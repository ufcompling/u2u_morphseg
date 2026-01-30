import os, argparse, shutil
import sklearn_crfsuite
import pickle
import statistics
from typing import TypeAlias, TypedDict, Literal, cast

# Unused Libraries:
# from sklearn.model_selection import train_test_split
# from collections import Counter
# from sklearn import metrics
# import matplotlib.pyplot as plt
# from sklearn.metrics import precision_recall_fscore_support
# from scipy.special import rel_entr

# Type Hinting
Word: TypeAlias = str
Morph: TypeAlias = str
MorphList: TypeAlias = list[str]
PredictionLabel: TypeAlias = Literal['B', 'M', 'E', 'S', '[', ']']

CharFeatures: TypeAlias = dict[str, int]
WordFeatures: TypeAlias = list[CharFeatures]
DatasetFeatures: TypeAlias = list[WordFeatures]

WordLabels: TypeAlias = list[PredictionLabel]
DatasetLabels: TypeAlias = list[WordLabels]

WordChars: TypeAlias = list[str]
DatasetChars: TypeAlias = list[WordChars]

ConfidenceScore: TypeAlias = float
ConfidenceData: TypeAlias = tuple[Word, list[Morph], ConfidenceScore]

CharMarginals: TypeAlias = dict[PredictionLabel, float]
WordMarginals: TypeAlias = list[CharMarginals]
DatasetMarginals: TypeAlias = list[WordMarginals]

BMESDict: TypeAlias = dict[Word, str]

class DatasetInfo(TypedDict):
	words: list[Word]
	morphs: list[MorphList]
	bmes: BMESDict

class DataDict(TypedDict):
	train: DatasetInfo
	test: DatasetInfo
	select: DatasetInfo

def main() -> None:

	args: argparse.Namespace = parse_arguments()
	sub_datadir: str = setup_datadirs(args)

	PATHS: dict[str, str] = {
		# Data gathering file paths
		'TRAIN_TGT': f'{sub_datadir}/train.{args.initial_size}.tgt',
		'TEST_TGT': f'{args.datadir}/{args.lang}/test.full.tgt',
		'SELECT_TGT': f'{sub_datadir}/select.{args.initial_size}.tgt',
		# Prediction saving file paths
		'TEST_PRED': f'{sub_datadir}/test.full.pred',
		'SELECT_PRED': f'{sub_datadir}/select.{args.initial_size}.pred',
		# Source file paths
		'TRAIN_SRC': f'{sub_datadir}/train.{args.initial_size}.src',
		'TEST_SRC': f'{args.datadir}/{args.lang}/test.full.src',
		'SELECT_SRC': f'{sub_datadir}/select.{args.initial_size}.src',
		# Evaluation file paths
		'EVAL_FILE': f'{sub_datadir}/eval.txt'	
	}

	# Gather words, morphs, and bmes
	data: DataDict = process_data(PATHS['TRAIN_TGT'], PATHS['TEST_TGT'], PATHS['SELECT_TGT'])
	
	# Build and evaluate the model
	Y_test_predict, Y_select_predict = build_and_output_crf(sub_datadir, args, data)

	# Outputting predictions for the test and the select file
	test_predictions: list[MorphList] = reconstruct_predictions(Y_test_predict, data['test']['words'])
	save_predictions(test_predictions, PATHS['TEST_PRED'])

	if os.path.exists(PATHS['SELECT_SRC']):
		select_predictions: list[MorphList] = reconstruct_predictions(Y_select_predict, data['select']['words'])	
		save_predictions(select_predictions, PATHS['SELECT_PRED'])

	# Overall evaluation metrics
	average_precision, average_recall, average_f1 = evaluate_predictions(data['test']['morphs'], test_predictions)
	with open(PATHS['EVAL_FILE'], 'w') as f:
		f.write(f'Precision: {average_precision}\n')
		f.write(f'Recall: {average_recall}\n')
		f.write(f'F1: {average_f1}\n')

	print('Complete!')
	print(f'  Language: {args.lang.title()}')
	print(f'  Initial Size: {args.initial_size}')
	print(f'  Average Precision: {average_precision}')
	print(f'  Average Recall: {average_recall}')
	print(f'  Average F1 Score: {average_f1}')

