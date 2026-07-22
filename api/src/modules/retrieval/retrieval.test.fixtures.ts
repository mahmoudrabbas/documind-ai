import mongoose from "mongoose";
import DocumentChunkModel, {
  type DocumentChunkDocument,
  type ChunkClassification,
} from "../../db/models/documentChunk.model.js";
import DocumentModel from "../../db/models/document.model.js";
import DocumentVersionModel from "../../db/models/documentVersion.model.js";

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

/**
 * Creates a deterministic pseudo-vector from text using simple character hashing.
 *
 * Each character's char code is accumulated into one of `dimensions` buckets
 * (cycling through buckets by index). The result is L2-normalised so every
 * vector has unit length for a given text length.
 *
 * Calling with the same text always yields the same vector.
 */
export function generateDeterministicVector(
  text: string,
  dimensions = 4,
): number[] {
  const sums = new Array<number>(dimensions).fill(0);

  for (let i = 0; i < text.length; i++) {
    sums[i % dimensions]! += text.charCodeAt(i);
  }

  const magnitude = Math.sqrt(
    sums.reduce((s, v) => s + v * v, 0),
  );

  if (magnitude === 0) {
    return Array<number>(dimensions).fill(0);
  }

  return sums.map((v) => Number((v / magnitude).toFixed(6)));
}

// ---------------------------------------------------------------------------
// Deterministic ObjectId helpers
// ---------------------------------------------------------------------------

function oid(hex: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(hex);
}

// ---------------------------------------------------------------------------
// Shared identifiers — all deterministic, never random
// ---------------------------------------------------------------------------

export const TENANTS = {
  tenantA: oid("670000000000000000000001"),
  tenantB: oid("670000000000000000000002"),
  platform: oid("670000000000000000000003"),
} as const;

export const DOCUMENTS = {
  // Tenant A
  doc1: oid("670000000000000000000010"), // Employment Contract
  doc2: oid("670000000000000000000011"), // HR Policy
  doc6: oid("670000000000000000000012"), // Data Security Policy
  // Tenant B
  doc3: oid("670000000000000000000020"), // عقد عمل
  doc4: oid("670000000000000000000021"), // Financial Report
  doc7: oid("670000000000000000000022"), // Customer Service Guidelines
  // Platform
  doc5: oid("670000000000000000000030"), // Platform Terms
  doc8: oid("670000000000000000000031"), // Infrastructure Overview
} as const;

export const VERSIONS = {
  // Doc 1 — 2 versions
  doc1_v1: oid("67000000000000000000a001"),
  doc1_v2: oid("67000000000000000000a002"),
  // Doc 2 — 1 version
  doc2_v1: oid("67000000000000000000b001"),
  // Doc 6 — 1 version
  doc6_v1: oid("67000000000000000000b101"),
  // Doc 3 — 1 version
  doc3_v1: oid("67000000000000000000c001"),
  // Doc 4 — 2 versions
  doc4_v1: oid("67000000000000000000d001"),
  doc4_v2: oid("67000000000000000000d002"),
  // Doc 7 — 1 version
  doc7_v1: oid("67000000000000000000c101"),
  // Doc 5 — 1 version
  doc5_v1: oid("67000000000000000000e001"),
  // Doc 8 — 1 version
  doc8_v1: oid("67000000000000000000e101"),
} as const;

// ---------------------------------------------------------------------------
// Raw fixture data (deterministic)
// ---------------------------------------------------------------------------

interface ChunkInput {
  tenantId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  documentVersionId: mongoose.Types.ObjectId;
  chunkIndex: number;
  text: string;
  pageNumber: number | null;
  sectionTitle: string | null;
  classification: ChunkClassification;
  category: string | null;
  department: string | null;
  allowAiUse: boolean;
}

/**
 * Every chunk in the entire fixture set.
 *
 * Total: 31 chunks (≥ 30 requirement).
 * - Tenant A: 13 chunks
 * - Tenant B: 11 chunks
 * - Platform:  7 chunks
 *
 * 3 chunks have `allowAiUse: false` (Doc1-v2-chunk2, Doc4-v1-chunk0, Doc4-v2-chunk0).
 *
 * Documents 1 and 4 have 2 versions each; only the latest version's chunks
 * should survive the version filter in `getDocumentVersionFilter()`.
 */
