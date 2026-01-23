from collections import Counter
from sklearn.model_selection import train_test_split
from sklearn import metrics
from sklearn.metrics import precision_recall_fscore_support
import sklearn_crfsuite
import matplotlib.pyplot as plt
import string
import itertools
import datetime
import re, argparse
import pickle
import io, os, sys
import statistics
import json
from scipy.special import rel_entr

def parse_arguments():

	parser = argparse.ArgumentParser()
	parser.add_argument('--datadir', type = str, default = 'data', help = 'path to data')
	parser.add_argument('--lang', type = str, help = 'language')
	parser.add_argument('--initial_size', type = str, default = '100', help = 'data initial_size to start AL iteration')
	parser.add_argument('--seed', type = str, default = '0', help = 'different initial training sets')
	parser.add_argument('--method', type = str, default = 'al')
	parser.add_argument('--select_interval', type = str, default = '50', help = 'how much data to select in each AL iteration; 50, 100, maybe larger')
	parser.add_argument('--select_size', type = str, default = '0', help = 'how much data have selected from all AL iterations thus far')
	parser.add_argument('--d', type = int, default = 4, help = 'delta; context window to consider for feature set construction')
	parser.add_argument('--e', type = float, default = 0.001, help = 'epsilon parameter for training CRF; may not use this in training')
	parser.add_argument('--i', type = int, default = 100, help = 'maximum number of iterations for training CRF')

	return parser.parse_args()

def setup_datadirs(args):
	# Data directory for the current iteration
	sub_datadir = f'{args.datadir}/{args.lang}/{args.initial_size}/{args.seed}/{args.method}/{args.select_interval}/select{args.select_size}'
	if not os.path.exists(sub_datadir):
		os.makedirs(sub_datadir)

	# Data directory for the previous iteration
	prev_datadir = ''
	if args.select_size not in ['0']:
		prev_datadir = f'{args.datadir}/{args.lang}/{args.initial_size}/{args.seed}/{args.method}/{args.select_interval}/select{int(args.select_size) - int(args.select_interval)}'

		# Training set = previous training set + previous increment
		os.system(f'cat {prev_datadir}/train.{args.initial_size}.src {prev_datadir}/increment.src > {sub_datadir}/train.{args.initial_size}.src')
		os.system(f'cat {prev_datadir}/train.{args.initial_size}.tgt {prev_datadir}/increment.tgt > {sub_datadir}/train.{args.initial_size}.tgt')
		# Unlabeled set = previous residual
		os.system(f'cp {prev_datadir}/residual.src {sub_datadir}/select.{args.initial_size}.src')
		os.system(f'cp {prev_datadir}/residual.tgt {sub_datadir}/select.{args.initial_size}.tgt')

	return sub_datadir

### Gathering data ###

def get_line_morphs(line):
	toks = line.strip().split()
	morphs = (''.join(c for c in toks)).split('!')
	word = ''.join(m for m in morphs)
	return word, morphs

def get_bmes_labels(morphs):
	label = ''

	for morph in morphs:
		if len(morph) == 1:
			label += 'S'
		else:
			label += 'B'

			for _ in range(len(morph)-2):
				label += 'M'

			label += 'E'

	return label

def load_file_data(file):
	words = []
	morphs = []
	bmes = dict()

	if not file or not os.path.exists(file):
		return words, morphs, bmes

	with io.open(file, encoding='utf-8') as f:
		for line in f:
			word, line_morphs = get_line_morphs(line)
			bmes_labels = get_bmes_labels(line_morphs)

			words.append(word)
			morphs.append(line_morphs)
			bmes[word] = bmes_labels
		
	return words, morphs, bmes

def process_data(train_path, test_path, select_path = None):   # *.tgt files 

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

### Computing features ###

def get_char_features(bounded_word, i, delta):
	char_dict = dict()

	for j in range(delta):
		char_dict['right_' + bounded_word[i:i+j+1]] = 1

	for j in range(delta):
		if i - j - 1 < 0: 
			break
		char_dict['left_' + bounded_word[i-j-1:i]] = 1

	char_dict['pos_start_' + str(i)] = 1  # extra feature: left index of the letter in the word

	return char_dict

