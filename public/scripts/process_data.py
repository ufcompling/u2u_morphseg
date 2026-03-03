import db_worker
from aliases import DataDict, Word, MorphList, BMESDict

def process_data(train_tgt, test_tgt, select_src) -> DataDict:
	"""
	Processes training, testing, and selection data from files.
	
	:param train_tgt: Labeled train data
	:type train_tgt: str
	:param test_tgt: Labeled test data
	:type test_tgt: str
	:param select_src: Unlabelled data
	:type select_src: str
	:return: Dictionary containing train, test, and select data
	:rtype: DataDict
	"""
	train_words, train_morphs, train_bmes = _parse_data(train_tgt)
	test_words, test_morphs, test_bmes = _parse_data(test_tgt)
	select_words, _, _ = _parse_data(select_src)

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

def _parse_data(data: str, labeled: bool = True) -> tuple[list[Word], list[MorphList], BMESDict] | list[Word]:
    if labeled:
        return _parse_labeled_data(data)
    return _parse_unlabeled_data

def _parse_labeled_data(data: str) -> tuple[list[Word], list[MorphList], BMESDict]:
    words: list[Word] = []
    morphs_list: list[MorphList] = []
    bmes: BMESDict = {}

    for line in data.splitlines():
        if not (line := line.strip()): continue

        toks: list[str] = line.split()

        morphs: MorphList = ''.join(toks).split('!')
        word: Word = ''.join(m for m in morphs)
        bmes_labels: str = _get_bmes_labels(morphs)

        words.append(word)
        morphs_list.append(morphs)
        bmes[word] = bmes_labels

    return words, morphs_list, bmes

def _parse_unlabeled_data(data: str) -> list[Word]:
    words: list[Word] = []

    for line in data.splitlines():
        if not (line := line.strip()): continue

        words.append(line.replace('!', ''))
    
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