const FIXTURE_CHUNKS: ChunkInput[] = [
  // =========================================================================
  // TENANT A  —  670000000000000000000001
  // =========================================================================

  // ---- Doc 1: Employment Contract (670000000000000000000010) ----
  // Version 1 (old — should be excluded by version filter)
  {
    tenantId: TENANTS.tenantA,
    documentId: DOCUMENTS.doc1,
    documentVersionId: VERSIONS.doc1_v1,
    chunkIndex: 0,
    text: "Employment contract version 1 - initial terms and conditions",
    pageNumber: 1,
    sectionTitle: "Terms",
    classification: "public",
    category: "contracts",
    department: "hr",
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.tenantA,
    documentId: DOCUMENTS.doc1,
    documentVersionId: VERSIONS.doc1_v1,
    chunkIndex: 1,
    text: "Salary structure: basic pay 4000 SAR, housing allowance 1000 SAR",
    pageNumber: 2,
    sectionTitle: "Salary",
    classification: "internal",
    category: "contracts",
    department: "hr",
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.tenantA,
    documentId: DOCUMENTS.doc1,
    documentVersionId: VERSIONS.doc1_v1,
    chunkIndex: 2,
    text: "Probation period of 90 days with performance review at 60 days",
    pageNumber: 3,
    sectionTitle: "Probation",
    classification: "internal",
    category: "contracts",
    department: "hr",
    allowAiUse: true,
  },
  // Version 2 (latest)
  {
    tenantId: TENANTS.tenantA,
    documentId: DOCUMENTS.doc1,
    documentVersionId: VERSIONS.doc1_v2,
    chunkIndex: 0,
    text:
      "This employment contract between TechCorp and employee defines salary terms of 5000 SAR monthly",
    pageNumber: 1,
    sectionTitle: "Salary Terms",
    classification: "public",
    category: "contracts",
    department: "hr",
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.tenantA,
    documentId: DOCUMENTS.doc1,
    documentVersionId: VERSIONS.doc1_v2,
    chunkIndex: 1,
    text:
      "Employee benefits include health insurance, 30 days annual leave, and end of service bonus",
    pageNumber: 2,
    sectionTitle: "Benefits",
    classification: "internal",
    category: "contracts",
    department: "hr",
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.tenantA,
    documentId: DOCUMENTS.doc1,
    documentVersionId: VERSIONS.doc1_v2,
    chunkIndex: 2,
    text:
      "Confidential clause: proprietary information must not be shared with competitors",
    pageNumber: 3,
    sectionTitle: "Confidentiality",
    classification: "confidential",
    category: "contracts",
    department: "hr",
    allowAiUse: false,
  },

  // ---- Doc 2: HR Policy (670000000000000000000011) ----
  // Version 1 (only version — latest)
  {
    tenantId: TENANTS.tenantA,
    documentId: DOCUMENTS.doc2,
    documentVersionId: VERSIONS.doc2_v1,
    chunkIndex: 0,
    text:
      "Annual leave policy: employees are entitled to 30 calendar days of paid leave per year",
    pageNumber: 1,
    sectionTitle: "Leave Policy",
    classification: "public",
    category: "policies",
    department: "hr",
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.tenantA,
    documentId: DOCUMENTS.doc2,
    documentVersionId: VERSIONS.doc2_v1,
    chunkIndex: 1,
    text:
      "Remote work policy allows 2 days per week from home with manager approval",
    pageNumber: 1,
    sectionTitle: "Remote Work",
    classification: "internal",
    category: "policies",
    department: "hr",
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.tenantA,
    documentId: DOCUMENTS.doc2,
    documentVersionId: VERSIONS.doc2_v1,
    chunkIndex: 2,
    text:
      "Overtime compensation: 1.5x base rate for extra hours beyond 40 hours per week",
    pageNumber: 2,
    sectionTitle: "Overtime",
    classification: "internal",
    category: "policies",
    department: "hr",
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.tenantA,
    documentId: DOCUMENTS.doc2,
    documentVersionId: VERSIONS.doc2_v1,
    chunkIndex: 3,
    text:
      "Employee grievance procedure: submit written complaint to HR within 5 business days",
    pageNumber: 2,
    sectionTitle: "Grievance",
    classification: "internal",
    category: "policies",
    department: "hr",
    allowAiUse: true,
  },

  // ---- Doc 6: Data Security Policy (670000000000000000000012) ----
  // Version 1 (only version — latest)
  {
    tenantId: TENANTS.tenantA,
    documentId: DOCUMENTS.doc6,
    documentVersionId: VERSIONS.doc6_v1,
    chunkIndex: 0,
    text:
      "Data security policy: all sensitive data must be encrypted at rest and in transit",
    pageNumber: 1,
    sectionTitle: "Encryption",
    classification: "confidential",
    category: "policies",
    department: "it",
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.tenantA,
    documentId: DOCUMENTS.doc6,
    documentVersionId: VERSIONS.doc6_v1,
    chunkIndex: 1,
    text:
      "Password requirements: minimum 12 characters with complexity requirements",
    pageNumber: 2,
    sectionTitle: "Passwords",
    classification: "internal",
    category: "policies",
    department: "it",
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.tenantA,
    documentId: DOCUMENTS.doc6,
    documentVersionId: VERSIONS.doc6_v1,
    chunkIndex: 2,
    text:
      "Incident reporting: security breaches must be reported within 1 hour to IT security team",
    pageNumber: 3,
    sectionTitle: "Incidents",
    classification: "internal",
    category: "policies",
    department: "it",
    allowAiUse: true,
  },

  // =========================================================================
  // TENANT B  —  670000000000000000000002
  // =========================================================================

  // ---- Doc 3: عقد عمل — Employment Contract Arabic (670000000000000000000020) ----
  // Version 1 (only version — latest)
  {
    tenantId: TENANTS.tenantB,
    documentId: DOCUMENTS.doc3,
    documentVersionId: VERSIONS.doc3_v1,
    chunkIndex: 0,
    text:
      "عقد عمل بين الشركة والموظف يحدد راتب شهري 8000 ريال سعودي",
    pageNumber: 1,
    sectionTitle: "الشروط الأساسية",
    classification: "internal",
    category: "contracts",
    department: "legal",
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.tenantB,
    documentId: DOCUMENTS.doc3,
    documentVersionId: VERSIONS.doc3_v1,
    chunkIndex: 1,
    text:
      "يشمل العقد تأمين صحي و30 يوم إجازة سنوية ومكافأة نهاية الخدمة",
    pageNumber: 2,
    sectionTitle: "المزايا",
    classification: "internal",
    category: "contracts",
    department: "legal",
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.tenantB,
    documentId: DOCUMENTS.doc3,
    documentVersionId: VERSIONS.doc3_v1,
    chunkIndex: 2,
    text: "مدة العقد: سنة قابلة للتجديد باتفاق الطرفين",
    pageNumber: 2,
    sectionTitle: "مدة العقد",
    classification: "internal",
    category: "contracts",
    department: "legal",
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.tenantB,
    documentId: DOCUMENTS.doc3,
    documentVersionId: VERSIONS.doc3_v1,
    chunkIndex: 3,
    text: "ساعات العمل: 40 ساعة أسبوعياً من الأحد إلى الخميس",
    pageNumber: 3,
    sectionTitle: "ساعات العمل",
    classification: "internal",
    category: "contracts",
    department: "legal",
    allowAiUse: true,
  },

  // ---- Doc 4: Financial Report (670000000000000000000021) ----
  // Version 1 (old — should be excluded by version filter)
  {
    tenantId: TENANTS.tenantB,
    documentId: DOCUMENTS.doc4,
    documentVersionId: VERSIONS.doc4_v1,
    chunkIndex: 0,
    text: "Q1-Q2 financial summary: total revenue 4.2 million SAR",
    pageNumber: 1,
    sectionTitle: "Summary",
    classification: "confidential",
    category: "reports",
    department: "finance",
    allowAiUse: false,
  },
  {
    tenantId: TENANTS.tenantB,
    documentId: DOCUMENTS.doc4,
    documentVersionId: VERSIONS.doc4_v1,
    chunkIndex: 1,
    text:
      "Preliminary budget allocation for next fiscal year under review",
    pageNumber: 2,
    sectionTitle: "Budget",
    classification: "restricted",
    category: "reports",
    department: "finance",
    allowAiUse: true,
  },
  // Version 2 (latest)
  {
    tenantId: TENANTS.tenantB,
    documentId: DOCUMENTS.doc4,
    documentVersionId: VERSIONS.doc4_v2,
    chunkIndex: 0,
    text:
      "Q3 revenue reached 2.5 million SAR with 15% growth year-over-year",
    pageNumber: 1,
    sectionTitle: "Revenue",
    classification: "confidential",
    category: "reports",
    department: "finance",
    allowAiUse: false,
  },
  {
    tenantId: TENANTS.tenantB,
    documentId: DOCUMENTS.doc4,
    documentVersionId: VERSIONS.doc4_v2,
    chunkIndex: 1,
    text:
      "Operating expenses were 1.2 million SAR including personnel costs of 800K",
    pageNumber: 2,
    sectionTitle: "Expenses",
    classification: "restricted",
    category: "reports",
    department: "finance",
    allowAiUse: true,
  },

  // ---- Doc 7: Customer Service Guidelines (670000000000000000000022) ----
  // Version 1 (only version — latest)
  {
    tenantId: TENANTS.tenantB,
    documentId: DOCUMENTS.doc7,
    documentVersionId: VERSIONS.doc7_v1,
    chunkIndex: 0,
    text:
      "Customer service response time: respond within 4 hours for standard inquiries",
    pageNumber: 1,
    sectionTitle: "Response Time",
    classification: "public",
    category: "guidelines",
    department: "support",
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.tenantB,
    documentId: DOCUMENTS.doc7,
    documentVersionId: VERSIONS.doc7_v1,
    chunkIndex: 1,
    text:
      "Returns and refunds policy: 30-day return window with original receipt",
    pageNumber: 2,
    sectionTitle: "Returns",
    classification: "internal",
    category: "guidelines",
    department: "support",
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.tenantB,
    documentId: DOCUMENTS.doc7,
    documentVersionId: VERSIONS.doc7_v1,
    chunkIndex: 2,
    text:
      "Customer complaint escalation: unresolved issues escalate to supervisor within 24 hours",
    pageNumber: 2,
    sectionTitle: "Escalation",
    classification: "internal",
    category: "guidelines",
    department: "support",
    allowAiUse: true,
  },

  // =========================================================================
  // PLATFORM  —  670000000000000000000003
  // =========================================================================

  // ---- Doc 5: Platform Terms (670000000000000000000030) ----
  // Version 1 (only version — latest)
  {
    tenantId: TENANTS.platform,
    documentId: DOCUMENTS.doc5,
    documentVersionId: VERSIONS.doc5_v1,
    chunkIndex: 0,
    text:
      "Platform usage terms require compliance with data protection regulations",
    pageNumber: 1,
    sectionTitle: "Terms of Use",
    classification: "public",
    category: "legal",
    department: null,
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.platform,
    documentId: DOCUMENTS.doc5,
    documentVersionId: VERSIONS.doc5_v1,
    chunkIndex: 1,
    text:
      "All users must authenticate via SSO and comply with tenant isolation policies",
    pageNumber: 1,
    sectionTitle: "Security",
    classification: "internal",
    category: "legal",
    department: null,
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.platform,
    documentId: DOCUMENTS.doc5,
    documentVersionId: VERSIONS.doc5_v1,
    chunkIndex: 2,
    text:
      "Platform SLA guarantees 99.9% uptime with scheduled maintenance windows",
    pageNumber: 2,
    sectionTitle: "SLA",
    classification: "public",
    category: "legal",
    department: null,
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.platform,
    documentId: DOCUMENTS.doc5,
    documentVersionId: VERSIONS.doc5_v1,
    chunkIndex: 3,
    text:
      "Data retention policy: customer data retained for 90 days after account termination",
    pageNumber: 2,
    sectionTitle: "Data Retention",
    classification: "public",
    category: "legal",
    department: null,
    allowAiUse: true,
  },

  // ---- Doc 8: Infrastructure Overview (670000000000000000000031) ----
  // Version 1 (only version — latest)
  {
    tenantId: TENANTS.platform,
    documentId: DOCUMENTS.doc8,
    documentVersionId: VERSIONS.doc8_v1,
    chunkIndex: 0,
    text:
      "Infrastructure runs on Kubernetes cluster with auto-scaling across 3 availability zones",
    pageNumber: 1,
    sectionTitle: "Architecture",
    classification: "internal",
    category: "operations",
    department: null,
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.platform,
    documentId: DOCUMENTS.doc8,
    documentVersionId: VERSIONS.doc8_v1,
    chunkIndex: 1,
    text:
      "Database backups run daily with 30-day retention and cross-region replication",
    pageNumber: 1,
    sectionTitle: "Backups",
    classification: "confidential",
    category: "operations",
    department: null,
    allowAiUse: true,
  },
  {
    tenantId: TENANTS.platform,
    documentId: DOCUMENTS.doc8,
    documentVersionId: VERSIONS.doc8_v1,
    chunkIndex: 2,
    text:
      "Monitoring stack: Prometheus metrics collection with 15-second scrape interval",
    pageNumber: 2,
    sectionTitle: "Monitoring",
    classification: "internal",
    category: "operations",
    department: null,
    allowAiUse: true,
  },
];