def get_word_features(word, bmes, delta):
	bounded_word = f'[{word}]' # <w> and <\w> replaced with [ and ], respectively
	word_X = [] # list (word) of dicts (chars)
	word_Y = [] # list (word) of labels (chars)
	word_chars = [] # list (learning set) of list (word) of chars
	
	for i in range(len(bounded_word)):
		char_dict = get_char_features(bounded_word, i, delta)
		word_X.append(char_dict)

		char = bounded_word[i]
		word_chars.append(char)

		if bounded_word[i] in ['[', ']']: # labeling start and end
			word_Y.append(char)
		else: # labeling chars
			word_Y.append(bmes[word][i - 1])

	return word_X, word_Y, word_chars

def get_features(words, bmes, delta):

	X = [] # list (learning set) of list (word) of dicts (chars), INPUT for crf
	Y = [] # list (learning set) of list (word) of labels (chars), INPUT for crf
	word_chars = [] # list (learning set) of list (word) of chars

	for word in words:
		features, labels, chars = get_word_features(word, bmes, delta)
		X.append(features)
		Y.append(labels)
		word_chars.append(chars)

	return X, Y, word_chars

## Sorting data based on confidence
def sort_confidence(select_words, select_morphs, confscores, modelname):
	'''sort auto-annotated words based on how "confident" 
	the model was at it predictions of each character's label, 
	by increasing "confidence", 
	lower probability == less confidence.
	Writes to file.'''
	
	SEPARATOR = '|'

	# Sort words/morphs by their confidence
	with_confidence = sorted(list(zip(select_words, select_morphs, confscores)), key=lambda x: x[2])
	sorted_words, sorted_morphs, sorted_confidence = zip(*with_confidence)

	datastring = []
	for i in range(len(sorted_words)):
		pairs = list(zip(sorted_words[i], sorted_morphs[i]))
		info = ' '.join(pair[0] + SEPARATOR + pair[1] for pair in pairs) + '\t' + str(sorted_confidence[i])
		datastring.append(info)

	return with_confidence

### Building models ###

def build_crf(sub_datadir, X_train, Y_train):

	crf = sklearn_crfsuite.CRF(
		algorithm='lbfgs',
		c1=0.1,
		c2=0.1,
		max_iterations=100,
		all_possible_transitions=True
	)
	crf.fit(X_train, Y_train)
	pickle.dump(crf, io.open(f'{sub_datadir}/crf.model', 'wb'))

	return crf

# TODO!: refactor
def evaluate_crf(crf, sub_datadir, data, X_test, X_select, select_interval):
	Y_test_predict = crf.predict(X_test)
	Y_select_predict = []
	if data['select']['words'] != []:
		Y_select_predict = crf.predict(X_select)
		Y_select_predicted_sequences = [list(zip(data['select']['words'][i], Y_select_predict[i])) for i in range(len(Y_select_predict))]

		# get confidence score
		all_probs = crf.predict_marginals(X_select)
		confidences = []
		for s, word in enumerate(Y_select_predicted_sequences):
			confidences.append(sum(all_probs[s][i][wordpair[1]] for i, wordpair in enumerate(word))/len(word))

		confidence_data = sort_confidence(data['select']['words'], data['select']['morphs'], confidences, 'CRF')
		print('selection predictions and confidence scores generated')

		# generate increment.src and residual.src
		select_sorted_words = [z[0] for z in confidence_data]
		select_sorted_morphs = [z[1] for z in confidence_data]
		select_sorted_confidence = [z[2] for z in confidence_data]

		increment_src = open(f'{sub_datadir}/increment.src', 'w')
		increment_tgt = open(f'{sub_datadir}/increment.tgt', 'w')
		n_toks = 0
		i = 0
		while n_toks < int(select_interval):
			word = select_sorted_words[i]
			morphs = '!'.join(select_sorted_morphs[i])
			increment_src.write(' '.join(w for w in word) + '\n')
			increment_tgt.write(' '.join(w for w in morphs) + '\n')
			n_toks += 1
			i += 1

		residual_words = select_sorted_words[i : ]
		residual_morphs = select_sorted_morphs[i: ]
		residual_src = open(f'{sub_datadir}/residual.src', 'w')
		residual_tgt = open(f'{sub_datadir}/residual.tgt', 'w')
		for i in range(len(residual_words)):
			word = residual_words[i]
			morphs = '!'.join(residual_morphs[i])
			residual_src.write(' '.join(w for w in word) + '\n')
			residual_tgt.write(' '.join(w for w in morphs) + '\n')

	return Y_test_predict, Y_select_predict

