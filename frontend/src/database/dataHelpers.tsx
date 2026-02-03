// rawdata component
export interface rawData {
  filename?: string;
  content: string | Uint8Array;
  size?: number;
  type?: string;
}

// filedata component
export interface fileData {
  id?: number;
  filename: string;
  content: string | Uint8Array;
  size: number;
  type: string;
  line?: string;
}

// map rawData to fileData
export const mapData = (data: rawData[]): fileData[] => {
  return data.map((item, index) => ({
    id: index + 1,
    filename: item.filename || `file_${index + 1}`,
    content: item.content,
    size: item.size || 0,
    type: item.type || 'unknown',
    line: typeof item.content === 'string' ? (item.content.split('\n')[0] || '') : undefined,
  }));
}