## Given an src path, e.g., data/finnish/original
## Iteratively construct randomly sampled training sets of different sizes
## e.g., python scripts/1.random_dataset.py --lang finnish

import io, os, sys, argparse
import random

parser = argparse.ArgumentParser()
parser.add_argument('--datadir', type = str, default = 'data/', help = 'path to data')
parser.add_argument('--lang', type = str, help = 'language')
parser.add_argument('--initial_size', type = str, default = '100', help = 'data size to start AL iteration')
parser.add_argument('--seed', type = str, default = '1', help = '')
parser.add_argument('--method', type = str, default = 'al')
parser.add_argument('--select_interval', type = str, default = '50', help = 'how much data to select in each AL iteration; 50, 100, maybe larger')

args = parser.parse_args()

datadir = args.datadir
lang = args.lang
initial_size = args.initial_size
seed = args.seed
method = args.method
select_interval = args.select_interval

# Reading in descriptive information
def read_descriptive(descriptive_file):
	total_num_words = 0
	with open('descriptive/' + lang + '.txt') as f:
		for line in f:
			if line.startswith('Total'):
				toks = line.strip().split()
				total_num_words = toks[-1]
	
	return total_num_words


# Reading in file information
def read_file(file_path, file_type = 'src'):
	data = []
	with open(file_path, encoding = 'utf-8') as f:
		for line in f:
			toks = line.strip().split()
			if file_type == 'tgt': # ! is used as morpheme boundary
				morphs = ''.join(toks).split('!')
				data.append(morphs)
			else:
				word = ''.join(toks)
				data.append(word)
	return data


# Given e.g., data/finnish/original/finnish_src + data/finnish/original/finnish_tgt
# Randomly partition them into original_train_data and original_test_data at a 4:1 ratio
def random_partition(datadir, lang, test_size = 0.2):
	original_train_data = []
	original_test_data = []

	src_file = datadir + lang + '/' + 'original/' + lang + '_src'
	tgt_file = datadir + lang + '/' + 'original/' + lang + '_tgt'

	src_data = read_file(src_file, 'src')
	tgt_data = read_file(tgt_file, 'tgt')

	index_list = list(range(len(src_data)))
	random.shuffle(index_list)

	train_size = int(len(src_data) * (1 - test_size))
	for idx in index_list[ : train_size + 1]:
		src_word = ' '.join(c for c in src_data[idx])
		tgt_word = ' '.join('!'.join(morph for morph in tgt_data[idx]))
		original_train_data.append([src_word, tgt_word])

	for idx in index_list[train_size + 1 : ]:
		src_word = ' '.join(c for c in src_data[idx])
		tgt_word = ' '.join('!'.join(morph for morph in tgt_data[idx]))
		original_test_data.append([src_word, tgt_word])

	# Generating train and test output files
	train_set_src_file = io.open(datadir + lang + '/train.full.src', 'w')
	train_set_tgt_file = io.open(datadir + lang + '/train.full.tgt', 'w')
	for tok in original_train_data:
		train_set_src_file.write(tok[0] + '\n')
		train_set_tgt_file.write(tok[1] + '\n')
	
	test_set_src_file = io.open(datadir + lang + '/test.full.src', 'w')
	test_set_tgt_file = io.open(datadir + lang + '/test.full.tgt', 'w')
	for tok in original_test_data:
		test_set_src_file.write(tok[0] + '\n')
		test_set_tgt_file.write(tok[1] + '\n')

	print('Done partitioning training and test files')

	return original_train_data, original_test_data


