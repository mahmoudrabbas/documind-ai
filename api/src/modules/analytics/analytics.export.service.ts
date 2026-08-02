import mongoose from "mongoose";
import * as XLSX from "xlsx";
import ExportJobModel, { type ExportJobDocument } from "../../db/models/exportJob.model.js";
import { AnalyticsRepository } from "./analytics.repository.js";
import type { AnalyticsQueryFilters } from "./analytics.types.js";

const DEFAULT_ROW_LIMIT = 10000;

export class AnalyticsExportService {
  constructor(private readonly repository: AnalyticsRepository = new AnalyticsRepository()) {}

  async createExportJob(
    tenantId: string | null,
    actorId: string,
    type: "csv" | "xlsx",
    filters?: AnalyticsQueryFilters
  ): Promise<ExportJobDocument> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h expiration

    const created = (await ExportJobModel.create({
      tenantId: tenantId ? new mongoose.Types.ObjectId(tenantId) : null,
      actorId: new mongoose.Types.ObjectId(actorId),
      type,
      status: "pending",
      filters: (filters as Record<string, unknown>) || {},
      rowCount: 0,
      expiresAt,
    })) as unknown as ExportJobDocument;

    // Execute in background
    void this.processExportJob(created._id.toString(), tenantId, filters, type);

    return created;
  }

  private async processExportJob(
    jobId: string,
    tenantId: string | null,
    filters: AnalyticsQueryFilters = {},
    type: "csv" | "xlsx"
  ): Promise<void> {
    try {
      await ExportJobModel.findByIdAndUpdate(jobId, { status: "running" }).exec();

      const eventsData = await this.repository.getEventsPaginated({
        ...filters,
        tenantId: tenantId ?? undefined,
        limit: DEFAULT_ROW_LIMIT,
        offset: 0,
      });

      const rows = eventsData.items.map((e) => ({
        "Event ID": e.id,
        "Event Type": e.eventType,
        Provider: e.provider || "N/A",
        Model: e.model || "N/A",
        "Total Tokens": e.totalTokens,
        "Cost (USD)": e.costUsd,
        "Latency (ms)": e.latencyMs,
        Success: e.success ? "Yes" : "No",
        "Created At": new Date(e.createdAt).toISOString(),
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      let contentBuffer: Buffer;
      let mimeType: string;

      if (type === "xlsx") {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Usage Events");
        contentBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
        mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      } else {
        const csvContent = XLSX.utils.sheet_to_csv(worksheet);
        contentBuffer = Buffer.from(csvContent, "utf-8");
        mimeType = "text/csv";
      }

      await ExportJobModel.findByIdAndUpdate(jobId, {
        status: "completed",
        rowCount: rows.length,
        filePath: `data:${mimeType};base64,${contentBuffer.toString("base64")}`,
      }).exec();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await ExportJobModel.findByIdAndUpdate(jobId, {
        status: "failed",
        error: errorMsg,
      }).exec();
    }
  }

  async getJobStatus(jobId: string, tenantId: string | null): Promise<ExportJobDocument | null> {
    const query: Record<string, unknown> = {
      _id: new mongoose.Types.ObjectId(jobId),
    };
    if (tenantId) {
      query.tenantId = new mongoose.Types.ObjectId(tenantId);
    }

    return ExportJobModel.findOne(query)
      .lean()
      .exec() as Promise<ExportJobDocument | null>;
  }
}
