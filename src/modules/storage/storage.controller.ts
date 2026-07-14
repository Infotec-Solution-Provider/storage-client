import { Logger } from "@in.pulse-crm/utils";
import { Request, Response, Router } from "express";
import upload from "../../middlewares/multer.middleware";
import StorageService from "./storage.service";
import { NotFoundError } from "@rgranatodutra/http-errors";

const storageRoutes = Router();

class StorageController {
  constructor(router: Router) {
    router.post("/", upload.single("file"), this.handleUpload);
    router.post("/chunks/init", this.handleInitChunkUpload);
    router.post("/chunks/:uploadId", upload.single("chunk"), this.handleUploadChunk);
    router.post("/chunks/:uploadId/complete", this.handleCompleteChunkUpload);
    router.get("/:fileId", this.handleDownload);
    router.post("/register", this.handleRegister);
    router.post("/bulk", this.handleBulkInsert);
  }

  private handleInitChunkUpload = async (req: Request, res: Response) => {
    try {
      const { folder = "public", fileName, fileType, totalSize, totalChunks } = req.body;

      if (
        typeof folder !== "string" ||
        typeof fileName !== "string" ||
        typeof fileType !== "string"
      ) {
        return res.status(400).json({
          message: "folder, fileName and fileType are required",
        });
      }

      const parsedTotalSize = Number(totalSize);
      const parsedTotalChunks = Number(totalChunks);

      if (!Number.isFinite(parsedTotalSize) || parsedTotalSize <= 0) {
        return res.status(400).json({ message: "totalSize must be a number greater than 0" });
      }

      if (!Number.isInteger(parsedTotalChunks) || parsedTotalChunks <= 0) {
        return res.status(400).json({ message: "totalChunks must be an integer greater than 0" });
      }

      const result = await StorageService.initChunkUpload({
        folder,
        fileName,
        fileType,
        totalSize: parsedTotalSize,
        totalChunks: parsedTotalChunks,
      });

      return res.status(201).json(result);
    } catch (error: any) {
      Logger.error("Error initializing chunk upload", error);
      return res.status(500).json({ message: error?.message });
    }
  };

  private handleUploadChunk = async (req: Request, res: Response) => {
    try {
      const { uploadId } = req.params;
      const { chunkIndex, totalChunks } = req.body;
      const chunk = req.file;

      if (!uploadId) {
        return res.status(400).json({ message: "uploadId is required" });
      }

      if (!chunk) {
        return res.status(400).json({ message: "No chunk uploaded" });
      }

      const parsedChunkIndex = Number(chunkIndex);
      const parsedTotalChunks = Number(totalChunks);

      if (!Number.isInteger(parsedChunkIndex) || parsedChunkIndex < 0) {
        return res.status(400).json({ message: "chunkIndex must be an integer >= 0" });
      }

      if (!Number.isInteger(parsedTotalChunks) || parsedTotalChunks <= 0) {
        return res.status(400).json({ message: "totalChunks must be an integer greater than 0" });
      }

      const result = await StorageService.uploadChunk({
        uploadId,
        chunkIndex: parsedChunkIndex,
        totalChunks: parsedTotalChunks,
        chunk,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      Logger.error("Error uploading chunk", error);
      return res.status(500).json({ message: error?.message });
    }
  };

  private handleCompleteChunkUpload = async (req: Request, res: Response) => {
    try {
      const { uploadId } = req.params;

      if (!uploadId) {
        return res.status(400).json({ message: "uploadId is required" });
      }

      const result = await StorageService.completeChunkUpload(uploadId);
      return res.status(201).json(result);
    } catch (error: any) {
      Logger.error("Error completing chunk upload", error);
      return res.status(500).json({ message: error?.message });
    }
  };

  private handleUpload = async (req: Request, res: Response) => {
    try {
      const file = req.file;
      const folder = req.body?.folder || "public";

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      Logger.info(`Uploading file: ${file.originalname} to folder: ${folder}`);
      const result = await StorageService.upload({ file, folder });

      return res.status(201).json(result);
    } catch (error: any) {
      Logger.error("Error uploading file", error);
      return res.status(500).json({ message: error?.message });
    }
  };

  private handleDownload = async (req: Request, res: Response) => {
    try {
      const { fileId } = req.params;

      if (!fileId) {
        return res.status(400).json({ message: "File ID is required" });
      }

      Logger.info(`Downloading file with ID: ${fileId}`);
      const fileStream = await StorageService.readFile({ fileId });

      return fileStream.pipe(res);
    } catch (error: any) {
      Logger.error("Error downloading file", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }

      return res.status(500).json({ message: error?.message });
    }
  };

  private handleRegister = async (req: Request, res: Response) => {
    try {
      const file = req.body;

      if (
        !file ||
        typeof file.name !== "string" ||
        typeof file.type !== "string" ||
        typeof file.path !== "string"
      ) {
        return res.status(400).json({
          message:
            "File requires: name (string), type (string), path (string). Optional: id, date",
        });
      }

      Logger.info(`Registering existing file: ${file.name}`);
      const result = await StorageService.registerExistingFile(file);

      return res.status(201).json(result);
    } catch (error: any) {
      Logger.error("Error registering existing file", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(500).json({ message: error?.message });
    }
  };

  private handleBulkInsert = async (req: Request, res: Response) => {
    try {
      const { files } = req.body;

      if (!Array.isArray(files) || files.length === 0) {
        return res
          .status(400)
          .json({ message: "Field 'files' must be a non-empty array" });
      }

      // Validação superficial
      const invalid = files.filter(
        (f: any) =>
          !f ||
          typeof f.name !== "string" ||
          typeof f.type !== "string" ||
          typeof f.size !== "number" ||
          typeof f.path !== "string"
      );

      if (invalid.length) {
        return res.status(400).json({
          message:
            "Each file requires: name (string), type (string), size (number), path (string). Optional: id, date",
        });
      }

      Logger.info(`Bulk registering ${files.length} existing file(s)`);
      const result = await StorageService.registerExistingFiles(files);

      return res.status(201).json(result);
    } catch (error: any) {
      Logger.error("Error bulk registering existing files", error);
      return res.status(500).json({ message: error?.message });
    }
  };
}

new StorageController(storageRoutes);

export default storageRoutes;
