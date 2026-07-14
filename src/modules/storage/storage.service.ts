import { Logger } from "@in.pulse-crm/utils";
import "dotenv/config";
import { nanoid } from "nanoid";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { tmpdir } from "node:os";
import prisma from "../../prisma";

import LocalStorage from "./storages/local.storage";
import Storage from "./storages/storage";
import { NotFoundError } from "@rgranatodutra/http-errors";

interface ChunkUploadSessionMetadata {
  folder: string;
  fileName: string;
  fileType: string;
  totalSize: number;
  totalChunks: number;
  createdAt: string;
}

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
const CHUNK_UPLOAD_ROOT = path.join(tmpdir(), "infotec-storage-client-chunks");
Logger.info(`Storage base path: ${BASE_PATH}`);

class StorageService {
  constructor(private storage: Storage) { }

  private getChunkUploadDir(uploadId: string): string {
    return path.join(CHUNK_UPLOAD_ROOT, uploadId);
  }

  private getChunkMetadataPath(uploadId: string): string {
    return path.join(this.getChunkUploadDir(uploadId), "metadata.json");
  }

  private async readChunkMetadata(uploadId: string): Promise<ChunkUploadSessionMetadata> {
    const raw = await fs.readFile(this.getChunkMetadataPath(uploadId), "utf-8");
    return JSON.parse(raw) as ChunkUploadSessionMetadata;
  }

  private async removeChunkUploadDir(uploadId: string): Promise<void> {
    await fs.rm(this.getChunkUploadDir(uploadId), { recursive: true, force: true });
  }

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

  public async initChunkUpload(input: {
    folder: string;
    fileName: string;
    fileType: string;
    totalSize: number;
    totalChunks: number;
  }) {
    const uploadId = await this.getUniqueId();
    const uploadDir = this.getChunkUploadDir(uploadId);

    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(
      this.getChunkMetadataPath(uploadId),
      JSON.stringify({
        folder: input.folder,
        fileName: input.fileName,
        fileType: input.fileType,
        totalSize: input.totalSize,
        totalChunks: input.totalChunks,
        createdAt: new Date().toISOString(),
      } satisfies ChunkUploadSessionMetadata),
      "utf-8"
    );

    return { uploadId };
  }

  public async uploadChunk(input: {
    uploadId: string;
    chunkIndex: number;
    totalChunks: number;
    chunk: Express.Multer.File;
  }) {
    const metadata = await this.readChunkMetadata(input.uploadId);

    if (metadata.totalChunks !== input.totalChunks) {
      throw new Error("totalChunks mismatch for chunk upload session");
    }

    await fs.writeFile(
      path.join(this.getChunkUploadDir(input.uploadId), `${input.chunkIndex}.part`),
      input.chunk.buffer
    );

    const files = await fs.readdir(this.getChunkUploadDir(input.uploadId));
    const receivedChunks = files.filter((fileName) => fileName.endsWith(".part")).length;

    return {
      receivedChunks,
      totalChunks: metadata.totalChunks,
    };
  }

  public async completeChunkUpload(uploadId: string) {
    const metadata = await this.readChunkMetadata(uploadId);
    const buffers: Buffer[] = [];

    for (let index = 0; index < metadata.totalChunks; index++) {
      const chunkPath = path.join(this.getChunkUploadDir(uploadId), `${index}.part`);
      const chunkBuffer = await fs.readFile(chunkPath);
      buffers.push(chunkBuffer);
    }

    const mergedBuffer = Buffer.concat(buffers);

    if (mergedBuffer.length !== metadata.totalSize) {
      throw new Error("Merged chunk size does not match original file size");
    }

    const file: Express.Multer.File = {
      fieldname: "file",
      originalname: metadata.fileName,
      encoding: "7bit",
      mimetype: metadata.fileType,
      size: mergedBuffer.length,
      buffer: mergedBuffer,
      destination: "",
      filename: metadata.fileName,
      path: "",
      stream: Readable.from(mergedBuffer),
    };

    const uploadedFile = await this.upload({ file, folder: metadata.folder });
    await this.removeChunkUploadDir(uploadId);

    return uploadedFile;
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