// ---------------------------------------------------------------------------
// Document metadata for DocumentModel seeding
// ---------------------------------------------------------------------------

interface DocInput {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  fileName: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  checksum: string;
  status: "uploaded";
  metadata: { title: string; description: string; tags: string[] };
  category: string | null;
  department: string | null;
  classification: ChunkClassification;
  owner: null;
  effectiveDate: null;
  expiryDate: null;
  version: number;
  versionLabel: string;
  isArchived: boolean;
  archivedAt: null;
  archivedBy: null;
  deletedAt: null;
  deletedBy: null;
  quarantineStatus: "none";
  scanResult: null;
  uploadedBy: mongoose.Types.ObjectId;
}

const FIXTURE_DOCS: DocInput[] = [
  {
    _id: DOCUMENTS.doc1,
    tenantId: TENANTS.tenantA,
    fileName: "employment-contract.pdf",
    originalFileName: "Employment Contract.pdf",
    fileSize: 120_000,
    mimeType: "application/pdf",
    storageKey: "670000000000000000000001/employment-contract.pdf",
    checksum: "abc1111111111111111111111111111111111111111111111111111111111111111",
    status: "uploaded",
    metadata: { title: "Employment Contract", description: "Employee contract with salary and benefits", tags: ["hr", "contract"] },
    category: "contracts",
    department: "hr",
    classification: "confidential",
    owner: null,
    effectiveDate: null,
    expiryDate: null,
    version: 2,
    versionLabel: "v2",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    deletedAt: null,
    deletedBy: null,
    quarantineStatus: "none",
    scanResult: null,
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f0"),
  },
  {
    _id: DOCUMENTS.doc2,
    tenantId: TENANTS.tenantA,
    fileName: "hr-policy.pdf",
    originalFileName: "HR Policy.pdf",
    fileSize: 85_000,
    mimeType: "application/pdf",
    storageKey: "670000000000000000000001/hr-policy.pdf",
    checksum: "abc2222222222222222222222222222222222222222222222222222222222222222",
    status: "uploaded",
    metadata: { title: "HR Policy", description: "Company HR policies and procedures", tags: ["hr", "policy"] },
    category: "policies",
    department: "hr",
    classification: "internal",
    owner: null,
    effectiveDate: null,
    expiryDate: null,
    version: 1,
    versionLabel: "v1",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    deletedAt: null,
    deletedBy: null,
    quarantineStatus: "none",
    scanResult: null,
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f0"),
  },
  {
    _id: DOCUMENTS.doc6,
    tenantId: TENANTS.tenantA,
    fileName: "data-security-policy.pdf",
    originalFileName: "Data Security Policy.pdf",
    fileSize: 95_000,
    mimeType: "application/pdf",
    storageKey: "670000000000000000000001/data-security-policy.pdf",
    checksum: "abc6666666666666666666666666666666666666666666666666666666666666666",
    status: "uploaded",
    metadata: { title: "Data Security Policy", description: "IT security and data protection policies", tags: ["it", "security"] },
    category: "policies",
    department: "it",
    classification: "confidential",
    owner: null,
    effectiveDate: null,
    expiryDate: null,
    version: 1,
    versionLabel: "v1",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    deletedAt: null,
    deletedBy: null,
    quarantineStatus: "none",
    scanResult: null,
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f0"),
  },
  {
    _id: DOCUMENTS.doc3,
    tenantId: TENANTS.tenantB,
    fileName: "employment-contract-ar.pdf",
    originalFileName: "عقد عمل.pdf",
    fileSize: 110_000,
    mimeType: "application/pdf",
    storageKey: "670000000000000000000002/employment-contract-ar.pdf",
    checksum: "abc3333333333333333333333333333333333333333333333333333333333333333",
    status: "uploaded",
    metadata: { title: "عقد عمل", description: "عقد عمل بين الشركة والموظف", tags: ["legal", "contract"] },
    category: "contracts",
    department: "legal",
    classification: "internal",
    owner: null,
    effectiveDate: null,
    expiryDate: null,
    version: 1,
    versionLabel: "v1",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    deletedAt: null,
    deletedBy: null,
    quarantineStatus: "none",
    scanResult: null,
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f1"),
  },
  {
    _id: DOCUMENTS.doc4,
    tenantId: TENANTS.tenantB,
    fileName: "financial-report-q3.pdf",
    originalFileName: "Financial Report Q3.pdf",
    fileSize: 200_000,
    mimeType: "application/pdf",
    storageKey: "670000000000000000000002/financial-report-q3.pdf",
    checksum: "abc4444444444444444444444444444444444444444444444444444444444444444",
    status: "uploaded",
    metadata: { title: "Financial Report", description: "Q3 financial results", tags: ["finance", "report"] },
    category: "reports",
    department: "finance",
    classification: "restricted",
    owner: null,
    effectiveDate: null,
    expiryDate: null,
    version: 2,
    versionLabel: "v2",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    deletedAt: null,
    deletedBy: null,
    quarantineStatus: "none",
    scanResult: null,
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f1"),
  },
  {
    _id: DOCUMENTS.doc7,
    tenantId: TENANTS.tenantB,
    fileName: "customer-service-guidelines.pdf",
    originalFileName: "Customer Service Guidelines.pdf",
    fileSize: 75_000,
    mimeType: "application/pdf",
    storageKey: "670000000000000000000002/customer-service-guidelines.pdf",
    checksum: "abc7777777777777777777777777777777777777777777777777777777777777777",
    status: "uploaded",
    metadata: { title: "Customer Service Guidelines", description: "Support team procedures", tags: ["support", "guidelines"] },
    category: "guidelines",
    department: "support",
    classification: "internal",
    owner: null,
    effectiveDate: null,
    expiryDate: null,
    version: 1,
    versionLabel: "v1",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    deletedAt: null,
    deletedBy: null,
    quarantineStatus: "none",
    scanResult: null,
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f1"),
  },
  {
    _id: DOCUMENTS.doc5,
    tenantId: TENANTS.platform,
    fileName: "platform-terms.pdf",
    originalFileName: "Platform Terms.pdf",
    fileSize: 50_000,
    mimeType: "application/pdf",
    storageKey: "670000000000000000000003/platform-terms.pdf",
    checksum: "abc5555555555555555555555555555555555555555555555555555555555555555",
    status: "uploaded",
    metadata: { title: "Platform Terms", description: "Terms of service for platform users", tags: ["legal", "platform"] },
    category: "legal",
    department: null,
    classification: "public",
    owner: null,
    effectiveDate: null,
    expiryDate: null,
    version: 1,
    versionLabel: "v1",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    deletedAt: null,
    deletedBy: null,
    quarantineStatus: "none",
    scanResult: null,
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f2"),
  },
  {
    _id: DOCUMENTS.doc8,
    tenantId: TENANTS.platform,
    fileName: "infrastructure-overview.pdf",
    originalFileName: "Infrastructure Overview.pdf",
    fileSize: 150_000,
    mimeType: "application/pdf",
    storageKey: "670000000000000000000003/infrastructure-overview.pdf",
    checksum: "abc8888888888888888888888888888888888888888888888888888888888888888",
    status: "uploaded",
    metadata: { title: "Infrastructure Overview", description: "System architecture and operations", tags: ["ops", "infrastructure"] },
    category: "operations",
    department: null,
    classification: "internal",
    owner: null,
    effectiveDate: null,
    expiryDate: null,
    version: 1,
    versionLabel: "v1",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    deletedAt: null,
    deletedBy: null,
    quarantineStatus: "none",
    scanResult: null,
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f2"),
  },
];

