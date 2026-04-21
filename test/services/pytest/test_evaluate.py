from pytest_pyodide import run_in_pyodide
from conftest import load_turtleshell

@load_turtleshell
@run_in_pyodide
async def test_evaluate_predictions(selenium):
    from evaluate import evaluate_predictions
    gold = [['un', 'do'], ['cat']]
    pred = [['undo'], ['cat']]
    precision, recall, f1 = evaluate_predictions(gold, pred)
    assert precision == 0.5
    assert recall == 0.5
    assert f1 == 0.5

@load_turtleshell
@run_in_pyodide
async def test_reconstruct_predictions(selenium):
    from evaluate import reconstruct_predictions
    pred_labels = [['[', 'B', 'E', 'B', 'E', ']'], ['[', 'B', 'M', 'E', ']']]
    words = ['undo', 'cat']
    reconstructed = reconstruct_predictions(pred_labels, words)
    assert reconstructed == [['un', 'do'], ['cat']]

@load_turtleshell
@run_in_pyodide
async def test_get_confidence_data(selenium):
    from evaluate import get_confidence_data
    words = ['undo', 'cat']
    predictions = [['[', 'B', 'E', 'B', 'E', ']'], ['[', 'B', 'M', 'E', ']']]
    marginals = [
        [{'[': 1.0}, {'B': 0.5, 'M': 0.5, 'E': 0.0}, {'B': 0.5, 'M': 0.0, 'E': 0.5}, {'B': 0.5, 'M': 0.5, 'E': 0.0}, {'B': 0.5, 'M': 0.0, 'E': 0.5}, {']': 1.0}],
        [{'[': 1.0}, {'B': 0.9, 'M': 0.1, 'E': 0.0}, {'B': 0.0, 'M': 0.9, 'E': 0.1}, {'B': 0.0, 'M': 0.1, 'E': 0.9}, {']': 1.0}]
    ]
    result = get_confidence_data(words, predictions, marginals)
    assert len(result) == 2
    assert result[0][2] <= result[1][2]
    assert result[0][0] == 'undo'
    assert result[1][0] == 'cat'