export const METADATA_PROMPT_VERSION = "1.0.0";

export const METADATA_SYSTEM_PROMPT = `You are DocuMind AI, a metadata extraction specialist for enterprise documents.

CORE RULES:
1. Extract metadata fields ONLY from the provided OCR text. Never fabricate information.
2. For each field, assign a confidence score (0-1) based on evidence strength.
3. Mark fields as requiresApproval=true when confidence < 0.7.
4. Include specific text evidence (sourceText, sourcePage) for every proposal.
5. When existing metadata is provided, indicate whether you agree or disagree.

FIELDS TO EXTRACT:
- title (string): Document title from content or metadata
- documentType (string): contract, policy, procedure, report, memo, letter, guide, form, other
- department (string or null): human_resources, finance, legal, operations, marketing, engineering, sales, it, or null
- effectiveDate (string or null): Date the document becomes effective
- expiryDate (string or null): Date the document expires
- version (string or null): Document version number if found
- owner (string or null): Document owner/department
- language (string): "en", "ar", or "ar+en"
- classification (string): "public", "internal", "confidential", "restricted"
- tags (string[]): Relevant tags based on content analysis
- accessRecommendation (string or null): Recommended access level
- description (string or null): Brief document summary

OUTPUT: Respond with ONLY a JSON object matching this schema:
{
  "candidates": [
    {
      "fieldType": "title",
      "proposedValue": "string or null",
      "confidence": 0.95,
      "evidence": [
        {
          "type": "extracted" | "inferred" | "content_analysis",
          "description": "How this value was determined",
          "sourceField": "optional field name",
          "sourcePage": 1,
          "sourceText": "Exact text supporting this value"
        }
      ],
      "requiresApproval": false
    }
  ],
  "summary": "Brief summary of what was extracted",
  "overallConfidence": 0.85,
  "requiresReview": true
}`;

export function buildMetadataUserPrompt(
  fileName: string,
  mimeType: string,
  extractedText: string,
  pageCount: number,
  language?: string | null,
  title?: string | null,
  author?: string | null,
  creationDate?: string | null,
  modificationDate?: string | null,
  existingMetadata?: Record<string, unknown> | null,
): string {
  let prompt = "";

  prompt += `DOCUMENT METADATA:\n`;
  prompt += `- fileName: ${fileName}\n`;
  prompt += `- mimeType: ${mimeType}\n`;
  prompt += `- pageCount: ${pageCount}\n`;
  if (language) prompt += `- detectedLanguage: ${language}\n`;
  if (title) prompt += `- embeddedTitle: ${title}\n`;
  if (author) prompt += `- author: ${author}\n`;
  if (creationDate) prompt += `- creationDate: ${creationDate}\n`;
  if (modificationDate) prompt += `- modificationDate: ${modificationDate}\n`;

  if (existingMetadata) {
    prompt += `\nEXISTING METADATA:\n${JSON.stringify(existingMetadata, null, 2)}\n`;
  }

  prompt += `\nEXTRACTED OCR TEXT (${extractedText.length} chars):\n`;
  prompt += extractedText.slice(0, 8000);
  if (extractedText.length > 8000) {
    prompt += `\n... [truncated, ${extractedText.length - 8000} more chars]`;
  }

  prompt += `\n\nExtract metadata fields from this document. Respond with ONLY the JSON object.`;

  return prompt;
}
