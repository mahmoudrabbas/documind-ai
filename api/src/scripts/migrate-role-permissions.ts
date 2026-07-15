import mongoose from "mongoose";
import { config } from "../config/index.js";
import RoleModel from "../db/models/role.model.js";
import { BASE_ROLE_DEFAULTS } from "../modules/permissions/permissions.catalog.js";

const DRY_RUN = process.argv.includes("--dry-run");

async function migrate() {
  const mongoUri =
    process.env.MONGODB_URI ?? config.MONGODB_URI;

  console.log(
    `[migrate-role-permissions] Connecting to ${mongoUri.replace(/\/\/.*@/, "//***@")}`,
  );
  await mongoose.connect(mongoUri, { dbName: "docsai" });

  const roles = await RoleModel.find({
    $or: [
      { version: { $eq: 0 } },
      { version: { $exists: false } },
      { permissions: { $exists: false } },
      { permissions: null },
    ],
  })
    .lean()
    .exec();

  console.log(
    `[migrate-role-permissions] Found ${roles.length} role(s) requiring migration`,
  );

  if (roles.length === 0) {
    console.log("[migrate-role-permissions] Nothing to do");
    await mongoose.disconnect();
    return;
  }

  let migrated = 0;

  for (const role of roles) {
    const roleId = (role._id as { toString(): string }).toString();
    const baseRole = role.baseRole as string;
    const defaults = BASE_ROLE_DEFAULTS[baseRole] ?? [];

    if (DRY_RUN) {
      console.log(
        `[dry-run] Role ${roleId} (${role.name}): baseRole=${baseRole}, would set ${defaults.length} permissions`,
      );
      migrated++;
      continue;
    }

    await RoleModel.updateOne(
      { _id: roleId },
      {
        $set: {
          permissions: [...defaults],
          status: role.status ?? "active",
          version: 1,
          scopes: {
            selfOnly: false,
            departmentIds: [],
            categories: [],
          },
        },
      },
    ).exec();

    console.log(
      `[migrate] Role ${roleId} (${role.name}): migrated with ${defaults.length} permissions`,
    );
    migrated++;
  }

  if (!DRY_RUN) {
    const remaining = await RoleModel.countDocuments({
      $or: [
        { version: { $eq: 0 } },
        { version: { $exists: false } },
      ],
    }).exec();

    if (remaining > 0) {
      console.warn(
        `[migrate-role-permissions] WARNING: ${remaining} role(s) still need migration`,
      );
    } else {
      console.log(
        "[migrate-role-permissions] All roles migrated successfully",
      );
    }
  }

  console.log(
    `[migrate-role-permissions] Done: ${migrated} migrated`,
  );
  await mongoose.disconnect();
}

migrate().catch((error) => {
  console.error("[migrate-role-permissions] Failed:", error);
  process.exitCode = 1;
});
