# Input = annotated txt file / unannotated txt file
# Output = train.src/train.tgt, test.src/test.tgt, select.src

# Needed functions:
# Takes in annotated data and makes it unannotated
# Convert file into a list of lines
# Convert list of lines into train/test split of list of lines
# Create file from list of lines
import os
from file_io import read_file_lines, write_file_lines

def process_input(annotated_file_path: str, unannotated_file_path: str) -> None:
    annotated_lines: list[str] = read_file_lines(annotated_file_path)
    train_tgt, test_tgt = train_test_split(annotated_lines)
    train_src = tgt_to_src(train_tgt)
    test_src = tgt_to_src(test_tgt)

    # temporary file locations
    write_file_lines('data/train.src', train_src)
    write_file_lines('data/train.tgt', train_tgt)
    write_file_lines('data/test.src', test_src)
    write_file_lines('data/test.tgt', test_tgt)

    change_file_name(unannotated_file_path, 'select.src')

def tgt_to_src(tgt_lines: list[str]) -> list[str]:
    ...

def train_test_split(lines_list: list[str]) -> tuple[list[str], list[str]]:
    ...

def change_file_name(from_path: str, to_name: str) -> None:
    os.rename(from_path, f'{os.path.dirname(from_path)}/{to_name}')
