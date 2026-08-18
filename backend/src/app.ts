import express from "express";
import cors from "cors";
import helmet from "helmet";
// import pinoHttp from "pino-http";
import countryRoutes from "./modules/country/country.route.js";
import authRouter from "./modules/auth/auth.route.js";
import userRoutes from "./modules/user/user.route.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import organizationRoutes from "./modules/organization/organization.route.js";
const app = express();

app.use(helmet());

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// For logging HTTP requests, you can use pino-http middleware. Uncomment the following line to enable it.
// app.use(pinoHttp());

app.get("/api/v1/health", (_req, res) => {
  console.log("HEALTH API HIT");

  res.status(200).json({
    success: true,
    message: "Enterprise Chat API is running",
  });
});

app.use("/api/v1", countryRoutes);
app.use("/api/v1/auth", authRouter);

app.use("/api/v1/user", userRoutes);
app.use(
  "/api/v1/organization",
  organizationRoutes,
);
// Error middleware MUST be after routes
app.use(errorMiddleware);

export default app;