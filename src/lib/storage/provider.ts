/**
 * Storage provider abstraction.
 *
 * All file I/O in LawLink goes through this interface so that the backing
 * store can be swapped (local filesystem, S3, etc.) without touching
 * business logic.
 */
export interface StorageProvider {
  /**
   * Persist a binary blob under the given scope.
   * @returns Relative path (stored in DB for later retrieval).
   */
  writeFile(scope: string, data: Buffer): Promise<string>;

  /** Read a previously written file by its relative path. */
  readFile(relPath: string): Promise<Buffer>;

  /** Delete a previously written file. Tolerates already-missing files. */
  deleteFile(relPath: string): Promise<void>;
}
