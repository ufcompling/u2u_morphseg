import os, pickle
from sklearn_crfsuite import CRF

from aliases import DatasetFeatures, DatasetLabels

def build_crf(X: DatasetFeatures, y: DatasetLabels, max_iterations: int) -> CRF:
    """
	Builds and trains a CRF model.
	
	:param sub_datadir: The subdirectory to save the model in
	:type sub_datadir: str
	:param X_train: The training features
	:type X_train: DatasetFeatures
	:param Y_train: The training labels
	:type Y_train: DatasetLabels
	:param max_iterations: The maximum number of iterations for training
	:type max_iterations: int
	:return: The trained CRF model
	:rtype: CRF
	"""
    crf: CRF = CRF(
        algorithm='lbfgs',
        c1=0.1,
        c2=0.1,
        max_iterations=max_iterations,
        all_possible_transitions=True
    )
    crf.fit(X, y)
    return crf

def save_crf(crf: CRF, work_dir: str, file_name: str) -> None:
    with open(os.path.join(work_dir, file_name), 'wb') as f:
        pickle.dump(crf, f)

def load_crf(work_dir: str, file_name: str) -> CRF | None:
    path = os.path.join(work_dir, file_name)
    if not os.path.exists(path):
        return None
    with open(path, 'rb') as f:
        return pickle.load(f)