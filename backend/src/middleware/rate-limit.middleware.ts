import { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

// Per-IP limits. Per-phone limits live in auth.service and work across servers.
// An office shares one IP, so these only stop abuse from a single source.
export const createRateLimiter = (max: number, windowMs: number) =>
  rateLimit({
    windowMs,
    limit: max * env.rateLimitMultiplier,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        message: "Too many requests. Please try again later.",
        errorCode: "RATE_LIMITED",
      });
    },
  });

export const sendOtpLimiter = createRateLimiter(30, FIFTEEN_MINUTES_MS);
export const verifyOtpLimiter = createRateLimiter(60, FIFTEEN_MINUTES_MS);
export const setupLimiter = createRateLimiter(30, FIFTEEN_MINUTES_MS);
export const refreshLimiter = createRateLimiter(120, FIFTEEN_MINUTES_MS);
