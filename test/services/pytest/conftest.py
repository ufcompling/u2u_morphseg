from pytest_pyodide.decorator import copy_files_to_pyodide

load_turtleshell = copy_files_to_pyodide(
    file_list=[
        ('dist/wheels/python_crfsuite-0.9.12-cp312-cp312-pyodide_2024_0_wasm32.whl', '/tmp'),
        ('public/scripts/', '/lib/python3.12/site-packages/')
    ],
    install_wheels=True
)