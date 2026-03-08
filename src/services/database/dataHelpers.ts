/* =============================================================================
 * TYPE DEFINITIONS
 * ============================================================================= */

// Emscripten uses string lookups only so no IDs.
// Structured file data ready for IndexedDB storage and calls
export interface fileData {
  fileName: string;                    // Original filename preserved
  fileContent?: string | Uint8Array;                 // Always a string (binary data gets Uint8Array-encoded as a string)
  fileSize?: number;                   // File size in bytes
  fileType?: 'text' | 'pdf' | 'docx';         // Only 'text', 'pdf', or 'docx' allowed
  createdAt?: number;                  // Unix timestamp - when file was uploaded
  filePath?: string;                  // Virtual path in Emscripten FS (e.g. "/uploads/filename.txt")
  fileRole?: string;                // Assigned role (e.g. "training", "validation", "test")
  validationStatus?: 'valid' | 'invalid' | 'pending'; // Validation status for UI feedback
}