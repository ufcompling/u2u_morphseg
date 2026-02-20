**Requirements**:
- I had to download pyodide-core-0.27.4.tar.bz2 from the Git Releases for Pyodide to get pytest-pyodide to work.
- Then, I had to unzip it with `tar -xjf pyodide-0.27.4.tar.bz2`
- I also had to `pip install pytest-pyodide selenium` to get the required libraries

To run, use:

```
pytest test/services/pytest/<TEST NAME>.py --runtime node -v
```