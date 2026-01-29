"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const axios_1 = __importDefault(require("axios"));
const storage_service_1 = __importDefault(require("../storage/storage.service"));
const mime_types_1 = require("mime-types");
const BASE_GRAPH_API_URL = 'https://graph.facebook.com/v16.0';
const DEBUG_WABA = (process.env['DEBUG_WABA'] || '').toLowerCase() === 'true';
const AXIOS_BODY_PREVIEW = 400;
function previewBody(data) {
    try {
        if (data == null)
            return undefined;
        if (typeof data === 'string')
            return data.slice(0, AXIOS_BODY_PREVIEW);
        return JSON.stringify(data).slice(0, AXIOS_BODY_PREVIEW);
    }
    catch {
        return '[unserializable]';
    }
}
function formatAxiosError(err) {
    if (axios_1.default.isAxiosError(err)) {
        const { config, response, code } = err;
        const method = config?.method?.toUpperCase();
        const url = config?.url;
        const status = response?.status;
        const statusText = response?.statusText;
        const contentType = response?.headers?.['content-type'] || response?.headers?.['Content-Type'];
        const responseType = config?.responseType;
        const isBinary = responseType === 'arraybuffer' || /octet-stream|image|audio|video/i.test(String(contentType || ''));
        const body = !isBinary ? previewBody(response?.data) : undefined;
        return [
            'AxiosError:',
            method && `[${method}]`,
            url,
            status != null && `status=${status}`,
            statusText && `(${statusText})`,
            code && `code=${code}`,
            contentType && `ctype=${contentType}`,
            responseType && `rtype=${responseType}`,
            body && `body=${JSON.stringify(body)}`
        ].filter(Boolean).join(' ');
    }
    if (err instanceof Error)
        return err.message;
    return String(err);
}
class WABAService {
    api;
    constructor(authToken) {
        this.api = axios_1.default.create({
            baseURL: BASE_GRAPH_API_URL,
            timeout: 10000,
        });
        console.log("WABA Token:", authToken);
        this.api.defaults.headers["Authorization"] = `Bearer ${authToken}`;
    }
    async downloadMediaAndStore(id, filename) {
        const file = await this.downloadMedia(id, filename);
        const uploadedFile = await storage_service_1.default.upload({ file, folder: 'waba' });
        return uploadedFile;
    }
    async downloadMedia(id, filename) {
        const startedAt = Date.now();
        if (DEBUG_WABA)
            console.debug(`[WABA] downloadMedia:start id=${id} filename=${filename ?? '(auto)'}`);
        try {
            const data = await this.fetchMediaMetadata(id);
            let urlHost = '';
            try {
                urlHost = new URL(data.url).host;
            }
            catch { }
            if (DEBUG_WABA) {
                console.debug(`[WABA] downloadMedia:metadata id=${id} mime=${data.mime_type} size=${data.file_size} sha256=${(data.sha256 || '').slice(0, 8)}… host=${urlHost}`);
                console.debug(`[WABA] downloadMedia:requesting-bytes id=${id} host=${urlHost}`);
            }
            const response = await this.api.get(data.url, { responseType: 'arraybuffer' });
            if (DEBUG_WABA) {
                const byteLen = response.data?.byteLength ?? 0;
                console.debug(`[WABA] downloadMedia:received id=${id} status=${response.status} bytes=${byteLen}`);
            }
            const ext = (0, mime_types_1.extension)(data.mime_type);
            filename = filename || `${id}.${ext || 'bin'}`;
            if (DEBUG_WABA)
                console.debug(`[WABA] downloadMedia:resolved-filename id=${id} filename=${filename}`);
            const file = {
                buffer: Buffer.from(response.data),
                destination: '',
                fieldname: '',
                filename,
                mimetype: data.mime_type,
                originalname: filename,
                path: '',
                size: data.file_size,
                stream: null,
                encoding: '7bit'
            };
            if (DEBUG_WABA)
                console.debug(`[WABA] downloadMedia:done id=${id} size=${file.size} mime=${file.mimetype} elapsedMs=${Date.now() - startedAt}`);
            return file;
        }
        catch (err) {
            const msg = formatAxiosError(err);
            if (DEBUG_WABA)
                console.error(`[WABA] downloadMedia:error id=${id} ${msg}`);
            throw new Error(`Failed to download media: ${msg}`);
        }
    }
    async fetchMediaMetadata(id) {
        try {
            const response = await this.api.get(`/${id}`);
            return response.data;
        }
        catch (err) {
            const msg = formatAxiosError(err);
            if (DEBUG_WABA)
                console.error(`[WABA] fetchMediaMetadata:error id=${id} ${msg}`);
            throw new Error(`Failed to get media URL: ${msg}`);
        }
    }
}
exports.default = new WABAService(process.env['WABA_TOKEN'] || '');
