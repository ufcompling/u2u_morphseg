from statistics import mean

from aliases import DatasetLabels, Word, MorphList, DatasetMarginals, ConfidenceData

def reconstruct_predictions(pred_labels: DatasetLabels, words: list[Word]) -> list[MorphList]:
	"""
	Reconstructs morpheme predictions from predicted labels.
	
	:param pred_labels: The predicted labels for each word
	:type pred_labels: DatasetLabels
	:param words: The list of words corresponding to the predicted labels
	:type words: list[Word]
	:return: The reconstructed morpheme predictions for each word
	:rtype: list[MorphList]
	"""
	predictions: list[MorphList] = []

	for pred, word in zip(pred_labels, words):

		# Remove '[' and ']' and split by end markers (E)
		labels: list[str] = [label for label in ''.join(pred[1:-1]).split('E') if label]
		
		new_labels: list[str] = []
		for tok in labels:
			
			# If nothing is marked single, then it's fine; add back the end marker
			if 'S' not in tok:
				new_labels.append(tok + 'E')

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
		prefix_length: int = 0
		for label in new_labels:
			tok_length: int = len(label)
			morphs.append(word[prefix_length:prefix_length+tok_length])
			prefix_length += tok_length

		predictions.append(morphs)

	return predictions

def evaluate_predictions(gold_word: list[MorphList], pred_word: list[MorphList]) -> tuple[float, float, float]:
	"""
	Evaluates predicted morphemes against gold standard morphemes using precision, recall, and F1 score.
	
	:param gold_word: The list of gold standard morpheme lists
	:type gold_word: list[MorphList]
	:param pred_word: The list of predicted morpheme lists
	:type pred_word: list[MorphList]
	:return: The average precision, recall, and F1 score across all words
	:rtype: tuple[float, float, float]
	"""
	precision_scores: list[float] = []
	recall_scores: list[float] = []
	f1_scores: list[float] = []

	for gold_morphs, pred_morphs in zip(gold_word, pred_word):
		precision, recall, f1 = _calculate_metrics(gold_morphs, pred_morphs)
		precision_scores.append(precision)
		recall_scores.append(recall)
		f1_scores.append(f1)

	average_precision, average_recall, average_f1 = (round(mean(x), 2) for x in (precision_scores, recall_scores, f1_scores))
	return average_precision, average_recall, average_f1

def get_confidence_data(words: list[Word], predictions: DatasetLabels, marginals: DatasetMarginals) -> list[ConfidenceData]:
	"""
	Calculates confidence scores for a list of words based on predictions and marginals.
	
	:param words: The list of words to calculate confidence scores for
	:type words: list[Word]
	:param predictions: The predictions for each word in the list
	:type predictions: DatasetLabels
	:param marginals: The marginal probabilities for each word in the list
	:type marginals: DatasetMarginals
	:return: A list of each word and its confidence score, sorted lowest to highest
	:rtype: list[ConfidenceData]
	"""
	confidence_data: list[ConfidenceData] = []
	for word, prediction, marginal in zip(words, predictions, marginals):
		# Remove '[' and ']' so that the characters match up with the labels
		boundless_pred, boundless_marg = prediction[1:-1], marginal[1:-1]
		confidence_data.append((word, prediction, sum(boundless_marg[i][label] for i, label in enumerate(boundless_pred)) / len(word)))

	return sorted(confidence_data, key=lambda x: x[2])

def _calculate_metrics(y_true: MorphList, y_pred: MorphList) -> tuple[float, float, float]:
	"""
	Calculates precision, recall, and F1 score for predicted morphemes.
	
	:param y_true: The true morpheme list
	:type y_true: MorphList
	:param y_pred: The predicted morpheme list
	:type y_pred: MorphList
	:return: The precision, recall, and F1 score
	:rtype: tuple[float, float, float]
	"""
	correct_total: int = sum(1 for m in y_pred if m in y_true)

	if not y_pred:
		return 0, 0, 0

	precision: float = correct_total / len(y_pred)
	recall: float = correct_total / len(y_true)
	f1: float = 2 * (precision * recall) / (precision + recall) if precision + recall != 0 else 0

	return round(precision, 4), round(recall, 4), round(f1, 4)