## Generate training sets via random sampling; the first training set, i.e., select0, is also the initial training set for active learning
def generate_train(original_train_data, datadir, lang, initial_size, select_interval, n = 3):

	# total number of words for a given language
	max_size = int(read_descriptive('descriptive/' + lang + '.txt'))
	print('Total number of words for', lang, 'is', max_size )

	# Generating three initial training sets, e.g., select0
	# For each initial training set, iteratively expand it via random sampling
	for i in range(n):
		train_data = original_train_data.copy()  # Make a copy of the original training data
		random.shuffle(train_data)

		sizes = [initial_size]
		size = initial_size
		
		os.makedirs(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/', exist_ok=True)
		os.makedirs(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/' + '/random/', exist_ok=True)
		os.makedirs(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/' + '/random/' + str(select_interval), exist_ok=True)
		os.makedirs(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/random/' + str(select_interval) + '/select0', exist_ok = True)
		os.makedirs(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/random/' + str(select_interval) + '/select0/error_0', exist_ok = True)
		os.makedirs(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/random/' + str(select_interval) + '/select0/error_0/1', exist_ok = True)
		os.makedirs(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/' + '/al/', exist_ok=True)
		os.makedirs(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/' + '/al/' + str(select_interval), exist_ok=True)	
		os.makedirs(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/al/' + str(select_interval) + '/select0', exist_ok = True)
		os.makedirs(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/al/' + str(select_interval) + '/select0/error_0', exist_ok = True)
		os.makedirs(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/al/' + str(select_interval) + '/select0/error_0/1', exist_ok = True)

		while size < max_size:
			size += select_interval
			sizes.append(size)

		if sizes[-1] > max_size:
			sizes[-1] = max_size


		train_set =[]
		n_toks = 0
		select_size = 0
		for size in sizes:
			os.makedirs(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/random/' + str(select_interval) + '/select' + str(select_size), exist_ok = True)
			os.makedirs(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/random/' + str(select_interval) + '/select' + str(select_size) + '/error_0', exist_ok = True)
			os.makedirs(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/random/' + str(select_interval) + '/select' + str(select_size) + '/error_0/1', exist_ok = True)

			try:
				while n_toks < size:
					pair = random.choices(train_data)[0]
					train_data.remove(pair)
					if pair not in train_set:
						train_set.append(pair)
						n_toks += 1
						if len(train_data) == 0:
							break
			except:
				pass

			train_set_src_file = io.open(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/random/' + str(select_interval) + '/select' + str(select_size) + '/error_0/1/train.' + str(initial_size) + '.src', 'w')
			train_set_tgt_file = io.open(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/random/' + str(select_interval) + '/select' + str(select_size) + '/error_0/1/train.' + str(initial_size) + '.tgt', 'w')
			for pair in train_set:
				train_set_src_file.write(pair[0] + '\n')
				train_set_tgt_file.write(pair[1] + '\n')
			train_set_src_file.close()
			train_set_tgt_file.close()
			
			if select_size == 0:			
				select_set = train_data  # Define select_set as train_set or appropriate data
				select_set_src_file = io.open(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/al/' + str(select_interval) + '/select0/error_0/1/select.' + str(initial_size) + '.src', 'w')
				select_set_tgt_file = io.open(datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/al/' + str(select_interval) + '/select0/error_0/1/select.' + str(initial_size) + '.tgt', 'w')
				for pair in select_set:
					select_set_src_file.write(pair[0] + '\n')
					select_set_tgt_file.write(pair[1] + '\n')
				select_set_src_file.close()
				select_set_tgt_file.close()
					
			select_size += select_interval
	
	for i in range(n):
		os.system('cp ' + datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/random/' + str(select_interval) + '/select0/error_0/1/train.' + str(initial_size) + '.src' + ' ' + datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/al/' + str(select_interval) + '/select0/error_0/1/')
		os.system('cp ' + datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/random/' + str(select_interval) + '/select0/error_0/1/train.' + str(initial_size) + '.tgt' + ' ' + datadir + lang + '/' + str(initial_size) + '/' + str(i) + '/al/' + str(select_interval) + '/select0/error_0/1/')

original_train_data, original_test_data = random_partition(datadir, lang)

generate_train(original_train_data, datadir, lang, int(initial_size), int(select_interval))
