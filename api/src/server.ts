import dotenv from "dotenv";
import app from "./app.js";
import { connectDB, disconnectDB, getDb } from "./db/connection.js";
import { connectRedis, disconnectRedis } from "./db/redis.js";
import { config } from "./config/index.js";
import { logger } from "./common/logger/logger.js";

dotenv.config();

const VECTOR_INDEX_NAME = "vidx_chunk_embeddings_v1";
const KEYWORD_INDEX_NAME = "kidx_chunk_text_v1";

async function ensureSearchIndexes(): Promise<void> {
  const db = getDb();
  if (!db) {
    logger.warn("Database not connected; skipping search index validation");
    return;
  }

  try {
    const chunkEmbeddings = db.collection("chunkembeddings");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (chunkEmbeddings as any).createSearchIndex({
      name: VECTOR_INDEX_NAME,
      type: "vectorSearch",
      definition: {
        fields: [
          { type: "vector", numDimensions: parseInt(process.env.AI_PROVIDER === "groq" ? (process.env.JINA_EMBEDDING_DIMENSIONS || "1024") : process.env.AI_PROVIDER === "student-bedrock" ? "1024" : (process.env.OPENAI_EMBEDDING_DIMENSIONS || "1536"), 10), path: "vector", similarity: "cosine" },
          { type: "filter", path: "tenantId" },
          { type: "filter", path: "documentId" },
          { type: "filter", path: "generationId" },
          { type: "filter", path: "department" },
          { type: "filter", path: "classification" },
          { type: "filter", path: "language" },
          { type: "filter", path: "contentType" },
        ],
      },
    });
    logger.info({ indexName: VECTOR_INDEX_NAME }, "Vector search index ensured");
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.message.includes("already exists")) {
      logger.info({ indexName: VECTOR_INDEX_NAME }, "Vector search index already exists");
    } else {
      logger.warn({ err, indexName: VECTOR_INDEX_NAME }, "Could not create vector search index (will retry on first indexing job)");
    }
  }

  try {
    const documentChunks = db.collection("documentchunks");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (documentChunks as any).createSearchIndex({
      name: KEYWORD_INDEX_NAME,
      type: "search",
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            text: { type: "string", analyzer: "luceneStandard" },
            tenantId: { type: "objectId" },
            documentId: { type: "objectId" },
            generationId: { type: "objectId" },
            classification: { type: "string", analyzer: "luceneStandard" },
            department: { type: "string", analyzer: "luceneStandard" },
            category: { type: "string", analyzer: "luceneStandard" },
          },
        },
      },
    });
    logger.info({ indexName: KEYWORD_INDEX_NAME }, "Keyword search index ensured");
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.message.includes("already exists")) {
      logger.info({ indexName: KEYWORD_INDEX_NAME }, "Keyword search index already exists");
    } else {
      logger.warn({ err, indexName: KEYWORD_INDEX_NAME }, "Could not create keyword search index (will retry on first indexing job)");
    }
  }

  try {
    const chunkEmbeddings = db.collection("chunkembeddings");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vectorIndexes = await (chunkEmbeddings as any).listSearchIndexes().toArray();
    const vectorReady = vectorIndexes.some(
      (idx: { name: string; status?: string }) => idx.name === VECTOR_INDEX_NAME && idx.status === "READY",
    );
    const documentChunks = db.collection("documentchunks");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keywordIndexes = await (documentChunks as any).listSearchIndexes().toArray();
    const keywordReady = keywordIndexes.some(
      (idx: { name: string; status?: string }) => idx.name === KEYWORD_INDEX_NAME && idx.status === "READY",
    );

    if (vectorReady && keywordReady) {
      logger.info("Atlas search indexes are READY");
    } else {
      logger.warn(
        { vectorReady, keywordReady },
        "Atlas search indexes not yet READY; service started in degraded mode — writes proceed but documents cannot become SEARCHABLE until indexes are READY",
      );
    }
  } catch {
    logger.warn("Could not verify Atlas search index status at startup");
  }
}

let shuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info({ signal }, "graceful shutdown started");

  await new Promise<void>((resolve) => {
    server.close(() => {
      logger.info("HTTP server closed");
      resolve();
    });
  });

  await Promise.allSettled([disconnectRedis(), disconnectDB()]);

  process.exit(0);
}

try {
  await connectDB();
  await connectRedis();
  await ensureSearchIndexes();
} catch (err) {
  logger.fatal({ err }, "API startup failed");
  process.exit(1);
}

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "API server started");
});

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});
