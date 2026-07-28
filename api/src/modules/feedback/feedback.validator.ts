import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import { submitFeedbackSchema, listFeedbackQuerySchema } from "./feedback.dto.js";

export const validateSubmitFeedback: RequestHandler = (req, _res, next) => {
  try {
    const result = submitFeedbackSchema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, VALIDATION_ERROR, "Invalid feedback payload", {
        errors: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  } catch (error) {
    next(error);
  }
};

export const validateListFeedbackQuery: RequestHandler = (req, res, next) => {
  try {
    const result = listFeedbackQuerySchema.safeParse(req.query);
    if (!result.success) {
      throw new AppError(400, VALIDATION_ERROR, "Invalid feedback query parameters", {
        errors: result.error.issues,
      });
    }
    res.locals.validatedQuery = result.data;
    next();
  } catch (error) {
    next(error);
  }
};
