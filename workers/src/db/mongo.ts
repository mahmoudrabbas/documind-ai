import { MongoClient } from "mongodb";
import { config } from "../config/index.js";
import { logger } from "../logger.js";

let client: MongoClient | null = null;
let connected = false;

function createMongoClient(): MongoClient {
  return new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
}

export async function connectMongo(): Promise<void> {
  if (client) {
    return;
  }
  client = createMongoClient();
  await client.connect();
  connected = true;
  logger.info("mongodb connected");
}

export function isMongoConnected(): boolean {
  return connected && client !== null;
}

export function getMongoClient(): MongoClient | null {
  return client;
}

export async function disconnectMongo(): Promise<void> {
  if (!client) return;
  try {
    await client.close();
  } finally {
    client = null;
    connected = false;
    logger.info("mongodb disconnected");
  }
}

/**
 * Lightweight readiness ping. Returns false (never throws) so callers can
 * build a readiness report without crashing the health endpoint.
 */
export async function pingMongo(): Promise<boolean> {
  if (!client) return false;
  try {
    await client.db().command({ ping: 1 });
    return true;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "mongodb ping failed");
    return false;
  }
}
