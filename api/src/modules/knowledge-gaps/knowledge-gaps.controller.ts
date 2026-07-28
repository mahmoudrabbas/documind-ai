import type { Request, Response, NextFunction } from "express";
import { knowledgeGapsService } from "./knowledge-gaps.service.js";
import type { ListGapsQueryInput } from "./knowledge-gaps.dto.js";

export async function reportGapCandidateController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const actorId = req.auth?.userId || "system";

    const gap = await knowledgeGapsService.reportCandidate(tenantId, actorId, req.body);
    res.status(201).json({ gap });
  } catch (error) {
    next(error);
  }
}

export async function listGapsController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const query = { ...(res.locals.validatedQuery || {}) };

    if (req.auth?.role === "EMPLOYEE" && req.auth.userId) {
      query.assigneeId = req.auth.userId;
    }

    const result = await knowledgeGapsService.listGaps(tenantId, query as ListGapsQueryInput);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getGapByIdController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const gapId = req.params.id as string;
    const gap = await knowledgeGapsService.getGapById(tenantId, gapId);

    if (req.auth?.role === "EMPLOYEE" && String(gap.assigneeId || "") !== req.auth.userId) {
      res.status(403).json({ error: "Access denied. This knowledge gap is not assigned to you." });
      return;
    }

    res.json({ gap });
  } catch (error) {
    next(error);
  }
}

export async function assignGapController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const gapId = req.params.id as string;
    const actorId = req.auth?.userId || "system";

    const gap = await knowledgeGapsService.assignGap(tenantId, gapId, actorId, req.body);
    res.json({ gap });
  } catch (error) {
    next(error);
  }
}

export async function resolveGapController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const gapId = req.params.id as string;
    const actorId = req.auth?.userId || "system";

    const gap = await knowledgeGapsService.resolveGap(tenantId, gapId, actorId, req.body);
    res.json({ gap });
  } catch (error) {
    next(error);
  }
}

export async function dismissGapController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const gapId = req.params.id as string;
    const actorId = req.auth?.userId || "system";

    const gap = await knowledgeGapsService.dismissGap(tenantId, gapId, actorId, req.body);
    res.json({ gap });
  } catch (error) {
    next(error);
  }
}

export async function reopenGapController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const gapId = req.params.id as string;
    const actorId = req.auth?.userId || "system";

    const gap = await knowledgeGapsService.reopenGap(tenantId, gapId, actorId);
    res.json({ gap });
  } catch (error) {
    next(error);
  }
}

export async function mergeGapsController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const actorId = req.auth?.userId || "system";

    const gap = await knowledgeGapsService.mergeGaps(tenantId, actorId, req.body);
    res.json({ gap });
  } catch (error) {
    next(error);
  }
}

export async function splitGapController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const gapId = req.params.id as string;
    const actorId = req.auth?.userId || "system";

    const gaps = await knowledgeGapsService.splitGap(tenantId, actorId, gapId, req.body);
    res.json({ gaps });
  } catch (error) {
    next(error);
  }
}

export async function linkDocumentsController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const gapId = req.params.id as string;
    const actorId = req.auth?.userId || "system";

    const gap = await knowledgeGapsService.linkDocuments(tenantId, gapId, actorId, req.body);
    res.json({ gap });
  } catch (error) {
    next(error);
  }
}

export async function triggerReevaluationController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const gapId = req.params.id as string;
    const documentId = req.body.documentId;
    const actorId = req.auth?.userId || "system";

    const record = await knowledgeGapsService.triggerReevaluation(tenantId, gapId, documentId, actorId);
    res.status(201).json({ reevaluation: record });
  } catch (error) {
    next(error);
  }
}

export async function getOccurrencesController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const gapId = req.params.id as string;
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;

    const result = await knowledgeGapsService.getOccurrences(tenantId, gapId, page, pageSize);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getReevaluationsController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const gapId = req.params.id as string;

    const reevaluations = await knowledgeGapsService.getReevaluations(tenantId, gapId);
    res.json({ reevaluations });
  } catch (error) {
    next(error);
  }
}

export async function getMetricsController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const metrics = await knowledgeGapsService.getMetrics(tenantId);
    res.json({ metrics });
  } catch (error) {
    next(error);
  }
}
