(function(){"use strict";console.log("[pyodide-worker] ===== WORKER SCRIPT STARTING =====");let r=null,a=null;const u="https://cdn.jsdelivr.net/pyodide/v0.27.4/full/",c=`${self.location.origin}/u2u_morphseg/wheels/python_crfsuite-0.9.12-cp312-cp312-pyodide_2024_0_wasm32.whl`,d="/persist",s=`${d}/turtleshell`,_="crf.model";async function w(t){return new Promise(e=>{r.FS.syncfs(t,i=>{i&&console.warn(`[pyodide-worker] IDBFS sync (populate=${t}) warning:`,i),e()})})}async function p(){await w(!1)}async function E(){await w(!0)}function m(){try{return r.FS.stat(`${s}/${_}`),!0}catch{return!1}}function y(t){try{r.FS.mkdir(t)}catch{}}async function f(){if(!r)return a||(a=(async()=>{o({type:"INIT_PROGRESS",step:"Loading Pyodide runtime…"});try{const i=(await import(`${u}pyodide.mjs`)).loadPyodide;if(!i)throw new Error("loadPyodide function not found in pyodide.mjs");r=await i({indexURL:u})}catch(e){throw new Error(`Failed to load Pyodide: ${e}`)}o({type:"INIT_PROGRESS",step:"Mounting persistent filesystem…"});try{y(d),r.FS.mount(r.FS.filesystems.IDBFS,{},d),await E(),y(s)}catch(e){console.warn("[pyodide-worker] IDBFS mount failed (non-fatal):",e),y(s)}o({type:"INIT_PROGRESS",step:"Installing micropip…"}),await r.loadPackage("micropip"),o({type:"INIT_PROGRESS",step:"Installing Python packages…"});try{const e=await fetch(c);if(!e.ok)throw new Error(`Wheel not found at ${c} (HTTP ${e.status})`);if((e.headers.get("content-type")||"").includes("text/html"))throw new Error(`Wheel URL returned HTML. Check that .whl exists at ${c}`);await r.runPythonAsync(`
import micropip
await micropip.install('${c}')
`)}catch(e){throw new Error(`Failed to install python-crfsuite: ${e}`)}try{await r.runPythonAsync(`
import micropip
await micropip.install('sklearn-crfsuite')
`)}catch(e){throw new Error(`Failed to install sklearn-crfsuite: ${e}`)}o({type:"INIT_PROGRESS",step:"Loading CRF pipeline scripts…"}),await R();const t=m();console.log(`[pyodide-worker] Init complete. Model exists: ${t}`),o({type:"INIT_DONE",modelExists:t})})().catch(t=>{throw a=null,r=null,o({type:"INIT_ERROR",error:String(t)}),t}),a)}async function R(){const[t,e]=await Promise.all([fetch("/u2u_morphseg/py/crf_al.py"),fetch("/u2u_morphseg/py/crf_bridge.py")]);if(!t.ok)throw new Error(`Failed to fetch crf_al.py: ${t.status}`);if(!e.ok)throw new Error(`Failed to fetch crf_bridge.py: ${e.status}`);const[i,n]=await Promise.all([t.text(),e.text()]);r.FS.writeFile("/tmp/crf_al.py",i),r.FS.writeFile("/tmp/crf_bridge.py",n),await r.runPythonAsync(`
import sys
sys.path.insert(0, '/tmp')
exec(open('/tmp/crf_bridge.py').read())
`)}async function S(t){const e={...t,workDir:s};h("init"),r.globals.set("_config_json",JSON.stringify(e)),l("init","VFS ready"),h("train");const i=await r.runPythonAsync("run_training_cycle(_config_json)");l("train","Model trained");const n=JSON.parse(i);if(n.error){o({type:"CYCLE_ERROR",error:n.error});return}l("predict",`${n.incrementWords.length} words selected`),l("select",`${n.residualCount} words remain in pool`),g(e.workDir);try{await p()}catch(P){console.warn("[pyodide-worker] Post-cycle IDBFS sync failed (non-fatal):",P)}o({type:"CYCLE_DONE",result:{precision:n.precision,recall:n.recall,f1:n.f1,incrementWords:n.incrementWords,residualCount:n.residualCount,incrementContent:n.incrementContent,residualContent:n.residualContent,evaluationContent:n.evaluationContent}})}async function I(t){const e={...t,workDir:s};r.globals.set("_inference_config_json",JSON.stringify(e));const i=await r.runPythonAsync("run_inference(_inference_config_json)"),n=JSON.parse(i);if(n.error){o({type:"INFERENCE_ERROR",error:n.error});return}o({type:"INFERENCE_DONE",result:{predictionsContent:n.predictionsContent,totalWords:n.totalWords}})}function g(t){try{r.runPython(`
import os, shutil
for root, dirs, files in os.walk('${t}'):
    for f in files:
        if f.endswith('.pyc'):
            os.remove(os.path.join(root, f))
    for d in dirs:
        if d == '__pycache__':
            shutil.rmtree(os.path.join(root, d))
for d in ['/tmp/__pycache__']:
    if os.path.exists(d):
        shutil.rmtree(d)
`)}catch{}}async function F(){try{r.runPython(`
import os, shutil
work_dir = '${s}'
if os.path.exists(work_dir):
    shutil.rmtree(work_dir)
    os.makedirs(work_dir)
`),await p()}catch(t){console.warn("[pyodide-worker] VFS wipe failed (non-fatal):",t)}o({type:"VFS_WIPED"})}try{self.onmessage=async t=>{const e=t.data;switch(e.type){case"INIT":try{await f()}catch(i){console.error("[pyodide-worker] Init failed:",i)}break;case"RUN_CYCLE":try{r||await f(),await S(e.payload)}catch(i){o({type:"CYCLE_ERROR",error:String(i)})}break;case"RUN_INFERENCE":try{r||await f(),await I(e.payload)}catch(i){o({type:"INFERENCE_ERROR",error:String(i)})}break;case"SYNC_VFS":try{r&&await p()}catch{}o({type:"VFS_SYNCED"});break;case"WIPE_VFS":try{r?await F():o({type:"VFS_WIPED"})}catch{o({type:"VFS_WIPED"})}break}}}catch(t){console.error("[pyodide-worker] FATAL: Failed to set up worker:",t);try{self.postMessage({type:"INIT_ERROR",error:`Worker setup failed: ${t}`})}catch{}}function o(t){self.postMessage(t)}function h(t){o({type:"STEP_START",stepId:t})}function l(t,e){o({type:"STEP_DONE",stepId:t,detail:e})}})();
