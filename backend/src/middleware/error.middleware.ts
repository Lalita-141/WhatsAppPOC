import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error.js";

export const errorMiddleware = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  console.error(error);

  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errorCode: error.errorCode,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
    errorCode: "INTERNAL_SERVER_ERROR",
  });
};