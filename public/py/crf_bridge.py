"""
File: crf_bridge.py
Location: public/py/crf_bridge.py

Purpose:
    Bridge between the Pyodide Web Worker (JS) and crf_al.py (Python).
    Translates JSON configs from the frontend into crf_al function calls,
    runs training/inference cycles, and returns JSON results.

    crf_al.py is written into /tmp/crf_al.py by the worker before this
    script is exec'd, so the import below resolves at runtime.

Key functions:
    run_training_cycle(config_json) - Train CRF, evaluate, select increment
    run_inference(config_json)      - Segment residual pool with saved model

Author: Evan / Joshua
Created: 2026-02-17
Version: 1.0.0

Dependencies: crf_al.py, sklearn-crfsuite, pickle, json
"""

import json
import os
import sys
import pickle

sys.path.insert(0, '/tmp')
import crf_al


# ──────────────────────────────────────────────────────────────────────────────
# Public entry point: training cycle
#   result_json = await pyodide.runPythonAsync("run_training_cycle(config_json)")
# ──────────────────────────────────────────────────────────────────────────────

def run_training_cycle(config_json: str) -> str:
    """
    Run one AL training cycle and return results as JSON.

    :param config_json: JSON string with fields:
        - trainTgt: str          annotated training data (.tgt format)
        - testTgt: str           evaluation data (.tgt format)
        - selectTgt: str         unannotated pool (.tgt format)
        - selectSrc: str         unannotated pool (.src format)
        - incrementSize: int     how many words to pull into increment (select_interval)
        - delta: int             context window for features (default 4)
        - maxIterations: int     CRF training iterations (default 100)
        - selectSize: int        cumulative words selected so far (0 on first cycle)
        - workDir: str           base VFS path (e.g. '/tmp/turtleshell')
    :type config_json: str
    :return: JSON string with fields:
        - precision: float       (0–1 range, normalized from crf_al's 0–100)
        - recall: float
        - f1: float
        - incrementWords: list[{id, word, confidence, boundaries}]
        - residualCount: int
        - incrementContent: str  raw .tgt content for the increment
        - residualContent: str   raw .tgt content for the residual
        - evaluationContent: str per-word eval report as TSV
        - error: str | null
    :rtype: str
    """
    try:
        config = json.loads(config_json)
        work_dir = config.get('workDir', '/tmp/turtleshell')
        paths = _setup_vfs(config, work_dir)

        # Cap increment to pool size - 1 so there's always a residual for the
        # next cycle. If pool <= 1 we take everything (final cycle).
        pool_size = _count_lines(paths['select_tgt'])
        raw_increment = config.get('incrementSize', 50)
        if pool_size > 1:
            safe_increment = min(raw_increment, pool_size - 1)
        else:
            safe_increment = pool_size

        # Build an argparse.Namespace that crf_al.output_crf expects
        import argparse
        args = argparse.Namespace(
            datadir=work_dir,
            lang='dataset',
            initial_size='train',
            seed='0',
            method='al',
            select_interval=safe_increment,
            select_size=config.get('selectSize', 0),
            d=config.get('delta', 4),
            e=0.001,
            i=config.get('maxIterations', 100),
        )

        # Load and process data from VFS files
        data = crf_al.process_data(
            paths['train_tgt'],
            paths['test_tgt'],
            paths['select_tgt'] if os.path.exists(paths['select_tgt']) else None,
        )

        # Extract features
        X_train, Y_train, _ = crf_al.get_features(
            data['train']['words'], data['train']['bmes'], args.d,
        )
        X_test, _, _ = crf_al.get_features(
            data['test']['words'], data['test']['bmes'], args.d,
        )

        # Train CRF
        crf = crf_al.build_crf(work_dir, X_train, Y_train, max_iterations=args.i)

        # Predict on test + select, write increment/residual files
        Y_test_predict, _ = crf_al.output_crf(crf, work_dir, args, data, X_test)

        # Evaluate against gold test set
        test_predictions = crf_al.reconstruct_predictions(Y_test_predict, data['test']['words'])
        precision, recall, f1 = crf_al.evaluate_predictions(
            data['test']['morphs'], test_predictions,
        )

        # Read back the increment/residual files output_crf wrote
        increment_path = os.path.join(work_dir, 'increment.tgt')
        residual_path = os.path.join(work_dir, 'residual.tgt')
        increment_words = _parse_increment_for_annotation(increment_path, crf, args.d)
        residual_count = _count_lines(residual_path)

        increment_content = _read_file(increment_path)
        residual_content = _read_file(residual_path)
        evaluation_content = _build_evaluation_content(
            data['test']['words'],
            data['test']['morphs'],
            test_predictions,
            precision, recall, f1,
        )

        # crf_al metrics are 0–100; JS expects 0–1
        return json.dumps({
            'precision': round(precision / 100, 4),
            'recall': round(recall / 100, 4),
            'f1': round(f1 / 100, 4),
            'incrementWords': increment_words,
            'residualCount': residual_count,
            'incrementContent': increment_content,
            'residualContent': residual_content,
            'evaluationContent': evaluation_content,
            'error': None,
        })

    except Exception:
        import traceback
        return json.dumps({
            'precision': 0.0,
            'recall': 0.0,
            'f1': 0.0,
            'incrementWords': [],
            'residualCount': 0,
            'incrementContent': '',
            'residualContent': '',
            'evaluationContent': '',
            'error': traceback.format_exc(),
        })


