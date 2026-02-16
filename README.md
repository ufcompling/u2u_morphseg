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
└── vite.config.ts                    # Vite bundler configuration
```
---

## 4. Prerequisites
To run this project locally, ensure you have the following installed:
- Node.js (v20.19.0+ or v22.12.0+)
- Bun.js
- Modern Browser: Chrome, Firefox, or Edge (required for WebAssembly/Pyodide support).

---

## 5. Update Node.js (if needed)
If your node version is too old, the build will fail. Use NVM to update:
```bash
curl -o- [https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh](https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh) | bash
source ~/.bashrc
nvm install 22
nvm use 22
```

---

## 6. Install Bun.js
```
curl -fsSL [https://bun.sh/install](https://bun.sh/install) | bash
source ~/.bashrc
# Verify with: bun --version
```

---

## 7. Running the app

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

## 8. Access the Site
Preview: http://localhost:4173/u2u_morphseg/
Development: http://localhost:5173/u2u_morphseg/
---

