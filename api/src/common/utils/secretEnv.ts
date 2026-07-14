import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readOptionalSecretFile(key: string): string | undefined {
  const source = process.env[`${key}_FILE`];

  if (!source) {
    return undefined;
  }

  try {
    return readFileSync(resolve(source), "utf8").trim();
  } catch {
    return undefined;
  }
}

export function getSecretValue(
  key: string,
  fallback?: string,
): string | undefined {
  const fromFile = readOptionalSecretFile(key);
  if (fromFile !== undefined) {
    return fromFile;
  }

  const fromEnv = process.env[key];
  if (fromEnv !== undefined) {
    return fromEnv;
  }

  return fallback;
}
