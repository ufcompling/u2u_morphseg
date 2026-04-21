from pytest_pyodide import run_in_pyodide
from conftest import load_turtleshell

@load_turtleshell
@run_in_pyodide
async def test_get_labeled_features(selenium):
    from features import get_labeled_features
    from process_data import _get_bmes_labels
    words = ['cat', 'do']
    bmes = {word: _get_bmes_labels([word]) for word in words}
    X, y = get_labeled_features(words, bmes, delta=2)
    assert X[0] == [{'right_[': 1, 'right_[c': 1, 'pos_start_0': 1}, {'right_c': 1, 'right_ca': 1, 'left_[': 1, 'pos_start_1': 1}, {'right_a': 1, 'right_at': 1, 'left_c': 1, 'left_[c': 1, 'pos_start_2': 1}, {'right_t': 1, 'right_t]': 1, 'left_a': 1, 'left_ca': 1, 'pos_start_3': 1}, {'right_]': 1, 'left_t': 1, 'left_at': 1, 'pos_start_4': 1}]
    assert X[1] == [{'right_[': 1, 'right_[d': 1, 'pos_start_0': 1}, {'right_d': 1, 'right_do': 1, 'left_[': 1, 'pos_start_1': 1}, {'right_o': 1, 'right_o]': 1, 'left_d': 1, 'left_[d': 1, 'pos_start_2': 1}, {'right_]': 1, 'left_o': 1, 'left_do': 1, 'pos_start_3': 1}]
    assert y[0] == ['[', 'B', 'M', 'E', ']']
    assert y[1] == ['[', 'B', 'E', ']']

@load_turtleshell
@run_in_pyodide
async def test_get_unlabeled_features(selenium):
    from features import get_unlabeled_features
    words = ['cat', 'do']
    X = get_unlabeled_features(words, delta=2)
    assert len(X) == 2
    assert X[0] == [{'right_[': 1, 'right_[c': 1, 'pos_start_0': 1}, {'right_c': 1, 'right_ca': 1, 'left_[': 1, 'pos_start_1': 1}, {'right_a': 1, 'right_at': 1, 'left_c': 1, 'left_[c': 1, 'pos_start_2': 1}, {'right_t': 1, 'right_t]': 1, 'left_a': 1, 'left_ca': 1, 'pos_start_3': 1}, {'right_]': 1, 'left_t': 1, 'left_at': 1, 'pos_start_4': 1}]
    assert X[1] == [{'right_[': 1, 'right_[d': 1, 'pos_start_0': 1}, {'right_d': 1, 'right_do': 1, 'left_[': 1, 'pos_start_1': 1}, {'right_o': 1, 'right_o]': 1, 'left_d': 1, 'left_[d': 1, 'pos_start_2': 1}, {'right_]': 1, 'left_o': 1, 'left_do': 1, 'pos_start_3': 1}]

@load_turtleshell
@run_in_pyodide
async def test_get_char_features(selenium):
    from features import _get_char_features
    features = _get_char_features('[cat]', 0, delta=2)
    assert 'pos_start_0' in features
    assert 'right_[' in features
    assert 'right_[c' in features
    assert not any (feature.startswith('left_') for feature in features)
    features = _get_char_features('[cat]', 2, delta=2)
    assert 'left_c' in features
    assert 'left_[c' in features

