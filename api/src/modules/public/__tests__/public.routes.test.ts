import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

process.env.NODE_ENV = "test";

import app from "../../../app.js";
import { connectDB, disconnectDB } from "../../../db/connection.js";
import { connectRedis, disconnectRedis } from "../../../db/redis.js";
import PackageModel from "../../../db/models/package.model.js";

function createServer() {
  return new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
}

function closeServer(server: ReturnType<typeof app.listen>) {
  return new Promise<void>((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

let server: ReturnType<typeof app.listen>;
let port: number;

before(async () => {
  await connectDB();
  await connectRedis();
  server = await createServer();
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  await closeServer(server);
  await disconnectRedis();
  await disconnectDB();
});

// ─── Seed helpers ────────────────────────────────────────────────────────────

interface SeedPackage {
  name: string;
  code: string;
  active: boolean;
  visibility: "public" | "internal";
  monthlyPrice: number;
  annualPrice: number;
  trialDays: number;
  entitlements: {
    employees: number;
    admins: number;
    documents: number;
    storageMb: number;
    fileSizeMb: number;
    queriesPerMonth: number;
    tokensPerMonth: number;
    ocrPagesPerMonth: number;
  };
}

async function seedPackages(...packages: SeedPackage[]) {
  await PackageModel.deleteMany({});
  await PackageModel.insertMany(
    packages.map((p) => ({
      ...p,
      version: 1,
      versions: [],
      currency: "USD",
      description: p.name,
      supportedModels: ["basic"],
      analyticsLevel: "basic",
      retentionDays: 90,
      supportLevel: "community",
    })),
  );
}

interface PublicPackageDTO {
  id: string;
  name: string;
  code: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  trialDays: number;
  entitlements: {
    employees: number;
    documents: number;
    storageMb: number;
    queriesPerMonth: number;
  };
  supportedModels: string[];
  analyticsLevel: string;
  supportLevel: string;
  retentionDays: number;
}

// ─── GET /public/packages ────────────────────────────────────────────────────

test("GET /public/packages returns 200 with empty array when no packages exist", async () => {
  await PackageModel.deleteMany({});

  const res = await fetch(`http://127.0.0.1:${port}/public/packages`);
  const body = (await res.json()) as { success: boolean; data: PublicPackageDTO[] };

  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.data, []);
});

test("GET /public/packages returns only active + public packages", async () => {
  await seedPackages(
    // Active + public → should be returned
    {
      name: "Free",
      code: "free",
      active: true,
      visibility: "public",
      monthlyPrice: 0,
      annualPrice: 0,
      trialDays: 0,
      entitlements: {
        employees: 5,
        admins: 1,
        documents: 100,
        storageMb: 500,
        fileSizeMb: 10,
        queriesPerMonth: 1000,
        tokensPerMonth: 50000,
        ocrPagesPerMonth: 100,
      },
    },
    // Active but internal → should NOT be returned
    {
      name: "Internal",
      code: "internal",
      active: true,
      visibility: "internal",
      monthlyPrice: 99,
      annualPrice: 999,
      trialDays: 0,
      entitlements: {
        employees: 999,
        admins: 10,
        documents: 99999,
        storageMb: 999999,
        fileSizeMb: 999,
        queriesPerMonth: 999999,
        tokensPerMonth: 9999999,
        ocrPagesPerMonth: 99999,
      },
    },
    // Inactive + public → should NOT be returned
    {
      name: "Retired",
      code: "retired",
      active: false,
      visibility: "public",
      monthlyPrice: 49,
      annualPrice: 490,
      trialDays: 14,
      entitlements: {
        employees: 25,
        admins: 3,
        documents: 1000,
        storageMb: 10240,
        fileSizeMb: 20,
        queriesPerMonth: 5000,
        tokensPerMonth: 100000,
        ocrPagesPerMonth: 500,
      },
    },
  );

  const res = await fetch(`http://127.0.0.1:${port}/public/packages`);
  const body = (await res.json()) as { success: boolean; data: PublicPackageDTO[] };

  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.length, 1, "should return exactly 1 package (active + public)");

  const pkg = body.data[0]!;
  assert.equal(pkg.name, "Free");
  assert.equal(pkg.code, "free");
});

test("GET /public/packages includes annualPrice, trialDays, currency", async () => {
  await seedPackages({
    name: "Pro",
    code: "pro",
    active: true,
    visibility: "public",
    monthlyPrice: 49,
    annualPrice: 490,
    trialDays: 14,
    entitlements: {
      employees: 25,
      admins: 3,
      documents: 1000,
      storageMb: 10240,
      fileSizeMb: 20,
      queriesPerMonth: 5000,
      tokensPerMonth: 100000,
      ocrPagesPerMonth: 500,
    },
  });

  const res = await fetch(`http://127.0.0.1:${port}/public/packages`);
  const body = (await res.json()) as { success: boolean; data: PublicPackageDTO[] };

  assert.equal(body.data.length, 1);
  const pkg = body.data[0]!;

  assert.equal(pkg.monthlyPrice, 49);
  assert.equal(pkg.annualPrice, 490);
  assert.equal(pkg.trialDays, 14);
  assert.equal(pkg.currency, "USD");
});

test("GET /public/packages returns sorted by monthlyPrice ascending", async () => {
  await seedPackages(
    {
      name: "Enterprise",
      code: "enterprise",
      active: true,
      visibility: "public",
      monthlyPrice: 199,
      annualPrice: 1990,
      trialDays: 30,
      entitlements: {
        employees: 100,
        admins: 10,
        documents: 10000,
        storageMb: 102400,
        fileSizeMb: 50,
        queriesPerMonth: 50000,
        tokensPerMonth: 1000000,
        ocrPagesPerMonth: 5000,
      },
    },
    {
      name: "Starter",
      code: "starter",
      active: true,
      visibility: "public",
      monthlyPrice: 0,
      annualPrice: 0,
      trialDays: 0,
      entitlements: {
        employees: 5,
        admins: 1,
        documents: 100,
        storageMb: 500,
        fileSizeMb: 10,
        queriesPerMonth: 1000,
        tokensPerMonth: 50000,
        ocrPagesPerMonth: 100,
      },
    },
    {
      name: "Pro",
      code: "pro",
      active: true,
      visibility: "public",
      monthlyPrice: 49,
      annualPrice: 490,
      trialDays: 14,
      entitlements: {
        employees: 25,
        admins: 3,
        documents: 1000,
        storageMb: 10240,
        fileSizeMb: 20,
        queriesPerMonth: 5000,
        tokensPerMonth: 100000,
        ocrPagesPerMonth: 500,
      },
    },
  );

  const res = await fetch(`http://127.0.0.1:${port}/public/packages`);
  const body = (await res.json()) as { success: boolean; data: PublicPackageDTO[] };

  assert.equal(body.data.length, 3);
  assert.equal(body.data[0]!.name, "Starter");
  assert.equal(body.data[1]!.name, "Pro");
  assert.equal(body.data[2]!.name, "Enterprise");
});

test("GET /public/packages returns only public-facing entitlement fields, excludes internal fields", async () => {
  await seedPackages({
    name: "Pro",
    code: "pro",
    active: true,
    visibility: "public",
    monthlyPrice: 49,
    annualPrice: 490,
    trialDays: 14,
    entitlements: {
      employees: 25,
      admins: 3,
      documents: 1000,
      storageMb: 10240,
      fileSizeMb: 20,
      queriesPerMonth: 5000,
      tokensPerMonth: 100000,
      ocrPagesPerMonth: 500,
    },
  });

  const res = await fetch(`http://127.0.0.1:${port}/public/packages`);
  const body = (await res.json()) as { success: boolean; data: PublicPackageDTO[] };

  const pkg = body.data[0]!;
  const raw = JSON.stringify(pkg);
  const entitlements = pkg.entitlements;

  // Public-facing fields MUST be present
  assert.equal(typeof entitlements.employees, "number");
  assert.equal(typeof entitlements.documents, "number");
  assert.equal(typeof entitlements.storageMb, "number");
  assert.equal(typeof entitlements.queriesPerMonth, "number");

  // Internal fields MUST NOT be exposed
  const entUnknown = entitlements as unknown as Record<string, unknown>;
  assert.equal(entUnknown.admins, undefined, "admins must not be in public DTO");
  assert.equal(entUnknown.fileSizeMb, undefined, "fileSizeMb must not be in public DTO");
  assert.equal(entUnknown.tokensPerMonth, undefined, "tokensPerMonth must not be in public DTO");
  assert.equal(entUnknown.ocrPagesPerMonth, undefined, "ocrPagesPerMonth must not be in public DTO");

  // Version history must not be exposed at top level
  const pkgUnknown = pkg as unknown as Record<string, unknown>;
  assert.equal(pkgUnknown.version, undefined, "version must not be in public DTO");
  assert.equal(pkgUnknown.versions, undefined, "versions array must not be in public DTO");
  assert.equal(pkgUnknown.active, undefined, "active flag must not be in public DTO");
  assert.equal(pkgUnknown.visibility, undefined, "visibility must not be in public DTO");

  // Must NOT leak internal fields anywhere in the response
  assert.equal(raw.includes("admins"), false, "JSON must not contain admins");
  assert.equal(raw.includes("fileSizeMb"), false, "JSON must not contain fileSizeMb");
  assert.equal(raw.includes("tokensPerMonth"), false, "JSON must not contain tokensPerMonth");
  assert.equal(raw.includes("ocrPagesPerMonth"), false, "JSON must not contain ocrPagesPerMonth");
});
