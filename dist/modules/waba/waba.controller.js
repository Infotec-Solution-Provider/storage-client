"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const waba_service_1 = __importDefault(require("./waba.service"));
const utils_1 = require("@in.pulse-crm/utils");
const wabaRoutes = (0, express_1.Router)();
class WABAController {
    constructor(router) {
        router.get("/media/:id", this.handleGetMedia);
    }
    handleGetMedia = async (req, res) => {
        try {
            utils_1.Logger.info("Fetching media URL from WABA");
            const { id } = req.params;
            const { filename } = req.query;
            if (!id) {
                return res.status(400).json({ message: "Media ID is required" });
            }
            const data = await waba_service_1.default.downloadMediaAndStore(id, filename);
            return res.status(200).json({ message: "Media URL fetched successfully", data });
        }
        catch (error) {
            return res.status(500).json({ message: error?.message });
        }
    };
}
new WABAController(wabaRoutes);
exports.default = wabaRoutes;
