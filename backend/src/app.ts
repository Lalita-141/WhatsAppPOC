import prisma from "./config/database.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import countryRoutes from "./modules/country/country.route.js";
import authRouter from "./modules/auth/auth.route.js";
import userRoutes from "./modules/user/user.route.js";
import { errorMiddleware, notFoundMiddleware } from "./middleware/error.middleware.js";
import organizationRoutes from "./modules/organization/organization.route.js";
import chatRoutes from "./modules/chat/chat.route.js";
import broadcastRoutes from "./modules/broadcast/broadcast.route.js";
import groupRoutes from "./modules/group/group.route.js";
import mediaRoutes from "./modules/media/media.route.js";
import callRoutes from "./modules/call/call.route.js";
import { channelRoutes, communityRoutes, statusRoutes } from "./modules/updates.route.js";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

const app = express();

app.set("trust proxy", env.trustProxy);

app.use(helmet());

app.use(
  cors({
    // The mobile app sends no Origin header, so only listed browser sites apply.
    origin: env.corsOrigins,
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(pinoHttp({ logger }));

// For load balancers and monitoring: 503 when the database cannot be reached.
app.get("/api/v1/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ success: true, message: "Enterprise Chat API is running", data: { database: "up" } });
  } catch {
    res.status(503).json({ success: false, message: "Database unavailable", errorCode: "UNHEALTHY", data: { database: "down" } });
  }
});

app.use("/api/v1", countryRoutes);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/organization", organizationRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/broadcasts", broadcastRoutes);
app.use("/api/v1/groups", groupRoutes);
app.use("/api/v1/media", mediaRoutes);
app.use("/api/v1/calls", callRoutes);
app.use("/api/v1/status", statusRoutes);
app.use("/api/v1/channels", channelRoutes);
app.use("/api/v1/communities", communityRoutes);

app.use(notFoundMiddleware);

// Error middleware MUST be after routes
app.use(errorMiddleware);

export default app;