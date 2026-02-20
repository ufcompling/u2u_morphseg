import pytest

@pytest.fixture
def selenium_pyodide(selenium):
    
    selenium.run_async("""
        import micropip
        await micropip.install([
            'http://localhost:8000/wheels/python_crfsuite-0.9.12-cp312-cp312-pyodide_2024_0_wasm32.whl', 
            'sklearn-crfsuite'
        ])
    """)
    return selenium