# TODO: Remove and replace with method of receiving these values from frontend!!!
def parse_arguments() -> argparse.Namespace:
	parser: argparse.ArgumentParser = argparse.ArgumentParser()
	parser.add_argument('--datadir', type = str, default = 'data', help = 'path to data')
	parser.add_argument('--lang', type = str, default = 'lang', help = 'language')
	parser.add_argument('--initial_size', type = str, default = '100', help = 'data initial_size to start AL iteration')
	parser.add_argument('--seed', type = str, default = '0', help = 'different initial training sets')
	parser.add_argument('--method', type = str, default = 'al')
	parser.add_argument('--select_interval', type = int, default = 50, help = 'how much data to select in each AL iteration; 50, 100, maybe larger')
	parser.add_argument('--select_size', type = int, default = 0, help = 'how much data have selected from all AL iterations thus far')
	parser.add_argument('--d', type = int, default = 4, help = 'delta; context window to consider for feature set construction')
	parser.add_argument('--e', type = float, default = 0.001, help = 'epsilon parameter for training CRF; may not use this in training')
	parser.add_argument('--i', type = int, default = 100, help = 'maximum number of iterations for training CRF')

	return parser.parse_args()

### Set up directories ###
def read_file(file_path: str) -> str:
	with open(file_path, 'r', encoding='utf-8') as f:
		return f.read()
	
def write_file(file_path: str, content: str) -> None:
	with open(file_path, 'w', encoding='utf-8') as f:
		f.write(content)

def setup_datadirs(args: argparse.Namespace) -> str:
	# Data directory for the current iteration
	sub_datadir: str = f'{args.datadir}/{args.lang}/{args.initial_size}/{args.seed}/{args.method}/{args.select_interval}/select{args.select_size}'
	if not os.path.exists(sub_datadir):
		os.makedirs(sub_datadir)

	if args.select_size != 0:
		# Data directory for the previous iteration
		prev_datadir: str = f'{args.datadir}/{args.lang}/{args.initial_size}/{args.seed}/{args.method}/{args.select_interval}/select{int(args.select_size) - int(args.select_interval)}'
		
		# Labeled set = previous training set + previous increment
		train_src: str = read_file(f'{prev_datadir}/train.{args.initial_size}.src')
		increment_src: str = read_file(f'{prev_datadir}/increment.src')
		write_file(f'{sub_datadir}/train.{args.initial_size}.src', train_src + increment_src)

		train_tgt: str = read_file(f'{prev_datadir}/train.{args.initial_size}.tgt')
		increment_tgt: str = read_file(f'{prev_datadir}/increment.tgt')
		write_file(f'{sub_datadir}/train.{args.initial_size}.tgt', train_tgt + increment_tgt)
		
		# Unlabeled set = previous residual
		shutil.copy(f'{prev_datadir}/residual.src', f'{sub_datadir}/select.{args.initial_size}.src')
		shutil.copy(f'{prev_datadir}/residual.tgt', f'{sub_datadir}/select.{args.initial_size}.tgt')

	return sub_datadir

### Gathering Data ###
def get_line_morphs(line: str) -> tuple[Word, MorphList]:
	toks: list[str] = line.strip().split()
	morphs: MorphList = ''.join(toks).split('!')
	word: Word = ''.join(m for m in morphs)
	return word, morphs

def get_bmes_labels(morphs: MorphList) -> str:
	label: str = ''

	for morph in morphs:
		if len(morph) == 1:
			label += 'S'
		else:
			label += 'B'

			for _ in range(len(morph)-2):
				label += 'M'

			label += 'E'

	return label

def load_file_data(file_path: str | None) -> tuple[list[Word], list[MorphList], BMESDict]:
	words: list[Word] = []
	morphs: list[MorphList] = []
	bmes: BMESDict = dict()

	if not file_path or not os.path.exists(file_path):
		return words, morphs, bmes

	with open(file_path, encoding='utf-8') as f:
		for line in f:
			word, line_morphs = get_line_morphs(line)
			bmes_labels: str = get_bmes_labels(line_morphs)

			words.append(word)
			morphs.append(line_morphs)
			bmes[word] = bmes_labels
		
	return words, morphs, bmes

def process_data(train_path: str, test_path: str, select_path: str | None = None) -> DataDict:  # *.tgt files 

	train_words, train_morphs, train_bmes = load_file_data(train_path)
	test_words, test_morphs, test_bmes = load_file_data(test_path)
	select_words, select_morphs, select_bmes = load_file_data(select_path)

	return {
		'train': {
			'words': train_words,
			'morphs': train_morphs,
			'bmes': train_bmes
		},
		'test': {
			'words': test_words,
			'morphs': test_morphs,
			'bmes': test_bmes
		},
		'select': {
			'words': select_words,
			'morphs': select_morphs,
			'bmes': select_bmes
		}
	}

### Computing Features ###
def get_char_features(bounded: Word, i: int, delta: int) -> CharFeatures:
	char_dict: CharFeatures = {}

	for j in range(delta):
		char_dict[f'right_{bounded[i:i+j+1]}'] = 1

	for j in range(delta):
		if i - j - 1 < 0: 
			break
		char_dict[f'left_{bounded[i-j-1:i]}'] = 1

	char_dict[f'pos_start_{i}'] = 1  # extra feature: left index of the letter in the word

	return char_dict

