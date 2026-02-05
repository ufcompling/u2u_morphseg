import Dexie from "dexie";
import {type fileData } from "./dataHelpers";

/* =============================================================================
 * DATABASE CONFIGURATION
 * ============================================================================= */

// We're using Dexie to wrap IndexedDB
// This gives us a clean interface for storing files entirely in the browser - no server needed.
// The user's data never leaves their machine, which is critical for working with endangered
// language data that may be culturally sensitive.
class FileDB extends Dexie {
  files!: Dexie.Table<fileData, number>;
  
  constructor() {
    super('FileDB');
    
    // The ++id means auto-increment primary key - Dexie handles the numbering for us
    // We index on filename, type, size, and createdAt so we can query/sort efficiently
    this.version(1).stores({
      files: '++id, filename, type, size, createdAt'
    });
  }
}

export const db = new FileDB();