#!/bin/bash
set -e

# 1. Python Venv
echo "========================== Setting up Python Venv =========================="
python3.12 -m venv .venv
. .venv/bin/activate


# 2. Build Tools
echo "========================== Installing Pip Requirements =========================="
./.venv/bin/python3 -m pip install --upgrade pip
./.venv/bin/python3 -m pip install -r requirements-dev.txt

# 3. Check for C++ Compiler
if ! command -v cc &> /dev/null; then
    echo "========================== CRITICAL: No C++ compiler found! =========================="
    echo "Please install one first (e.g., 'xcode-select --install' on Mac or 'sudo apt install build-essential' on Linux)."
    exit 1
fi

# 4. Emscripten Activation
echo "========================== Checking Emscripten =========================="
if [ -f /.dockerenv ]; then
    echo "Running in Docker: Using pre-installed /emsdk tools"
else
    if [ -d "emsdk" ]; then
        echo "========================== emsdk folder found. Activating... =========================="
        cd emsdk
    else
        echo "========================== emsdk not found. Downloading... =========================="
        git clone https://github.com/emscripten-core/emsdk.git
        cd emsdk
        ./emsdk install 3.1.58
    fi
    ./emsdk activate 3.1.58
    source ./emsdk_env.sh
    cd ..
fi


# 5. Clone & Build
if [ ! -d "temp-crfsuite/.git" ]; then  # Check for .git specifically
    echo "========================== Preparing temp-crfsuite =========================="
    # Delete contents instead of the directory itself to avoid "Device busy"
    find temp-crfsuite -mindepth 1 -delete
    
    echo "========================== Cloning python-crfsuite =========================="    
    # Run clone and capture errors
    git clone --depth 1 --recursive https://github.com/scrapinghub/python-crfsuite.git temp-crfsuite || {
        echo "CRITICAL ERROR: Git clone failed!"
        exit 1
    }
fi

# 6. Build Custom Wheel
WHEEL_PATH="./public/wheels"
# Look for a specific filename or just clear it to be sure
echo "========================== Checking for Custom Wheel =========================="

# Change the check to be more specific, or just check if the directory is empty
if [ -n "$(ls -A $WHEEL_PATH 2>/dev/null)" ]; then
    echo "========================== Wheel found. Skipping build. =========================="
else
    echo "========================== Build the crfsuite wheel =========================="
    pyodide build temp-crfsuite/

    echo "========================== Moving wheel to React public folder =========================="
    mkdir -p "$WHEEL_PATH"
    
    if ls dist/*.whl >/dev/null 2>&1; then
        mv dist/*.whl "$WHEEL_PATH/"
    else
        echo "ERROR: No wheel found in temp-crfsuite/dist/ after build!"
        exit 1
    fi
fi

echo "========================== DONE! Your environment is ready. =========================="

