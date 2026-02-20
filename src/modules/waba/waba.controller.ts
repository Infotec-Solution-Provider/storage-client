import { Request, Response, Router } from "express";
import wabaService from "./waba.service";
import { Logger } from "@in.pulse-crm/utils";
import { NotFoundError } from "@rgranatodutra/http-errors";

const wabaRoutes = Router();

class WABAController {
    constructor(router: Router) {
        router.get("/media/:id", this.handleGetMedia);
        router.post("/media", this.handleUploadMedia);
    }

    private handleGetMedia = async (req: Request, res: Response) => {
        try {
            Logger.info("Fetching media URL from WABA");
            const { id } = req.params;
            const { filename } = req.query;

            if (!id) {
                return res.status(400).json({ message: "Media ID is required" });
            }
            const data = await wabaService.downloadMediaAndStore(id, filename as string | undefined);
            return res.status(200).json({ message: "Media URL fetched successfully", data });
        }
        catch (error: any) {
            Logger.error("Error fetching media URL from WABA", error);
            return res.status(500).json({ message: error?.message });
        }
    }

    private handleUploadMedia = async (req: Request, res: Response) => {
        try {
            Logger.info("Uploading media to WABA");
            const { fileId } = req.body;
            if (!fileId) {
                return res.status(400).json({ message: "File ID is required" });
            }
            const mediaId = await wabaService.uploadMedia(fileId);
            return res.status(200).json({ message: "Media uploaded successfully", mediaId });
        }
        catch (error: any) {
            Logger.error("Error uploading media to WABA", error);
            if (error instanceof NotFoundError) {
                return res.status(404).json({ message: error.message });
            }
            return res.status(500).json({ message: error?.message });
        }
    }
}

new WABAController(wabaRoutes);

export default wabaRoutes;