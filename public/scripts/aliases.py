from typing import TypeAlias, TypedDict, Literal

Word: TypeAlias = str
Morph: TypeAlias = str
MorphList: TypeAlias = list[str]
PredictionLabel: TypeAlias = Literal['B', 'M', 'E', 'S', '[', ']']

CharFeatures: TypeAlias = dict[str, int]
WordFeatures: TypeAlias = list[CharFeatures]
DatasetFeatures: TypeAlias = list[WordFeatures]

WordLabels: TypeAlias = list[PredictionLabel]
DatasetLabels: TypeAlias = list[WordLabels]

WordChars: TypeAlias = list[str]
DatasetChars: TypeAlias = list[WordChars]

ConfidenceScore: TypeAlias = float
ConfidenceData: TypeAlias = tuple[Word, list[Morph], ConfidenceScore]

CharMarginals: TypeAlias = dict[PredictionLabel, float]
WordMarginals: TypeAlias = list[CharMarginals]
DatasetMarginals: TypeAlias = list[WordMarginals]

BMESDict: TypeAlias = dict[Word, str]

class DatasetInfo(TypedDict):
	words: list[Word]
	morphs: list[MorphList]
	bmes: BMESDict

class DataDict(TypedDict):
	train: DatasetInfo
	test: DatasetInfo
	select: list[Word]