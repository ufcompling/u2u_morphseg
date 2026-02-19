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
import io, os, sys, subprocess
import statistics
import json
from scipy.special import rel_entr

parser = argparse.ArgumentParser()
parser.add_argument('--datadir', type = str, default = 'data/', help = 'path to data')
parser.add_argument('--lang', type = str, help = 'language')
parser.add_argument('--initial_size', type = str, default = '100', help = 'data initial_size to start AL iteration')
parser.add_argument('--seed', type = str, default = '0', help = 'different initial training sets')
parser.add_argument('--method', type = str, default = 'random')
parser.add_argument('--select_interval', type = str, default = '50', help = 'how much data to select in each AL iteration; 50, 100, maybe larger')
parser.add_argument('--select_size', type = str, default = '0', help = 'how much data have selected from all AL iterations thus far')
parser.add_argument('--d', type = int, default = 4, help = 'delta; context window to consider for feature set construction')
parser.add_argument('--e', type = float, default = 0.001, help = 'epsilon parameter for training CRF; may not use this in training')
parser.add_argument('--i', type = int, default = 100, help = 'maximum number of iterations for training CRF')
parser.add_argument('--error_prop', type = str, default = '0', help = 'error proportions; 0, 0.1, 0.2, 0.3')
parser.add_argument('--error_seed', type = str, default = '1', help = 'for each error proportion value, create three different sets')

args = parser.parse_args()

datadir = args.datadir
lang = args.lang
initial_size = args.initial_size
seed = args.seed
method = args.method
select_interval = args.select_interval
select_size = args.select_size
delta = args.d
epsilon = args.e
max_iterations = args.i
error_prop = args.error_prop
error_seed = args.error_seed # When error proportion is 0, there is just one seed

# Data directory for the current iteration
sub_datadir = datadir + lang + '/' + initial_size + '/' + seed + '/' + method + '/' + select_interval + '/select' + select_size + '/error_0/1/'


### Gathering data ###
def gather_data(train, test):   # *_tgt files 

	### COLLECT DATA AND LABELLING ###
	train_dict = {}
	test_dict = {}

	input_files = [train, test] 
	dictionaries = (train_dict, test_dict)

	train_words = []
	test_words = []

	train_morphs = []
	test_morphs = []

	counter = 0
	
	for file in input_files:
		data = []

		with io.open(file, encoding = 'utf-8') as f:

			for line in f:
				toks = line.strip().split()
				morphs = (''.join(c for c in toks)).split('!')
				word = ''.join(m for m in morphs)

				if file == train:
					train_words.append(word)
					train_morphs.append(morphs)

				if file == test:
					test_words.append(word)
					test_morphs.append(morphs)

				label = ''

				for morph in morphs:
					if len(morph) == 1:
						label += 'S'
					else:
						label += 'B'

						for i in range(len(morph)-2):
							label += 'M'

						label += 'E'

				w_dict = {}
				dictionaries[counter][''.join(m for m in morphs)] = label

		counter += 1

	return dictionaries, train_words, test_words, train_morphs, test_morphs


### Computing features ###

def features(word_dictonary, original_words, delta):

	X = [] # list (learning set) of list (word) of dics (chars), INPUT for crf
	Y = [] # list (learning set) of list (word) of labels (chars), INPUT for crf
	words = [] # list (learning set) of list (word) of chars

	for word in original_words:
		word_plus = '[' + word + ']' # <w> and <\w> replaced with [ and ]
		word_list = [] # container of the dic of each character in a word
		word_label_list = [] # container of the label of each character in a word
	
		for i in range(len(word_plus)):
			char_dic = {} # dic of features of the actual char
		
			for j in range(delta):
				char_dic['right_' + word_plus[i:i + j + 1]] = 1
		
			for j in range(delta):
				if i - j - 1 < 0: break
				char_dic['left_' + word_plus[i - j - 1:i]] = 1
			char_dic['pos_start_' + str(i)] = 1  # extra feature: left index of the letter in the word
			# char_dic['pos_end_' + str(len(word) - i)] = 1  # extra feature: right index of the letter in the word
		#    if word_plus[i] in ['a', 's', 'o']: # extra feature: stressed characters (discussed in the report)
		#        char_dic[str(word_plus[i])] = 1
			word_list.append(char_dic)
		
			if word_plus[i] == '[': word_label_list.append('[') # labeling start and end
			elif word_plus[i] == ']': word_label_list.append(']')
			else: word_label_list.append(word_dictonary[word][i-1]) # labeling chars

		X.append(word_list)
		Y.append(word_label_list)
		temp_list_word = [char for char in word_plus]
		words.append(temp_list_word)

	return (X, Y, words)



