import type { ErrorRequestHandler } from "express";
import { AppError } from "../errors/AppError.js";
import { BAD_REQUEST, INTERNAL_SERVER_ERROR } from "../errors/errorCodes.js";

interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown;
    path: string;
    method: string;
    timestamp: string;
    stack?: string;
  };
}

function isSyntaxError(error: unknown): error is SyntaxError {
  return (
    error instanceof SyntaxError ||
    (typeof error === "object" &&
      error !== null &&
      "type" in error &&
      (error as { type?: string }).type === "entity.parse.failed")
  );
}

export const errorHandlerMiddleware: ErrorRequestHandler = (
  err,
  req,
  res,
  _next
) => {
  void _next;

  const isProduction = process.env.NODE_ENV === "production";

  let statusCode = 500;
  let code = INTERNAL_SERVER_ERROR;
  let message = "Internal server error";
  let details: unknown = null;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details ?? null;
  } else if (isSyntaxError(err)) {
    statusCode = 400;
    code = BAD_REQUEST;
    message = "Invalid JSON payload";
    details = null;
  }

  console.error("[error-handler]", err);

  const payload: ErrorEnvelope = {
    success: false,
    error: {
      code,
      message,
      details,
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
    },
  };

  if (!isProduction && err instanceof Error && err.stack) {
    payload.error.stack = err.stack;
  }

  res.status(statusCode).json(payload);
};
