# Senior Project: Morphological Analysis with Client-Side CRF

![Overview-gif](https://github.com/user-attachments/assets/944773df-924e-4dc3-846d-9df831696ffa)

> **Looking for the User Guide?**
> Detailed step-by-step instructions, workflow guides, and troubleshooting tips can be found in the [User Manual (manual.md)](manual.md).

## 1. Abstract
**Overview:** 
The application allows users to perform sequence labeling using Conditional Random Fields (CRF) entirely within the web browser. By leveraging **Pyodide (WebAssembly)**, we move the computation from the server to the client. The system also utilizes **Active Learning** strategies to suggest which data points a researcher should annotate next, significantly reducing manual effort while maintaining high model accuracy.

**Key Features:**
* **Client-Side ML:** Training and inference happen on your device via Pyodide.
* **Local Persistence:** Data is stored securely in your browser's IndexedDB.
* **Manageable Labeling:** Uses Active Learning to increment annotated data a bit at a time, reducing the pressure of handling a large dataset all at once.
* **Automated CI/CD**: Integrated with GitHub Actions for automated testing and seamless deployment to GitHub Pages.
* **Serverless Deployment**: Fully functional as a static site; no expensive backend server required.

---

## 2. Technical Stack
* **Frontend:** React.js + Bun.js (Runtime)
* **Machine Learning:** Pyodide & sklearn-crfsuite
* **Database:** IndexedDB (via Emscripten)
* **Deployment:** GitHub Pages & GitHub Actions (CI/CD)

---

## 3. Project Architecture
```
.
├─ .github/workflows                # Github action configuration files
├─ public/                          # Static assets for deployment
│  ├─ wheels/                       # The compiled wheel artifacts
│  ├─ scripts/                      # Python utilities (CRF & analysis)
│  └─ requirements.txt              # Browser-side Python dependencies
├─ setup.sh                         # Environment & Wasm build script
├─ src/                             # Main application source
│  ├─ App.tsx
│  ├─ components/                   # Reusable UI elements and layout helpers
│  ├─ features/                     # Groups feature-specific modules
│  │  └─ analyzer/                  # The morphological annotation workflow
│  ├─ hooks/                        # Shared React hooks
│  ├─ lib/                          # Shared utilities, validation, and types
│  ├─ pages/                        # Route-level views
│  ├─ services/                     
│  │  ├─ database/                  # IndexedDB configuration
│  │  └─ pyodide/                   # Pyodide (WASM) initialization and bridge
│  │     └─ worker/                 # Background processing workers
|  ├─ main.tsx                      # Application entry point
│  └─ index.css
├─ test/                            # Test assets and suites
│  ├─ features/                     # Unit test cases for ML layers.
│  ├─ services/                     # Unit test cases for persistence layers.
│  └─ testdata/                     
├─ Dockerfile                       # Build environment for Emscripten & Pyodide
├─ LICENSE
├─ Makefile                         # Shortcut commands for building a wheel file.
├─ README.md                        # Project documentation
├─ requirements-dev.txt             # Python build/development dependencies
├─ bun.lock
├─ docker-compose.yml               # Orchestrates the Wasm wheel compilation process
├─ eslint.config.js
├─ index.html                       # Entry point HTML.
├─ package.json
└─ vite.config.ts

```
---

## 4. Prerequisites
- **Node.js** (v20+) & **Bun.js**
- **Python 3.12** (Must match Pyodide's environment)
- **venv** (Python virtual environment)
  - *Linux:* `sudo apt install python3.12-venv`
- **Git** (with submodules support)
- **C++ Compiler**: 
  - *macOS*: `xcode-select --install`
  - *Linux*: `sudo apt install build-essential`
  - *Windows*: Visual Studio Build Tools 2022 (C++ workload)
- **Emscripten SDK**: (Will be managed by `setup.sh` or manual clone)
- **Modern Browser** (Chrome/Firefox/Edge for Wasm support)

---

## 5. Update Node.js (if needed)
If your node version is too old, the build will fail. Use NVM to update:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
```

---

## 6. Install Bun.js (if needed)
```
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
# Verify with: bun --version
```

---

## 7. Python & Wasm Setup (manual clone)
Since `python-crfsuite` is not natively supported by Pyodide, we must cross-compile it to WebAssembly locally.
This can be done manually or through the setup.sh.

**Clone the Emscripten SDK** (this also can be done through the setup.sh):
```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install 3.1.58 && ./emsdk activate 3.1.58 && cd ..
```

---

## 8. Run the Automated Setup:
This script creates a virtual environment, installs build tools, clones the CRF source, and builds the .whl file. This only needs to be run once during the initial environment setup.
This automated setup is optimized for Linux and macOS. If you are on Windows, please follow the Docker instructions in section #9.
```
RUN chmod +x setup.sh
./setup.sh
```

---
## 9. Set up the environment with Docker
- install WSL: [Microsoft WSL Install Guide](https://learn.microsoft.com/en-us/windows/wsl/install) (Required for Windows).
- install Docker: [Docker Install Guide](https://docs.docker.com/engine/install/). Ensure "Use the WSL 2 based engine" is checked in Docker settings.
**One-Step Setup**:
This will build the Docker image, start the service, and generate the necessary ML wheel files automatically.
This only needs to be run once during the initial environment setup.
```
make
```
[!CAUTION]
Permission Warning: Since the wheel files are generated inside a Docker container (running as root), they may be owned by the root user on your host machine. If you need to manually delete or move these files from your file explorer/terminal, you may need to use sudo:

```
sudo rm public/wheels/*.whl
```

---

## 10. Running the app

Install dependencies
```
bun install
```

Create production build
```
bun run build
```

Launch the preview
```
bun run preview
```

Run the development server (it allows to make changes to the code with instant updates.)
```
bun run dev
```

---

## 11. Access the Site
- Preview: http://localhost:4173/u2u_morphseg/
- Development: http://localhost:5173/u2u_morphseg/
- Github Pages: https://ufcompling.github.io/u2u_morphseg/

---

## 12. Testing

### JavaScript Tests
For the Bun/JavaScript test suites, run:
```
bun test
```

### Pyodide Tests (Python-in-Browser)
These tests run Python code inside a virtualized browser environment. Follow these steps to set up your local environment:
1. Environment Setup
First, create and activate your virtual environment, then install the required development dependencies:
```
python -m venv .venv       # If you don't have one already
source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
pip install -r requirements-dev.txt
```

2. Install Browser Binaries
Since we use Playwright as the test runner, you need to install the Chromium binary and its necessary system dependencies:
```
python -m playwright install chromium --with-deps
```

3. Setup Pyodide Runtime
The tests require a local copy of the Pyodide runtime (v0.27.3) to serve the environment:
```
# Download the distribution
wget https://github.com/pyodide/pyodide/releases/download/0.27.3/pyodide-0.27.3.tar.bz2

# Extract to the 'pyodide' directory
mkdir -p pyodide
tar -xjf pyodide-0.27.3.tar.bz2 -C pyodide --strip-components=1
```

4. Run Tests
Execute the Pyodide-specific tests using the following command. This points to your local Pyodide folder and uses Playwright to handle the browser logic:
```
pytest test/services/pytest/ --dist-dir=pyodide --runtime chrome --runner playwright
```

---

## 13. Development Workflow & CI/CD

We follow a **dev-to-main** branching strategy. All contributors are encouraged to follow these steps to maintain code quality and deployment stability.

### Branching Strategy
* **`main`**: Production-ready code. Only updated via PR from `dev`.
* **`dev`**: Integration branch for new features.
* **`feature/[feature-name]`**: Individual branches for specific tasks or components.

### Step-by-Step Workflow

1.  **Feature Development**: Create a dedicated branch for every new feature or bug fix (e.g., `feature/annotate-ui`).
2.  **Pull Request to `dev`**: Once a feature is complete, open a Pull Request (PR) to the `dev` branch.
    * **CI Trigger (Test and Build)**: A GitHub Action is automatically triggered to run the full testing suite.
3.  **Code Review & Merge**: 
    * Upon successful completion of the CI tests and a manual code review, the merge is approved.
    * **CI Trigger (Build)**: A second automated check ensures the project builds successfully without errors.
4.  **Production Release**: When the `dev` branch is stable and ready for release, a PR is made from `dev` to `main`.
    * **Requirement**: This merge requires at least **one peer approval**.
5.  **Deployment (CD)**: 
    * Once the merge to `main` is successful, a Continuous Deployment (CD) pipeline is triggered.
    Once the merge to `main` is successful, a Continuous Deployment (CD) pipeline is triggered.
    * If the deployment fails, the previous version of the site remains live until a fix is merged.
    * The live application on **GitHub Pages** is automatically updated with the new changes.

---
