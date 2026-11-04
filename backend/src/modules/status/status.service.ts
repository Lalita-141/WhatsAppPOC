import prisma from "../../config/database.js";
import { ApiError } from "../../utils/api-error.js";
import { mediaDtoSelect, toMediaDto } from "../media/media.dto.js";
import { findBlockBetween } from "../chat/messages/message.repository.js";
import { organizationsCanCommunicate, reachableOrganizations } from "../policy/communication.policy.js";

export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
const ID = /^\d{1,20}$/;
const COLOR = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;

const fullName = (u: { first_name: string; last_name: string | null }) => [u.first_name, u.last_name].filter(Boolean).join(" ");

const exchangedMessages = async (a: bigint, b: bigint) =>
    Boolean(await prisma.personal_chat_history.findFirst({
        where: {
            deleted_at: null,
            OR: [
                { sender_user_organization_id: a, receiver_user_organization_id: b },
                { sender_user_organization_id: b, receiver_user_organization_id: a },
            ],
        },
        select: { chat_id: true },
    }));

/**
 * Whether a viewer may see one status: the organizations may communicate,
 * neither person blocked the other, and the status audience includes them.
 * "Contacts" means people the owner has exchanged messages with.
 */
export const canSeeStatus = async (
    viewer: bigint,
    status: { status_id: bigint; owner_user_org_id: bigint; audience: string; expires_at: Date; deleted_at: Date | null },
) => {
    if (status.deleted_at || status.expires_at.getTime() <= Date.now()) return false;
    if (status.owner_user_org_id === viewer) return true;

    const [viewerOrg, ownerOrg] = await Promise.all([
        prisma.user_organization.findUnique({ where: { user_organization_id: viewer }, select: { org_id: true, deleted_at: true } }),
        prisma.user_organization.findUnique({ where: { user_organization_id: status.owner_user_org_id }, select: { org_id: true, deleted_at: true } }),
    ]);
    if (!viewerOrg || !ownerOrg || viewerOrg.deleted_at || ownerOrg.deleted_at) return false;
    if (!(await organizationsCanCommunicate(viewerOrg.org_id, ownerOrg.org_id))) return false;
    if (await findBlockBetween(viewer, status.owner_user_org_id)) return false;

    if (status.audience === "EVERYONE") return true;
    if (status.audience === "CONTACTS") return exchangedMessages(viewer, status.owner_user_org_id);
    return Boolean(await prisma.status_audience.findUnique({
        where: { status_id_user_organization_id: { status_id: status.status_id, user_organization_id: viewer } },
    }));
};

const statusSelect = {
    status_id: true,
    owner_user_org_id: true,
    kind: true,
    text: true,
    background_color: true,
    audience: true,
    created_at: true,
    expires_at: true,
    deleted_at: true,
    media_file: { select: mediaDtoSelect },
} as const;

const toStatusDto = (s: { status_id: bigint; kind: string; text: string | null; background_color: string | null; created_at: Date; expires_at: Date; media_file: Parameters<typeof toMediaDto>[0] | null }) => ({
    statusId: s.status_id.toString(),
    kind: s.kind,
    text: s.text,
    backgroundColor: s.background_color,
    media: s.media_file ? toMediaDto(s.media_file) : null,
    createdAt: s.created_at,
    expiresAt: s.expires_at,
});

export const createStatus = async (owner: bigint, body: unknown) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const kind = input.kind;
    if (kind !== "TEXT" && kind !== "IMAGE" && kind !== "VIDEO") throw new ApiError(400, "VALIDATION_ERROR", "kind must be TEXT, IMAGE or VIDEO");

    const text = typeof input.text === "string" ? input.text.trim() : "";
    if (text.length > 700) throw new ApiError(400, "VALIDATION_ERROR", "text must be at most 700 characters");
    if (kind === "TEXT" && !text) throw new ApiError(400, "VALIDATION_ERROR", "A text status needs text");
    if (input.backgroundColor !== undefined && (typeof input.backgroundColor !== "string" || !COLOR.test(input.backgroundColor))) {
        throw new ApiError(400, "VALIDATION_ERROR", "backgroundColor must be a hex color");
    }

    let mediaId: bigint | null = null;
    if (kind !== "TEXT") {
        if (typeof input.mediaId !== "string" || !ID.test(input.mediaId)) throw new ApiError(400, "VALIDATION_ERROR", "mediaId is required");
        const media = await prisma.media_file.findFirst({
            where: { media_id: BigInt(input.mediaId), owner_user_org_id: owner, kind, status: "READY", deleted_at: null },
        });
        if (!media) throw new ApiError(400, "INVALID_MEDIA", "Upload the photo or video first");
        mediaId = media.media_id;
    }

    // Without an explicit choice, the owner's status privacy setting decides.
    let audience = input.audience as string | undefined;
    if (audience === undefined) {
        const setting = await prisma.user_setting.findUnique({ where: { user_organization_id: owner }, select: { status_privacy: true } });
        audience = setting?.status_privacy === "EVERYONE" ? "EVERYONE" : setting?.status_privacy === "NOBODY" ? "SELECTED" : "CONTACTS";
    }
    if (!["EVERYONE", "CONTACTS", "SELECTED"].includes(audience)) throw new ApiError(400, "VALIDATION_ERROR", "audience must be EVERYONE, CONTACTS or SELECTED");

    let audienceIds: bigint[] = [];
    if (audience === "SELECTED" && input.audienceIds !== undefined) {
        if (!Array.isArray(input.audienceIds) || !input.audienceIds.every((v) => typeof v === "string" && ID.test(v)) || input.audienceIds.length > 1000) {
            throw new ApiError(400, "VALIDATION_ERROR", "audienceIds must be a list of up to 1000 IDs");
        }
        audienceIds = [...new Set(input.audienceIds as string[])].map((v) => BigInt(v)).filter((id) => id !== owner);
    }

    const status = await prisma.status_post.create({
        data: {
            owner_user_org_id: owner,
            kind,
            text: text || null,
            background_color: (input.backgroundColor as string | undefined) ?? null,
            media_id: mediaId,
            audience: audience as "EVERYONE" | "CONTACTS" | "SELECTED",
            expires_at: new Date(Date.now() + STATUS_TTL_MS),
            audience_members: audienceIds.length ? { createMany: { data: audienceIds.map((id) => ({ user_organization_id: id })) } } : undefined,
        },
        select: statusSelect,
    });
    return toStatusDto(status);
};

