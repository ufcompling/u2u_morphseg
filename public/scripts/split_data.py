import os
from collections import Counter
from sklearn.model_selection import train_test_split

def main() -> None:
    X, y = process_file('../../test/testdata/train_annotated.txt')
    _, _, y_train, y_test = stratify_data(X, y)

    print(f"Average word length in training set: {get_avg_word_length(y_train)}")
    print(f"Average number of morphs in training set: {get_avg_morphs(y_train)}")

    print(f"Average word length in test set: {get_avg_word_length(y_test)}")
    print(f"Average number of morphs in test set: {get_avg_morphs(y_test)}")

def process_file(file_path: str) -> tuple:
    X = []
    y = []
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            word = line.strip().lower().replace(' ', '')
            X.append(word.replace('!', ''))
            y.append(word)
    return X, y

def stratify_data(X: list, y: list) -> tuple:
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=categorize(y))
    return X_train, X_test, y_train, y_test

def categorize(y: list[str]) -> list[str]:
    """
    - Research different categories by which to stratify
    - Research different methods of determining number of bins
    """
    # Labels are of the form 'morph_count-word_length' 
    # (could try average morpheme length instead of word length?)
    labels = [f'{word.count('!') + 1}-{len(word.replace('!', ''))}' for word in y]
    counts = Counter(labels)

    # If a category only has a single member, combine them into 'misc' category
    # (could use bins to ensure no misc category)
    output = [label if counts[label] > 1 else 'misc' for label in labels]
    return output


def get_avg_word_length(words: list[str]) -> float:
    total_length = sum(len(word.replace('!', '')) for word in words)
    return total_length / len(words) if words else 0

def get_avg_morphs(words: list[str]) -> float:
    total_morphs = sum(word.count('!') + 1 for word in words)
    return total_morphs / len(words) if words else 0

if __name__ == '__main__':
    main()