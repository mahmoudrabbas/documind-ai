import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { config } from "../../config/index.js";

export interface StorageProvider {
  saveFile(buffer: Buffer, originalName: string, tenantId: string): Promise<string>;
  saveFileFromStream(stream: Readable, originalName: string, tenantId: string): Promise<string>;
  deleteFile(storagePath: string): Promise<void>;
  getFileStream(storagePath: string): Readable;
  getFullPath(storagePath: string): string;
}

class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  private async ensureDir(dir: string): Promise<void> {
    await fsp.mkdir(dir, { recursive: true });
  }

  private generateStoragePath(originalName: string, tenantId: string): { storagePath: string; fullPath: string } {
    const ext = path.extname(originalName) || "";
    const uniqueName = `${randomUUID()}${ext}`;
    const relativePath = path.join(tenantId, uniqueName);
    const fullPath = path.join(this.baseDir, relativePath);

    return { storagePath: relativePath, fullPath };
  }

  async saveFile(buffer: Buffer, originalName: string, tenantId: string): Promise<string> {
    const { storagePath, fullPath } = this.generateStoragePath(originalName, tenantId);

    await this.ensureDir(path.dirname(fullPath));
    await fsp.writeFile(fullPath, buffer);

    return storagePath;
  }

  async saveFileFromStream(stream: Readable, originalName: string, tenantId: string): Promise<string> {
    const { storagePath, fullPath } = this.generateStoragePath(originalName, tenantId);

    await this.ensureDir(path.dirname(fullPath));

    const writeStream = fs.createWriteStream(fullPath);
    await pipeline(stream, writeStream);

    return storagePath;
  }

  async deleteFile(storagePath: string): Promise<void> {
    const fullPath = path.join(this.baseDir, storagePath);

    try {
      await fsp.unlink(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  getFileStream(storagePath: string): Readable {
    const fullPath = path.join(this.baseDir, storagePath);

    return fs.createReadStream(fullPath);
  }

  getFullPath(storagePath: string): string {
    return path.join(this.baseDir, storagePath);
  }
}

export const storageProvider: StorageProvider = new LocalStorageProvider(config.UPLOAD_DIR);
