
def read_file(file_path: str) -> str:
	"""
	Reads the content of a file.
		
	:param file_path: Path to the file
	:type file_path: str
	:return: Content of the file
	:rtype: str
	"""
	with open(file_path, 'r', encoding='utf-8') as f:
		return f.read()
	
def read_file_lines(file_path: str) -> list[str]:
    """
    Reads the content of a file as a list of lines

    :param file_path: Path to the file
    :type file_path: str
    :return: Content of the file as list of lines
    :rtype: list[str]
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.readlines()

def write_file(file_path: str, content: str) -> None:
	"""
	Writes content to a file.
	
	:param file_path: Path to the file
	:type file_path: str
	:param content: Content to write to the file
	:type content: str
	"""
	with open(file_path, 'w', encoding='utf-8') as f:
		f.write(content)


def write_file_lines(file_path: str, lines: list[str]) -> None:
    """
    Writes content to a file from a list of lines

    :param file_path: Path to the file
    :type file_path: str
    :param lines: List of lines to write to the file
    :type lines: list[str]
    """
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(f'{line}\n' for line in lines)