"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@in.pulse-crm/utils");
const express_1 = require("express");
const multer_middleware_1 = __importDefault(require("../../middlewares/multer.middleware"));
const storage_service_1 = __importDefault(require("./storage.service"));
const storageRoutes = (0, express_1.Router)();
class StorageController {
    constructor(router) {
        router.post("/", multer_middleware_1.default.single("file"), this.handleUpload);
        router.get("/:fileId", this.handleDownload);
        router.post("/register", this.handleRegister);
        router.post("/bulk", this.handleBulkInsert);
    }
    handleUpload = async (req, res) => {
        try {
            const file = req.file;
            const folder = req.body?.folder || "public";
            if (!file) {
                return res.status(400).json({ message: "No file uploaded" });
            }
            utils_1.Logger.info(`Uploading file: ${file.originalname} to folder: ${folder}`);
            const result = await storage_service_1.default.upload({ file, folder });
            return res.status(201).json(result);
        }
        catch (error) {
            return res.status(500).json({ message: error?.message });
        }
    };
    handleDownload = async (req, res) => {
        try {
            const { fileId } = req.params;
            if (!fileId) {
                return res.status(400).json({ message: "File ID is required" });
            }
            utils_1.Logger.info(`Downloading file with ID: ${fileId}`);
            const fileStream = await storage_service_1.default.download({ fileId });
            return fileStream.pipe(res);
        }
        catch (error) {
            return res.status(500).json({ message: error?.message });
        }
    };
    handleRegister = async (req, res) => {
        try {
            const file = req.body;
            if (!file ||
                typeof file.name !== "string" ||
                typeof file.type !== "string" ||
                typeof file.path !== "string") {
                return res.status(400).json({
                    message: "File requires: name (string), type (string), path (string). Optional: id, date",
                });
            }
            utils_1.Logger.info(`Registering existing file: ${file.name}`);
            const result = await storage_service_1.default.registerExistingFile(file);
            return res.status(201).json(result);
        }
        catch (error) {
            return res.status(500).json({ message: error?.message });
        }
    };
    handleBulkInsert = async (req, res) => {
        try {
            const { files } = req.body;
            if (!Array.isArray(files) || files.length === 0) {
                return res
                    .status(400)
                    .json({ message: "Field 'files' must be a non-empty array" });
            }
            const invalid = files.filter((f) => !f ||
                typeof f.name !== "string" ||
                typeof f.type !== "string" ||
                typeof f.size !== "number" ||
                typeof f.path !== "string");
            if (invalid.length) {
                return res.status(400).json({
                    message: "Each file requires: name (string), type (string), size (number), path (string). Optional: id, date",
                });
            }
            utils_1.Logger.info(`Bulk registering ${files.length} existing file(s)`);
            const result = await storage_service_1.default.registerExistingFiles(files);
            return res.status(201).json(result);
        }
        catch (error) {
            return res.status(500).json({ message: error?.message });
        }
    };
}
new StorageController(storageRoutes);
exports.default = storageRoutes;
