import "dotenv/config";
import mongoose from "mongoose";
import argon2 from "argon2";

const MONGODB_URI =
  process.env.MONGODB_URI ??
  "mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

interface TenantInput {
  name: string;
  slug: string;
  isSystemTenant?: boolean;
}

interface UserInput {
  name: string;
  email: string;
  password: string;
  role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE";
  employeeProfile?: {
    employeeId?: string;
    department?: string;
    jobTitle?: string;
  };
}

interface SeedTenant {
  tenant: TenantInput;
  users: UserInput[];
}

const SEED_DATA: SeedTenant[] = [
  {
    tenant: {
      name: "DocuMind AI",
      slug: "documind.ai",
      isSystemTenant: true,
    },
    users: [
      {
        name: "DocuMind Platform Admin",
        email: "superadmin@documind.ai",
        password: "DocuMind@2026",
        role: "SUPER_ADMIN",
      },
    ],
  },
  {
    tenant: {
      name: "ITI",
      slug: "iti",
    },
    users: [
      {
        name: "ITI Admin",
        email: "admin@iti.com",
        password: "Admin@123456",
        role: "COMPANY_ADMIN",
      },
      {
        name: "Ahmed Hassan",
        email: "ahmed@iti.com",
        password: "Employee@123456",
        role: "EMPLOYEE",
        employeeProfile: {
          employeeId: "EMP-ITI-001",
          department: "Engineering",
          jobTitle: "Software Engineer",
        },
      },
      {
        name: "Sara Mohamed",
        email: "sara@iti.com",
        password: "Employee@123456",
        role: "EMPLOYEE",
        employeeProfile: {
          employeeId: "EMP-ITI-002",
          department: "HR",
          jobTitle: "HR Specialist",
        },
      },
    ],
  },
  {
    tenant: {
      name: "Acme Corp",
      slug: "acme-corp",
    },
    users: [
      {
        name: "Acme Admin",
        email: "admin@acme.com",
        password: "Admin@123456",
        role: "COMPANY_ADMIN",
      },
      {
        name: "John Smith",
        email: "john@acme.com",
        password: "Employee@123456",
        role: "EMPLOYEE",
        employeeProfile: {
          employeeId: "EMP-ACME-001",
          department: "Finance",
          jobTitle: "Financial Analyst",
        },
      },
      {
        name: "Jane Doe",
        email: "jane@acme.com",
        password: "Employee@123456",
        role: "EMPLOYEE",
        employeeProfile: {
          employeeId: "EMP-ACME-002",
          department: "Marketing",
          jobTitle: "Marketing Manager",
        },
      },
    ],
  },
];

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db!;
  console.log("Connected.\n");

  const tenantsCol = db.collection("tenants");
  const usersCol = db.collection("users");
  const packagesCol = db.collection("packages");
  const subscriptionsCol = db.collection("subscriptions");

  // Ensure free package exists
  let freePackage = await packagesCol.findOne({ code: "free" });
  if (!freePackage) {
    const now = new Date();
    const result = await packagesCol.insertOne({
      name: "Free",
      code: "free",
      description: "Get started with basic document management",
      active: true,
      version: 1,
      monthlyPrice: 0,
      annualPrice: 0,
      currency: "USD",
      trialDays: 0,
      visibility: "public",
      entitlements: {
        employees: 3,
        admins: 1,
        documents: 50,
        storageMb: 100,
        fileSizeMb: 10,
        queriesPerMonth: 500,
        tokensPerMonth: 0,
        ocrPagesPerMonth: 0,
      },
      supportedModels: ["basic"],
      analyticsLevel: "basic",
      retentionDays: 90,
      supportLevel: "community",
      stripeProductId: "",
      stripePriceId: "",
      stripeAnnualPriceId: "",
      versions: [],
      createdAt: now,
      updatedAt: now,
    });
    freePackage = await packagesCol.findOne({ _id: result.insertedId });
    console.log("Created free package.");
  } else {
    console.log("Free package already exists.");
  }

  const results: Array<{
    tenant: string;
    slug: string;
    email: string;
    password: string;
    role: string;
  }> = [];

  for (const { tenant: tenantInput, users: userList } of SEED_DATA) {
    const now = new Date();

    // Upsert tenant
    const tenant = await tenantsCol.findOneAndUpdate(
      { slug: tenantInput.slug },
      {
        $set: {
          name: tenantInput.name,
          status: "active",
          plan: "free",
          isSystemTenant: tenantInput.isSystemTenant ?? false,
          updatedAt: now,
        },
        $setOnInsert: {
          slug: tenantInput.slug,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" }
    );
    console.log(`\nTenant: ${tenantInput.name} (${tenantInput.slug}) -> ${tenant!._id}`);

    // Create subscription for non-system tenants
    if (!tenantInput.isSystemTenant && freePackage) {
      await subscriptionsCol.updateOne(
        { tenantId: tenant!._id },
        {
          $setOnInsert: {
            tenantId: tenant!._id,
            packageId: freePackage._id,
            packageVersion: freePackage.version,
            status: "ACTIVE",
            startedAt: now,
            periodStart: now,
            periodEnd: null,
            trialStart: null,
            trialEnd: null,
            cancelledAt: null,
            cancellationReason: "",
            cancelAtPeriodEnd: false,
            providerCustomerId: "",
            providerSubscriptionId: "",
            providerPriceId: "",
            paymentState: "paid",
            providerMetadata: {},
            lastProviderEventId: "",
            lastProviderEventTimestamp: null,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
      console.log(`  Subscription ensured.`);
    }

    for (const userInput of userList) {
      const passwordHash = await hashPassword(userInput.password);

      const user = await usersCol.findOneAndUpdate(
        { tenantId: tenant!._id, email: userInput.email },
        {
          $set: {
            tenantId: tenant!._id,
            name: userInput.name,
            email: userInput.email,
            passwordHash,
            role: userInput.role,
            status: "active",
            emailVerified: true,
            emailVerifiedAt: now,
            permissionBaseline: "standard",
            roleMigrationState: "complete",
            sessionGuardVersion: 0,
            updatedAt: now,
          },
          $setOnInsert: {
            customRoleId: null,
            employeeProfile: userInput.employeeProfile ?? null,
            createdAt: now,
          },
        },
        { upsert: true, returnDocument: "after" }
      );

      console.log(
        `  User: ${userInput.name} <${userInput.email}> [${userInput.role}] -> ${user!._id}`
      );
      results.push({
        tenant: tenantInput.name,
        slug: tenantInput.slug,
        email: userInput.email,
        password: userInput.password,
        role: userInput.role,
      });
    }
  }

  console.log("\n\n=== SEED COMPLETE ===\n");
  console.log(JSON.stringify(results, null, 2));

  await mongoose.disconnect();
  console.log("\nDisconnected.");
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
