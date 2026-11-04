import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error.js";
import { logger } from "../config/logger.js";

export const notFoundMiddleware = (
  _req: Request,
  res: Response,
) => {
  res.status(404).json({
    success: false,
    message: "Resource not found",
    errorCode: "NOT_FOUND",
  });
};

export const errorMiddleware = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errorCode: error.errorCode,
    });
  }

  // Malformed or oversized request bodies from express.json()
  const bodyError = error as { status?: number; type?: string };

  if (
    typeof bodyError?.status === "number" &&
    bodyError.status >= 400 &&
    bodyError.status < 500 &&
    bodyError.type
  ) {
    return res.status(bodyError.status).json({
      success: false,
      message: "Invalid request body",
      errorCode: "INVALID_REQUEST_BODY",
    });
  }

  logger.error({ err: error }, "Unhandled request error");

  return res.status(500).json({
    success: false,
    message: "Internal server error",
    errorCode: "INTERNAL_SERVER_ERROR",
  });
};
