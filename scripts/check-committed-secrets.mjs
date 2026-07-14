import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FORBIDDEN_PATHS = [
  /(^|\/)\.env(?:\.|$)(?!example$)/i,
  /(^|\/)secrets\/(?!README\.md$|[^/]+\.example$)/i,
  /\.(?:pem|p12|pfx|key)$/i,
];

const CONTENT_RULES = [
  { name: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "github-token", pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { name: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "generic-secret-assignment", pattern: /(?:JWT_SECRET|JWT_REFRESH_SECRET|PASSWORD_RESET_JWT_SECRET|EMAIL_VERIFICATION_JWT_SECRET|SMTP_PASS|SUPER_ADMIN_BOOTSTRAP_KEY)\s*=\s*["']?(?!$|<|\{\{|your-|example|development-only|test-only|replace-me|CHANGE_ME)[^\s"']{16,}/m },
];

const TEXT_FILE_LIMIT = 1024 * 1024;
const CONTENT_EXCLUDED_PATHS = [/(^|\/)\.env\.example$/i, /\.test\.[cm]?[jt]sx?$/i];

export function scanTrackedFiles(root, trackedFiles) {
  const findings = [];

  for (const relativePath of trackedFiles) {
    if (FORBIDDEN_PATHS.some((pattern) => pattern.test(relativePath))) {
      findings.push({ path: relativePath, rule: "forbidden-secret-path" });
      continue;
    }

    if (relativePath.endsWith("package-lock.json") || CONTENT_EXCLUDED_PATHS.some((pattern) => pattern.test(relativePath))) continue;

    let content;
    try {
      const buffer = readFileSync(resolve(root, relativePath));
      if (buffer.length > TEXT_FILE_LIMIT || buffer.includes(0)) continue;
      content = buffer.toString("utf8");
    } catch { continue; }

    for (const rule of CONTENT_RULES) {
      if (rule.pattern.test(content)) findings.push({ path: relativePath, rule: rule.name });
    }
  }

  return findings;
}

export function trackedFiles(root) {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).split("\0").filter(Boolean);
}

function main() {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const findings = scanTrackedFiles(root, trackedFiles(root));
  if (findings.length) {
    console.error("Committed-secret check failed. Findings list paths and rule names only:");
    for (const finding of findings) console.error(`- ${finding.path}: ${finding.rule}`);
    process.exitCode = 1;
    return;
  }
  console.log("Committed-secret check passed: no forbidden tracked secret material detected.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
