import prisma from "../../config/database.js";
import { ApiError } from "../../utils/api-error.js";
import { Prisma } from "../../generated/prisma/client.js";
import { findMembership } from "../chat/messages/message.repository.js";

export const REPORT_REASONS = ["SPAM", "HARASSMENT", "INAPPROPRIATE", "SCAM", "OTHER"] as const;

const requireMemberOfSameOrg = async (actor: bigint, target: bigint) => {
    if (actor === target) {
        throw new ApiError(400, "INVALID_USER", "You cannot do this to yourself");
    }

    const [me, them] = await Promise.all([findMembership(actor), findMembership(target)]);

    // Same answer for "not reachable" and "does not exist".
    if (!me || !them || them.org_id !== me.org_id) {
        throw new ApiError(404, "USER_NOT_FOUND", "User not found");
    }
};

export const blockUser = async (actor: bigint, target: bigint) => {
    await requireMemberOfSameOrg(actor, target);

    try {
        await prisma.user_block.create({
            data: { blocker_user_organization_id: actor, blocked_user_organization_id: target },
        });
    } catch (error) {
        // Already blocked is fine.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
            throw error;
        }
    }
};

export const unblockUser = async (actor: bigint, target: bigint) => {
    await prisma.user_block.deleteMany({
        where: { blocker_user_organization_id: actor, blocked_user_organization_id: target },
    });
};

export const listBlocked = async (actor: bigint) => {
    const rows = await prisma.user_block.findMany({
        where: { blocker_user_organization_id: actor },
        orderBy: { created_at: "desc" },
        select: {
            created_at: true,
            blocked: {
                select: {
                    user_organization_id: true,
                    user_master: { select: { first_name: true, last_name: true, mobile_no: true } },
                },
            },
        },
    });

    return rows.map((row) => ({
        userOrganizationId: row.blocked.user_organization_id.toString(),
        name: [row.blocked.user_master.first_name, row.blocked.user_master.last_name].filter(Boolean).join(" "),
        mobileNo: row.blocked.user_master.mobile_no,
        blockedAt: row.created_at,
    }));
};

export const reportUser = async (actor: bigint, body: unknown) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const target = typeof input.userOrganizationId === "string" && /^\d{1,20}$/.test(input.userOrganizationId)
        ? BigInt(input.userOrganizationId)
        : null;

    if (!target) {
        throw new ApiError(400, "VALIDATION_ERROR", "userOrganizationId is required");
    }

    if (!REPORT_REASONS.includes(input.reason as (typeof REPORT_REASONS)[number])) {
        throw new ApiError(400, "VALIDATION_ERROR", `reason must be one of ${REPORT_REASONS.join(", ")}`);
    }

    if (input.details !== undefined && (typeof input.details !== "string" || input.details.length > 1000)) {
        throw new ApiError(400, "VALIDATION_ERROR", "details must be text of at most 1000 characters");
    }

    await requireMemberOfSameOrg(actor, target);

    let chatId: bigint | null = null;

    if (input.messageId !== undefined) {
        const id = typeof input.messageId === "string" && /^\d{1,20}$/.test(input.messageId)
            ? BigInt(input.messageId)
            : null;
        // A report can only point at a message between the two people.
        const message = id
            ? await prisma.personal_chat_history.findFirst({
                where: {
                    chat_id: id,
                    OR: [
                        { sender_user_organization_id: target, receiver_user_organization_id: actor },
                        { sender_user_organization_id: actor, receiver_user_organization_id: target },
                    ],
                },
                select: { chat_id: true },
            })
            : null;

        if (!message) {
            throw new ApiError(400, "INVALID_MESSAGE", "That message is not in your chat with this user");
        }
        chatId = message.chat_id;
    }

    const report = await prisma.user_report.create({
        data: {
            reporter_user_organization_id: actor,
            reported_user_organization_id: target,
            chat_id: chatId,
            reason: input.reason as string,
            details: (input.details as string | undefined)?.trim() || null,
        },
    });

    if (input.block === true) {
        await blockUser(actor, target);
    }

    return { reportId: report.user_report_id.toString(), blocked: input.block === true };
};
