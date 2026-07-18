import { Types } from "mongoose";
import OcrPageResultModel from "../../db/models/ocrPageResult.model.js";
import DocumentQualityModel from "../../db/models/documentQuality.model.js";
import OcrUsageRecordModel from "../../db/models/ocrUsageRecord.model.js";
import type { OcrPageResultDocument } from "../../db/models/ocrPageResult.model.js";
import type { DocumentQualityDocument } from "../../db/models/documentQuality.model.js";

export async function findOcrPageResults(
  tenantId: string,
  documentId: string,
  documentVersion: number,
): Promise<OcrPageResultDocument[]> {
  return OcrPageResultModel.find({
    tenantId: new Types.ObjectId(tenantId),
    documentId: new Types.ObjectId(documentId),
    documentVersion,
  }).sort({ pageNumber: 1 });
}

export async function findOcrPageResultByPage(
  tenantId: string,
  documentId: string,
  documentVersion: number,
  pageNumber: number,
): Promise<OcrPageResultDocument | null> {
  return OcrPageResultModel.findOne({
    tenantId: new Types.ObjectId(tenantId),
    documentId: new Types.ObjectId(documentId),
    documentVersion,
    pageNumber,
  });
}

export async function upsertOcrPageResult(
  tenantId: string,
  documentId: string,
  documentVersion: number,
  pageNumber: number,
  updates: Partial<OcrPageResultDocument>,
): Promise<OcrPageResultDocument> {
  return OcrPageResultModel.findOneAndUpdate(
    {
      tenantId: new Types.ObjectId(tenantId),
      documentId: new Types.ObjectId(documentId),
      documentVersion,
      pageNumber,
    },
    {
      $set: { ...updates, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true },
  );
}

export async function findDocumentQuality(
  tenantId: string,
  documentId: string,
  documentVersion: number,
): Promise<DocumentQualityDocument | null> {
  return DocumentQualityModel.findOne({
    tenantId: new Types.ObjectId(tenantId),
    documentId: new Types.ObjectId(documentId),
    documentVersion,
  });
}

export async function upsertDocumentQuality(
  tenantId: string,
  documentId: string,
  documentVersion: number,
  updates: Partial<DocumentQualityDocument>,
): Promise<DocumentQualityDocument> {
  return DocumentQualityModel.findOneAndUpdate(
    {
      tenantId: new Types.ObjectId(tenantId),
      documentId: new Types.ObjectId(documentId),
      documentVersion,
    },
    {
      $set: { ...updates, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true },
  );
}

export async function createOcrUsageRecord(
  tenantId: string,
  documentId: string,
  documentVersion: number,
  pageNumber: number,
  provider: string,
  providerModel: string,
  language: "ar" | "en" | "ar+en",
  durationMs: number,
  costUsd: number,
): Promise<void> {
  await OcrUsageRecordModel.create({
    tenantId: new Types.ObjectId(tenantId),
    documentId: new Types.ObjectId(documentId),
    documentVersion,
    pageNumber,
    provider,
    providerModel,
    language,
    pagesProcessed: 1,
    durationMs,
    costUsd,
  });
}

export async function getOcrUsageCount(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const result = await OcrUsageRecordModel.aggregate([
    {
      $match: {
        tenantId: new Types.ObjectId(tenantId),
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$pagesProcessed" },
      },
    },
  ]);
  return result.length > 0 ? result[0].total : 0;
}

export async function deleteOcrPageResults(
  tenantId: string,
  documentId: string,
  documentVersion: number,
): Promise<void> {
  await OcrPageResultModel.deleteMany({
    tenantId: new Types.ObjectId(tenantId),
    documentId: new Types.ObjectId(documentId),
    documentVersion,
  });
}
