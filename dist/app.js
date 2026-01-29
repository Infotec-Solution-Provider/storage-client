"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@in.pulse-crm/utils");
const cors_1 = __importDefault(require("cors"));
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const storage_controller_1 = __importDefault(require("./modules/storage/storage.controller"));
const waba_controller_1 = __importDefault(require("./modules/waba/waba.controller"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use("/api/storage", storage_controller_1.default);
app.use("/api/waba", waba_controller_1.default);
app.use((err, _req, res, _next) => {
    utils_1.Logger.error("Internal server error", err);
    res.status(500).send({ message: "Internal server error", cause: err });
});
const LISTEN_PORT = Number(process.env["LISTEN_PORT"]) || 3001;
app.listen(LISTEN_PORT, () => {
    (0, utils_1.logRoutes)("/api/storage", [storage_controller_1.default]);
    (0, utils_1.logRoutes)("/api/waba", [waba_controller_1.default]);
    console.log("Server is running on port ", LISTEN_PORT);
});
