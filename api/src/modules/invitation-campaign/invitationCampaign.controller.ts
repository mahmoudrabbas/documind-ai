import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { CampaignService } from "./services/campaign.service.js";
import { CampaignAgentFactory } from "./ports/campaignAgent.port.js";
import { createCampaignQuerySchema, confirmCampaignParamsSchema, cancelCampaignParamsSchema, listCampaignsQuerySchema } from "./invitationCampaign.validator.js";
import { invitationCampaignProcessingDuration } from "./services/campaignMetrics.js";
import { parseEmployeeSpreadsheet } from "../imports/services/xlsxParser.service.js";
import { resolveColumnMappings } from "../imports/services/mappingResolver.service.js";
import { validateBatch } from "../imports/services/validationEngine.service.js";
import type { ResolvedMapping, ValidationContext } from "../imports/services/validationEngine.service.js";
import User from "../../db/models/user.model.js";
import { ImportBatchService } from "../imports/services/importBatch.service.js";

export async function uploadAndAnalyze(req: Request, res: Response, next: NextFunction): Promise<void> {
  const start = Date.now();
  try {
    const file = req.file;
    if (!file) throw new AppError(400, "FILE_REQUIRED", "Spreadsheet file is required");

    const tenantId = req.auth?.tenantId;
    const actorId = req.auth?.userId;
    if (!tenantId || !actorId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");

    const query = createCampaignQuerySchema.parse(req.query);

    // Step 1: Parse spreadsheet
    const parseResult = parseEmployeeSpreadsheet(file.buffer, file.originalname);
    const totalRows = parseResult.totalRows;
    const headers = parseResult.headers;

    // Step 2: Resolve column mappings (deterministic, no LLM)
    const proposal = resolveColumnMappings(headers);
    const fieldMap: Record<string, string> = {};
    let mappedCount = 0;
    let confidence: "high" | "medium" | "low" = "high";
    for (const mapping of proposal.columnMappings) {
      if (mapping.targetField) {
        fieldMap[mapping.excelHeader] = mapping.targetField;
        mappedCount++;
        if (mapping.confidence === "low") confidence = "low";
        else if (mapping.confidence === "medium" && confidence !== "low") confidence = "medium";
      }
    }
    const resolvedMapping: ResolvedMapping = {
      fieldMap,
      unmappedHeaders: proposal.unmappedHeaders,
      mappedCount,
      totalHeaders: proposal.columnMappings.length,
      confidence,
    };

    // Step 3: Build validation context from tenant users
    const tenantUsers = await User.find({ tenantId }).lean();
    const existingEmails = new Set<string>();
    const existingUserIds = new Map<string, string>();
    for (const u of tenantUsers) {
      if (u.email) existingEmails.add(u.email);
      if (u.email && u._id) existingUserIds.set(u.email, u._id.toString());
    }
    const validationContext: ValidationContext = {
      tenantId,
      existingEmails,
      existingUserIds,
      tenantUserLimit: Number.MAX_SAFE_INTEGER,
    };

    // Step 4: Validate rows
    const validation = await validateBatch({
      tenantId,
      rows: parseResult.rows,
      mapping: resolvedMapping,
      context: validationContext,
    });

    const validCount = validation.summary.valid;
    const warningCount = validation.summary.warning;
    const invalidCount = validation.summary.invalid;
    const duplicateCount = validation.rows.filter((r) => {
      const email = r.errors.find((e) => e.code === "DUPLICATE_EMAIL_IN_FILE");
      return !!email;
    }).length;
    const alreadyRegisteredCount = validation.rows.filter((r) =>
      r.errors.some((e) => e.code === "EMAIL_ALREADY_REGISTERED"),
    ).length;
    const alreadyInvitedCount = validation.rows.filter((r) =>
      r.errors.some((e) => e.code === "ALREADY_INVITED"),
    ).length;

    // Step 5: Create import batch (in UPLOADED state)
    const { batch } = await ImportBatchService.createBatch({
      tenantId,
      createdBy: actorId,
      originalFileName: file.originalname,
      fileChecksum: parseResult.fileChecksum,
      fileSizeBytes: file.size,
      totalRows,
      rows: parseResult.rows.map((r) => ({
        rowNumber: r.rowNumber,
        rawData: r.rawData,
        checksum: r.checksum,
      })),
    });

    // Step 6: AI analysis with REAL validation data
    const agent = await CampaignAgentFactory.fromEnv();
    const analysisResult = await agent.analyzeSpreadsheet({
      fileName: file.originalname,
      totalRows,
      columnHeaders: headers,
      validationSummary: {
        valid: validCount,
        warning: warningCount,
        invalid: invalidCount,
        duplicates: duplicateCount,
        alreadyRegistered: alreadyRegisteredCount,
        alreadyInvited: alreadyInvitedCount,
      },
      sampleRows: parseResult.rows.slice(0, 5).map((r) => {
        const sanitized: Record<string, string> = {};
        for (const [key, val] of Object.entries(r.rawData)) {
          sanitized[key] = val
            .split("")
            .filter((c) => {
              const code = c.charCodeAt(0);
              return !(code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31));
            })
            .join("")
            .substring(0, 500);
        }
        return sanitized;
      }),
    });

    // Step 7: Create campaign (already linked to the batch)
    const campaign = await CampaignService.createCampaign({
      tenantId,
      createdBy: actorId,
      originalFileName: file.originalname,
      fileChecksum: parseResult.fileChecksum,
      totalRows,
      importBatchId: batch._id.toString(),
      analysis: analysisResult.analysis,
      campaignPlan: {
        validCount,
        warningCount,
        invalidCount,
        duplicateCount,
        alreadyRegisteredCount,
        alreadyInvitedCount,
        totalRows,
        autoConfirm: query.autoConfirm ?? analysisResult.autoConfirm,
        recommendations: analysisResult.recommendations,
      },
    });

    invitationCampaignProcessingDuration.observe((Date.now() - start) / 1000);
    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
}

export async function getCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");

    const campaignId = req.params.campaignId as string;
    const campaign = await CampaignService.getCampaign(campaignId, tenantId);
    if (!campaign) throw new AppError(404, "NOT_FOUND", "Campaign not found");
    res.json(campaign);
  } catch (err) {
    next(err);
  }
}

export async function confirmCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.auth?.tenantId;
    const actorId = req.auth?.userId;
    if (!tenantId || !actorId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");

    const { campaignId } = confirmCampaignParamsSchema.parse(req.params);
    const result = await CampaignService.confirmCampaign(campaignId, actorId, tenantId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function cancelCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.auth?.tenantId;
    const actorId = req.auth?.userId;
    if (!tenantId || !actorId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");

    const { campaignId } = cancelCampaignParamsSchema.parse(req.params);
    const campaign = await CampaignService.cancelCampaign(campaignId, actorId, tenantId);
    res.json(campaign);
  } catch (err) {
    next(err);
  }
}

export async function listCampaigns(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");

    const query = listCampaignsQuerySchema.parse(req.query);
    const result = await CampaignService.listCampaigns({
      tenantId,
      page: query.page,
      pageSize: query.pageSize,
      state: query.state,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}