def get_word_features(word: Word, bmes: BMESDict, delta: int) -> tuple[WordFeatures, WordLabels, WordChars]:
	bounded_word: Word = f'[{word}]' # <w> and <\w> replaced with [ and ], respectively
	features: WordFeatures = [] # list (word) of dicts (chars)
	labels: WordLabels = [] # list (word) of labels (chars)
	word_chars: WordChars = [] # list (learning set) of list (word) of chars
	
	for i in range(len(bounded_word)):
		char_dict: CharFeatures = get_char_features(bounded_word, i, delta)
		features.append(char_dict)

		char: str = bounded_word[i]
		word_chars.append(char)

		if char in ['[', ']']: # labeling start and end
			labels.append(cast(PredictionLabel, char))
		else: # labeling chars
			labels.append(cast(PredictionLabel, bmes[word][i-1]))

	return features, labels, word_chars

def get_features(words: list[Word], bmes: BMESDict, delta: int) -> tuple[DatasetFeatures, DatasetLabels, DatasetChars]:

	X: DatasetFeatures = [] # list (learning set) of list (word) of dicts (chars), INPUT for crf
	Y: DatasetLabels = [] # list (learning set) of list (word) of labels (chars), INPUT for crf
	dataset_chars: DatasetChars = [] # list (learning set) of list (word) of chars

	for word in words:
		features, labels, word_chars = get_word_features(word, bmes, delta)
		X.append(features)
		Y.append(labels)
		dataset_chars.append(word_chars)

	return X, Y, dataset_chars

### Sorting Data based on Confidence ###
def get_confidence_scores(words: list[Word], predictions: DatasetLabels, marginals: DatasetMarginals) -> list[ConfidenceScore]:

	confscores: list[ConfidenceScore] = []
	for word, prediction, marginal in zip(words, predictions, marginals):
		# Remove '[' and ']' so that the characters match up with the labels
		boundless_pred, boundless_marg = prediction[1:-1], marginal[1:-1]
		confscores.append(sum(boundless_marg[i][label] for i, label in enumerate(boundless_pred)) / len(word))

	return confscores

def sort_by_confidence(words: list[Word], morphs: list[MorphList], confscores: list[ConfidenceScore]) -> list[ConfidenceData]:
	
	# Sort words/morphs by their confidence
	with_confidence: list[ConfidenceData] = sorted(zip(words, morphs, confscores), key=lambda x: x[2])

	# For debugging:
	# SEPARATOR = '|'
	# sorted_words, sorted_morphs, sorted_confidence = zip(*with_confidence)
	# datastring = []
	# for i in range(len(sorted_words)):
	# 	pairs = list(zip(sorted_words[i], sorted_morphs[i]))
	# 	info = ' '.join(pair[0] + SEPARATOR + pair[1] for pair in pairs) + '\t' + str(sorted_confidence[i])
	# 	datastring.append(info)

	return with_confidence

### Building Models ###

def build_crf(sub_datadir: str, X_train: DatasetFeatures, Y_train: DatasetLabels, max_iterations: int = 100) -> sklearn_crfsuite.CRF:

	crf: sklearn_crfsuite.CRF = sklearn_crfsuite.CRF(
		algorithm='lbfgs',
		c1=0.1,
		c2=0.1,
		max_iterations=max_iterations,
		all_possible_transitions=True
	)
	crf.fit(X_train, Y_train)
	with open(f'{sub_datadir}/crf.model', 'wb') as f:
		pickle.dump(crf, f)

	return crf

def split_increment_residual(confidence_data: list[ConfidenceData], select_interval: int) -> tuple[list[ConfidenceData], list[ConfidenceData]]:

	increment_data: list[ConfidenceData] = confidence_data[:select_interval]
	residual_data: list[ConfidenceData] = confidence_data[select_interval:]

	return increment_data, residual_data

def save_data(confidence_data: list[ConfidenceData], sub_datadir: str, file_name: str) -> None:
	words, morphs_list, _ = zip(*confidence_data)
	
	src_content: list[str] = [' '.join(word) + '\n' for word in words]
	with open(f'{sub_datadir}/{file_name}.src', 'w', encoding='utf-8') as src:
		src.writelines(src_content)

	tgt_content: list[str] = [' '.join('!'.join(morphs)) + '\n' for morphs in morphs_list]
	with open(f'{sub_datadir}/{file_name}.tgt', 'w', encoding='utf-8') as tgt:
		tgt.writelines(tgt_content)
		
