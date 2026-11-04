import { NextFunction, Request, Response, Router } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { createRateLimiter } from "../../middleware/rate-limit.middleware.js";
import * as media from "./media.service.js";
import { storage } from "./storage.js";

const router = Router();
const uploadLimiter = createRateLimiter(30, 60 * 1000);

const id = (value: unknown) => {
    const text = Array.isArray(value) ? value[0] : value;
    if (typeof text !== "string" || !/^\d{1,20}$/.test(text)) throw new ApiError(404, "MEDIA_NOT_FOUND", "File not found");
    return BigInt(text);
};

router.post("/uploads", uploadLimiter, authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const data = await media.createUpload(req.user!, req.body);
        res.status(201).json({ success: true, message: "Upload started", data });
    } catch (error) {
        next(error);
    }
});

// The body is the raw file, streamed straight to storage.
router.put("/uploads/:id", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const data = await media.receiveUpload(req.user!.userOrganizationId, id(req.params.id), req);
        res.status(200).json({ success: true, message: "Upload complete", data });
    } catch (error) {
        next(error);
    }
});

router.get("/:id/url", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        res.status(200).json({ success: true, message: "Download link", data: await media.signedUrl(req.user!.userOrganizationId, id(req.params.id), req.query.variant) });
    } catch (error) {
        next(error);
    }
});

/**
 * Serves a file to a signed link. Supports byte ranges, which video and audio
 * players need for seeking.
 */
router.get("/:id/content", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const mediaId = id(req.params.id);
        const variant = media.verifySignedRequest(mediaId.toString(), req.query as Record<string, unknown>);
        const file = variant ? await media.mediaForServing(mediaId) : null;
        if (!variant || !file) throw new ApiError(404, "MEDIA_NOT_FOUND", "File not found or link expired");

        const key = variant === "thumbnail" ? file.thumbnail_key : file.storage_key;
        if (!key) throw new ApiError(404, "MEDIA_NOT_FOUND", "File not found");
        const total = await storage().size(key);
        const type = variant === "thumbnail" ? "image/jpeg" : file.mime_type;

        res.setHeader("Content-Type", type);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "private, max-age=600");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader(
            "Content-Disposition",
            `${file.kind === "DOCUMENT" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
        );

        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
        if (range && (range[1] || range[2])) {
            const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
            const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
            if (start > end || start >= total) {
                res.status(416).setHeader("Content-Range", `bytes */${total}`).end();
                return;
            }
            res.status(206);
            res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
            res.setHeader("Content-Length", String(end - start + 1));
            storage().read(key, { start, end }).on("error", next).pipe(res);
            return;
        }

        res.setHeader("Content-Length", String(total));
        storage().read(key).on("error", next).pipe(res);
    } catch (error) {
        next(error);
    }
});

export default router;
