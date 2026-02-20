import axios, { AxiosInstance } from "axios";
import "dotenv/config";
import FormData from "form-data";
import { extension } from "mime-types";
import prisma from "../../prisma";
import storageService from "../storage/storage.service";
import { NotFoundError } from "@rgranatodutra/http-errors";

interface GetMediaURLResponse {
    url: string,
    mime_type: string,
    sha256: string,
    file_size: number,
    id: string,
    messaging_product: string
}

const GRAPH_API_URL = 'https://graph.facebook.com/v16.0';

// Resumo compacto de erros Axios
const AXIOS_BODY_PREVIEW = 400;
function previewBody(data: any): string | undefined {
    try {
        if (data == null) return undefined;
        if (typeof data === 'string') return data.slice(0, AXIOS_BODY_PREVIEW);
        return JSON.stringify(data).slice(0, AXIOS_BODY_PREVIEW);
    } catch {
        return '[unserializable]';
    }
}

function formatAxiosError(err: unknown): string {
    if (axios.isAxiosError(err)) {
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
    if (err instanceof Error) return err.message;
    return String(err);
}

class WABAService {
    private api: AxiosInstance;
    private phoneId: string;

    constructor(authToken: string, phoneId: string) {
        this.api = axios.create({
            baseURL: GRAPH_API_URL,
            timeout: 10000,
        });

        console.log("WABA Token:", authToken);
        this.api.defaults.headers["Authorization"] = `Bearer ${authToken}`;
        this.phoneId = phoneId;
    }

    public async uploadMedia(fileId: string) {
        const file = await prisma.file.findUnique({
            where: { id: fileId },
        });

        if (!file) throw new NotFoundError(`File with ID ${fileId} not found in database`);

        const fileStream = await storageService.readFile({ fileId });

        const form = new FormData();
        form.append('file', fileStream, {
            contentType: file.type,
            filename: file.name,
            knownLength: file.size,
            filepath: file.path
        });

        form.append("type", file.type);
        form.append("messaging_product", "whatsapp");

        const response = await this.api.post<{ id: string }>(`/${this.phoneId}/media`, form, {
            headers: form.getHeaders()
        });

        return response.data.id;
    }

    public async downloadMediaAndStore(id: string, filename?: string) {
        const file = await this.downloadMedia(id, filename);
        const uploadedFile = await storageService.upload({ file, folder: 'waba' });

        return uploadedFile;
    }

    public async downloadMedia(id: string, filename?: string) {
        try {
            const data = await this.fetchMediaMetadata(id);
            const response = await this.api.get(data.url, { responseType: 'arraybuffer' });

            const ext = extension(data.mime_type);
            filename = filename || `${id}.${ext || 'bin'}`;

            const file: Express.Multer.File = {
                buffer: Buffer.from(response.data),
                destination: '',
                fieldname: '',
                filename,
                mimetype: data.mime_type,
                originalname: filename,
                path: '',
                size: data.file_size,
                stream: null as any,
                encoding: '7bit'
            }

            return file;
        } catch (err: any) {
            const msg = formatAxiosError(err);
            throw new Error(`Failed to download media: ${msg}`);
        }
    }

    public async fetchMediaMetadata(id: string) {
        try {
            const response = await this.api.get<GetMediaURLResponse>(`/${id}`);
            return response.data;
        } catch (err: unknown) {
            const msg = formatAxiosError(err);
            throw new Error(`Failed to get media URL: ${msg}`);
        }
    }
}

const token = process.env['WABA_TOKEN'] || '';
const phoneId = process.env['WABA_PHONE_ID'] || '';

export default new WABAService(token, phoneId);