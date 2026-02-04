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


## 3. Prerequisites
To run this project locally, ensure you have the following installed:
- Node.js (v20.19.0+ or v22.12.0+)
- Bun.js
- Modern Browser: Chrome, Firefox, or Edge (required for WebAssembly/Pyodide support).

---