# ──────────────────────────────────────────────────────────────────────────────
# Public entry point: inference
#   result_json = await pyodide.runPythonAsync("run_inference(config_json)")
# ──────────────────────────────────────────────────────────────────────────────

def run_inference(config_json: str) -> str:
    """
    Run the trained CRF model over residual words without retraining.
    Loads crf.model from the VFS written during the last training cycle.

    :param config_json: JSON string with fields:
        - residualTgt: str   residual pool content (.tgt format)
        - delta: int         context window for features (default 4)
        - workDir: str       VFS directory where crf.model lives
    :type config_json: str
    :return: JSON string with fields:
        - predictions: list[{word, segmentation}]
        - predictionsContent: str   full .tgt file content for download
        - totalWords: int
        - error: str | null
    :rtype: str
    """
    try:
        config = json.loads(config_json)
        work_dir = config.get('workDir', '/tmp/turtleshell')
        model_path = os.path.join(work_dir, 'crf.model')
        delta = config.get('delta', 4)

        if not os.path.exists(model_path):
            return json.dumps({
                'predictions': [],
                'predictionsContent': '',
                'totalWords': 0,
                'error': 'No trained model found. Run at least one training cycle first.',
            })

        with open(model_path, 'rb') as f:
            crf = pickle.load(f)

        residual_content = config.get('residualTgt', '')
        if not residual_content.strip():
            return json.dumps({
                'predictions': [],
                'predictionsContent': '',
                'totalWords': 0,
                'error': None,
            })

        # Parse surface words from .tgt lines (space-separated chars with ! boundaries)
        words = []
        for line in residual_content.splitlines():
            line = line.strip()
            if not line:
                continue
            word = ''.join(line.split()).replace('!', '')
            words.append(word)

        if not words:
            return json.dumps({
                'predictions': [],
                'predictionsContent': '',
                'totalWords': 0,
                'error': None,
            })

        # Dummy BMES labels — get_features needs a bmes dict but the labels
        # aren't used for prediction, only for building the Y_train ground truth.
        # We use single-char 'S' labels as placeholders.
        dummy_bmes = {w: 'S' * len(w) for w in words}
        X, _, _ = crf_al.get_features(words, dummy_bmes, delta)
        Y_predict = crf.predict(X)

        predicted_morphs = crf_al.reconstruct_predictions(Y_predict, words)

        predictions = []
        tgt_lines = []
        for word, morphs in zip(words, predicted_morphs):
            seg = '!'.join(morphs)
            predictions.append({'word': word, 'segmentation': seg})
            tgt_lines.append(seg)

        predictions_content = '\n'.join(tgt_lines) + '\n'

        return json.dumps({
            'predictions': predictions,
            'predictionsContent': predictions_content,
            'totalWords': len(words),
            'error': None,
        })

    except Exception:
        import traceback
        return json.dumps({
            'predictions': [],
            'predictionsContent': '',
            'totalWords': 0,
            'error': traceback.format_exc(),
        })


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _setup_vfs(config: dict, work_dir: str) -> dict:
    """
    Write JS-provided file content strings into the Pyodide VFS.

    :param config: Decoded config dict from JS
    :param work_dir: Base directory to write files into
    :return: Dict of resolved file paths keyed by role
    """
    os.makedirs(work_dir, exist_ok=True)

    paths = {
        'train_tgt':  os.path.join(work_dir, 'train.train.tgt'),
        'test_tgt':   os.path.join(work_dir, 'test.full.tgt'),
        'select_tgt': os.path.join(work_dir, 'select.train.tgt'),
        'select_src': os.path.join(work_dir, 'select.train.src'),
    }

    _write_if_present(paths['train_tgt'], config.get('trainTgt', ''))
    _write_if_present(paths['test_tgt'],  config.get('testTgt', ''))
    _write_if_present(paths['select_tgt'], config.get('selectTgt', ''))
    _write_if_present(paths['select_src'], config.get('selectSrc', ''))

    return paths