// ---------------------------------------------------------------------------
// Version metadata for DocumentVersionModel seeding
// ---------------------------------------------------------------------------

interface VersionInput {
  _id: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  version: number;
  versionLabel: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  storageKey: string;
  uploadedBy: mongoose.Types.ObjectId;
  uploadReason: "initial" | "replace" | "restore";
  changeDescription: string | null;
}

const FIXTURE_VERSIONS: VersionInput[] = [
  // Doc 1 v1 (old)
  {
    _id: VERSIONS.doc1_v1,
    documentId: DOCUMENTS.doc1,
    tenantId: TENANTS.tenantA,
    version: 1,
    versionLabel: "v1",
    fileName: "employment-contract-v1.pdf",
    fileSize: 100_000,
    mimeType: "application/pdf",
    checksum: "old1111111111111111111111111111111111111111111111111111111111111111",
    storageKey: "670000000000000000000001/employment-contract-v1.pdf",
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f0"),
    uploadReason: "initial",
    changeDescription: null,
  },
  // Doc 1 v2 (latest)
  {
    _id: VERSIONS.doc1_v2,
    documentId: DOCUMENTS.doc1,
    tenantId: TENANTS.tenantA,
    version: 2,
    versionLabel: "v2",
    fileName: "employment-contract-v2.pdf",
    fileSize: 120_000,
    mimeType: "application/pdf",
    checksum: "abc1111111111111111111111111111111111111111111111111111111111111111",
    storageKey: "670000000000000000000001/employment-contract-v2.pdf",
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f0"),
    uploadReason: "replace",
    changeDescription: "Updated salary terms",
  },
  // Doc 2 v1 (only)
  {
    _id: VERSIONS.doc2_v1,
    documentId: DOCUMENTS.doc2,
    tenantId: TENANTS.tenantA,
    version: 1,
    versionLabel: "v1",
    fileName: "hr-policy-v1.pdf",
    fileSize: 85_000,
    mimeType: "application/pdf",
    checksum: "abc2222222222222222222222222222222222222222222222222222222222222222",
    storageKey: "670000000000000000000001/hr-policy-v1.pdf",
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f0"),
    uploadReason: "initial",
    changeDescription: null,
  },
  // Doc 6 v1 (only)
  {
    _id: VERSIONS.doc6_v1,
    documentId: DOCUMENTS.doc6,
    tenantId: TENANTS.tenantA,
    version: 1,
    versionLabel: "v1",
    fileName: "data-security-policy-v1.pdf",
    fileSize: 95_000,
    mimeType: "application/pdf",
    checksum: "abc6666666666666666666666666666666666666666666666666666666666666666",
    storageKey: "670000000000000000000001/data-security-policy-v1.pdf",
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f0"),
    uploadReason: "initial",
    changeDescription: null,
  },
  // Doc 3 v1 (only)
  {
    _id: VERSIONS.doc3_v1,
    documentId: DOCUMENTS.doc3,
    tenantId: TENANTS.tenantB,
    version: 1,
    versionLabel: "v1",
    fileName: "employment-contract-ar-v1.pdf",
    fileSize: 110_000,
    mimeType: "application/pdf",
    checksum: "abc3333333333333333333333333333333333333333333333333333333333333333",
    storageKey: "670000000000000000000002/employment-contract-ar-v1.pdf",
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f1"),
    uploadReason: "initial",
    changeDescription: null,
  },
  // Doc 4 v1 (old)
  {
    _id: VERSIONS.doc4_v1,
    documentId: DOCUMENTS.doc4,
    tenantId: TENANTS.tenantB,
    version: 1,
    versionLabel: "v1",
    fileName: "financial-report-v1.pdf",
    fileSize: 150_000,
    mimeType: "application/pdf",
    checksum: "old4444444444444444444444444444444444444444444444444444444444444444",
    storageKey: "670000000000000000000002/financial-report-v1.pdf",
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f1"),
    uploadReason: "initial",
    changeDescription: null,
  },
  // Doc 4 v2 (latest)
  {
    _id: VERSIONS.doc4_v2,
    documentId: DOCUMENTS.doc4,
    tenantId: TENANTS.tenantB,
    version: 2,
    versionLabel: "v2",
    fileName: "financial-report-v2.pdf",
    fileSize: 200_000,
    mimeType: "application/pdf",
    checksum: "abc4444444444444444444444444444444444444444444444444444444444444444",
    storageKey: "670000000000000000000002/financial-report-v2.pdf",
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f1"),
    uploadReason: "replace",
    changeDescription: "Updated Q3 figures",
  },
  // Doc 7 v1 (only)
  {
    _id: VERSIONS.doc7_v1,
    documentId: DOCUMENTS.doc7,
    tenantId: TENANTS.tenantB,
    version: 1,
    versionLabel: "v1",
    fileName: "customer-service-guidelines-v1.pdf",
    fileSize: 75_000,
    mimeType: "application/pdf",
    checksum: "abc7777777777777777777777777777777777777777777777777777777777777777",
    storageKey: "670000000000000000000002/customer-service-guidelines-v1.pdf",
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f1"),
    uploadReason: "initial",
    changeDescription: null,
  },
  // Doc 5 v1 (only)
  {
    _id: VERSIONS.doc5_v1,
    documentId: DOCUMENTS.doc5,
    tenantId: TENANTS.platform,
    version: 1,
    versionLabel: "v1",
    fileName: "platform-terms-v1.pdf",
    fileSize: 50_000,
    mimeType: "application/pdf",
    checksum: "abc5555555555555555555555555555555555555555555555555555555555555555",
    storageKey: "670000000000000000000003/platform-terms-v1.pdf",
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f2"),
    uploadReason: "initial",
    changeDescription: null,
  },
  // Doc 8 v1 (only)
  {
    _id: VERSIONS.doc8_v1,
    documentId: DOCUMENTS.doc8,
    tenantId: TENANTS.platform,
    version: 1,
    versionLabel: "v1",
    fileName: "infrastructure-overview-v1.pdf",
    fileSize: 150_000,
    mimeType: "application/pdf",
    checksum: "abc8888888888888888888888888888888888888888888888888888888888888888",
    storageKey: "670000000000000000000003/infrastructure-overview-v1.pdf",
    uploadedBy: new mongoose.Types.ObjectId("6700000000000000000000f2"),
    uploadReason: "initial",
    changeDescription: null,
  },
];

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

