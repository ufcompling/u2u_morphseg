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
// Structured file data ready for IndexedDB storage
export interface fileData {
  fileName: string;                    // Original filename preserved
  fileContent: string;                 // Always a string (binary data gets Base64-encoded)
  fileSize?: number;                   // File size in bytes
  fileType: 'text' | 'binary';         // Only 'text' or 'binary' allowed
  createdAt?: number;                  // Unix timestamp - when file was uploaded
  processedFileContent?: string;       // ML output - populated after running CRF model
}

/* =============================================================================
 * DATA TRANSFORMATION UTILITIES
 * ============================================================================= */

// Convert binary file data to Base64 string for storage
// We do this because IndexedDB can't efficiently store Uint8Array in our schema
// Base64 is ~33% larger but lets us treat all content uniformly as strings
function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  let binary = '';
  const len = uint8Array.byteLength;
  
  // Build a binary string by converting each byte to a character
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  
  // Use browser's built-in Base64 encoder
  return btoa(binary);
}

// Transform raw uploaded files into database-ready format
// This is the bridge between the browser's File API and our IndexedDB schema
export function mapData(rawDataArray: rawData[]): fileData[] {
  return rawDataArray.map((rawItem) => {
    const isText = typeof rawItem.fileContent === 'string';
    const fileContent = isText
      ? rawItem.fileContent as string
      : uint8ArrayToBase64(rawItem.fileContent as Uint8Array);
    const fileType: 'text' | 'binary' = isText ? 'text' : 'binary';
    return {
      fileName: rawItem.fileName,
      fileContent,
      fileSize: rawItem.fileSize,
      fileType,
      createdAt: Date.now(),
    };
  });
}