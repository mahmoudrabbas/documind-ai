import type {
  VersionConflictAgent,
  DocumentComparisonInput,
  VersionConflictAgentOutput,
  DetectedRelationship,
  DetectedConflict,
} from "./versionConflictAgent.port.js";

function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter((w) => w.length > 3));

  if (words1.size === 0 || words2.size === 0) return 0;

  let matches = 0;
  for (const word of words1) {
    if (words2.has(word)) matches++;
  }

  return matches / Math.max(words1.size, words2.size);
}

function calculateChecksumSimilarity(checksum1: string, checksum2: string): number {
  if (checksum1 === checksum2) return 1;

  let matches = 0;
  const len = Math.min(checksum1.length, checksum2.length);
  for (let i = 0; i < len; i++) {
    if (checksum1[i] === checksum2[i]) matches++;
  }
  return matches / Math.max(checksum1.length, checksum2.length);
}

function detectDuplicateRelationship(
  source: DocumentComparisonInput["sourceDocument"],
  target: DocumentComparisonInput["candidateDocuments"][0],
): DetectedRelationship | null {
  const checksumSimilarity = calculateChecksumSimilarity(source.checksum, target.checksum);
  if (checksumSimilarity > 0.95) {
    return {
      targetDocumentId: target.id,
      relationshipType: "DUPLICATE_OF",
      confidence: 0.95,
      evidence: [
        {
          type: "checksum",
          description: `Documents have ${Math.round(checksumSimilarity * 100)}% checksum similarity`,
        },
      ],
      requiresApproval: false,
    };
  }

  const textSimilarity = calculateTextSimilarity(source.extractedText, target.extractedText);
  if (textSimilarity > 0.85) {
    return {
      targetDocumentId: target.id,
      relationshipType: "DUPLICATE_OF",
      confidence: 0.7 + textSimilarity * 0.2,
      evidence: [
        {
          type: "content_similarity",
          description: `Documents have ${Math.round(textSimilarity * 100)}% text similarity`,
        },
      ],
      requiresApproval: true,
    };
  }

  return null;
}

function detectVersionRelationship(
  source: DocumentComparisonInput["sourceDocument"],
  target: DocumentComparisonInput["candidateDocuments"][0],
): DetectedRelationship | null {
  const sourceTitle = source.metadata.title?.toLowerCase() || "";
  const targetTitle = target.metadata.title?.toLowerCase() || "";

  if (sourceTitle && targetTitle) {
    const titleSimilarity = calculateTextSimilarity(sourceTitle, targetTitle);
    if (titleSimilarity > 0.7) {
      const sourceVersion = source.metadata.version || 1;
      const targetVersion = target.metadata.version || 1;

      if (sourceVersion > targetVersion) {
        return {
          targetDocumentId: target.id,
          relationshipType: "SUPERSEDES",
          confidence: 0.6 + titleSimilarity * 0.2,
          evidence: [
            {
              type: "title_similarity",
              description: `Titles are ${Math.round(titleSimilarity * 100)}% similar`,
            },
            {
              type: "version_comparison",
              description: `Source version (${sourceVersion}) is higher than target (${targetVersion})`,
            },
          ],
          requiresApproval: true,
        };
      }
      if (targetVersion > sourceVersion) {
        return {
          targetDocumentId: target.id,
          relationshipType: "SUPERSEDED_BY",
          confidence: 0.6 + titleSimilarity * 0.2,
          evidence: [
            {
              type: "title_similarity",
              description: `Titles are ${Math.round(titleSimilarity * 100)}% similar`,
            },
            {
              type: "version_comparison",
              description: `Target version (${targetVersion}) is higher than source (${sourceVersion})`,
            },
          ],
          requiresApproval: true,
        };
      }
    }
  }

  return null;
}

function detectRelatedRelationship(
  source: DocumentComparisonInput["sourceDocument"],
  target: DocumentComparisonInput["candidateDocuments"][0],
): DetectedRelationship | null {
  const textSimilarity = calculateTextSimilarity(source.extractedText, target.extractedText);

  if (textSimilarity > 0.4 && textSimilarity <= 0.7) {
    const sourceTags = source.metadata.tags || [];
    const targetTags = target.metadata.tags || [];
    const commonTags = sourceTags.filter((t) => targetTags.includes(t));

    if (commonTags.length > 0 || source.metadata.department === target.metadata.department) {
      return {
        targetDocumentId: target.id,
        relationshipType: "RELATED_TO",
        confidence: 0.5 + textSimilarity * 0.2,
        evidence: [
          {
            type: "content_similarity",
            description: `Documents have ${Math.round(textSimilarity * 100)}% text similarity`,
          },
          ...(commonTags.length > 0
            ? [{ type: "common_tags", description: `Shared tags: ${commonTags.join(", ")}` }]
            : []),
          ...(source.metadata.department === target.metadata.department
            ? [{ type: "same_department", description: `Both in department: ${source.metadata.department}` }]
            : []),
        ],
        requiresApproval: true,
      };
    }
  }

  return null;
}

