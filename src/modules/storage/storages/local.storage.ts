import Storage, { DownloadFileOptions, UploadFileOptions } from "./storage";
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';

class LocalStorage implements Storage {
    private basePath: string;

    constructor(storagePath: string) {
        this.basePath = storagePath;
    }

    /**
     * Normalizes a file path to ensure it's relative to basePath
     * and returns the normalized absolute path
     */
    private normalizePath(filePath: string): string {
        let normalized = path.resolve(filePath);
        const basePath = path.resolve(this.basePath);

        // If path is already absolute and not within basePath, use it as-is
        // Otherwise, ensure it's relative to basePath
        if (!normalized.startsWith(basePath) && !path.isAbsolute(filePath)) {
            normalized = path.join(basePath, filePath);
        }

        return normalized;
    }

    public async upload(options: UploadFileOptions): Promise<string> {
        try {
            const { file, folder } = options;

            const filePath = path.join(this.basePath, folder, file.originalname);

            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, file.buffer);

            // Store relative path to ensure portability
            const relativePath = path.relative(this.basePath, filePath);
            return relativePath;
        } catch (err: unknown) {
            if (err instanceof Error) {
                throw new Error(`Failed to upload file: ${err.message}`, { cause: err });
            }

            throw new Error(`Failed to upload file: ${String(err)}`);
        }
    }

    public async download(options: DownloadFileOptions): Promise<NodeJS.ReadableStream> {
        try {
            let filePath = this.normalizePath(options.sourcePath);

            // Validate file exists before creating stream
            await fs.access(filePath);

            return createReadStream(filePath);
        } catch (err: unknown) {
            if (err instanceof Error) {
                throw new Error(`Failed to download file: ${err.message}`, { cause: err });
            }
            throw new Error(`Failed to download file: ${String(err)}`);
        }
    }
}

export default LocalStorage;