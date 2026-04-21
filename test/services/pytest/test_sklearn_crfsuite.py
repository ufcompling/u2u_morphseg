from pytest_pyodide import run_in_pyodide
from conftest import load_turtleshell

@load_turtleshell
@run_in_pyodide
async def test_sklearn_crfsuite(selenium):
    import micropip
    await micropip.install('sklearn-crfsuite')

    from sklearn_crfsuite import CRF

    X = [[{'right_[': 1, 'right_[f': 1, 'right_[fa': 1, 'right_[fai': 1, 'pos_start_0': 1}, 
          {'right_f': 1, 'right_fa': 1, 'right_fai': 1, 'right_fair': 1, 'left_[': 1, 'pos_start_1': 1}, 
          {'right_a': 1, 'right_ai': 1, 'right_air': 1, 'right_airn': 1, 'left_f': 1, 'left_[f': 1, 'pos_start_2': 1}, 
          {'right_i': 1, 'right_ir': 1, 'right_irn': 1, 'right_irne': 1, 'left_a': 1, 'left_fa': 1, 'left_[fa': 1, 'pos_start_3': 1}, 
          {'right_r': 1, 'right_rn': 1, 'right_rne': 1, 'right_rnes': 1, 'left_i': 1, 'left_ai': 1, 'left_fai': 1, 'left_[fai': 1, 'pos_start_4': 1}, 
          {'right_n': 1, 'right_ne': 1, 'right_nes': 1, 'right_ness': 1, 'left_r': 1, 'left_ir': 1, 'left_air': 1, 'left_fair': 1, 'pos_start_5': 1}, 
          {'right_e': 1, 'right_es': 1, 'right_ess': 1, 'right_ess]': 1, 'left_n': 1, 'left_rn': 1, 'left_irn': 1, 'left_airn': 1, 'pos_start_6': 1}, 
          {'right_s': 1, 'right_ss': 1, 'right_ss]': 1, 'left_e': 1, 'left_ne': 1, 'left_rne': 1, 'left_irne': 1, 'pos_start_7': 1}, 
          {'right_s': 1, 'right_s]': 1, 'left_s': 1, 'left_es': 1, 'left_nes': 1, 'left_rnes': 1, 'pos_start_8': 1}, 
          {'right_]': 1, 'left_s': 1, 'left_ss': 1, 'left_ess': 1, 'left_ness': 1, 'pos_start_9': 1}]]
    y = [['[', 'B', 'M', 'M', 'E', 'B', 'M', 'M', 'E', ']']]

    crf = CRF(
        algorithm='lbfgs',
        max_iterations=20
    )
    crf.fit(X, y)
    assert all(pred == label for pred, label in zip(crf.predict(X)[0], y[0]))