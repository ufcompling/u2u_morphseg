from pytest_pyodide import run_in_pyodide
from conftest import load_turtleshell

@load_turtleshell
@run_in_pyodide
async def test_get_bmes_labels(selenium):
    from process_data import _get_bmes_labels
    assert _get_bmes_labels(['a']) == 'S'
    assert _get_bmes_labels(['cat']) == 'BME'
    assert _get_bmes_labels(['un', 'do']) == 'BEBE'

@load_turtleshell
@run_in_pyodide
async def test_parse_labeled_data(selenium):
    from process_data import _parse_labeled_data
    words, morphs, bmes = _parse_labeled_data('un!do\ncat', delimiter='!')
    assert words == ['undo', 'cat']
    assert morphs == [['un', 'do'], ['cat']]
    assert bmes['undo'] == 'BEBE'
    assert bmes['cat'] == 'BME'

@load_turtleshell
@run_in_pyodide
async def test_parse_unlabeled_data(selenium):
    from process_data import _parse_unlabeled_data
    words = _parse_unlabeled_data('undo\ncat', delimiter='!')
    assert words == ['undo', 'cat']

@load_turtleshell
@run_in_pyodide
def test_process_data(selenium):
    from process_data import process_data
    data = process_data('un!do\n', 'cat\n', 'run\n', delimiter='!')
    assert 'train' in data and 'test' in data and 'select' in data
    assert data['train']['words'] == ['undo']
    assert data['train']['morphs'] == [['un', 'do']]
    assert data['train']['bmes']['undo'] == 'BEBE'
    assert data['test']['words'] == ['cat']
    assert data['test']['morphs'] == [['cat']]
    assert data['test']['bmes']['cat'] == 'BME'
    assert data['select']['words'] == ['run']
