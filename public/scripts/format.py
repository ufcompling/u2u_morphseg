from aliases import Word, MorphList, ConfidenceData, DatasetLabels

def format_evaluation(words: list[Word], gold_morphs: list[MorphList], pred_morphs: list[MorphList], 
					  precision: float, recall: float, f1: float, delimiter: str = '!') -> str:
	lines = [
        '# TurtleShell Evaluation Report',
        f'# Precision: {precision:.2f}  Recall: {recall:.2f}  F1: {f1:.2f}',
        '#',
        '# word\tgold\tpredicted',
    ]
	for word, gold, pred in zip(words, gold_morphs, pred_morphs):
		gold_seg = delimiter.join(gold)
		pred_seg = delimiter.join(pred)
		lines.append(f'{word}\t{gold_seg}\t{pred_seg}')
	return '\n'.join(lines) + '\n'
	
def format_increment(confidence_data: list[ConfidenceData]) -> list[dict[str, str | float | list[dict]]]:
	increment: list[dict[str, str | float | list[dict]]] = []
	
	for i, (word, labels, confscore) in enumerate(confidence_data):
		increment.append({
			'id': f'w{i}',
			'word': word.replace(' ', ''),
			'confidence': round(confscore, 4),
			'boundaries': [{'index': b} for b in _get_morph_boundaries(word, labels)]
        })
	return increment
		
def _get_morph_boundaries(word: str, bounded_labels: DatasetLabels) -> list[int]:
	labels: DatasetLabels = bounded_labels[1:-1]
	boundaries: list[int] = []
	for i, label in enumerate(labels):
		if label in ['E', 'S'] and i < len(word) - 1:
			boundaries.append(i)
	return boundaries