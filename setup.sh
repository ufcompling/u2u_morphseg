#!/bin/bash

# 1. Python Venv
echo "========================== Setting up Python Venv =========================="
python3.12 -m venv .venv
source .venv/bin/activate

# 2. Build Tools
echo "========================== Installing Pip Requirements =========================="
pip install -r requirements-dev.txt

# 3. Check for C++ Compiler
if ! command -v cc &> /dev/null; then
    echo "========================== CRITICAL: No C++ compiler found! =========================="
    echo "Please install one first (e.g., 'xcode-select --install' on Mac or 'sudo apt install build-essential' on Linux)."
    exit 1
fi

# 4. Emscripten Activation
echo "========================== Checking Emscripten =========================="
if [ -d "emsdk" ]; then
    echo "emsdk folder found. Activating..."
    cd emsdk
else
    echo "emsdk not found. Downloading..."
    git clone https://github.com/emscripten-core/emsdk.git
    cd emsdk
    ./emsdk install 3.1.58
fi
./emsdk activate 3.1.58
source ./emsdk_env.sh
cd ..

# 5. Clone & Build
if [ ! -d "temp-crfsuite" ]; then
    echo "========================== Cloning python-crfsuite for build... =========================="
    git clone --depth 1 --recursive https://github.com/scrapinghub/python-crfsuite.git temp-crfsuite
fi

# 6. Build Custom Wheel
if ls public/wheels/*.whl >/dev/null 2>&1; then
    echo "========================== Wheel already exists in public/wheels/. Skipping build. =========================="
else
    echo "========================== Build the crfsuite wheel =========================="
    pyodide build temp-crfsuite/

    echo "========================== Moving wheel to React public folder =========================="
    mkdir -p public/wheels
    mv dist/*.whl public/wheels/
fi

echo "========================== DONE! Your environment is ready. =========================="

