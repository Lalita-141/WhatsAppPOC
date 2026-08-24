import "dotenv/config";
import http from "http";

import app from "./app.js";
import { initializeSocket } from "./socket/socket.server.js";

const PORT = Number(process.env.PORT) || 5000;
const HOST = "0.0.0.0";

// Create HTTP server using Express app
const httpServer = http.createServer(app);

// Initialize Socket.IO
initializeSocket(httpServer);

// Start server
httpServer.listen(PORT, HOST, () => {
  console.log(
    `Server running on http://${HOST}:${PORT}`,
  );
});