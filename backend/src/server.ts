import "dotenv/config";
import http from "http";

import app from "./app.js";
import { initializeSocket } from "./socket/socket.server.js";
import { logger } from "./config/logger.js";
import { expireStatuses } from "./modules/status/status.service.js";
import { sweepAbandonedUploads } from "./modules/media/media.service.js";
import prisma from "./config/database.js";

const PORT = Number(process.env.PORT) || 5000;
const HOST = "0.0.0.0";

// Create HTTP server using Express app
const httpServer = http.createServer(app);

// Initialize Socket.IO
initializeSocket(httpServer);

// Call state lives in memory, so calls open when the server stopped are over.
// Retried once: the very first queries after start-up can race the pool.
const closeCallsLeftOpen = (attempt = 1): void => {
  prisma.call_session
    .updateMany({ where: { status: { in: ["RINGING", "ONGOING"] } }, data: { status: "FAILED", end_reason: "SERVER_RESTART", ended_at: new Date() } })
    .catch((err) => {
      if (attempt < 2) setTimeout(() => closeCallsLeftOpen(attempt + 1), 2000).unref();
      else logger.error({ err }, "Could not close calls left open");
    });
};

// Start server
httpServer.listen(PORT, HOST, () => {
  logger.info(`Server running on http://${HOST}:${PORT}`);
  closeCallsLeftOpen();
});

// Expired status updates are already hidden by every query; this also drops
// their link to the file, so the photo or video cannot be fetched afterwards.
const EXPIRY_SWEEP_MS = 10 * 60 * 1000;
setInterval(() => {
  expireStatuses().catch((err) => logger.error({ err }, "Status expiry sweep failed"));
  sweepAbandonedUploads().catch((err) => logger.error({ err }, "Upload cleanup failed"));
}, EXPIRY_SWEEP_MS).unref();

// On SIGTERM (deploys, container stop) finish open requests, then exit.
const shutdown = (signal: string) => {
  logger.info({ signal }, "Shutting down");
  httpServer.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10 * 1000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));