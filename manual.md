# User Manual: Active Learning Morphological Segmenter

This manual provides a step-by-step guide on how to use the application for morphological data annotation and model training. For technical details, installation, and dependency management, please refer to the [README.md](README.md).

---

## Table of Contents
1. [Configuration Stage](#1-configuration-stage)
2. [Upload Stage](#2-upload-stage)
3. [Training Stage](#3-training-stage)
4. [Result Stage](#4-result-stage)
5. [Annotate Stage](#5-annotate-stage)
6. [Data Formatting Requirements](#data-formatting-requirements)
7. [Troubleshooting (QA)](#troubleshooting-qa)

---
<img width="500" height="800" alt="config stage" src="https://github.com/user-attachments/assets/120dabb4-b1b3-47f0-b415-fa93acb3dbdb" />

## 1. Configuration Stage
The initial setup defines how the machine learning model (CRF) interacts with your data.

* **Target Language:** Enter the language of your morphological data.
* **Annotated File Delimiter:** The specific character used to separate morphemes in your training file (e.g., `-`, `!`, or `|`). **This must match your file exactly.**
* **Seed:** Controls the 80/20 train/test split. Leave empty for a random split, or enter a fixed integer to ensure the same results across different sessions.
* **Query Strategy:** Select the methodology the model uses to pick which samples you should annotate next (e.g., Least Confidence or Random).
* **Restore Snapshot:** If you have a previously saved session file (`.json`), use the **Restore** button to skip setup and resume your progress. This will repopulate the workbench with your intermediate annotated words and restore the current state of the CRF model.
* **Upload Files:** Proceeds to the file upload interface to begin a new project session.

---

## 2. Upload Stage
<img width="450" height="500" alt="upload stage" src="https://github.com/user-attachments/assets/4d6d22ae-5699-4471-9c4c-dad5ecddf472" />

In this stage, you provide the raw materials for the model.

1. Users must upload two separate files: an Annotated (labeled) dataset and an Unannotated (raw) corpus. Currently, only .txt format is supported.
2. Files can be imported via drag-and-drop or by clicking the upload dialogue box.
3. The annotated file must strictly adhere to the delimiter specified during the initial Configuration Stage to ensure correct parsing.
4. After uploading, use the dropdown menu adjacent to each filename to designate the file as either "Annotated" or "Unannotated."
5. **Start Training:**: Proceeds to the model training interface.


---

## 3. Training Stage
<img width="430" height="520" alt="training stage" src="https://github.com/user-attachments/assets/08ef6b4a-e306-4d83-807c-09e0e0c4b54c" />

This is an automated background process where the CRF (Conditional Random Field) model learns from your annotated data. 

* Once the progress bar completes, click **Continue to Results**.

---

## 4. Result Stage
<img width="400" height="620" alt="result stage" src="https://github.com/user-attachments/assets/5ae8f845-7d5d-4754-a700-8683ea489565" />

After training, you can evaluate the model's performance or proceed to manual annotation.

* **Run:** Executes model inference on all remaining unlabeled words. Upon completion, a "Download Predictions" option becomes available to export the model's boundary detections.
* **Export Increment:** Downloads the specific batch of words the model has selected for you to annotate next.
* **Export Residual:** Downloads the pool of words that have not yet been processed.
* **Export Evaluation:** Generates a detailed report including **F1, Precision, and Recall** scores to track model accuracy.
* **Annotate Cycle:** Move to the manual interface to begin the next iteration of manual annotation.
* **Reset Project:** Clears local storage and returns you to the start.

---

## 5. Annotate Stage
<img width="700" height="700" alt="annotate stage" src="https://github.com/user-attachments/assets/417221dd-a7ff-4eb9-8d72-0fbf9a2f4792" />

This is the core "Human-in-the-loop" interface.

* **Navigation:** Use the circular icons or the **Prev/Next** buttons to move between words in the current batch.
* **Editing Boundaries:** The model pre-populates the word with predicted boundaries represented by vertical bars. Click in the space between characters to **add** or **remove** a boundary.
* **Confirming:** After correcting a word, click **Confirm**. A confirmed word's icon will change color.
* **Snapshot:** Use this at any time to save your current manual progress to a file. This ensures no progress is lost if the session is interrupted.
* **Submit All:** Once the batch is finished, click this to feed your new corrections back into the model for the next training cycle.

---

## Data Formatting Requirements

To ensure the system parses your data correctly, please adhere to the following:

| Type | Requirement | Example |
| :--- | :--- | :--- |
| **Annotated** | One word per row, using the consistent delimiter defined in Configuration. | `un!happi!ness` |
| **Unannotated** | One raw word per row. | `unhappiness` |
| **Spacing** | Any spaces within a word are ignored automatically. | `un hap piness` → `unhappiness` |

---

## Troubleshooting (QA)

**Q: The application has frozen or is stuck on a specific stage. What should I do?**

**A:** This is usually caused by a conflict in the browser's local storage. Clearing the **Cache** and **IndexedDB** will reset the application state and resolve most local execution errors.

**How to clear site data (Chrome/Edge):**

| Step | Action | Visual Guide |
| :--- | :--- | :--- |
| **1** | Click **“View site information”** next to the URL. | <img width="300" height="44" alt="image" src="https://github.com/user-attachments/assets/3164115a-7ec4-4c09-a16a-2655cfd56884" /> |
| **2** | Select **“Cookies and site data”**. |<img width="256" height="205" alt="image" src="https://github.com/user-attachments/assets/be7eba42-1052-40b5-9096-c599913d6602" /> |
| **3** | Click **“Manage on-device site data”**. | <img width="256" height="205" alt="image" src="https://github.com/user-attachments/assets/e5ee52bd-8068-45e6-84a7-f058cdc420c5" /> |
| **4** | Click the **trash can icon** and then **“Done”**. |<img width="400" height="280" alt="image" src="https://github.com/user-attachments/assets/a03d84ec-529f-4dd5-b62d-f90f97ba0f67" />  |
| **5** | **Reload** the site to apply changes. | |