def _write_if_present(path: str, content: str) -> None:
    if content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)


def _parse_increment_for_annotation(increment_tgt_path: str, crf, delta: int) -> list:
    """
    Read increment.tgt and pair each word with the model's confidence score
    and predicted boundary indices for the annotation UI.

    :param increment_tgt_path: Path to increment.tgt written by output_crf
    :param crf: Trained CRF model (for marginals on increment words)
    :param delta: Feature window size
    :return: List of dicts matching AnnotationWord shape in the frontend
    """
    if not os.path.exists(increment_tgt_path):
        return []

    words, morphs, bmes = crf_al.load_file_data(increment_tgt_path)
    if not words:
        return []

    X, _, _ = crf_al.get_features(words, bmes, delta)
    Y_predict = crf.predict(X)
    marginals = crf.predict_marginals(X)
    conf_scores = crf_al.get_confidence_scores(words, Y_predict, marginals)

    result = []
    for i, (word, pred_labels, conf) in enumerate(zip(words, Y_predict, conf_scores)):
        boundaries = _labels_to_boundary_indices(word, pred_labels)
        result.append({
            'id': f'w{i}',
            'word': word,
            'confidence': round(conf, 4),
            'boundaries': [{'index': b} for b in boundaries],
        })

    return result


def _labels_to_boundary_indices(word: str, pred_labels: list) -> list:
    """
    Convert BMES label sequence to boundary indices (char index after which
    a morpheme split occurs). Strips the '['/']' markers crf_al wraps words with.

    :param word: Surface form of the word
    :param pred_labels: Full label list including '[' and ']'
    :return: List of character indices where morpheme boundaries fall
    """
    inner = pred_labels[1:-1]  # strip [ and ]
    boundaries = []
    for i, label in enumerate(inner):
        if label in ('E', 'S') and i < len(word) - 1:
            boundaries.append(i)
    return boundaries


def _count_lines(path: str) -> int:
    if not os.path.exists(path):
        return 0
    with open(path, encoding='utf-8') as f:
        return sum(1 for line in f if line.strip())


def _read_file(path: str) -> str:
    if not os.path.exists(path):
        return ''
    with open(path, encoding='utf-8') as f:
        return f.read()


def _build_evaluation_content(
    test_words: list,
    test_morphs: list,
    predicted_morphs: list,
    precision: float,
    recall: float,
    f1: float,
) -> str:
    """
    Build a human-readable evaluation report as a TSV string.
    Metrics here are in crf_al's 0–100 scale (pre-normalization).

    :return: Report with summary header and per-word rows (word | gold | predicted)
    """
    lines = [
        '# TurtleShell Evaluation Report',
        f'# Precision: {precision:.2f}  Recall: {recall:.2f}  F1: {f1:.2f}',
        '#',
        '# word\tgold\tpredicted',
    ]
    for word, gold, pred in zip(test_words, test_morphs, predicted_morphs):
        gold_seg = '!'.join(gold)
        pred_seg = '!'.join(pred)
        lines.append(f'{word}\t{gold_seg}\t{pred_seg}')
    return '\n'.join(lines) + '\n'