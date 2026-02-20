# Senior Project: Morphological Analysis with Client-Side CRF

## 1. Abstract
**Overview:** 
The application allows users to perform sequence labeling using Conditional Random Fields (CRF) entirely within the web browser. By leveraging **Pyodide (WebAssembly)**, we move the computation from the server to the client. The system also utilizes **Active Learning** strategies to suggest which data points a researcher should annotate next, significantly reducing manual effort while maintaining high model accuracy.

**Key Features:**
* **Client-Side ML:** Training and inference happen on your device via Pyodide.
* **Local Persistence:** Data is stored securely in your browser's IndexedDB.
* **Manageable Labeling:** Uses Active Learning to increment annotated data a bit at a time, reducing the pressure of handling a large dataset all at once.

---

## 2. Technical Stack
* **Frontend:** React.js + Bun.js (Runtime)
* **Machine Learning:** Pyodide & sklearn-crfsuite
* **Database:** IndexedDB (via Dexie.js)
* **Deployment:** GitHub Pages & GitHub Actions (CI/CD)

---

## 3. Project Architecture
```
.
├── public/                           # Static assets served directly by the browser.
│   ├── wheels/                       # Compiled .whl files (Don't delete!)
│   ├── requirements.txt              # Browser-side Python dependencies
│   └── scripts/                      # Python logic (CRF & analysis)
├── src/
│   ├── components/                   
│   │   └── ui/                       # Shared UI components (Buttons, Modals)
│   ├── features/                     # Feature-based modules
│   │   └── analyzer/                 # Morphological Analyzer feature
│   │       ├── components/           
│   │       └── hooks/                
│   ├── hooks/                        # Global React hooks
│   ├── layouts/                      # Page structure components
│   ├── pages/                        # Individual routes/views
│   ├── services/
│   │   ├── database/                 # IndexedDB configuration
│   │   └── pyodide/                  # Pyodide (WASM) initialization and bridge
│   │       └── worker/               # Background processing workers
│   ├── App.tsx                       # Root component & Router
│   ├── index.css                     
│   └── main.tsx                      # Application entry point
├── test/                             # Test suite directory
│   ├── features/                     # UI and integration tests
│   └── services/                     # Database and engine tests
├── index.html                        # Entry point (loads Pyodide CDN)
├── package.json                      # Dependencies and scripts
├── requirements-dev.txt              # Local build tools (pyodide-build, etc.)
├── setup.sh                          # Environment & Wasm build script
└── vite.config.ts                    # Vite bundler configuration
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
This script creates a virtual environment, installs build tools, clones the CRF source, and builds the .whl file.
This automated setup is optimized for Linux and macOS. If you are on Windows, please follow the Docker instructions in section #11.
```
./setup.sh
```

---

## 9. Running the app

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

## 10. Set up the environment with Docker
- install WSL: [https://learn.microsoft.com/en-us/windows/wsl/install](Microsoft WSL Install Guide) (Required for Windows).
- install Docker: [https://docs.docker.com/engine/install/](Docker Install Guide). Ensure "Use the WSL 2 based engine" is checked in Docker settings.
**One-Step Setup**:
This will build the Docker image, start the container in the background, and generate the necessary ML wheel files automatically.
```
make py-setup

```
**Manual Start**:
To run the container normally (foreground) without rebuilding the ML wheels:
```
docker compose up
```

---

## 11. Access the Site
- Preview: http://localhost:4173/u2u_morphseg/
- Development: http://localhost:5173/u2u_morphseg/
- Github Pages: https://ufcompling.github.io/u2u_morphseg/

---

## 12. Troubleshooting: Cannot access the site on Windows
If you are using WSL and localhost:5173 does not load in your browser, the port forwarding may be failing. You can use the specific Linux IP address instead:
1. Find your WSL IP: Run this command in your WSL terminal:
```
ip addr show eth0 | grep "inet "
```
2. Copy the IP: Look for the numbers after inet (e.g., 172.25.x.x).
3. Update the URL: Replace localhost in your browser with that IP (e.g., http://172.25.x.x:5173).

