import type { NextFunction, Request, Response } from "express";
import { reconcileSubscriptions } from "./reconciliation.service.js";

export async function reconciliationController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await reconcileSubscriptions();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
