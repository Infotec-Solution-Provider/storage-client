"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_fs_1 = require("node:fs");
class LocalStorage {
    basePath;
    constructor(storagePath) {
        this.basePath = storagePath;
    }
    async upload(options) {
        try {
            const { file, folder } = options;
            const filePath = node_path_1.default.join(this.basePath, folder, file.originalname);
            await promises_1.default.mkdir(node_path_1.default.dirname(filePath), { recursive: true });
            await promises_1.default.writeFile(filePath, file.buffer);
            return filePath;
        }
        catch (err) {
            if (err instanceof Error) {
                throw new Error(`Failed to upload file: ${err.message}`, { cause: err });
            }
            throw new Error(`Failed to upload file: ${String(err)}`);
        }
    }
    async download(options) {
        try {
            const filePath = options.sourcePath;
            return (0, node_fs_1.createReadStream)(filePath);
        }
        catch (err) {
            if (err instanceof Error) {
                throw new Error(`Failed to download file: ${err.message}`, { cause: err });
            }
            throw new Error(`Failed to download file: ${String(err)}`);
        }
    }
}
exports.default = LocalStorage;
