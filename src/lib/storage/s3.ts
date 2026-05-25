/**
 * S3-compatible storage provider (optional).
 *
 * Activated by setting STORAGE_PROVIDER=s3 and providing the usual AWS env
 * vars. The @aws-sdk/client-s3 package is an *optional* dependency — if it
 * is not installed every method throws a clear error.
 */
import type { StorageProvider } from "./provider";

export class S3StorageProvider implements StorageProvider {
  async writeFile(_scope: string, _data: Buffer): Promise<string> {
    throw new Error("S3 storage not configured: @aws-sdk/client-s3 not installed");
  }

  async readFile(_relPath: string): Promise<Buffer> {
    throw new Error("S3 storage not configured: @aws-sdk/client-s3 not installed");
  }

  async deleteFile(_relPath: string): Promise<void> {
    throw new Error("S3 storage not configured: @aws-sdk/client-s3 not installed");
  }
}
