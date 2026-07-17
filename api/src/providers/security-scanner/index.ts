import type { SecurityScanner, ScanResult } from "../storage/types.js";

const MAGIC_BYTES: Record<string, Buffer[]> = {
  "application/pdf": [Buffer.from("%PDF")],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    Buffer.from("PK"),
  ],
  "application/msword": [Buffer.from("D0CF11E0")],
};

function isPrintableRatio(buf: Buffer): number {
  let printable = 0;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    if (
      byte === 9 ||
      byte === 10 ||
      byte === 13 ||
      (byte >= 32 && byte <= 126) ||
      byte >= 160
    ) {
      printable++;
    }
  }
  return buf.length > 0 ? printable / buf.length : 0;
}

export class LocalFileSignatureScanner implements SecurityScanner {
  async scan(buffer: Buffer, filename: string): Promise<ScanResult> {
    if (buffer.length === 0) {
      return { scanner: "local-signature", result: "clean" };
    }

    const ext = filename.substring(filename.lastIndexOf(".") + 1).toLowerCase();
    const textExtensions = ["txt", "md"];

    if (textExtensions.includes(ext)) {
      const ratio = isPrintableRatio(buffer.subarray(0, 512));
      if (ratio < 0.7) {
        return {
          scanner: "local-signature",
          result: "error",
          details: `Text file has low printable ratio: ${(ratio * 100).toFixed(1)}%`,
        };
      }
      return { scanner: "local-signature", result: "clean" };
    }

    const mimeGuess = this.guessMimeFromExt(ext);
    const expectedSignatures = MAGIC_BYTES[mimeGuess];

    if (!expectedSignatures) {
      return { scanner: "local-signature", result: "clean" };
    }

    for (const signature of expectedSignatures) {
      if (buffer.subarray(0, signature.length).equals(signature)) {
        return { scanner: "local-signature", result: "clean" };
      }
    }

    return {
      scanner: "local-signature",
      result: "error",
      details: `File signature does not match expected type for .${ext}`,
    };
  }

  private guessMimeFromExt(ext: string): string {
    const map: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc: "application/msword",
    };
    return map[ext] ?? "";
  }
}
