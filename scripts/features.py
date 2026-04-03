from aliases import Word, WordLabels, BMESDict, CharFeatures, WordFeatures, PredictionLabel, DatasetFeatures, DatasetLabels
from typing import cast

def get_labeled_features(words: list[Word], bmes: BMESDict, delta: int) -> tuple[DatasetFeatures, DatasetLabels]:
	"""
	Generates features and labels for a list of labeled words.
	
	:param words: The list of labeled words to generate features for
	:type words: list[Word]
	:param bmes: The BMES labels for each character in each word
	:type bmes: BMESDict
	:param delta: The number of characters to consider for right and left features
	:type delta: int
	:return: Features and labels for the given list of words
	:rtype: tuple[DatasetFeatures, DatasetLabels]
	"""
	X: DatasetFeatures = [] # list (learning set) of list (word) of dicts (chars), INPUT for crf training
	y: DatasetLabels = [] # list (learning set) of list (word) of labels (chars), INPUT for crf training

	for word in words:
		bounded: Word = f'[{word}]' # <w> and <\w> replaced with [ and ], respectively
		features: WordFeatures = [] # list (word) of dicts (chars)
		labels: WordLabels = [] # list (word) of labels (chars)
		
		for i, char in enumerate(bounded):
			features.append(_get_char_features(bounded, i, delta))

			if char in ['[', ']']: # labeling start and end
				labels.append(cast(PredictionLabel, char))
			else: # labeling chars
				labels.append(cast(PredictionLabel, bmes[word][i-1]))

		X.append(features)
		y.append(labels)

	return X, y

def get_unlabeled_features(words: list[Word], delta: int) -> DatasetFeatures:
	"""
	Generates features for a list of unlabeled words.
	
	:param words: The list of unlabeled words to generate features for
	:type words: list[Word]
	:param delta: The number of characters to consider for right and left features
	:type delta: int
	:return: Features for the given list of words
	:rtype: DatasetFeatures
	"""
	X: DatasetFeatures = [] # list (learning set) of list (word) of dicts (chars), INPUT for crf predictions

	for word in words:
		bounded: Word = f'[{word}]' # <w> and <\w> replaced with [ and ], respectively
		X.append([_get_char_features(bounded, i, delta) for i in range(len(bounded))])

	return X

def _get_char_features(bounded: Word, i: int, delta: int) -> CharFeatures:
	"""
	Generates character features for a given position in a bounded word.
	
	:param bounded: The bounded word (with [ and ] markers)
	:type bounded: Word
	:param i: The index of the character in the bounded word
	:type i: int
	:param delta: The number of characters to consider for right and left features
	:type delta: int
	:return: Character features for the given position
	:rtype: CharFeatures
	"""
	char_dict: CharFeatures = {}

	for j in range(delta):
		char_dict[f'right_{bounded[i:i+j+1]}'] = 1

	for j in range(delta):
		if i - j - 1 < 0: break
		char_dict[f'left_{bounded[i-j-1:i]}'] = 1

	char_dict[f'pos_start_{i}'] = 1  # extra feature: left index of the letter in the word

	return char_dict