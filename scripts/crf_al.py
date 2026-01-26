from collections import Counter
from sklearn.model_selection import train_test_split
from sklearn import metrics
from sklearn.metrics import precision_recall_fscore_support
import sklearn_crfsuite
import matplotlib.pyplot as plt
import argparse
import pickle
import io, os
import statistics
from scipy.special import rel_entr

# TODO: Remove and replace with method of receiving these values from frontend!!!
def parse_arguments() -> argparse.Namespace:
	parser = argparse.ArgumentParser()
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
def setup_datadirs(args: argparse.Namespace) -> str:
	# Data directory for the current iteration
	sub_datadir: str = f'{args.datadir}/{args.lang}/{args.initial_size}/{args.seed}/{args.method}/{args.select_interval}/select{args.select_size}'
	if not os.path.exists(sub_datadir):
		os.makedirs(sub_datadir)

	# Data directory for the previous iteration
	if args.select_size != 0:
		prev_datadir: str = f'{args.datadir}/{args.lang}/{args.initial_size}/{args.seed}/{args.method}/{args.select_interval}/select{int(args.select_size) - int(args.select_interval)}'
		# Labeled set = previous training set + previous increment
		os.system(f'cat {prev_datadir}/train.{args.initial_size}.src {prev_datadir}/increment.src > {sub_datadir}/train.{args.initial_size}.src')
		os.system(f'cat {prev_datadir}/train.{args.initial_size}.tgt {prev_datadir}/increment.tgt > {sub_datadir}/train.{args.initial_size}.tgt')
		# Unlabeled set = previous residual
		os.system(f'cp {prev_datadir}/residual.src {sub_datadir}/select.{args.initial_size}.src')
		os.system(f'cp {prev_datadir}/residual.tgt {sub_datadir}/select.{args.initial_size}.tgt')

	return sub_datadir

### Gathering Data ###
def get_line_morphs(line: str) -> tuple[str, list[str]]:
	toks: list[str] = line.strip().split()
	morphs: list[str] = (''.join(c for c in toks)).split('!')
	word: str = ''.join(m for m in morphs)
	return word, morphs

def get_bmes_labels(morphs: list[str]) -> str:
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

def load_file_data(file_path: str | None) -> tuple[list[str], list[list[str]], dict[str, str]]:
	words: list[str] = []
	morphs: list[list[str]] = []
	bmes: dict[str, str] = dict()

	if not file_path or not os.path.exists(file_path):
		return words, morphs, bmes

	with io.open(file_path, encoding='utf-8') as f:
		for line in f:
			word, line_morphs = get_line_morphs(line)
			bmes_labels = get_bmes_labels(line_morphs)

			words.append(word)
			morphs.append(line_morphs)
			bmes[word] = bmes_labels
		
	return words, morphs, bmes

def process_data(train_path: str, test_path: str, select_path: str | None = None) -> dict[str, dict]:  # *.tgt files 

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
def get_char_features(bounded_word: str, i: int, delta: int) -> dict[str, int]:
	char_dict: dict[str, int] = {}

	for j in range(delta):
		char_dict[f'right_{bounded_word[i:i+j+1]}'] = 1

	for j in range(delta):
		if i - j - 1 < 0: 
			break
		char_dict[f'left_{bounded_word[i-j-1:i]}'] = 1

	char_dict[f'pos_start_{i}'] = 1  # extra feature: left index of the letter in the word

	return char_dict

def get_word_features(word: str, bmes: dict[str, str], delta: int) -> tuple[list[dict[str, int]], list[str], list[str]]:
	bounded_word = f'[{word}]' # <w> and <\w> replaced with [ and ], respectively
	features: list[dict[str, int]] = [] # list (word) of dicts (chars)
	labels: list[str] = [] # list (word) of labels (chars)
	chars: list[str] = [] # list (learning set) of list (word) of chars
	
	for i in range(len(bounded_word)):
		char_dict = get_char_features(bounded_word, i, delta)
		features.append(char_dict)

		char = bounded_word[i]
		chars.append(char)

		if char in ['[', ']']: # labeling start and end
			labels.append(char)
		else: # labeling chars
			labels.append(bmes[word][i-1])

	return features, labels, chars

