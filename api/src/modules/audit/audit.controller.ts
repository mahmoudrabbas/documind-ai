import type { NextFunction, Request, Response } from "express";
import { findAuditLogs, countAuditLogs, getAuditLogById, exportAuditLogs } from "./audit.repository.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { AppError } from "../../common/errors/AppError.js";
import { validateAuditLogsInput, validateExportAuditLogsInput } from "./audit.validator.js";
import type { AuditQueryFilter } from "./audit.types.js";

function getAuditTenantScope(req: Request) {
  if (req.auth?.role === "SUPER_ADMIN") {
    return typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
  }
  return req.auth?.tenantId;
}

export const getLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = validateAuditLogsInput(req.query);
    const filter: AuditQueryFilter = {
      ...payload,
      tenantId: getAuditTenantScope(req),
    };
    
    const page = payload.page;
    const pageSize = payload.pageSize;

    const [logs, totalRecords] = await Promise.all([
      findAuditLogs(filter, page, pageSize),
      countAuditLogs(filter),
    ]);

    res.json({
      logs,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: Math.ceil(totalRecords / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLogById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const tenantId = getAuditTenantScope(req);
    
    const log = await getAuditLogById(id as string, tenantId);
    
    if (!log) {
      throw new AppError(404, "NOT_FOUND", "Audit log not found");
    }

    res.json({ log });
  } catch (error) {
    next(error);
  }
};

export const exportLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = validateExportAuditLogsInput(req.query);
    const filter: AuditQueryFilter = {
      ...payload,
      tenantId: getAuditTenantScope(req),
    };
    
    if (!filter.dateFrom && !filter.dateTo) {
      throw new AppError(400, "BAD_REQUEST", "Export requires dateFrom or dateTo to bound the query");
    }

    const logs = await exportAuditLogs(filter, 10000);

    await getAuditWriter().write({
      action: "AUDIT_EXPORTED",
      resourceType: "System",
      resourceId: "audit_logs",
      metadata: { filter, count: logs.length }
    });

    res.json({ logs });
  } catch (error) {
    next(error);
  }
};

