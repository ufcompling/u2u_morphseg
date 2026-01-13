## Given an input path, e.g., data/finnish/original
## in the input path there is: finnish_src, finnish_tgt
## Generate the descriptive statistics for the language
## Use: e.g., python scripts/0.descriptive.py --lang finnish

import io, os, argparse
import statistics

parser = argparse.ArgumentParser()
parser.add_argument('--datadir', type = str, default = 'data/', help = 'path to data')
parser.add_argument('--lang', type = str, help = 'language')

args = parser.parse_args()

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

datadir = args.datadir
lang = args.lang

src_file = datadir + lang + '/' + 'original/' + lang + '_src'
tgt_file = datadir + lang + '/' + 'original/' + lang + '_tgt'

src_data = read_file(src_file, 'src')
tgt_data = read_file(tgt_file, 'tgt')

## Descriptive statistics to collect:
## (1) total number of words
## (2) average word length
## (3) average number of morphemes per word

total_num_words = len(src_data)

word_len_list = [len(w) for w in src_data]
ave_word_len = statistics.mean(word_len_list)

num_morph_list = [len(morphs) for morphs in tgt_data]
ave_num_morph = statistics.mean(num_morph_list)

os.makedirs('descriptive/', exist_ok=True)

with open('descriptive/' + lang + '.txt', 'w') as f:
	f.write(f"Total number of words: {total_num_words}" + '\n')
	f.write(f"Average word length: {ave_word_len}" + '\n')
	f.write(f"Average number of morphemes per word: {ave_num_morph}" + '\n')
f.close()