def get_features(words: list[str], bmes: dict[str, str], delta: int) -> tuple[list[list[dict[str, int]]], list[list[str]], list[list[str]]]:

	X: list[list[dict[str, int]]] = [] # list (learning set) of list (word) of dicts (chars), INPUT for crf
	Y: list[list[str]] = []# list (learning set) of list (word) of labels (chars), INPUT for crf
	word_chars: list[list[str]] = [] # list (learning set) of list (word) of chars

	for word in words:
		features, labels, chars = get_word_features(word, bmes, delta)
		X.append(features)
		Y.append(labels)
		word_chars.append(chars)

	return X, Y, word_chars

### Sorting Data based on Confidence ###
def get_confidence_scores(words: list[str], predictions: list[list[str]], marginals: list[list[dict[str, int]]]) -> list[float]:

	Y_select_predicted_sequences: list[list[tuple[str, str]]] = [list(zip(words[i], predictions[i])) for i in range(len(predictions))]

	confscores: list[float] = []
	for s, word in enumerate(Y_select_predicted_sequences):
		confscores.append(sum(marginals[s][i][wordpair[1]] for i, wordpair in enumerate(word))/len(word))

	return confscores

def sort_by_confidence(words: list[str], morphs: list[list[str]], confscores: list[float]) -> list[tuple[str, list[str], float]]:
	
	# Sort words/morphs by their confidence
	with_confidence: list[tuple[str, list[str], float]] = sorted(list(zip(words, morphs, confscores)), key=lambda x: x[2])

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

def build_crf(sub_datadir: str, X_train: list[list[dict[str, int]]], Y_train: list[list[str]], max_iterations: int = 100) -> sklearn_crfsuite.CRF:

	crf: sklearn_crfsuite.CRF = sklearn_crfsuite.CRF(
		algorithm='lbfgs',
		c1=0.1,
		c2=0.1,
		max_iterations=max_iterations,
		all_possible_transitions=True
	)
	crf.fit(X_train, Y_train)
	pickle.dump(crf, io.open(f'{sub_datadir}/crf.model', 'wb'))

	return crf

def split_increment_residual(confidence_data: list[tuple[str, list[str], float]], select_interval: int) \
	-> tuple[list[tuple[str, list[str], float]], list[tuple[str, list[str], float]]]:

	increment_data: list[tuple[str, list[str], float]] = confidence_data[:select_interval]
	residual_data: list[tuple[str, list[str], float]] = confidence_data[select_interval:]

	return increment_data, residual_data

def save_data(data: list[tuple[str, list[str], float]], sub_datadir: str, file_name: str) -> None:
	
	words, morphs_list, _ = zip(*data)
	
	with open(f'{sub_datadir}/{file_name}.src', 'w', encoding='utf-8') as src:
		for word in words:
			src.write(' '.join(w for w in word) + '\n')

	with open(f'{sub_datadir}/{file_name}.tgt', 'w', encoding='utf-8') as tgt:
		for morphs in morphs_list:
			seg_word: str = '!'.join(morphs)
			tgt.write(' '.join(w for w in seg_word) + '\n')

def evaluate_crf(crf: sklearn_crfsuite.CRF, sub_datadir: str, args: argparse.Namespace, data: dict[str, dict], X_test: list[list[dict[str, int]]]) \
	-> tuple[list[list[str]], list[list[str]]]:

	Y_test_predict: list[list[str]] = crf.predict(X_test)

	Y_select_predict: list[list[str]] = []
	if data['select']['words']:
		X_select, _, _ = get_features(data['select']['words'], data['select']['bmes'], args.d)
		Y_select_predict = crf.predict(X_select)

		# Get Confidence Data
		marginals: list[list[dict[str, int]]] = crf.predict_marginals(X_select)
		confscores: list[float] = get_confidence_scores(data['select']['words'], Y_select_predict, marginals)
		conf_sorted_data: list[tuple[str, list[str], float]] = sort_by_confidence(data['select']['words'], data['select']['morphs'], confscores)

		# Generate increment.src and residual.src
		increment_data, residual_data = split_increment_residual(conf_sorted_data, args.select_interval)
		save_data(increment_data, sub_datadir, 'increment')
		save_data(residual_data, sub_datadir, 'residual')

	return Y_test_predict, Y_select_predict

def build_and_evaluate_crf(sub_datadir: str, args: argparse.Namespace, data: dict[str, dict]) -> tuple[list[list[str]], list[list[str]]]:

	X_train, Y_train, _ = get_features(data['train']['words'], data['train']['bmes'], args.d)
	X_test, _, _ = get_features(data['test']['words'], data['test']['bmes'], args.d)

	crf: sklearn_crfsuite.CRF = build_crf(sub_datadir, X_train, Y_train)
	
	return evaluate_crf(crf, sub_datadir, args, data, X_test)

