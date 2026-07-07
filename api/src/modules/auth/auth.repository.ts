import type { ClientSession } from "mongoose";
import TenantModel, { type TenantDocument } from "../../db/models/tenant.model.js";
import UserModel, { type UserDocument } from "../../db/models/user.model.js";

export interface TenantCreateInput {
  name: string;
  slug: string;
  status: string;
  plan: string;
}

export interface UserCreateInput {
  tenantId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
}

export async function findTenantBySlug(slug: string) {
  return TenantModel.findOne({ slug }).lean<TenantDocument>().exec();
}

export async function findUserByEmail(email: string) {
  return UserModel.findOne({ email }).lean<UserDocument>().exec();
}

export async function findUserDocumentByEmail(email: string) {
  return UserModel.findOne({ email }).select("+emailVerificationTokenHash").exec();
}

export function findUserDocumentById(userId: string) {
  return UserModel.findById(userId)
    .select("+emailVerificationTokenHash +emailVerificationExpiresAt")
    .exec();
}

export async function createTenant(input: TenantCreateInput, session?: ClientSession) {
  const [tenant] = await TenantModel.create([input], { session });
  return tenant as TenantDocument;
}

export async function createUser(input: UserCreateInput, session?: ClientSession) {
  const [user] = await UserModel.create([input], { session });
  return user as UserDocument;
}

export async function updateUserVerificationToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date
) {
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: expiresAt,
      },
    }
  ).exec();
}

export async function activateTenantIfPendingVerification(tenantId: string) {
  return TenantModel.findOneAndUpdate(
    { _id: tenantId, status: "pending_verification" },
    { $set: { status: "active" } },
    { returnDocument: "after" }
  )
    .lean<TenantDocument>()
    .exec();
}

export async function findTenantById(tenantId: string) {
  return TenantModel.findById(tenantId).lean<TenantDocument>().exec();
}

export async function deleteTenantById(tenantId: string) {
  await TenantModel.deleteOne({ _id: tenantId });
}

export async function deleteUserById(userId: string) {
  await UserModel.deleteOne({ _id: userId });
}
