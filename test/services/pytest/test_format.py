from pytest_pyodide import run_in_pyodide
from conftest import load_turtleshell

@load_turtleshell
@run_in_pyodide
async def test_get_labeled_features(selenium):
    from format import format_evaluation
    result = format_evaluation(
        ['undo', 'cat'], [['un', 'do'], ['cat']], [['undo'], ['cat']],
        precision=0.5, recall=0.5, f1=0.5
    )
    assert '# TurtleShell Evaluation Report' in result
    assert 'Precision: 0.50  Recall: 0.50  F1: 0.50' in result

@load_turtleshell
@run_in_pyodide
async def test_format_increment(selenium):
    from format import format_increment
    data = [('undo', ['[', 'B', 'E', 'B', 'E', ']'], 0.85)]
    result = format_increment(data)
    assert len(result) == 1
    assert result[0]['id'] == 'w0'
    assert result[0]['word'] == 'undo'
    assert result[0]['confidence'] == 0.85
    assert result[0]['boundaries'] == [{'index': 1}]

@load_turtleshell
@run_in_pyodide
async def test_get_morph_boundaries(selenium):
    from format import _get_morph_boundaries
    assert _get_morph_boundaries('undo', ['[', 'B', 'E', 'B', 'E', ']']) == [1]
    assert _get_morph_boundaries('cat', ['[', 'B', 'M', 'E', ']']) == []
    assert _get_morph_boundaries('a', ['[', 'S', ']']) == []