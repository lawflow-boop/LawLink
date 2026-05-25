import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { StorageProvider } from "./provider";

const STORAGE_ROOT = process.env.APP_STORAGE_DIR
  ? path.resolve(process.env.APP_STORAGE_DIR)
  : path.resolve(process.cwd(), "storage");

// ---------------------------------------------------------------------------
// Class-based provider (implements the abstraction)
// ---------------------------------------------------------------------------

export class LocalStorageProvider implements StorageProvider {
  /**
   * 写入文件到 storage/<scope>/<yyyymm>/<uuid>.bin
   * 返回相对 STORAGE_ROOT 的 path（存到数据库）
   */
  async writeFile(scope: string, data: Buffer): Promise<string> {
    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, "_");
    const dir = path.join(STORAGE_ROOT, safeScope, yyyymm);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${randomUUID()}.bin`;
    const relPath = path.posix.join(safeScope, yyyymm, filename);
    await fs.writeFile(path.join(STORAGE_ROOT, relPath), data);
    return relPath;
  }

  async readFile(relPath: string): Promise<Buffer> {
    const full = path.join(STORAGE_ROOT, relPath);
    // 防止路径穿越
    const resolved = path.resolve(full);
    if (!resolved.startsWith(STORAGE_ROOT)) {
      throw new Error("非法路径");
    }
    return fs.readFile(resolved);
  }

  async deleteFile(relPath: string): Promise<void> {
    const full = path.join(STORAGE_ROOT, relPath);
    const resolved = path.resolve(full);
    if (!resolved.startsWith(STORAGE_ROOT)) {
      throw new Error("非法路径");
    }
    try {
      await fs.unlink(resolved);
    } catch (err) {
      // 容忍文件已不存在
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton used by backward-compatible standalone exports
// ---------------------------------------------------------------------------

const _instance = new LocalStorageProvider();

// ---------------------------------------------------------------------------
// Legacy standalone function exports (backward compatibility)
// ---------------------------------------------------------------------------

export function writeFile(scope: string, data: Buffer): Promise<string> {
  return _instance.writeFile(scope, data);
}

export function readFile(relPath: string): Promise<Buffer> {
  return _instance.readFile(relPath);
}

/** @deprecated Use storage.deleteFile() instead. Kept for backward compat. */
export function deleteStoredFile(relPath: string): Promise<void> {
  return _instance.deleteFile(relPath);
}

export function getStorageRoot() {
  return STORAGE_ROOT;
}
