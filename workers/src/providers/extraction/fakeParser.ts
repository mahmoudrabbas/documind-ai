import type { ExtractionInput, ExtractionOutput } from "../../contracts/extractionContract.js";
import type { ExtractionParser } from "./extractionPort.js";

export class FakeParser implements ExtractionParser {
  readonly supportedMimeTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];

  async parse(input: ExtractionInput): Promise<ExtractionOutput> {
    const filename = input.fileName.toLowerCase();

    if (filename.includes("encrypted") || filename.includes("password")) {
      throw new Error("encrypted");
    }

    if (filename.includes("malformed") || filename.includes("corrupt")) {
      throw new Error("Malformed PDF file or invalid structure");
    }

    if (filename.includes("bilingual")) {
      return {
        pages: [
          {
            pageNumber: 1,
            blocks: [
              {
                type: "heading",
                text: "Employment Contract / عقد عمل",
                level: 1,
              },
              {
                type: "paragraph",
                text: "This agreement is entered into between... / تم الاتفاق على هذا العقد بين...",
              },
            ],
          },
        ],
        metadata: {
          totalPages: 1,
          totalCharacters: 80,
          detectedLanguages: ["en", "ar"],
          warnings: [],
          hasImageOnlyPages: false,
        },
        parserName: "fake-parser",
        parserVersion: "1.0.0-fake",
      };
    }

    if (filename.includes("tables")) {
      return {
        pages: [
          {
            pageNumber: 1,
            blocks: [
              {
                type: "heading",
                text: "Financial Summary",
                level: 1,
              },
              {
                type: "table",
                text: "Quarter | Revenue | Expenses\nQ1 | $10,000 | $5,000\nQ2 | $12,000 | $6,000",
              },
            ],
          },
        ],
        metadata: {
          totalPages: 1,
          totalCharacters: 70,
          detectedLanguages: ["en"],
          warnings: [],
          hasImageOnlyPages: false,
        },
        parserName: "fake-parser",
        parserVersion: "1.0.0-fake",
      };
    }

    if (filename.includes("image-only") || filename.includes("scanned")) {
      return {
        pages: [
          {
            pageNumber: 1,
            blocks: [
              {
                type: "paragraph",
                text: "[Image-Only Page Detected]",
              },
            ],
          },
        ],
        metadata: {
          totalPages: 1,
          totalCharacters: 26,
          detectedLanguages: [],
          warnings: ["Page 1 contains low text confidence. OCR recommended."],
          hasImageOnlyPages: true,
        },
        parserName: "fake-parser",
        parserVersion: "1.0.0-fake",
      };
    }

    // Default mock response
    return {
      pages: [
        {
          pageNumber: 1,
          blocks: [
            {
              type: "heading",
              text: "Mock Document Title",
              level: 1,
            },
            {
              type: "paragraph",
              text: `This is a mock extraction of document "${input.fileName}" for tenant "${input.tenantId}".`,
            },
          ],
        },
      ],
      metadata: {
        totalPages: 1,
        totalCharacters: 100,
        detectedLanguages: ["en"],
        warnings: [],
        hasImageOnlyPages: false,
      },
      parserName: "fake-parser",
      parserVersion: "1.0.0-fake",
    };
  }
}