function matchesContext(
  chunk: ChunkInput,
  context?: { tenantId?: string; documentId?: string; versionId?: string },
): boolean {
  if (!context) return true;
  if (context.tenantId && chunk.tenantId.toString() !== context.tenantId) return false;
  if (context.documentId && chunk.documentId.toString() !== context.documentId) return false;
  if (context.versionId && chunk.documentVersionId.toString() !== context.versionId) return false;
  return true;
}

function docMatchesContext(
  doc: DocInput,
  context?: { tenantId?: string; documentId?: string; versionId?: string },
): boolean {
  if (!context) return true;
  if (context.tenantId && doc.tenantId.toString() !== context.tenantId) return false;
  if (context.documentId && doc._id.toString() !== context.documentId) return false;
  // For versionId context, include the document if it has a matching version
  if (context.versionId) {
    return FIXTURE_VERSIONS.some(
      (v) =>
        v._id.toString() === context.versionId &&
        v.documentId.toString() === doc._id.toString(),
    );
  }
  return true;
}

function versionMatchesContext(
  ver: VersionInput,
  context?: { tenantId?: string; documentId?: string; versionId?: string },
): boolean {
  if (!context) return true;
  if (context.tenantId && ver.tenantId.toString() !== context.tenantId) return false;
  if (context.documentId && ver.documentId.toString() !== context.documentId) return false;
  if (context.versionId && ver._id.toString() !== context.versionId) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seeds deterministic fixture data into the currently-connected MongoDB
 * (expected to be a `MongoMemoryServer` instance managed by the caller).
 *
 * Inserts documents, versions, and document chunks into their respective
 * collections. The caller is responsible for:
 *   1. Starting a `MongoMemoryServer` and connecting with `mongoose.connect()`
 *   2. Calling this function
 *   3. Using the returned chunk references in tests
 *   4. Cleaning up with `mongoose.disconnect()` and `mongoServer.stop()`
 *
 * @param context - Optional filter to seed only a subset of fixtures.
 *   - `tenantId`:   seed only this tenant's data
 *   - `documentId`: seed only this document (and its versions/chunks)
 *   - `versionId`:  seed only this version's chunks
 * @returns The inserted `DocumentChunkDocument` array (hydrated Mongoose docs
 *   with real `_id` values).
 */
export async function seedRetrievalFixtures(
  context?: { tenantId?: string; documentId?: string; versionId?: string },
): Promise<{ chunks: DocumentChunkDocument[] }> {
  // Determine which objects to insert
  const docsToInsert = FIXTURE_DOCS.filter((d) => docMatchesContext(d, context));
  const versionsToInsert = FIXTURE_VERSIONS.filter((v) =>
    versionMatchesContext(v, context),
  );
  const chunksToInsert = FIXTURE_CHUNKS.filter((c) =>
    matchesContext(c, context),
  );

  // Delete existing data for the affected tenants to keep tests hermetic
  const tenantIds = new Set<string>();
  for (const doc of docsToInsert) tenantIds.add(doc.tenantId.toString());
  for (const chunk of chunksToInsert) tenantIds.add(chunk.tenantId.toString());

  if (tenantIds.size > 0) {
    const tenantObjectIds = [...tenantIds].map((id) => new mongoose.Types.ObjectId(id));

    // Only delete what we are about to re-seed
    if (docsToInsert.length > 0) {
      await DocumentModel.deleteMany({ tenantId: { $in: tenantObjectIds } });
    }
    if (versionsToInsert.length > 0) {
      await DocumentVersionModel.deleteMany({ tenantId: { $in: tenantObjectIds } });
    }
    if (chunksToInsert.length > 0) {
      await DocumentChunkModel.deleteMany({ tenantId: { $in: tenantObjectIds } });
    }
  }

  // Insert in dependency order (documents → versions → chunks)
  if (docsToInsert.length > 0) {
    await DocumentModel.insertMany(docsToInsert);
  }
  if (versionsToInsert.length > 0) {
    await DocumentVersionModel.insertMany(versionsToInsert);
  }

  // Build chunk documents with deterministic vectors and createdAt
  const chunkDocs = chunksToInsert.map((c) => ({
    ...c,
    vector: generateDeterministicVector(c.text),
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
  }));

  const chunks = await DocumentChunkModel.insertMany(chunkDocs);

  return { chunks };
}

/**
 * Converts hydrated `DocumentChunkDocument` objects into the shape expected
 * by fake vector and keyword adapters during retrieval tests.
 *
 * This is useful for unit-testing the retrieval service / fusion engine
 * without touching the database (just pass the output to a mock repository).
 *
 * @param chunks - The chunk documents to convert (e.g. from `seedRetrievalFixtures`)
 * @returns Object with `vectorData` and `keywordData` arrays, each containing
 *   the chunk's ID, content, and metadata for the respective adapter.
 */
export function createFakeAdapterData(
  chunks: DocumentChunkDocument[],
): {
  vectorData: {
    chunkId: string;
    vector: number[];
    metadata: Record<string, unknown>;
  }[];
  keywordData: {
    chunkId: string;
    text: string;
    metadata: Record<string, unknown>;
  }[];
} {
  const vectorData: {
    chunkId: string;
    vector: number[];
    metadata: Record<string, unknown>;
  }[] = [];

  const keywordData: {
    chunkId: string;
    text: string;
    metadata: Record<string, unknown>;
  }[] = [];

  for (const chunk of chunks) {
    const chunkId = chunk._id.toString();
    const metadata: Record<string, unknown> = {
      tenantId: chunk.tenantId.toString(),
      documentId: chunk.documentId.toString(),
      documentVersionId: chunk.documentVersionId.toString(),
      classification: chunk.classification,
      department: chunk.department,
      category: chunk.category,
      allowAiUse: chunk.allowAiUse,
      pageNumber: chunk.pageNumber,
      sectionTitle: chunk.sectionTitle,
      chunkIndex: chunk.chunkIndex,
    };

    vectorData.push({
      chunkId,
      vector: generateDeterministicVector(chunk.text),
      metadata,
    });

    keywordData.push({
      chunkId,
      text: chunk.text,
      metadata,
    });
  }

  return { vectorData, keywordData };
}