function detectDateConflicts(
  source: DocumentComparisonInput["sourceDocument"],
  target: DocumentComparisonInput["candidateDocuments"][0],
): DetectedConflict | null {
  const sourceEffective = source.metadata.effectiveDate;
  const targetEffective = target.metadata.effectiveDate;
  const sourceExpiry = source.metadata.expiryDate;
  const targetExpiry = target.metadata.expiryDate;

  if (sourceEffective && targetEffective && sourceExpiry && targetExpiry) {
    const sourceStart = new Date(sourceEffective).getTime();
    const sourceEnd = new Date(sourceExpiry).getTime();
    const targetStart = new Date(targetEffective).getTime();
    const targetEnd = new Date(targetExpiry).getTime();

    if (sourceStart < targetEnd && targetStart < sourceEnd) {
      return {
        targetDocumentId: target.id,
        conflictType: "overlapping_dates",
        severity: "medium",
        confidence: 0.8,
        description: `Documents have overlapping effective date ranges`,
        evidence: [
          {
            type: "date_overlap",
            sourceField: "effectiveDate",
            sourceValue: sourceEffective,
            targetValue: targetEffective,
            explanation: `Source effective date overlaps with target effective date`,
          },
          {
            type: "date_overlap",
            sourceField: "expiryDate",
            sourceValue: sourceExpiry,
            targetValue: targetExpiry,
            explanation: `Source expiry date overlaps with target expiry date`,
          },
        ],
        requiresApproval: true,
      };
    }
  }

  return null;
}

function detectValueConflicts(
  source: DocumentComparisonInput["sourceDocument"],
  target: DocumentComparisonInput["candidateDocuments"][0],
): DetectedConflict | null {
  const conflicts: DetectedConflict["evidence"] = [];

  if (source.metadata.classification && target.metadata.classification) {
    if (source.metadata.classification !== target.metadata.classification) {
      conflicts.push({
        type: "classification_mismatch",
        sourceField: "classification",
        sourceValue: source.metadata.classification,
        targetValue: target.metadata.classification,
        explanation: `Documents have different classifications: ${source.metadata.classification} vs ${target.metadata.classification}`,
      });
    }
  }

  if (source.metadata.department && target.metadata.department) {
    if (source.metadata.department !== target.metadata.department) {
      conflicts.push({
        type: "department_mismatch",
        sourceField: "department",
        sourceValue: source.metadata.department,
        targetValue: target.metadata.department,
        explanation: `Documents are in different departments: ${source.metadata.department} vs ${target.metadata.department}`,
      });
    }
  }

  if (conflicts.length > 0) {
    return {
      targetDocumentId: target.id,
      conflictType: "inconsistent_values",
      severity: "low",
      confidence: 0.7,
      description: `Documents have ${conflicts.length} inconsistent metadata value(s)`,
      evidence: conflicts,
      requiresApproval: true,
    };
  }

  return null;
}

export class FakeVersionConflictAgent implements VersionConflictAgent {
  async analyzeDocument(input: DocumentComparisonInput): Promise<VersionConflictAgentOutput> {
    const relationships: DetectedRelationship[] = [];
    const conflicts: DetectedConflict[] = [];

    for (const target of input.candidateDocuments) {
      const duplicate = detectDuplicateRelationship(input.sourceDocument, target);
      if (duplicate) {
        relationships.push(duplicate);
        continue;
      }

      const version = detectVersionRelationship(input.sourceDocument, target);
      if (version) {
        relationships.push(version);
      }

      const related = detectRelatedRelationship(input.sourceDocument, target);
      if (related) {
        relationships.push(related);
      }

      const dateConflict = detectDateConflicts(input.sourceDocument, target);
      if (dateConflict) {
        conflicts.push(dateConflict);
      }

      const valueConflict = detectValueConflicts(input.sourceDocument, target);
      if (valueConflict) {
        conflicts.push(valueConflict);
      }
    }

    const totalFindings = relationships.length + conflicts.length;
    const overallConfidence =
      totalFindings > 0
        ? (relationships.reduce((sum, r) => sum + r.confidence, 0) +
            conflicts.reduce((sum, c) => sum + c.confidence, 0)) /
          totalFindings
        : 0;

    const requiresReview =
      relationships.some((r) => r.requiresApproval) || conflicts.some((c) => c.requiresApproval);

    const summary = [
      `Analyzed document "${input.sourceDocument.fileName}" against ${input.candidateDocuments.length} candidate(s).`,
      `Found ${relationships.length} relationship(s) and ${conflicts.length} conflict(s).`,
      overallConfidence > 0
        ? `Overall confidence: ${Math.round(overallConfidence * 100)}%.`
        : "No significant relationships or conflicts detected.",
    ].join(" ");

    return {
      relationships,
      conflicts,
      summary,
      overallConfidence,
      requiresReview,
    };
  }
}
