import math, json, os
from collections import Counter
import warnings
from sklearn.preprocessing import KBinsDiscretizer
from sklearn.model_selection import train_test_split
from db_worker import read_file, save_text

def process_file(file_path: str, annotated_file: str, seed: int, delimiter: str = '!') -> None:

    file_content: str = json.loads(read_file(os.path.join(file_path, annotated_file)))['content']
    y: list[str] = [line.strip().lower().replace(' ', '') for line in file_content.splitlines() if line.strip()]
    X : list[str] = [word.replace(delimiter, '') for word in y]

    _, _, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=seed, stratify=_categorize(y, delimiter)
    )

    train_path: str = os.path.join(file_path, 'train.txt')
    test_path: str = os.path.join(file_path, 'test.txt')

    save_text(train_path, '\n'.join(y_train))
    save_text(test_path, '\n'.join(y_test))

    return train_path, test_path

def _categorize(y: list[str], delimiter: str = '!') -> list[str]:
    # Labels are of the form 'morph_count-avg_morph_len'
    features: list[tuple[int, float]] = _get_features(y, delimiter)

    num_bins: int = math.ceil(math.log2(len(y)) + 1)  # Derived from Sturge's formula

    # Ensure bin sizes are 2 or more.
    # Falls back to single bin if not possible
    while num_bins >= 2:
        kbd: KBinsDiscretizer = KBinsDiscretizer(
            n_bins=num_bins,
            encode="ordinal",
            strategy="quantile"
        )
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="Bins whose width are too small .*",
                category=UserWarning,
            )
            feature_bins = kbd.fit_transform(features).astype(int)

        labels: list[str] = [f'{morph_count}-{avg_morph_len}' for morph_count, avg_morph_len in feature_bins]

        if min(Counter(labels).values()) > 1: 
            break
        num_bins -= 1
    else:
        labels = ['all'] * len(y)
    
    return labels

def _get_features(words: list[str], delimiter: str = '!') -> list[tuple[int, float]]:
    return[(
            len(morphs := word.split(delimiter)),  # Morpheme Count
            sum(len(m) for m in morphs) / len(morphs) # Average Morpheme Length
        ) for word in words
    ]