import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import {
  reportGapCandidateSchema,
  listGapsQuerySchema,
  assignGapSchema,
  resolveGapSchema,
  dismissGapSchema,
  mergeGapsSchema,
  splitGapSchema,
  linkDocumentsSchema,
  triggerReevaluationSchema,
} from "./knowledge-gaps.dto.js";

export const validateReportCandidate: RequestHandler = (req, _res, next) => {
  try {
    const result = reportGapCandidateSchema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, VALIDATION_ERROR, "Invalid gap candidate payload", {
        errors: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  } catch (error) {
    next(error);
  }
};

export const validateListGapsQuery: RequestHandler = (req, res, next) => {
  try {
    const result = listGapsQuerySchema.safeParse(req.query);
    if (!result.success) {
      throw new AppError(400, VALIDATION_ERROR, "Invalid list query parameters", {
        errors: result.error.issues,
      });
    }
    res.locals.validatedQuery = result.data;
    next();
  } catch (error) {
    next(error);
  }
};

export const validateAssignGap: RequestHandler = (req, _res, next) => {
  try {
    const result = assignGapSchema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, VALIDATION_ERROR, "Invalid assign gap payload", {
        errors: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  } catch (error) {
    next(error);
  }
};

export const validateResolveGap: RequestHandler = (req, _res, next) => {
  try {
    const result = resolveGapSchema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, VALIDATION_ERROR, "Invalid resolve gap payload", {
        errors: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  } catch (error) {
    next(error);
  }
};

export const validateDismissGap: RequestHandler = (req, _res, next) => {
  try {
    const result = dismissGapSchema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, VALIDATION_ERROR, "Invalid dismiss gap payload", {
        errors: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  } catch (error) {
    next(error);
  }
};

export const validateMergeGaps: RequestHandler = (req, _res, next) => {
  try {
    const result = mergeGapsSchema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, VALIDATION_ERROR, "Invalid merge gaps payload", {
        errors: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  } catch (error) {
    next(error);
  }
};

export const validateSplitGap: RequestHandler = (req, _res, next) => {
  try {
    const result = splitGapSchema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, VALIDATION_ERROR, "Invalid split gap payload", {
        errors: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  } catch (error) {
    next(error);
  }
};

export const validateLinkDocuments: RequestHandler = (req, _res, next) => {
  try {
    const result = linkDocumentsSchema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, VALIDATION_ERROR, "Invalid link documents payload", {
        errors: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  } catch (error) {
    next(error);
  }
};

export const validateTriggerReevaluation: RequestHandler = (req, _res, next) => {
  try {
    const result = triggerReevaluationSchema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, VALIDATION_ERROR, "Invalid reevaluation payload", {
        errors: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  } catch (error) {
    next(error);
  }
};
