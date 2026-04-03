import os

from aliases import DataDict, Word, MorphList, BMESDict

def process_data(train_tgt, test_tgt, select_src, delimiter: str = '!') -> DataDict:
	"""
	Processes training, testing, and selection data from files.
	
	:param train_tgt: Labeled train data
	:type train_tgt: str
	:param test_tgt: Labeled test data
	:type test_tgt: str
	:param select_src: Unlabelled data
	:type select_src: str
	:param delimiter: Delimiter for splitting morphemes
	:type delimiter: str
	:return: Dictionary containing train, test, and select data
	:rtype: DataDict
	"""
	train_words, train_morphs, train_bmes = _parse_labeled_data(train_tgt, delimiter)
	test_words, test_morphs, test_bmes = _parse_labeled_data(test_tgt, delimiter)
	select_words = _parse_unlabeled_data(select_src, delimiter)

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
			'words': select_words
		}
	}

def _parse_labeled_data(data: str, delimiter: str = '!') -> tuple[list[Word], list[MorphList], BMESDict]:
    words: list[Word] = []
    morphs_list: list[MorphList] = []
    bmes: BMESDict = {}

    for line in data.splitlines():
        if not (line := line.strip()): continue

        toks: list[str] = line.split()

        morphs: MorphList = ''.join(toks).split(delimiter)
        word: Word = ''.join(m for m in morphs)
        bmes_labels: str = _get_bmes_labels(morphs)

        words.append(word)
        morphs_list.append(morphs)
        bmes[word] = bmes_labels

    return words, morphs_list, bmes

def _parse_unlabeled_data(data: str, delimiter: str = '!') -> list[Word]:
    words: list[Word] = []

    for line in data.splitlines():
        if not (line := line.strip()): continue

        words.append(line.replace(delimiter, ''))
    
    return words

def _get_bmes_labels(morphs: MorphList) -> str:
	"""
	Generates BMES labels for a list of morphemes.
	
	:param morphs: List of morphemes
	:type morphs: MorphList
	:return: BMES labels for each character in the word
	:rtype: str
	"""
	label: list = []

	for morph in morphs:
		if len(morph) == 1:
			label.append('S')
		else:
			label.append('B')

			for _ in range(len(morph)-2):
				label.append('M')

			label.append('E')

	return ''.join(label)

def setup_dirs(config: dict, work_dir: str) -> None:
    """
    Write JS-provided file content strings into the Pyodide VFS.

    :param config: Decoded config dict from JS
    :param work_dir: Base directory to write files into
    :return: Dict of resolved file paths keyed by role
    """
    os.makedirs(work_dir, exist_ok=True)

    paths = {
        'train_tgt':  os.path.join(work_dir, 'train.train.tgt'),
        'test_tgt':   os.path.join(work_dir, 'test.full.tgt'),
        'select_src': os.path.join(work_dir, 'select.train.src'),
    }

    _write_if_present(paths['train_tgt'], config.get('trainTgt', ''))
    _write_if_present(paths['test_tgt'],  config.get('testTgt', ''))
    _write_if_present(paths['select_src'], config.get('selectSrc', ''))

    #return paths


def _write_if_present(path: str, content: str) -> None:
    if content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
