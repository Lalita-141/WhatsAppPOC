import crypto from "node:crypto";
import { Readable } from "node:stream";
import sharp from "sharp";
import prisma from "../../config/database.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { ApiError } from "../../utils/api-error.js";
import { getOrganizationSetting, organizationsCanCommunicate } from "../policy/communication.policy.js";
import { newStorageKey, storage } from "./storage.js";
import { canSeeStatus } from "../status/status.service.js";
import { mediaDtoSelect, toMediaDto } from "./media.dto.js";

export { mediaDtoSelect, toMediaDto };

export type MediaKind = "IMAGE" | "VIDEO" | "AUDIO" | "VOICE" | "DOCUMENT" | "AVATAR";

const MB = 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 10 * 60;
const MAX_VOICE_MS = 15 * 60 * 1000;

const IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const VIDEO = ["video/mp4", "video/quicktime", "video/3gpp"];
const AUDIO = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/x-m4a", "audio/m4a", "audio/ogg", "audio/wav", "audio/x-wav"];
const DOCUMENT = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "application/zip",
];

export const KIND_RULES: Record<MediaKind, { mimes: string[]; maxBytes: number }> = {
    IMAGE: { mimes: IMAGE, maxBytes: 16 * MB },
    VIDEO: { mimes: VIDEO, maxBytes: 64 * MB },
    AUDIO: { mimes: AUDIO, maxBytes: 16 * MB },
    VOICE: { mimes: AUDIO, maxBytes: 16 * MB },
    DOCUMENT: { mimes: DOCUMENT, maxBytes: 100 * MB },
    AVATAR: { mimes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"], maxBytes: 5 * MB },
};

const ascii = (head: Buffer, start: number, text: string) => head.subarray(start, start + text.length).toString("latin1") === text;

/**
 * Checks the first bytes against the declared type, so a renamed executable
 * cannot be uploaded as a photo or a PDF.
 */
export const contentMatches = (mime: string, head: Buffer) => {
    const isFtyp = ascii(head, 4, "ftyp");
    switch (mime) {
        case "image/jpeg": return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
        case "image/png": return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        case "image/gif": return ascii(head, 0, "GIF87a") || ascii(head, 0, "GIF89a");
        case "image/webp": return ascii(head, 0, "RIFF") && ascii(head, 8, "WEBP");
        case "image/heic":
        case "image/heif": return isFtyp && ["heic", "heix", "hevc", "mif1", "msf1"].some((brand) => ascii(head, 8, brand));
        case "video/mp4":
        case "video/quicktime":
        case "video/3gpp":
        case "audio/mp4":
        case "audio/x-m4a":
        case "audio/m4a": return isFtyp || (mime === "video/quicktime" && ["moov", "mdat", "wide", "free"].some((atom) => ascii(head, 4, atom)));
        case "audio/aac": return isFtyp || (head[0] === 0xff && (head[1] & 0xf6) === 0xf0);
        case "audio/mpeg": return ascii(head, 0, "ID3") || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
        case "audio/ogg": return ascii(head, 0, "OggS");
        case "audio/wav":
        case "audio/x-wav": return ascii(head, 0, "RIFF") && ascii(head, 8, "WAVE");
        case "application/pdf": return ascii(head, 0, "%PDF-");
        case "application/zip":
        case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
            return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
        case "application/msword":
        case "application/vnd.ms-excel":
        case "application/vnd.ms-powerpoint":
            return head.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
        case "text/plain":
        case "text/csv": return !head.includes(0);
        default: return false;
    }
};

const safeFileName = (name: string) =>
    name.replace(/[\u0000-\u001f\u007f"\\/]/g, "_").replace(/^\.+/, "").slice(0, 200) || "file";

// ---------------------------------------------------------------- upload

export const createUpload = async (
    actor: { userOrganizationId: bigint; organizationId: bigint },
    body: unknown,
) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const kind = input.kind as MediaKind;
    const rule = KIND_RULES[kind];
    if (!rule) throw new ApiError(400, "VALIDATION_ERROR", `kind must be one of ${Object.keys(KIND_RULES).join(", ")}`);

    const mimeType = typeof input.mimeType === "string" ? input.mimeType.toLowerCase().split(";")[0].trim() : "";
    if (!rule.mimes.includes(mimeType)) throw new ApiError(415, "UNSUPPORTED_TYPE", `This file type is not allowed for ${kind.toLowerCase()}`);

    const size = Number(input.size);
    const setting = await getOrganizationSetting(actor.organizationId);
    const limit = kind === "AVATAR" ? rule.maxBytes : Math.min(rule.maxBytes, setting.max_upload_mb * MB);
    if (!Number.isInteger(size) || size < 1) throw new ApiError(400, "VALIDATION_ERROR", "size must be the file size in bytes");
    if (size > limit) throw new ApiError(413, "FILE_TOO_LARGE", `Files of this kind can be at most ${Math.floor(limit / MB)} MB`);

    if (kind !== "AVATAR" && !setting.file_sharing_enabled) {
        throw new ApiError(403, "FILE_SHARING_DISABLED", "Your organization has turned off file sharing");
    }

    let durationMs: number | null = null;
    if (input.durationMs !== undefined) {
        durationMs = Number(input.durationMs);
        if (!Number.isInteger(durationMs) || durationMs < 0 || (kind === "VOICE" && durationMs > MAX_VOICE_MS)) {
            throw new ApiError(400, "VALIDATION_ERROR", "durationMs is not valid");
        }
    }

    const media = await prisma.media_file.create({
        data: {
            owner_user_org_id: actor.userOrganizationId,
            kind,
            storage_provider: storage().name,
            storage_key: newStorageKey(),
            original_name: safeFileName(typeof input.fileName === "string" ? input.fileName : "file"),
            mime_type: mimeType,
            declared_size: BigInt(size),
            duration_ms: durationMs,
        },
    });

    return { mediaId: media.media_id.toString(), uploadPath: `/api/v1/media/uploads/${media.media_id}`, maxBytes: size };
};

/** Receives the bytes, verifies them, strips image metadata and makes a thumbnail. */
export const receiveUpload = async (owner: bigint, mediaId: bigint, body: Readable) => {
    const media = await prisma.media_file.findFirst({ where: { media_id: mediaId, owner_user_org_id: owner, deleted_at: null } });
    if (!media) throw new ApiError(404, "MEDIA_NOT_FOUND", "Upload not found");
    if (media.status !== "PENDING") throw new ApiError(409, "UPLOAD_COMPLETE", "This upload is already complete");

    const store = storage();
    const written = await store.write(media.storage_key, body, Number(media.declared_size));

    const reject = async (status: number, code: string, message: string) => {
        await store.remove(media.storage_key);
        throw new ApiError(status, code, message);
    };

    if (written.size !== Number(media.declared_size)) await reject(400, "SIZE_MISMATCH", "The file size does not match what was declared");
    if (!contentMatches(media.mime_type, written.head)) await reject(415, "CONTENT_MISMATCH", "The file content does not match its type");

    let width: number | null = null;
    let height: number | null = null;
    let thumbnailKey: string | null = null;
    let size = written.size;
    let checksum = written.sha256;

    if (media.kind === "IMAGE" || media.kind === "AVATAR") {
        const source = store.localPath(media.storage_key);
        try {
            // Re-encoding drops EXIF data such as GPS location and applies the orientation.
            const isAnimated = media.mime_type === "image/gif";
            const cleaned = isAnimated
                ? null
                : await sharp(source, { failOn: "error" })
                    .rotate()
                    .resize({ width: media.kind === "AVATAR" ? 640 : 2560, height: media.kind === "AVATAR" ? 640 : 2560, fit: "inside", withoutEnlargement: true })
                    .jpeg({ quality: 85, mozjpeg: true })
                    .toBuffer({ resolveWithObject: true });
            if (cleaned) {
                const replaced = await store.write(media.storage_key, Readable.from(cleaned.data), cleaned.data.length);
                width = cleaned.info.width;
                height = cleaned.info.height;
                size = replaced.size;
                checksum = replaced.sha256;
            } else {
                const meta = await sharp(source).metadata();
                width = meta.width ?? null;
                height = meta.height ?? null;
            }
            const thumb = await sharp(store.localPath(media.storage_key), { animated: false })
                .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
                .jpeg({ quality: 70 })
                .toBuffer();
            thumbnailKey = `${media.storage_key}.thumb.jpg`;
            await store.write(thumbnailKey, Readable.from(thumb), thumb.length);
        } catch (error) {
            logger.warn({ err: error }, "Image processing failed");
            await reject(415, "CONTENT_MISMATCH", "The image could not be read");
        }
    }

    const ready = await prisma.media_file.update({
        where: { media_id: mediaId },
        data: {
            status: "READY",
            size_bytes: BigInt(size),
            checksum_sha256: checksum,
            width,
            height,
            thumbnail_key: thumbnailKey,
            mime_type: (media.kind === "IMAGE" || media.kind === "AVATAR") && media.mime_type !== "image/gif" ? "image/jpeg" : media.mime_type,
            completed_at: new Date(),
        },
    });
    return toMediaDto(ready);
};

// ---------------------------------------------------------------- access

/**
 * Who may see a file: its uploader, the people in a chat or group where it was
 * sent (group members only for messages sent after they joined), and, for a
 * profile photo, people allowed by the owner's profile photo privacy.
 */
export const canView = async (viewer: bigint, mediaId: bigint) => {
    const media = await prisma.media_file.findFirst({ where: { media_id: mediaId, status: "READY", deleted_at: null } });
    if (!media) return null;
    if (media.owner_user_org_id === viewer) return media;

    const personal = await prisma.personal_chat_history.findFirst({
        where: {
            media_id: mediaId,
            deleted_at: null,
            deleted_for_everyone_at: null,
            OR: [{ sender_user_organization_id: viewer }, { receiver_user_organization_id: viewer }],
        },
        select: { chat_id: true },
    });
    if (personal) return media;

    const groupMessages = await prisma.group_chat.findMany({
        where: { media_id: mediaId, deleted_at: null, deleted_for_everyone_at: null },
        select: { group_id: true, send_time: true },
    });
    for (const message of groupMessages) {
        const member = await prisma.group_member.findFirst({
            where: { group_id: message.group_id, user_organization_id: viewer, deleted_at: null, joined_at: { lte: message.send_time } },
        });
        if (member) return media;
    }

    // A status photo or video, while the status is live and the viewer is in its audience.
    const statuses = await prisma.status_post.findMany({ where: { media_id: mediaId, deleted_at: null, expires_at: { gt: new Date() } } });
    for (const status of statuses) {
        if (await canSeeStatus(viewer, status)) return media;
    }

    // A channel post, for followers and admins of the channel.
    const posts = await prisma.channel_post.findMany({ where: { media_id: mediaId, deleted_at: null }, select: { channel: { select: { channel_id: true, org_id: true, deleted_at: true } } } });
    for (const { channel } of posts) {
        if (channel.deleted_at) continue;
        const member = await prisma.channel_member.findUnique({ where: { channel_id_user_organization_id: { channel_id: channel.channel_id, user_organization_id: viewer } } });
        const viewerOrg = member && (await prisma.user_organization.findUnique({ where: { user_organization_id: viewer }, select: { org_id: true } }));
        if (viewerOrg && (await organizationsCanCommunicate(viewerOrg.org_id, channel.org_id))) return media;
    }

    if (media.kind === "AVATAR") {
        const owner = await prisma.user_master.findFirst({
            where: { profile_photo_media_id: mediaId, deleted_at: null },
            select: { user_organization: { where: { deleted_at: null }, select: { user_organization_id: true, org_id: true, user_setting: { select: { profile_privacy: true } } } } },
        });
        const viewerOrg = await prisma.user_organization.findUnique({ where: { user_organization_id: viewer }, select: { org_id: true } });
        if (owner && viewerOrg) {
            for (const membership of owner.user_organization) {
                const privacy = membership.user_setting?.profile_privacy ?? "CONTACTS";
                if (privacy === "NOBODY" || !(await organizationsCanCommunicate(viewerOrg.org_id, membership.org_id))) continue;
                if (privacy === "EVERYONE") return media;
                const exchanged = await prisma.personal_chat_history.findFirst({
                    where: {
                        OR: [
                            { sender_user_organization_id: viewer, receiver_user_organization_id: membership.user_organization_id },
                            { sender_user_organization_id: membership.user_organization_id, receiver_user_organization_id: viewer },
                        ],
                    },
                    select: { chat_id: true },
                });
                if (exchanged) return media;
            }
        }
    }

    return null;
};

const signature = (mediaId: string, variant: string, expires: number) =>
    crypto.createHmac("sha256", env.media.urlSecret).update(`${mediaId}:${variant}:${expires}`).digest("base64url");

/** A short-lived link for players and downloads that cannot send an Authorization header. */
export const signedUrl = async (viewer: bigint, mediaId: bigint, variant: unknown) => {
    const kind = variant === "thumbnail" ? "thumbnail" : "original";
    const media = await canView(viewer, mediaId);
    if (!media || (kind === "thumbnail" && !media.thumbnail_key)) throw new ApiError(404, "MEDIA_NOT_FOUND", "File not found");
    const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
    return {
        url: `/api/v1/media/${mediaId}/content?variant=${kind}&expires=${expires}&signature=${signature(mediaId.toString(), kind, expires)}`,
        expiresAt: new Date(expires * 1000),
        media: toMediaDto(media),
    };
};

export const verifySignedRequest = (mediaId: string, query: Record<string, unknown>) => {
    const variant = query.variant === "thumbnail" ? "thumbnail" : "original";
    const expires = Number(query.expires);
    const given = typeof query.signature === "string" ? query.signature : "";
    if (!Number.isInteger(expires) || expires < Date.now() / 1000) return null;
    const expected = signature(mediaId, variant, expires);
    if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
    return variant;
};

/** Removes uploads that were started but never finished within a day. */
export const sweepAbandonedUploads = async () => {
    const stale = await prisma.media_file.findMany({
        where: { status: "PENDING", created_at: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        select: { media_id: true, storage_key: true },
        take: 500,
    });
    for (const media of stale) {
        await storage().remove(media.storage_key);
        await prisma.media_file.delete({ where: { media_id: media.media_id } });
    }
    return stale.length;
};

export const mediaForServing = async (mediaId: bigint) =>
    prisma.media_file.findFirst({ where: { media_id: mediaId, status: "READY", deleted_at: null } });

/** The file a sender attaches: their own finished upload, or one they can see when forwarding. */
export const attachableMedia = async (sender: bigint, mediaId: bigint, forwarded: boolean) => {
    const media = forwarded ? await canView(sender, mediaId) : await prisma.media_file.findFirst({
        where: { media_id: mediaId, owner_user_org_id: sender, status: "READY", deleted_at: null },
    });
    if (!media || media.kind === "AVATAR") throw new ApiError(400, "INVALID_MEDIA", "Upload the file first");
    return media;
};
