def process_data(file_content):
    lines: list[str] = file_content.split('\n')
    processed: str = '\n'.join([line[::-1].upper() for line in lines])
    return processed