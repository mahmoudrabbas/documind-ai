import type {
  MetadataAgent,
  ExtractionArtifacts,
  MetadataAgentOutput,
  MetadataCandidate,
} from "./metadataAgent.port.js";

const DOCUMENT_TYPES = [
  "policy",
  "procedure",
  "contract",
  "report",
  "memo",
  "presentation",
  "spreadsheet",
  "manual",
  "guide",
  "specification",
  "other",
];

const CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"];

const DEPARTMENTS = [
  "human_resources",
  "finance",
  "legal",
  "operations",
  "marketing",
  "engineering",
  "sales",
  "admin",
  "it",
  "other",
];

function extractTitleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectDocumentType(text: string, fileName: string): { value: string; confidence: number; evidence: string } {
  const lowerText = text.toLowerCase();
  const lowerFileName = fileName.toLowerCase();

  if (lowerText.includes("terms and conditions") || lowerText.includes("agreement")) {
    return { value: "contract", confidence: 0.85, evidence: "Text contains contract-related keywords" };
  }
  if (lowerText.includes("policy") || lowerText.includes("policy statement")) {
    return { value: "policy", confidence: 0.8, evidence: "Text contains policy-related keywords" };
  }
  if (lowerText.includes("procedure") || lowerText.includes("step-by-step")) {
    return { value: "procedure", confidence: 0.8, evidence: "Text contains procedure-related keywords" };
  }
  if (lowerText.includes("quarterly report") || lowerText.includes("annual report")) {
    return { value: "report", confidence: 0.75, evidence: "Text contains report-related keywords" };
  }
  if (lowerFileName.includes("memo") || lowerText.includes("memorandum")) {
    return { value: "memo", confidence: 0.7, evidence: "Filename or text suggests memo" };
  }

  return { value: "other", confidence: 0.3, evidence: "Unable to determine document type from content" };
}

function detectDepartment(text: string): { value: string; confidence: number; evidence: string } | null {
  const lowerText = text.toLowerCase();

  const departmentKeywords: Record<string, string[]> = {
    human_resources: ["employee", "hr policy", "human resources", "hiring", "termination", "benefits"],
    finance: ["budget", "financial", "invoice", "payment", "accounting", "revenue"],
    legal: ["legal", "compliance", "regulation", "liability", "contract", "agreement"],
    operations: ["operations", "process", "workflow", "operational", "efficiency"],
    marketing: ["marketing", "brand", "campaign", "advertising", "promotion"],
    engineering: ["engineering", "technical", "specification", "architecture", "development"],
    sales: ["sales", "customer", "proposal", "quotation", "deal"],
    it: ["information technology", "it policy", "system", "infrastructure", "security"],
  };

  let bestMatch: { value: string; confidence: number; evidence: string } | null = null;
  let bestScore = 0;

  for (const [dept, keywords] of Object.entries(departmentKeywords)) {
    const matches = keywords.filter((kw) => lowerText.includes(kw));
    if (matches.length > bestScore) {
      bestScore = matches.length;
      bestMatch = {
        value: dept,
        confidence: Math.min(0.3 + matches.length * 0.15, 0.85),
        evidence: `Text contains department-related keywords: ${matches.join(", ")}`,
      };
    }
  }

  return bestMatch;
}

function detectLanguage(text: string): { value: string; confidence: number; evidence: string } {
  const arabicRegex = /[\u0600-\u06FF]/g;
  const arabicMatches = text.match(arabicRegex);
  const arabicRatio = arabicMatches ? arabicMatches.length / text.length : 0;

  if (arabicRatio > 0.3) {
    return { value: "ar", confidence: 0.9, evidence: "Document contains significant Arabic text" };
  }
  if (arabicRatio > 0.1) {
    return { value: "ar+en", confidence: 0.8, evidence: "Document contains mixed Arabic and English text" };
  }
  return { value: "en", confidence: 0.85, evidence: "Document appears to be primarily English" };
}

function detectClassification(text: string): { value: string; confidence: number; evidence: string } {
  const lowerText = text.toLowerCase();

  if (lowerText.includes("confidential") || lowerText.includes("proprietary")) {
    return { value: "confidential", confidence: 0.8, evidence: "Document contains confidentiality markers" };
  }
  if (lowerText.includes("restricted") || lowerText.includes("internal only")) {
    return { value: "restricted", confidence: 0.75, evidence: "Document contains restriction markers" };
  }
  if (lowerText.includes("public") || lowerText.includes("public domain")) {
    return { value: "public", confidence: 0.7, evidence: "Document indicates public availability" };
  }

  return { value: "internal", confidence: 0.5, evidence: "Default classification for business documents" };
}

