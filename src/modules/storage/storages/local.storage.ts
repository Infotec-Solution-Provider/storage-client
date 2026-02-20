import Storage, { ReadFileOptions, WriteFileOptions } from "./storage";
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import NotFoundError from "../../shared/errors/not-found.error";

class LocalStorage implements Storage {
    private basePath: string;

    constructor(storagePath: string) {
        this.basePath = storagePath;
    }

    private normalizePath(filePath: string): string {
        let normalized = path.resolve(filePath);
        const basePath = path.resolve(this.basePath);

        if (!normalized.startsWith(basePath) && !path.isAbsolute(filePath)) {
            normalized = path.join(basePath, filePath);
        }

        return normalized;
    }

    public async writeFile(options: WriteFileOptions): Promise<string> {
        const { file, folder } = options;

        const filePath = path.join(this.basePath, folder, file.originalname);

        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.buffer);

        const relativePath = path.relative(this.basePath, filePath);
        return relativePath;
    }

    public async readFile(options: ReadFileOptions): Promise<NodeJS.ReadableStream> {
        let filePath = this.normalizePath(options.sourcePath);

        await fs.access(filePath).catch((err) => {
            throw new NotFoundError(`File not found at path: ${filePath} | ${err.message}`);
        });

        return createReadStream(filePath);
    }
}

export default LocalStorage;