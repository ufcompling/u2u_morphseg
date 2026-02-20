import os
import json
import base64
from typing import Union

def save_file(file_name: str, data) -> None:
    """Saves a file to the /data directory in the Pyodide virtual filesystem.

    Accepts bytes, str, bytearray, memoryview, or lists of ints. Strings are
    encoded as UTF-8 before writing. This keeps the Python API simple for
    callers coming from JS.
    """
    # Normalize incoming data to bytes
    if isinstance(data, bytes):
        data_bytes = data
    elif isinstance(data, str):
        data_bytes = data.encode('utf-8')
    elif isinstance(data, bytearray):
        data_bytes = bytes(data)
    elif isinstance(data, memoryview):
        data_bytes = data.tobytes()
    elif isinstance(data, list):
        data_bytes = bytes(data)
    else:
        raise ValueError('Unsupported data type for saving file')

    os.makedirs('/data', exist_ok=True)
    file_path = os.path.join('/data', file_name)
    with open(file_path, 'wb') as f:
        f.write(data_bytes)


def save_base64(file_name: str, b64_content: str) -> None:
    """Decode a base64 string and save the resulting bytes to /data."""
    try:
        data_bytes = base64.b64decode(b64_content)
    except Exception as e:
        raise ValueError('Invalid base64 content') from e

    os.makedirs('/data', exist_ok=True)
    file_path = os.path.join('/data', file_name)
    with open(file_path, 'wb') as f:
        f.write(data_bytes)


def read_file(file_name: str, detect_text: bool = True, encoding: str = 'utf-8') -> str:
    """Reads a file and returns a JSON string describing the result.

    Returns a JSON-encoded dict with two keys:
      - type: 'text' or 'base64'
      - content: decoded text (if 'text') or base64 string (if 'base64')

    This avoids passing raw bytes across the JS/Py boundary and lets the JS
    side decide how to display or download the data.
    """
    file_path = os.path.join('/data', file_name)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File '{file_name}' not found in /data directory")

    with open(file_path, 'rb') as f:
        b = f.read()

    if detect_text:
        try:
            text = b.decode(encoding)
            return json.dumps({'type': 'text', 'content': text})
        except UnicodeDecodeError:
            pass

    return json.dumps({'type': 'base64', 'content': base64.b64encode(b).decode('ascii')})


def delete_file(file_name: str) -> None:
    """Deletes a file from the /data directory in the Pyodide virtual filesystem."""
    file_path = os.path.join('/data', file_name)
    if os.path.exists(file_path):
        os.remove(file_path)