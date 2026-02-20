import { Logger } from "@in.pulse-crm/utils";
import "dotenv/config";
import { nanoid } from "nanoid";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "../../prisma";

import LocalStorage from "./storages/local.storage";
import Storage from "./storages/storage";
import { NotFoundError } from "@rgranatodutra/http-errors";

interface WriteFileOptions {
  file: Express.Multer.File;
  folder: string;
}

interface ReadFileOptions {
  fileId: string;
}

interface SaveFileMetadataOptions {
  id: string;
  file: Express.Multer.File;
  path: string;
  date: Date;
}

const BASE_PATH =
  process.env["STORAGE_PATH"] || path.join(process.cwd(), "uploads");
const LOCAL_STORAGE = new LocalStorage(BASE_PATH);
Logger.info(`Storage base path: ${BASE_PATH}`);

class StorageService {
  constructor(private storage: Storage) { }

  public async upload({ file, folder }: WriteFileOptions) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");

    const uniqueId = await this.getUniqueId();
    const filePath = `/${folder}/${year}/${month}/${uniqueId}`;
    const savePath = await this.storage.writeFile({ file, folder: filePath });
    const fileData = await this.saveFileMetadata({
      id: uniqueId,
      file,
      path: savePath,
      date: now,
    });

    return fileData;
  }

  public async readFile({ fileId }: ReadFileOptions) {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });
    if (!file) throw new NotFoundError(`File with ID ${fileId} not found in database`);
    const fileStream = await this.storage.readFile({ sourcePath: file.path });

    return fileStream;
  }

  private async getUniqueId(): Promise<string> {
    const id = nanoid();

    const duplicated = await prisma.file.findUnique({
      where: { id },
    });

    return duplicated ? await this.getUniqueId() : id;
  }

  private async saveFileMetadata({
    id,
    file,
    path,
    date,
  }: SaveFileMetadataOptions) {
    return await prisma.file.create({
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

  public async registerExistingFile(file: {
    id?: string;
    name: string;
    type: string;
    path: string;
    date?: Date | string;
  }) {
    // Valida se o arquivo existe e obtém o tamanho real
    const fullPath = path.join(BASE_PATH, file.path);
    let stats;
    try {
      stats = await fs.stat(fullPath);
    } catch (error) {
      throw new Error(`File not found at path: ${file.path}`);
    }

    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${file.path}`);
    }

    const id = file.id || (await this.getUniqueId());
    const date = file.date ? new Date(file.date) : new Date();
    const size = stats.size;

    const created = await prisma.file.create({
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

  public async registerExistingFiles(
    files: Array<{
      id?: string;
      name: string;
      type: string;
      size: number;
      path: string;
      date?: Date | string;
    }>
  ) {
    if (!files?.length) {
      throw new Error("No files provided");
    }

    // Normaliza e garante IDs únicos
    const prepared = await Promise.all(
      files.map(async (f) => {
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
      })
    );

    // Cria em transação para garantir atomicidade
    const created = await prisma.$transaction(
      prepared.map((p) =>
        prisma.file.create({
          data: p,
          omit: { path: true },
        })
      )
    );

    return created;
  }
}

export default new StorageService(LOCAL_STORAGE);
