import prisma from "../../config/database.js";
import { ApiError } from "../../utils/api-error.js";
import { deliverGroupMessage, deliverNewMessage } from "../../socket/delivery.js";
import { assertCanMessage, sendMessage, toMessageDto } from "./messages/message.service.js";
import { requireMember, sendGroupMessage, toGroupMessageDto } from "../group/group.service.js";

const MAX_FORWARD_TARGETS = 5;
const ID = /^\d{1,20}$/;

const ids = (value: unknown) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && ID.test(v))) {
        throw new ApiError(400, "INVALID_RECIPIENTS", "Recipients must be a list of IDs");
    }
    return [...new Set(value as string[])].map((v) => BigInt(v));
};

/**
 * Forwards text to people and groups. Every target is checked before anything
 * is sent, so one refused target sends nothing.
 */
export const forwardText = async (actor: bigint, content: { text: string; mediaId: bigint | null }, body: unknown) => {
    const text = content.text;
    const input = (body ?? {}) as Record<string, unknown>;
    const people = ids(input.receiverUserOrganizationIds);
    const groups = ids(input.groupIds);
    const total = people.length + groups.length;
    if (total === 0 || total > MAX_FORWARD_TARGETS) {
        throw new ApiError(400, "INVALID_RECIPIENTS", `Choose 1 to ${MAX_FORWARD_TARGETS} chats`);
    }

    for (const person of people) await assertCanMessage(actor, person);
    for (const group of groups) await requireMember(group, actor);

    const sent: unknown[] = [];
    for (const person of people) {
        const { message } = await sendMessage({ sender: actor, receiver: person, message: text, forwarded: true, mediaId: content.mediaId });
        deliverNewMessage(message);
        sent.push(toMessageDto(message, actor));
    }
    for (const groupId of groups) {
        const { row, recipients } = await sendGroupMessage({ sender: actor, groupId, message: text, forwarded: true, mediaId: content.mediaId });
        const group = await prisma.wp_group.findUniqueOrThrow({ where: { group_id: groupId }, select: { group_name: true } });
        await deliverGroupMessage(row, recipients, group.group_name);
        sent.push(toGroupMessageDto(row, actor));
    }
    return sent;
};