/** Status updates the viewer may see, grouped by person, own ones first. */
export const statusFeed = async (viewer: bigint) => {
    const membership = await prisma.user_organization.findUniqueOrThrow({ where: { user_organization_id: viewer }, select: { org_id: true } });
    const orgs = await reachableOrganizations(membership.org_id);
    const candidates = await prisma.status_post.findMany({
        where: {
            deleted_at: null,
            expires_at: { gt: new Date() },
            OR: [{ owner_user_org_id: viewer }, { owner: { org_id: { in: orgs }, deleted_at: null } }],
        },
        orderBy: { status_id: "asc" },
        take: 2000,
        select: {
            ...statusSelect,
            owner: { select: { user_master: { select: { first_name: true, last_name: true, profile_photo_media_id: true } } } },
            views: { where: { viewer_user_org_id: viewer }, select: { viewed_at: true } },
            _count: { select: { views: true } },
        },
    });

    const byOwner = new Map<string, { owner: Record<string, unknown>; statuses: unknown[]; unviewed: number; latest: Date }>();
    for (const s of candidates) {
        if (!(await canSeeStatus(viewer, s))) continue;
        const key = s.owner_user_org_id.toString();
        const isMine = s.owner_user_org_id === viewer;
        const entry = byOwner.get(key) ?? {
            owner: {
                userOrganizationId: key,
                name: isMine ? "My status" : fullName(s.owner.user_master),
                profilePhotoMediaId: s.owner.user_master.profile_photo_media_id?.toString() ?? null,
                isMine,
            },
            statuses: [],
            unviewed: 0,
            latest: s.created_at,
        };
        entry.statuses.push({ ...toStatusDto(s), viewed: isMine || s.views.length > 0, ...(isMine ? { viewCount: s._count.views } : {}) });
        if (!isMine && s.views.length === 0) entry.unviewed += 1;
        entry.latest = s.created_at;
        byOwner.set(key, entry);
    }

    return [...byOwner.values()]
        .sort((a, b) => Number(b.owner.isMine) - Number(a.owner.isMine) || Number(b.unviewed > 0) - Number(a.unviewed > 0) || b.latest.getTime() - a.latest.getTime())
        .map(({ owner, statuses, unviewed }) => ({ owner, statuses, unviewedCount: unviewed }));
};

const visibleStatus = async (viewer: bigint, statusId: bigint) => {
    const status = await prisma.status_post.findUnique({ where: { status_id: statusId } });
    if (!status || !(await canSeeStatus(viewer, status))) throw new ApiError(404, "STATUS_NOT_FOUND", "Status not found");
    return status;
};

export const viewStatus = async (viewer: bigint, statusId: bigint) => {
    const status = await visibleStatus(viewer, statusId);
    if (status.owner_user_org_id === viewer) return;
    await prisma.status_view.upsert({
        where: { status_id_viewer_user_org_id: { status_id: statusId, viewer_user_org_id: viewer } },
        create: { status_id: statusId, viewer_user_org_id: viewer },
        update: {},
    });
};

export const statusViewers = async (owner: bigint, statusId: bigint) => {
    const status = await prisma.status_post.findFirst({ where: { status_id: statusId, owner_user_org_id: owner, deleted_at: null } });
    if (!status) throw new ApiError(404, "STATUS_NOT_FOUND", "Status not found");
    const views = await prisma.status_view.findMany({
        where: { status_id: statusId },
        orderBy: { viewed_at: "desc" },
        select: { viewed_at: true, viewer: { select: { user_organization_id: true, user_master: { select: { first_name: true, last_name: true } } } } },
    });
    return views.map((v) => ({ userOrganizationId: v.viewer.user_organization_id.toString(), name: fullName(v.viewer.user_master), viewedAt: v.viewed_at }));
};

export const deleteStatus = async (owner: bigint, statusId: bigint) => {
    const { count } = await prisma.status_post.updateMany({
        where: { status_id: statusId, owner_user_org_id: owner, deleted_at: null },
        data: { deleted_at: new Date(), media_id: null },
    });
    if (count === 0) throw new ApiError(404, "STATUS_NOT_FOUND", "Status not found");
};

/** Expired statuses lose their media link, so their files can no longer be fetched. */
export const expireStatuses = async () =>
    prisma.status_post.updateMany({
        where: { expires_at: { lte: new Date() }, media_id: { not: null } },
        data: { media_id: null },
    });
