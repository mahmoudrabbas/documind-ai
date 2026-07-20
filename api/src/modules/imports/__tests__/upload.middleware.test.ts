import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { Router } from "express";
import multer from "multer";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Replicate the exact multer config from imports.routes.ts
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(
        Object.assign(new Error(`File type ${file.mimetype} is not supported`), {
          code: "UNSUPPORTED_FILE_TYPE",
        }) as Error & { code: string },
      );
    }
  },
});

// ---------------------------------------------------------------------------
// Test server
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  const router = Router();

  router.post("/test-upload", upload.single("file"), (req, res) => {
    if (!req.file) {
      res.status(400).json({ success: false, message: "No file uploaded" });
      return;
    }
    res.json({
      success: true,
      fileName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  });

  app.use(router);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status =
      err instanceof multer.MulterError
        ? 400
        : (err as { statusCode?: number })?.statusCode ?? 400;
    res.status(status).json({
      success: false,
      message: (err as Error)?.message ?? "Upload failed",
    });
  });
  return app;
}

function startServer(app: express.Express): Promise<Server> {
  return new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildXlsxBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["Name", "Email", "Department"]]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function bufferToBlob(buffer: Buffer, mimeType: string): Blob {
  return new Blob([new Uint8Array(buffer)], { type: mimeType });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Multer upload middleware (imports)", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    const app = buildApp();
    server = await startServer(app);
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await stopServer(server);
  });

  it("accepts .xlsx with correct MIME type → 200", async () => {
    const buffer = buildXlsxBuffer();
    const blob = bufferToBlob(
      buffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const fd = new FormData();
    fd.append("file", blob, "employees.xlsx");

    const res = await fetch(`http://127.0.0.1:${port}/test-upload`, {
      method: "POST",
      body: fd,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fileName).toBe("employees.xlsx");
    expect(body.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  it("accepts .csv with text/csv MIME type → 200", async () => {
    const blob = bufferToBlob(Buffer.from("a,b,c\n1,2,3"), "text/csv");
    const fd = new FormData();
    fd.append("file", blob, "employees.csv");

    const res = await fetch(`http://127.0.0.1:${port}/test-upload`, {
      method: "POST",
      body: fd,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fileName).toBe("employees.csv");
  });

  it("accepts .xls with application/vnd.ms-excel MIME → 200", async () => {
    const buffer = buildXlsxBuffer();
    const blob = bufferToBlob(buffer, "application/vnd.ms-excel");
    const fd = new FormData();
    fd.append("file", blob, "employees.xls");

    const res = await fetch(`http://127.0.0.1:${port}/test-upload`, {
      method: "POST",
      body: fd,
    });

    expect(res.status).toBe(200);
  });

  it("rejects PDF (unsupported MIME type) → 4xx", async () => {
    const blob = bufferToBlob(
      Buffer.from("fake pdf"),
      "application/pdf",
    );
    const fd = new FormData();
    fd.append("file", blob, "document.pdf");

    const res = await fetch(`http://127.0.0.1:${port}/test-upload`, {
      method: "POST",
      body: fd,
    });

    expect(res.status).toBe(400);
  });

  it("rejects image/png (unsupported MIME type) → 4xx", async () => {
    const blob = bufferToBlob(Buffer.from("fake png"), "image/png");
    const fd = new FormData();
    fd.append("file", blob, "photo.png");

    const res = await fetch(`http://127.0.0.1:${port}/test-upload`, {
      method: "POST",
      body: fd,
    });

    expect(res.status).toBe(400);
  });

  it("rejects file exceeding 5 MB size limit → 4xx", async () => {
    const large = Buffer.alloc(6 * 1024 * 1024);
    const blob = bufferToBlob(
      large,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const fd = new FormData();
    fd.append("file", blob, "too-large.xlsx");

    const res = await fetch(`http://127.0.0.1:${port}/test-upload`, {
      method: "POST",
      body: fd,
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when no file field is sent", async () => {
    const fd = new FormData();
    const res = await fetch(`http://127.0.0.1:${port}/test-upload`, {
      method: "POST",
      body: fd,
    });
    expect(res.status).toBe(400);
  });
});
