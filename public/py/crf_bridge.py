import json
import os
import sys
import shutil
import pickle

# crf_al.py is written into /tmp/crf_al.py by the worker before calling us
sys.path.insert(0, '/tmp')
import crf_al


# ──────────────────────────────────────────────────────────────────────────────
# Public entry point called from JS:
#   result_json = await pyodide.runPythonAsync("run_training_cycle(config_json)")
# ──────────────────────────────────────────────────────────────────────────────

def run_training_cycle(config_json: str) -> str:
    """
    Run one AL training cycle and return results as JSON.

    :param config_json: JSON string with fields:
        - trainTgt: str          annotated training data (.tgt format)
        - testTgt: str           evaluation data (.tgt format)
        - selectTgt: str         unannotated pool (.tgt format)
        - selectSrc: str         unannotated pool (.src format) — used by crf_al for residual
        - incrementSize: int     how many words to pull into increment (select_interval)
        - delta: int             context window for features (default 4)
        - maxIterations: int     CRF training iterations (default 100)
        - selectSize: int        cumulative words selected so far (0 on first cycle)
        - workDir: str           base VFS path (e.g. '/tmp/turtleshell')
    :type config_json: str
    :return: JSON string with fields:
        - precision: float
        - recall: float
        - f1: float
        - incrementWords: list[{word, boundaries, confidence}]
        - residualCount: int
        - error: str | null
    :rtype: str
    """
    try:
        config = json.loads(config_json)
        work_dir = config.get('workDir', '/tmp/turtleshell')
        paths = _setup_vfs(config, work_dir)

        # ── Build args namespace to match crf_al's internal API ──
        import argparse
        args = argparse.Namespace(
            datadir=work_dir,
            lang='dataset',
            initial_size='train',
            seed='0',
            method='al',
            select_interval=config.get('incrementSize', 50),
            select_size=config.get('selectSize', 0),
            d=config.get('delta', 4),
            e=0.001,
            i=config.get('maxIterations', 100),
        )

        # ── Process data from VFS ──
        data = crf_al.process_data(
            paths['train_tgt'],
            paths['test_tgt'],
            paths['select_tgt'] if os.path.exists(paths['select_tgt']) else None
        )

        # ── Train + predict ──
        X_train, Y_train, _ = crf_al.get_features(data['train']['words'], data['train']['bmes'], args.d)
        X_test, _, _ = crf_al.get_features(data['test']['words'], data['test']['bmes'], args.d)

        crf = crf_al.build_crf(work_dir, X_train, Y_train, max_iterations=args.i)
        Y_test_predict, _ = crf_al.output_crf(crf, work_dir, args, data, X_test)

        # ── Evaluate ──
        test_predictions = crf_al.reconstruct_predictions(Y_test_predict, data['test']['words'])
        precision, recall, f1 = crf_al.evaluate_predictions(data['test']['morphs'], test_predictions)

        # ── Read increment words for annotation ──
        increment_path = os.path.join(work_dir, 'increment.tgt')
        residual_path = os.path.join(work_dir, 'residual.tgt')
        increment_words = _parse_increment_for_annotation(increment_path, crf, data, args.d)
        residual_count = _count_lines(residual_path)

        return json.dumps({
            'precision': precision,
            'recall': recall,
            'f1': f1,
            'incrementWords': increment_words,
            'residualCount': residual_count,
            'error': None,
        })

    except Exception as exc:
        import traceback
        return json.dumps({
            'precision': 0.0,
            'recall': 0.0,
            'f1': 0.0,
            'incrementWords': [],
            'residualCount': 0,
            'error': traceback.format_exc(),
        })


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _setup_vfs(config: dict, work_dir: str) -> dict:
    """
    Write JS-provided file content strings into the Pyodide VFS and return paths.

    :param config: Decoded config dict from JS
    :param work_dir: Base directory to write files into
    :return: Dict of resolved file paths
    """
    os.makedirs(work_dir, exist_ok=True)

    paths = {
        'train_tgt': os.path.join(work_dir, 'train.train.tgt'),
        'test_tgt':  os.path.join(work_dir, 'test.full.tgt'),
        'select_tgt': os.path.join(work_dir, 'select.train.tgt'),
        'select_src': os.path.join(work_dir, 'select.train.src'),
    }

    _write_if_present(paths['train_tgt'], config.get('trainTgt', ''))
    _write_if_present(paths['test_tgt'], config.get('testTgt', ''))
    _write_if_present(paths['select_tgt'], config.get('selectTgt', ''))
    _write_if_present(paths['select_src'], config.get('selectSrc', ''))

    return paths


def _write_if_present(path: str, content: str) -> None:
    if content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)


def _parse_increment_for_annotation(increment_tgt_path: str, crf, data: dict, delta: int) -> list:
    """
    Read increment.tgt and pair each word with the model's confidence score
    and predicted boundary indices so JS can drive the annotation UI.

    :param increment_tgt_path: Path to increment.tgt written by output_crf
    :param crf: Trained CRF model (for marginals on increment words)
    :param data: Full DataDict — we pull select bmes from here for features
    :param delta: Feature window size
    :return: List of dicts suitable for AnnotationWord in the frontend
    """
    if not os.path.exists(increment_tgt_path):
        return []

    words, morphs, bmes = crf_al.load_file_data(increment_tgt_path)
    if not words:
        return []

    X, Y_labels, _ = crf_al.get_features(words, bmes, delta)
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
    Convert BMES label sequence to boundary indices (after which char a split occurs).
    Labels include the '[' and ']' boundary markers added by crf_al, so strip them.

    :param word: The surface form of the word
    :param pred_labels: Full label list including '[' and ']'
    :return: List of character indices where morpheme boundaries occur
    """
    # strip the outer [ ] markers that crf_al wraps every word with
    inner = pred_labels[1:-1]
    boundaries = []
    for i, label in enumerate(inner):
        # E = End of morpheme, S = Single-char morpheme -> boundary after this char
        if label in ('E', 'S') and i < len(word) - 1:
            boundaries.append(i)
    return boundaries


def _count_lines(path: str) -> int:
    if not os.path.exists(path):
        return 0
    with open(path, encoding='utf-8') as f:
        return sum(1 for line in f if line.strip())