function detectDates(text: string): Array<{ field: "effectiveDate" | "expiryDate"; value: string; confidence: number; evidence: string }> {
  const results: Array<{ field: "effectiveDate" | "expiryDate"; value: string; confidence: number; evidence: string }> = [];
  const dateRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g;
  const matches = [...text.matchAll(dateRegex)];

  if (matches.length >= 2) {
    results.push({
      field: "effectiveDate",
      value: matches[0][0],
      confidence: 0.6,
      evidence: `First date found in document: ${matches[0][0]}`,
    });
    results.push({
      field: "expiryDate",
      value: matches[matches.length - 1][0],
      confidence: 0.5,
      evidence: `Last date found in document: ${matches[matches.length - 1][0]}`,
    });
  } else if (matches.length === 1) {
    results.push({
      field: "effectiveDate",
      value: matches[0][0],
      confidence: 0.5,
      evidence: `Single date found in document: ${matches[0][0]}`,
    });
  }

  return results;
}

function detectTags(text: string): Array<{ value: string; confidence: number; evidence: string }> {
  const lowerText = text.toLowerCase();
  const tags: Array<{ value: string; confidence: number; evidence: string }> = [];

  const tagPatterns: Record<string, string[]> = {
    urgent: ["urgent", "immediate", "asap", "priority"],
    compliance: ["compliance", "regulatory", "regulation", "audit"],
    financial: ["financial", "budget", "cost", "expense", "revenue"],
    hr: ["employee", "staff", "personnel", "hiring", "termination"],
    legal: ["legal", "contract", "agreement", "terms", "liability"],
    technical: ["technical", "specification", "architecture", "system"],
    security: ["security", "confidential", "protected", "sensitive"],
  };

  for (const [tag, keywords] of Object.entries(tagPatterns)) {
    const matches = keywords.filter((kw) => lowerText.includes(kw));
    if (matches.length >= 2) {
      tags.push({
        value: tag,
        confidence: Math.min(0.4 + matches.length * 0.1, 0.75),
        evidence: `Text contains related keywords: ${matches.join(", ")}`,
      });
    }
  }

  return tags;
}

export class FakeMetadataAgent implements MetadataAgent {
  async proposeMetadata(artifacts: ExtractionArtifacts): Promise<MetadataAgentOutput> {
    const candidates: MetadataCandidate[] = [];

    const title = artifacts.title || extractTitleFromFileName(artifacts.fileName);
    candidates.push({
      fieldType: "title",
      proposedValue: title,
      confidence: artifacts.title ? 0.9 : 0.7,
      evidence: artifacts.title
        ? [{ type: "extracted", description: "Title extracted from document metadata" }]
        : [{ type: "inferred", description: "Title inferred from filename", sourceField: "fileName" }],
      requiresApproval: artifacts.title ? false : true,
    });

    const docType = detectDocumentType(artifacts.extractedText, artifacts.fileName);
    candidates.push({
      fieldType: "documentType",
      proposedValue: docType.value,
      confidence: docType.confidence,
      evidence: [{ type: "content_analysis", description: docType.evidence }],
      requiresApproval: docType.confidence < 0.7,
    });

    const dept = detectDepartment(artifacts.extractedText);
    if (dept) {
      candidates.push({
        fieldType: "department",
        proposedValue: dept.value,
        confidence: dept.confidence,
        evidence: [{ type: "content_analysis", description: dept.evidence }],
        requiresApproval: dept.confidence < 0.7,
      });
    }

    const lang = detectLanguage(artifacts.extractedText);
    candidates.push({
      fieldType: "language",
      proposedValue: lang.value,
      confidence: lang.confidence,
      evidence: [{ type: "content_analysis", description: lang.evidence }],
      requiresApproval: false,
    });

    const classification = detectClassification(artifacts.extractedText);
    candidates.push({
      fieldType: "classification",
      proposedValue: classification.value,
      confidence: classification.confidence,
      evidence: [{ type: "content_analysis", description: classification.evidence }],
      requiresApproval: classification.confidence < 0.7,
    });

    const dates = detectDates(artifacts.extractedText);
    for (const date of dates) {
      candidates.push({
        fieldType: date.field,
        proposedValue: date.value,
        confidence: date.confidence,
        evidence: [{ type: "content_analysis", description: date.evidence }],
        requiresApproval: true,
      });
    }

    const tags = detectTags(artifacts.extractedText);
    if (tags.length > 0) {
      candidates.push({
        fieldType: "tags",
        proposedValue: tags.map((t) => t.value),
        confidence: 0.6,
        evidence: tags.map((t) => ({ type: "content_analysis", description: t.evidence })),
        requiresApproval: true,
      });
    }

    const overallConfidence =
      candidates.reduce((sum, c) => sum + c.confidence, 0) / candidates.length;
    const requiresReview = candidates.some((c) => c.requiresApproval);

    return {
      candidates,
      summary: `Analyzed document "${artifacts.fileName}" and proposed ${candidates.length} metadata fields with overall confidence ${Math.round(overallConfidence * 100)}%.`,
      overallConfidence,
      requiresReview,
    };
  }
}
