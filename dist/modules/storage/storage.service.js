"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@in.pulse-crm/utils");
require("dotenv/config");
const nanoid_1 = require("nanoid");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const prisma_1 = __importDefault(require("../../prisma"));
const local_storage_1 = __importDefault(require("./storages/local.storage"));
const BASE_PATH = process.env["STORAGE_PATH"] || node_path_1.default.join(process.cwd(), "uploads");
const LOCAL_STORAGE = new local_storage_1.default(BASE_PATH);
utils_1.Logger.info(`Storage base path: ${BASE_PATH}`);
class StorageService {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    async upload({ file, folder }) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const uniqueId = await this.getUniqueId();
        const filePath = `/${folder}/${year}/${month}/${uniqueId}`;
        const savePath = await this.storage.upload({ file, folder: filePath });
        const fileData = await this.saveFileMetadataOnDatabase({
            id: uniqueId,
            file,
            path: savePath,
            date: now,
        });
        return fileData;
    }
    async download({ fileId }) {
        const file = await prisma_1.default.file.findUnique({
            where: { id: fileId },
        });
        if (!file)
            throw new Error("File not found");
        const fileStream = await this.storage.download({ sourcePath: file.path });
        return fileStream;
    }
    async getUniqueId() {
        const id = (0, nanoid_1.nanoid)();
        const duplicated = await prisma_1.default.file.findUnique({
            where: { id },
        });
        return duplicated ? await this.getUniqueId() : id;
    }
    async saveFileMetadataOnDatabase({ id, file, path, date, }) {
        return await prisma_1.default.file.create({
            data: {
                id,
                name: file.originalname,
                type: file.mimetype,
                size: file.size,
                date,
                path,
            },
            omit: {
                path: true,
            },
        });
    }
    async registerExistingFile(file) {
        const fullPath = node_path_1.default.join(BASE_PATH, file.path);
        let stats;
        try {
            stats = await promises_1.default.stat(fullPath);
        }
        catch (error) {
            throw new Error(`File not found at path: ${file.path}`);
        }
        if (!stats.isFile()) {
            throw new Error(`Path is not a file: ${file.path}`);
        }
        const id = file.id || (await this.getUniqueId());
        const date = file.date ? new Date(file.date) : new Date();
        const size = stats.size;
        const created = await prisma_1.default.file.create({
            data: {
                id,
                name: file.name,
                type: file.type,
                size,
                path: file.path,
                date,
            },
            omit: { path: true },
        });
        return created;
    }
    async registerExistingFiles(files) {
        if (!files?.length) {
            throw new Error("No files provided");
        }
        const prepared = await Promise.all(files.map(async (f) => {
            const id = f.id || (await this.getUniqueId());
            const date = f.date ? new Date(f.date) : new Date();
            return {
                id,
                name: f.name,
                type: f.type,
                size: f.size,
                path: f.path,
                date,
            };
        }));
        const created = await prisma_1.default.$transaction(prepared.map((p) => prisma_1.default.file.create({
            data: p,
            omit: { path: true },
        })));
        return created;
    }
}
exports.default = new StorageService(LOCAL_STORAGE);