def build_and_evaluate_crf(sub_datadir, data, delta, select_interval):
	
	X_train, Y_train, _ = get_features(data['train']['words'], data['train']['bmes'], delta)
	X_test, _, _ = get_features(data['test']['words'], data['test']['bmes'], delta)
	if data['select']['words']:
		X_select, _, _ = get_features(data['select']['words'], data['select']['bmes'], delta)

	crf = build_crf(sub_datadir, X_train, Y_train)
	
	return evaluate_crf(crf, sub_datadir, data, X_test, X_select, select_interval)

# Going from predicted labels to predicted morphemes
def reconstruct_predictions(pred_labels, words):

	predictions = []

	for i in range(len(pred_labels)):
		pred = pred_labels[i]
		word = words[i]

		# Remove '[' and ']' and split by end markers (E)
		labels = [label for label in ''.join(w for w in pred[1:-1]).split('E') if label]
		
		new_labels = []
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
				tok = tok.split('S')
				for bmes_label in tok:
					if bmes_label == '':
						new_labels.append('S')
					else:
						new_labels.append(bmes_label + 'E')

		morphs = []

		for i in range(len(new_labels)):
			tok = new_labels[i]
			l = len(tok)
			if i == 0:
				morphs.append(word[0 : l])
			else:
				pre = len(''.join(z for z in new_labels[ : i]))
				morphs.append(word[pre: pre + l])

		predictions.append(morphs)

	return predictions

# Save predictions
def save_predictions(predictions, file_path):
	with io.open(file_path, 'w', encoding = 'utf-8') as f:
		for tok in predictions:
			tok = '!'.join(m for m in tok)
			f.write(' '.join(c for c in tok) + '\n')

# Evaluate predictions with statistical metrics (precision, recall, F1 score)
def calculate_metrics(y_true, y_pred):
	correct_total = sum(1 for m in y_pred if m in y_true)

	if not y_pred:
		return 0, 0, 0

	precision = correct_total / len(y_pred)
	recall = correct_total / len(y_true)

	f1 = 2 * (precision * recall) / (precision + recall) if precision + recall != 0 else 0

	return round(precision * 100, 2), round(recall * 100, 2), round(f1 * 100, 2)

def evaluate_predictions(gold_word, pred_word):
	precision_scores = []
	recall_scores = []
	f1_scores = []

	for i in range(len(pred_word)):
		precision, recall, f1 = calculate_metrics(gold_word[i], pred_word[i])
		precision_scores.append(precision)
		recall_scores.append(recall)
		f1_scores.append(f1)

	average_precision = round(statistics.mean(precision_scores), 2)
	average_recall = round(statistics.mean(recall_scores), 2)
	average_f1 = round(statistics.mean(f1_scores), 2)

	return average_precision, average_recall, average_f1

def main():

	args = parse_arguments()
	sub_datadir = setup_datadirs(args)

	paths = {
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
	data = process_data(paths['train_tgt'], paths['test_tgt'], paths['select_tgt']) # data = {train/test/select: {words: [], morphs: [], bmes: {}}}
	
	# Build and evaluate the model
	Y_test_predict, Y_select_predict = build_and_evaluate_crf(sub_datadir, data, args.d, args.select_interval)

	# Outputting predictions for the test and the select file
	test_predictions = reconstruct_predictions(Y_test_predict, data['test']['words'])
	save_predictions(test_predictions, paths['test_pred'])

	if os.path.exists(paths['select_src']):
		select_predictions = reconstruct_predictions(Y_select_predict, data['select']['words'])				
		save_predictions(select_predictions, paths['select_pred'])

	# Overall evaluation metrics
	average_precision, average_recall, average_f1 = evaluate_predictions(data['test']['morphs'], test_predictions)
	with open(paths['eval_file'], 'w') as f:
		f.write(f'Precision: {average_precision}\n')
		f.write(f'Recall: {average_recall}\n')
		f.write(f'F1: {average_f1}\n')

	print('Eval File Generated:')
	print(f'  Language: {args.lang}')
	print(f'  Initial Size: {args.initial_size}')
	print(f'  Average Precision: {average_precision}')
	print(f'  Average Recall: {average_recall}')
	print(f'  Average F1 Score: {average_f1}')

if __name__ == '__main__':
	main()