# Going from predicted labels to predicted morphemes
def reconstruct_predictions(pred_labels: list[list[str]], words: list[str]) -> list[list[str]]:

	predictions: list[list[str]] = []

	for i in range(len(pred_labels)):
		pred: list[str] = pred_labels[i]
		word: str = words[i]

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

		morphs: list[str] = []

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
def save_predictions(predictions: list[list[str]], file_path: str) -> None:
	with io.open(file_path, 'w', encoding = 'utf-8') as f:
		for tok in predictions:
			tok = '!'.join(m for m in tok)
			f.write(' '.join(c for c in tok) + '\n')

# Evaluate predictions with statistical metrics (precision, recall, F1 score)
def calculate_metrics(y_true: list[str], y_pred: list[str]) -> tuple[float, float, float]:
	correct_total: int = sum(1 for m in y_pred if m in y_true)

	if not y_pred:
		return 0, 0, 0

	precision: float = correct_total / len(y_pred) * 100
	recall: float = correct_total / len(y_true) * 100
	f1: float = 2 * (precision * recall) / (precision + recall) if precision + recall != 0 else 0

	return round(precision, 2), round(recall, 2), round(f1, 2)

def evaluate_predictions(gold_word: list[list[str]], pred_word: list[list[str]]) -> tuple[float, float, float]:
	precision_scores: list[float] = []
	recall_scores: list[float] = []
	f1_scores: list[float] = []

	for i in range(len(pred_word)):
		precision, recall, f1 = calculate_metrics(gold_word[i], pred_word[i])
		precision_scores.append(precision)
		recall_scores.append(recall)
		f1_scores.append(f1)

	average_precision, average_recall, average_f1 = (round(statistics.mean(x), 2) for x in (precision_scores, recall_scores, f1_scores))
	return average_precision, average_recall, average_f1

def main() -> None:

	args: argparse.Namespace = parse_arguments()
	sub_datadir: str = setup_datadirs(args)

	paths: dict[str, str] = {
		# Data gathering file paths
		'train_tgt': f'{sub_datadir}/train.{args.initial_size}.tgt',
		'test_tgt': f'{args.datadir}/{args.lang}/test.full.tgt',
		'select_tgt': f'{sub_datadir}/select.{args.initial_size}.tgt',
		# Prediction saving file paths
		'test_pred': f'{sub_datadir}/test.full.pred',
		'select_pred': f'{sub_datadir}/select.{args.initial_size}.pred',
		# Source file paths
		'test_src': f'{args.datadir}/{args.lang}/test.full.src',
		'train_src': f'{sub_datadir}/train.{args.initial_size}.src',
		'select_src': f'{sub_datadir}/select.{args.initial_size}.src',
		# Evaluation file paths
		'eval_file': f'{sub_datadir}/eval.txt'	
	}

	# Gather words, morphs, and bmes
	# data = {train/test/select: {words: [], morphs: [], bmes: {}}}
	data: dict[str, dict] = process_data(paths['train_tgt'], paths['test_tgt'], paths['select_tgt'])
	
	# Build and evaluate the model
	Y_test_predict, Y_select_predict = build_and_evaluate_crf(sub_datadir, args, data)

	# Outputting predictions for the test and the select file
	test_predictions: list[list[str]] = reconstruct_predictions(Y_test_predict, data['test']['words'])
	save_predictions(test_predictions, paths['test_pred'])

	if os.path.exists(paths['select_src']):
		select_predictions: list[list[str]] = reconstruct_predictions(Y_select_predict, data['select']['words'])	
		save_predictions(select_predictions, paths['select_pred'])

	# Overall evaluation metrics
	average_precision, average_recall, average_f1 = evaluate_predictions(data['test']['morphs'], test_predictions)
	with open(paths['eval_file'], 'w') as f:
		f.write(f'Precision: {average_precision}\n')
		f.write(f'Recall: {average_recall}\n')
		f.write(f'F1: {average_f1}\n')

	print('Complete!')
	print(f'  Language: {args.lang.title()}')
	print(f'  Initial Size: {args.initial_size}')
	print(f'  Average Precision: {average_precision}')
	print(f'  Average Recall: {average_recall}')
	print(f'  Average F1 Score: {average_f1}')

if __name__ == '__main__':
	main()
