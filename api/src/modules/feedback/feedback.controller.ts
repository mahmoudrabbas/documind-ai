import type { Request, Response, NextFunction } from "express";
import { feedbackService } from "./feedback.service.js";
import type { ListFeedbackQueryInput } from "./feedback.dto.js";

export async function submitFeedbackController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const userId = req.auth!.userId;

    const feedback = await feedbackService.submitFeedback(tenantId, userId, req.body);
    res.status(201).json({ feedback });
  } catch (error) {
    next(error);
  }
}

export async function getMyFeedbackForMessageController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const userId = req.auth!.userId;
    const messageId = req.params.messageId as string;

    const feedback = await feedbackService.getMyFeedbackForMessage(tenantId, userId, messageId);
    res.json({ feedback });
  } catch (error) {
    next(error);
  }
}

export async function listFeedbackController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const result = await feedbackService.listFeedback(tenantId, res.locals.validatedQuery as ListFeedbackQueryInput);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getFeedbackStatsController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const stats = await feedbackService.getFeedbackStats(tenantId);
    res.json({ stats });
  } catch (error) {
    next(error);
  }
}
