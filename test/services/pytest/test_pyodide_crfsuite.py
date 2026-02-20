from pytest_pyodide import run_in_pyodide

@run_in_pyodide
async def test_import(selenium_pyodide):
    from sklearn_crfsuite import CRF
    assert CRF is not None

@run_in_pyodide
async def test_train(selenium_pyodide):
    from sklearn_crfsuite import CRF

    crf = CRF(max_iterations=10)

    X_train = [[{'morph': 'happi'}, {'morph': 'ness'}]]
    y_train = [['root', 'suffix']]

    crf.fit(X_train, y_train)

    y_pred = crf.predict(X_train)
    assert list(y_pred[0]) == y_train[0]