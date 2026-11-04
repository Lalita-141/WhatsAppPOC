import { NextFunction, Response, Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware.js";
import { ApiError } from "../utils/api-error.js";
import * as status from "./status/status.service.js";
import * as channels from "./channel/channel.service.js";
import * as communities from "./community/community.service.js";

type Handler = (req: AuthRequest) => Promise<{ status?: number; message: string; data?: unknown }>;
const handle = (handler: Handler) => async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { status: code = 200, message, data } = await handler(req);
        res.status(code).json({ success: true, message, ...(data !== undefined ? { data } : {}) });
    } catch (error) {
        next(error);
    }
};
const id = (value: unknown) => {
    const text = Array.isArray(value) ? value[0] : value;
    if (typeof text !== "string" || !/^\d{1,20}$/.test(text)) throw new ApiError(400, "INVALID_ID", "Invalid ID");
    return BigInt(text);
};
const me = (req: AuthRequest) => req.user!.userOrganizationId;
const actor = (req: AuthRequest) => ({ userOrganizationId: req.user!.userOrganizationId, organizationId: req.user!.organizationId });

export const statusRoutes = Router();
statusRoutes.get("/", authenticate, handle(async (req) => ({ message: "Status updates", data: await status.statusFeed(me(req)) })));
statusRoutes.post("/", authenticate, handle(async (req) => ({ status: 201, message: "Status posted", data: await status.createStatus(me(req), req.body) })));
statusRoutes.post("/:id/view", authenticate, handle(async (req) => {
    await status.viewStatus(me(req), id(req.params.id));
    return { message: "Viewed" };
}));
statusRoutes.get("/:id/viewers", authenticate, handle(async (req) => ({ message: "Viewers", data: await status.statusViewers(me(req), id(req.params.id)) })));
statusRoutes.delete("/:id", authenticate, handle(async (req) => {
    await status.deleteStatus(me(req), id(req.params.id));
    return { message: "Status deleted" };
}));

export const channelRoutes = Router();
channelRoutes.get("/", authenticate, handle(async (req) => ({ message: "Channels", data: await channels.myChannels(actor(req)) })));
channelRoutes.get("/discover", authenticate, handle(async (req) => ({ message: "Channels to follow", data: await channels.discoverChannels(actor(req)) })));
channelRoutes.post("/", authenticate, handle(async (req) => ({ status: 201, message: "Channel created", data: await channels.createChannel(actor(req), req.body) })));
channelRoutes.post("/:id/follow", authenticate, handle(async (req) => {
    await channels.follow(actor(req), id(req.params.id));
    return { message: "Following" };
}));
channelRoutes.delete("/:id/follow", authenticate, handle(async (req) => {
    await channels.unfollow(actor(req), id(req.params.id));
    return { message: "Unfollowed" };
}));
channelRoutes.patch("/:id/mute", authenticate, handle(async (req) => {
    await channels.setMuted(actor(req), id(req.params.id), req.body?.muted);
    return { message: "Saved" };
}));
channelRoutes.get("/:id/posts", authenticate, handle(async (req) => ({ message: "Posts", data: await channels.posts(actor(req), id(req.params.id), req.query.cursor) })));
channelRoutes.post("/:id/posts", authenticate, handle(async (req) => ({ status: 201, message: "Posted", data: await channels.publish(actor(req), id(req.params.id), req.body) })));
channelRoutes.delete("/:id/posts/:postId", authenticate, handle(async (req) => {
    await channels.deletePost(actor(req), id(req.params.id), id(req.params.postId));
    return { message: "Post deleted" };
}));
channelRoutes.post("/:id/admins", authenticate, handle(async (req) => {
    await channels.addAdmin(actor(req), id(req.params.id), req.body?.userOrganizationId);
    return { message: "Admin added" };
}));
channelRoutes.delete("/:id", authenticate, handle(async (req) => {
    await channels.deleteChannel(actor(req), id(req.params.id));
    return { message: "Channel deleted" };
}));

export const communityRoutes = Router();
communityRoutes.get("/", authenticate, handle(async (req) => ({ message: "Communities", data: await communities.myCommunities(actor(req)) })));
communityRoutes.post("/", authenticate, handle(async (req) => ({ status: 201, message: "Community created", data: await communities.createCommunity(actor(req), req.body) })));
communityRoutes.get("/:id", authenticate, handle(async (req) => ({ message: "Community", data: await communities.getCommunity(actor(req), id(req.params.id)) })));
communityRoutes.post("/:id/groups", authenticate, handle(async (req) => ({ message: "Group added", data: await communities.addGroupToCommunity(actor(req), id(req.params.id), req.body?.groupId) })));
communityRoutes.delete("/:id/groups/:groupId", authenticate, handle(async (req) => {
    await communities.removeGroupFromCommunity(actor(req), id(req.params.id), id(req.params.groupId));
    return { message: "Group removed" };
}));
communityRoutes.post("/:id/groups/:groupId/join", authenticate, handle(async (req) => {
    await communities.joinCommunityGroup(actor(req), id(req.params.id), id(req.params.groupId));
    return { message: "Joined group" };
}));
communityRoutes.delete("/:id", authenticate, handle(async (req) => {
    await communities.deleteCommunity(actor(req), id(req.params.id));
    return { message: "Community deleted" };
}));
