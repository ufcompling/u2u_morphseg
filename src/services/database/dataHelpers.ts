/* =============================================================================
 * TYPE DEFINITIONS
 * ============================================================================= */

// Raw file data straight from the browser's FileReader API
// This is what we get immediately after the user uploads a file
export interface rawData {
  fileName: string;                    // Original filename from user's computer
  fileContent: string | Uint8Array;        // Text content or binary data
  fileSize: number;                        // File size in bytes
  fileType: string;                        // MIME type (text/plain, application/pdf, etc.)
}

// Emscripten uses string lookups only.
// Structured file data ready for IndexedDB storage and calls
export interface fileData {
  fileName: string;                    // Original filename preserved
  fileContent?: string | Uint8Array;                 // Always a string (binary data gets Uint8Array-encoded as a string)
  fileSize?: number;                   // File size in bytes
  fileType?: 'text' | 'pdf' | 'docx';         // Only 'text', 'pdf', or 'docx' allowed
  createdAt?: number;                  // Unix timestamp - when file was uploaded
  filePath?: string;                  // Virtual path in Emscripten FS (e.g. "/uploads/filename.txt")
}

/* =============================================================================
 * DATA TRANSFORMATION UTILITIES
 * ============================================================================= */

// Transform raw uploaded files into database-ready format
// This is the bridge between the browser's File API and our IndexedDB schema
export function mapData(rawDataArray: rawData[]): fileData[] {
  return rawDataArray.map((rawItem) => {
    const isText = typeof rawItem.fileContent === 'string';
    const fileContent = isText
      ? rawItem.fileContent as string
      : rawItem.fileContent as Uint8Array;
    let fileType: 'text' | 'pdf' | 'docx';
    if (rawItem.fileType.startsWith('text/')) {
      fileType = 'text';
    } else if (rawItem.fileType === 'application/pdf') {
      fileType = 'pdf';
    } else if (rawItem.fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      fileType = 'docx';
    } else {
      throw new Error(`Unsupported file type: ${rawItem.fileType}`);
    }
    return {
      fileName: rawItem.fileName,
      fileContent,
      fileSize: rawItem.fileSize,
      fileType,
      createdAt: Date.now(),
    };
  });
}