import { Types } from "mongoose";
import ExtractionArtifactModel, { ExtractionArtifactDocument } from "../../db/models/extractionArtifact.model.js";

export async function findArtifactByVersion(
  tenantId: string | Types.ObjectId,
  documentId: string | Types.ObjectId,
  documentVersion: number,
): Promise<ExtractionArtifactDocument | null> {
  return ExtractionArtifactModel.findOne({
    tenantId: new Types.ObjectId(tenantId),
    documentId: new Types.ObjectId(documentId),
    documentVersion,
  });
}

export async function upsertArtifact(
  tenantId: string | Types.ObjectId,
  documentId: string | Types.ObjectId,
  documentVersion: number,
  updates: Partial<ExtractionArtifactDocument>,
): Promise<ExtractionArtifactDocument> {
  const result = await ExtractionArtifactModel.findOneAndUpdate(
    {
      tenantId: new Types.ObjectId(tenantId),
      documentId: new Types.ObjectId(documentId),
      documentVersion,
    },
    {
      $set: {
        ...updates,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );
  return result;
}

export async function deleteArtifact(
  tenantId: string | Types.ObjectId,
  documentId: string | Types.ObjectId,
  documentVersion: number,
): Promise<boolean> {
  const result = await ExtractionArtifactModel.deleteOne({
    tenantId: new Types.ObjectId(tenantId),
    documentId: new Types.ObjectId(documentId),
    documentVersion,
  });
  return result.deletedCount > 0;
}