def output_crf(crf: sklearn_crfsuite.CRF, sub_datadir: str, args: argparse.Namespace, data: DataDict, X_test: DatasetFeatures) -> tuple[DatasetLabels, DatasetLabels]:

	Y_test_predict: DatasetLabels = crf.predict(X_test)

	Y_select_predict: DatasetLabels = []
	if data['select']['words']:
		X_select, _, _ = get_features(data['select']['words'], data['select']['bmes'], args.d)
		Y_select_predict = crf.predict(X_select)

		# Get Confidence Data
		marginals: DatasetMarginals = crf.predict_marginals(X_select)
		confscores: list[ConfidenceScore] = get_confidence_scores(data['select']['words'], Y_select_predict, marginals)
		conf_sorted_data: list[ConfidenceData] = sort_by_confidence(data['select']['words'], data['select']['morphs'], confscores)

		# Generate increment.src and residual.src
		increment_data, residual_data = split_increment_residual(conf_sorted_data, args.select_interval)
		save_data(increment_data, sub_datadir, 'increment')
		save_data(residual_data, sub_datadir, 'residual')

	return Y_test_predict, Y_select_predict

def build_and_output_crf(sub_datadir: str, args: argparse.Namespace, data: DataDict) -> tuple[DatasetLabels, DatasetLabels]:

	X_train, Y_train, _ = get_features(data['train']['words'], data['train']['bmes'], args.d)
	X_test, _, _ = get_features(data['test']['words'], data['test']['bmes'], args.d)

	crf: sklearn_crfsuite.CRF = build_crf(sub_datadir, X_train, Y_train)
	
	return output_crf(crf, sub_datadir, args, data, X_test)

# Going from predicted labels to predicted morphemes
def reconstruct_predictions(pred_labels: DatasetLabels, words: list[Word]) -> list[MorphList]:

	predictions: list[MorphList] = []

	for pred, word in zip(pred_labels, words):

		# Remove '[' and ']' and split by end markers (E)
		labels: list[str] = [label for label in ''.join(w for w in pred[1:-1]).split('E') if label]
		
		new_labels: list[str] = []
		for tok in labels:
			
			# If nothing is marked single, then it's fine; add back the end marker
			if 'S' not in tok:
				tok += 'E'
				new_labels.append(tok)

			# Otherwise, if the tok only contains single markers, then add that many single markers
			elif (s_count := tok.count('S')) == len(tok):
				new_labels.extend(['S'] * s_count)
			
			# Otherwise, append an S marker for the single morphemes or concatenate an end marker to each morpheme and add it
			else:
				for bmes_label in tok.split('S'):
					if bmes_label == '':
						new_labels.append('S')
					else:
						new_labels.append(bmes_label + 'E')

		morphs: MorphList = []

		for i in range(len(new_labels)):
			tok_length: int = len(new_labels[i])
			if i == 0:
				morphs.append(word[0:tok_length])
			else:
				pre: int = len(''.join(z for z in new_labels[:i]))
				morphs.append(word[pre:pre+tok_length])

		predictions.append(morphs)

	return predictions

# Save predictions
def save_predictions(predictions: list[MorphList], file_path: str) -> None:
	with open(file_path, 'w', encoding = 'utf-8') as f:
		for morphs in predictions:
			segmented: Word = '!'.join(morphs)
			f.write(' '.join(c for c in segmented) + '\n')

# Evaluate predictions with statistical metrics (precision, recall, F1 score)
def calculate_metrics(y_true: MorphList, y_pred: MorphList) -> tuple[float, float, float]:
	correct_total: int = sum(1 for m in y_pred if m in y_true)

	if not y_pred:
		return 0, 0, 0

	precision: float = correct_total / len(y_pred) * 100
	recall: float = correct_total / len(y_true) * 100
	f1: float = 2 * (precision * recall) / (precision + recall) if precision + recall != 0 else 0

	return round(precision, 2), round(recall, 2), round(f1, 2)

def evaluate_predictions(gold_word: list[MorphList], pred_word: list[MorphList]) -> tuple[float, float, float]:
	precision_scores: list[float] = []
	recall_scores: list[float] = []
	f1_scores: list[float] = []

	for gold_morphs, pred_morphs in zip(gold_word, pred_word):
		precision, recall, f1 = calculate_metrics(gold_morphs, pred_morphs)
		precision_scores.append(precision)
		recall_scores.append(recall)
		f1_scores.append(f1)

	average_precision, average_recall, average_f1 = (round(statistics.mean(x), 2) for x in (precision_scores, recall_scores, f1_scores))
	return average_precision, average_recall, average_f1

if __name__ == '__main__':
	main()
