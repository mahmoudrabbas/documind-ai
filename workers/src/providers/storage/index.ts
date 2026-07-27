import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../../config/index.js";

export interface StorageProvider {
  saveFile(buffer: Buffer, originalName: string, tenantId: string): Promise<string>;
  saveFileFromStream(stream: Readable, originalName: string, tenantId: string): Promise<string>;
  deleteFile(storageKey: string): Promise<void>;
  getFileStream(storageKey: string): Promise<Readable> | Readable;
  getFileBuffer(storageKey: string): Promise<Buffer>;
  getContentType(originalName: string): string;
}

export class LocalStorageProvider implements StorageProvider {
  private _baseDir?: string;

  constructor(baseDir?: string) {
    this._baseDir = baseDir;
  }

  private get baseDir(): string {
    return this._baseDir ?? config.UPLOAD_DIR;
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

  async deleteFile(storageKey: string): Promise<void> {
    const fullPath = path.join(this.baseDir, storageKey);

    try {
      await fsp.unlink(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  getFileStream(storageKey: string): Readable {
    const fullPath = path.join(this.baseDir, storageKey);
    return fs.createReadStream(fullPath);
  }

  async getFileBuffer(storageKey: string): Promise<Buffer> {
    const fullPath = path.join(this.baseDir, storageKey);
    return fsp.readFile(fullPath);
  }

  getContentType(originalName: string): string {
    const ext = originalName.substring(originalName.lastIndexOf(".") + 1).toLowerCase();
    const map: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc: "application/msword",
      txt: "text/plain",
      md: "text/markdown",
    };
    return map[ext] ?? "application/octet-stream";
  }
}

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor(region: string, bucket: string, accessKeyId?: string, secretAccessKey?: string) {
    this.bucket = bucket;
    const clientConfig: Record<string, unknown> = { region };
    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }
    this.client = new S3Client(clientConfig);
  }

  private generateStorageKey(originalName: string, tenantId: string): string {
    const ext = path.extname(originalName) || "";
    const uniqueName = `${randomUUID()}${ext}`;
    return `${tenantId}/${uniqueName}`;
  }

  getContentType(originalName: string): string {
    const ext = originalName.substring(originalName.lastIndexOf(".") + 1).toLowerCase();
    const map: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc: "application/msword",
      txt: "text/plain",
      md: "text/markdown",
    };
    return map[ext] ?? "application/octet-stream";
  }

  async saveFile(buffer: Buffer, originalName: string, tenantId: string): Promise<string> {
    const storageKey = this.generateStorageKey(originalName, tenantId);
    const contentType = this.getContentType(originalName);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return storageKey;
  }

  async saveFileFromStream(stream: Readable, originalName: string, tenantId: string): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    return this.saveFile(buffer, originalName, tenantId);
  }

  async deleteFile(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
  }

  async getFileStream(storageKey: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );

    if (!response.Body) {
      throw new Error(`S3 Object Body is empty for key: ${storageKey}`);
    }

    return response.Body as Readable;
  }

  async getFileBuffer(storageKey: string): Promise<Buffer> {
    const stream = await this.getFileStream(storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}

export function createStorageProvider(): StorageProvider {
  if (config.STORAGE_PROVIDER === "s3") {
    return new S3StorageProvider(
      config.AWS_REGION,
      config.AWS_S3_BUCKET,
      config.AWS_ACCESS_KEY_ID,
      config.AWS_SECRET_ACCESS_KEY,
    );
  }
  return new LocalStorageProvider();
}

export const storageProvider: StorageProvider = createStorageProvider();
