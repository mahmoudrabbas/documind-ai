import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { config } from "../../config/index.js";
class LocalStorageProvider {
    baseDir;
    constructor(baseDir) {
        this.baseDir = baseDir;
    }
    async ensureDir(dir) {
        await fsp.mkdir(dir, { recursive: true });
    }
    generateStoragePath(originalName, tenantId) {
        const ext = path.extname(originalName) || "";
        const uniqueName = `${randomUUID()}${ext}`;
        const relativePath = path.join(tenantId, uniqueName);
        const fullPath = path.join(this.baseDir, relativePath);
        return { storagePath: relativePath, fullPath };
    }
    async saveFile(buffer, originalName, tenantId) {
        const { storagePath, fullPath } = this.generateStoragePath(originalName, tenantId);
        await this.ensureDir(path.dirname(fullPath));
        await fsp.writeFile(fullPath, buffer);
        return storagePath;
    }
    async saveFileFromStream(stream, originalName, tenantId) {
        const { storagePath, fullPath } = this.generateStoragePath(originalName, tenantId);
        await this.ensureDir(path.dirname(fullPath));
        const writeStream = fs.createWriteStream(fullPath);
        await pipeline(stream, writeStream);
        return storagePath;
    }
    async deleteFile(storagePath) {
        const fullPath = path.join(this.baseDir, storagePath);
        try {
            await fsp.unlink(fullPath);
        }
        catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }
        }
    }
    getFileStream(storagePath) {
        const fullPath = path.join(this.baseDir, storagePath);
        return fs.createReadStream(fullPath);
    }
    getFullPath(storagePath) {
        return path.join(this.baseDir, storagePath);
    }
}
export const storageProvider = new LocalStorageProvider(config.UPLOAD_DIR);
//# sourceMappingURL=index.js.map