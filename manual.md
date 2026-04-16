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

## 1. Configuration Stage
The initial setup defines how the machine learning model (CRF) interacts with your data.

* **Target Language:** Enter the language of your morphological data.
* **Annotated File Delimiter:** The specific character used to separate morphemes in your training file (e.g., `-`, `!`, or `|`). **This must match your file exactly.**
* **Seed:** Controls the 80/20 train/test split. Leave empty for a random split, or enter a fixed integer to ensure the same results across different sessions.
* **Query Strategy:** Select the methodology the model uses to pick which samples you should annotate next (e.g., Least Confidence or Random).
* **Restore Snapshot:** If you have a previously saved session file (`.json`), use the **Restore** button to skip setup and resume your progress.
* **Upload Files:** Once configured, click this to move to the next stage.

> *[Insert Screenshot: Configuration Interface]*

---

## 2. Upload Stage
In this stage, you provide the raw materials for the model.

1.  **File Selection:** Upload two separate `.txt` files. You can drag-and-drop or use the file dialogue.
    * **Annotated Dataset:** Your "Gold Standard" labeled data.
    * **Unannotated Corpus:** The raw list of words you wish to segment.
2.  **Labeling:** After uploading, use the dropdown menu next to each file to designate it as "Annotated" or "Unannotated."
3.  **Start Training:** Click this once both files are correctly assigned to begin the first active learning cycle.

---

## 3. Training Stage
This is an automated background process where the CRF (Conditional Random Field) model learns from your annotated data. 

* Once the progress bar completes, click **Continue to Results**.

> *[Insert Screenshot: Training Progress Bar]*

---

## 4. Result Stage
After training, you can evaluate the model's performance or proceed to manual annotation.

* **Run:** Executes model inference on all remaining unlabeled words. Upon completion, a "Download Predictions" option becomes available to export the model's boundary detections.
* **Export Increment:** Downloads the specific batch of words the model has selected for you to annotate next.
* **Export Residual:** Downloads the pool of words that have not yet been processed.
* **Export Evaluation:** Generates a detailed report including **F1, Precision, and Recall** scores to track model accuracy.
* **Annotate Cycle:** Move to the manual interface to begin the next iteration of manual annotation.
* **Reset Project:** Clears local storage and returns you to the start.

---

## 5. Annotate Stage
This is the core "Human-in-the-loop" interface.

* **Navigation:** Use the circular icons or the **Prev/Next** buttons to move between words in the current batch.
* **Editing Boundaries:** The model pre-populates the word with predicted boundaries represented by vertical bars. Click in the space between characters to **add** or **remove** a boundary.
* **Confirming:** After correcting a word, click **Confirm**. A confirmed word's icon will change color.
* **Snapshot:** Use this at any time to save your current manual progress to a file. This ensures no progress is lost if the session is interrupted.
* **Submit All:** Once the batch is finished, click this to feed your new corrections back into the model for the next training cycle.

> *[Insert Screenshot: Annotation Workspace]*

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

**Q: The application has frozen or is stuck on a specific stage. What should I do?** **A:** This is usually caused by a conflict in the browser's local storage. Clearing the **Cache** and **IndexedDB** will reset the application state and resolve most local execution errors.

**How to clear site data (Chrome/Edge):**
1.  Click the **"View site information"** icon (lock or settings icon) next to the URL.
2.  Select **"Cookies and site data."**
3.  Click **"Manage on-device site data."**
4.  Click the **trash can icon** next to the site entry and click **Done.**
5.  **Reload** the page.