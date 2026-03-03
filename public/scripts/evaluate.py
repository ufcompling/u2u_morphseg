from aliases import DatasetLabels, Word, MorphList

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