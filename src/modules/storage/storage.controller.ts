import { Logger } from "@in.pulse-crm/utils";
import { Request, Response, Router } from "express";
import upload from "../../middlewares/multer.middleware";
import StorageService from "./storage.service";

const storageRoutes = Router();

class StorageController {
  constructor(router: Router) {
    router.post("/", upload.single("file"), this.handleUpload);
    router.get("/:fileId", this.handleDownload);
    router.post("/register", this.handleRegister);
    router.post("/bulk", this.handleBulkInsert);
  }

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
      const fileStream = await StorageService.download({ fileId });

      return fileStream.pipe(res);
    } catch (error: any) {
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
      return res.status(500).json({ message: error?.message });
    }
  };
}

new StorageController(storageRoutes);

export default storageRoutes;