### Building models ###
def build(model_filename, dictionaries, train_words, test_words, delta, epsilon, max_iterations):

	train_dict, test_dict = dictionaries

	X_train, Y_train, words_train = features(train_dict, train_words, delta)
	X_test, Y_test, words_test = features(test_dict, test_words, delta)

	### train ###

#    crf = sklearn_crfsuite.CRF(algorithm = 'ap', epsilon = epsilon, max_iterations = max_iterations)
#    crf.fit(X_train, Y_train, X_dev=X_dev, y_dev=Y_dev)
	
	crf = sklearn_crfsuite.CRF(
		algorithm='lbfgs',
		c1=0.1,
		c2=0.1,
		max_iterations=100,
		all_possible_transitions=True
	)

	crf.fit(X_train, Y_train)

	pickle.dump(crf, io.open(model_filename, "wb"))

	print('training done')

	### Evaluating ###

	Y_test_predict = crf.predict(X_test)

	return Y_test_predict


# Going from predicted labels to predicted morphemes
def reconstruct(pred_labels, words):

	pred_list = []

	for idx in range(len(pred_labels)):
		pred = pred_labels[idx]
		word = words[idx]

		labels = ''.join(w for w in pred[1 : -1])
		labels = labels.split('E')
	
		if '' in labels:
			labels.remove('')
		new_labels = []

		for tok in labels:
			if 'S' not in tok:
				tok += 'E'
				new_labels.append(tok)

			else:
				c = tok.count('S')

				if c == len(tok):
					for z in range(c):
						new_labels.append('S')

				else:
					tok = tok.split('S')

					for z in tok:
						if z == '':
							new_labels.append('S')
						else:
							new_labels.append(z + 'E')

		morphs = []

		for i in range(len(new_labels)):
			tok = new_labels[i]
			l = len(tok)
			if i == 0:
				morphs.append(word[0 : l])
			else:
				pre = len(''.join(z for z in new_labels[ : i]))
				morphs.append(word[pre: pre + l])

		pred_list.append(morphs)

	return pred_list

# F1 score as the evaluation metric
def F1(gold_word, pred_word):

	correct_total = 0

	for m in pred_word:
		if m in gold_word:
			correct_total += 1

	gold_total = len(gold_word)
	pred_total = len(pred_word)

	precision = correct_total / pred_total
	recall = correct_total / gold_total

	F1 = 0

	try:
		F1 = 2 * (precision * recall) / (precision + recall)
		F1 = round(F1 * 100, 2)
	except:
		F1 = 0

	return round(precision * 100, 2), round(recall * 100, 2), F1


### Building models ###

def mainCRF():

	test_src = datadir + lang + '/test.full.src'
	test_tgt = datadir + lang + '/test.full.tgt'

	train_src = sub_datadir + 'train.' + initial_size + '.src'
	train_tgt = sub_datadir + 'train.' + initial_size + '.tgt'

	test_pred = sub_datadir + 'test.full.pred'

	model_filename = sub_datadir + 'crf.model'

	dictionaries, train_words, test_words, train_morphs, test_morphs = gather_data(train_tgt, test_tgt)

	Y_test_predict = build(model_filename, dictionaries, train_words, test_words, delta, epsilon, max_iterations)

	test_predictions = reconstruct(Y_test_predict, test_words)

	## Outputting predictions for the test and the select file
	with io.open(test_pred, 'w', encoding = 'utf-8') as f:
		for tok in test_predictions:
			tok = '!'.join(m for m in tok)
			f.write(' '.join(c for c in tok) + '\n')

	# Overall evaluation metrics
	evaluation_file = sub_datadir + 'eval.txt'
	precision_scores = []
	recall_scores = []
	f1_scores = []
	print(len(test_predictions))
	print(len(test_morphs))
	for i in range(len(test_predictions)):
		y_true = test_morphs[i]
		y_pred = test_predictions[i]
		precision, recall, f1 = F1(y_true, y_pred)
		precision_scores.append(precision)
		recall_scores.append(recall)
		f1_scores.append(f1)

	average_precision = round(statistics.mean(precision_scores), 2)
	average_recall = round(statistics.mean(recall_scores), 2)
	average_f1 = round(statistics.mean(f1_scores), 2)

	with open(evaluation_file, 'w') as f:
		f.write('Precision: ' + str(average_precision) + '\n')
		f.write('Recall: ' + str(average_recall) + '\n')
		f.write('F1: ' + str(average_f1) + '\n')

	print('eval file generated')
	print(lang, initial_size, average_precision, average_recall, average_f1)


mainCRF()

