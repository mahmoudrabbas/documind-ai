import { Queue } from "bullmq";
import IORedis from "ioredis";
import { randomUUID } from "node:crypto";

const connection = new IORedis("redis://127.0.0.1:6379", { maxRetriesPerRequest: null });
const queue = new Queue("documind-jobs", { connection, defaultJobOptions: { attempts: 3 } });

const docId = "6a76789ba9310c6179f1a89c";
const tenantId = "6a50bd3909f18632ed601f96";
const actorId = "6a720d76c99afbbf5ce95b28";
const version = 1;
const checksum = "c68dcf7460a6011d27145053e563d855e00c97195991aa541c69aa1cd24ca1da";
const idempotencyKey = `ext-${docId}-${version}-${checksum}`;
const jobId = `document.extract__${idempotencyKey}`;

const envelope = {
  jobType: "document.extract",
  schemaVersion: "1.0.0",
  tenantId,
  actorId,
  traceId: randomUUID(),
  idempotencyKey,
  payload: { documentId: docId, tenantId, documentVersion: version },
  createdAt: new Date().toISOString(),
};

const job = await queue.add("document.extract", envelope, { jobId, removeOnComplete: 500, removeOnFail: 500 });
console.log("enqueued:", job.id);
await queue.close();
connection.disconnect();
