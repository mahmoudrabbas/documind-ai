import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import {
  analyticsQuerySchema,
  exportRequestSchema,
  insightRequestSchema,
} from "./analytics.dto.js";

export const validateAnalyticsQuery: RequestHandler = (req, _res, next) => {
  try {
    const result = analyticsQuerySchema.safeParse(req.query);
    if (!result.success) {
      throw new AppError(400, VALIDATION_ERROR, "Invalid analytics query parameters", {
        errors: result.error.issues,
      });
    }
    Object.assign(req.query, result.data);
    next();
  } catch (error) {
    next(error);
  }
};

export const validateExportRequest: RequestHandler = (req, _res, next) => {
  try {
    const result = exportRequestSchema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, VALIDATION_ERROR, "Invalid export request payload", {
        errors: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  } catch (error) {
    next(error);
  }
};

export const validateInsightRequest: RequestHandler = (req, _res, next) => {
  try {
    const result = insightRequestSchema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, VALIDATION_ERROR, "Invalid insight request payload", {
        errors: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  } catch (error) {
    next(error);
  }
};
