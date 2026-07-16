import { readFileSync } from "node:fs";
import { resolve } from "node:path";
function readOptionalSecretFile(key, environment) {
    const source = environment[`${key}_FILE`];
    if (!source) {
        return undefined;
    }
    try {
        const value = readFileSync(resolve(source), "utf8").trim();
        if (!value)
            throw new Error("empty secret file");
        return value;
    }
    catch {
        throw new Error(`Unable to load configured secret: ${key}_FILE`);
    }
}
export function getSecretValue(key, fallback, environment = process.env) {
    const fromFile = readOptionalSecretFile(key, environment);
    if (fromFile !== undefined) {
        return fromFile;
    }
    const fromEnv = environment[key];
    if (fromEnv !== undefined) {
        return fromEnv;
    }
    return fallback;
}
//# sourceMappingURL=secretEnv.js.map