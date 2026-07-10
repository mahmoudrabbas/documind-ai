import type { Readable } from "node:stream";
export interface StorageProvider {
    saveFile(buffer: Buffer, originalName: string, tenantId: string): Promise<string>;
    saveFileFromStream(stream: Readable, originalName: string, tenantId: string): Promise<string>;
    deleteFile(storagePath: string): Promise<void>;
    getFileStream(storagePath: string): Readable;
    getFullPath(storagePath: string): string;
}
export declare const storageProvider: StorageProvider;
//# sourceMappingURL=index.d.ts.map