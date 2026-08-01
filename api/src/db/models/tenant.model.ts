import mongoose, { Schema } from "mongoose";

export type TenantDefaultLanguage = "en" | "ar";
export type TenantResponseStyle = "concise" | "balanced" | "detailed";

export interface TenantSettings {
  profile: {
    companyName: string | null;
    logoUrl: string | null;
    accentColor: string | null;
    timezone: string | null;
  };
  defaultLanguage: TenantDefaultLanguage;
  emailBranding: {
    fromName: string | null;
    footerText: string | null;
    brandColor: string | null;
  };
  aiRuntimePreferences: {
    temperature: number;
    maxTokens: number;
    responseStyle: TenantResponseStyle;
    citationsEnabled: boolean;
  };
  notifications: {
    emailOnUserInvited: boolean;
    emailOnKnowledgeGapCreated: boolean;
    emailOnDocumentProcessingFailed: boolean;
    emailOnWeeklyDigest: boolean;
  };
}

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  profile: {
    companyName: null,
    logoUrl: null,
    accentColor: null,
    timezone: null,
  },
  defaultLanguage: "en",
  emailBranding: {
    fromName: null,
    footerText: null,
    brandColor: null,
  },
  aiRuntimePreferences: {
    temperature: 0.4,
    maxTokens: 1024,
    responseStyle: "balanced",
    citationsEnabled: true,
  },
  notifications: {
    emailOnUserInvited: true,
    emailOnKnowledgeGapCreated: true,
    emailOnDocumentProcessingFailed: true,
    emailOnWeeklyDigest: false,
  },
};

export interface TenantDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  isSystemTenant: boolean;
  selectedPackageCode?: string;
  adminGuardVersion: number;
  roleGuardVersion: number;
  settings: TenantSettings;
  settingsVersion: number;
  settingsUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const tenantSettingsSchema = new Schema<TenantSettings>(
  {
    profile: {
      companyName: { type: String, default: null, maxlength: 120 },
      logoUrl: { type: String, default: null, maxlength: 2048 },
      accentColor: {
        type: String,
        default: null,
        match: /^#[0-9a-fA-F]{6}$/,
      },
      timezone: { type: String, default: null, maxlength: 100 },
    },
    defaultLanguage: { type: String, enum: ["en", "ar"], default: "en" },
    emailBranding: {
      fromName: { type: String, default: null, maxlength: 120 },
      footerText: { type: String, default: null, maxlength: 500 },
      brandColor: {
        type: String,
        default: null,
        match: /^#[0-9a-fA-F]{6}$/,
      },
    },
    aiRuntimePreferences: {
      temperature: { type: Number, default: 0.4, min: 0, max: 2 },
      maxTokens: { type: Number, default: 1024, min: 128, max: 8192 },
      responseStyle: {
        type: String,
        enum: ["concise", "balanced", "detailed"],
        default: "balanced",
      },
      citationsEnabled: { type: Boolean, default: true },
    },
    notifications: {
      emailOnUserInvited: { type: Boolean, default: true },
      emailOnKnowledgeGapCreated: { type: Boolean, default: true },
      emailOnDocumentProcessingFailed: { type: Boolean, default: true },
      emailOnWeeklyDigest: { type: Boolean, default: false },
    },
  },
  { _id: false },
);

const tenantSchema = new Schema<TenantDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 80,
    },
    status: {
      type: String,
      enum: ["active", "trial", "pending", "pending_verification", "suspended"],
      default: "pending_verification",
    },
    plan: {
      type: String,
      enum: ["free", "trial", "pro"],
      default: "free",
    },
    isSystemTenant: {
      type: Boolean,
      default: false,
      index: true,
    },
    selectedPackageCode: {
      type: String,
      default: null,
    },
    adminGuardVersion: { type: Number, default: 0, min: 0 },
    roleGuardVersion: { type: Number, default: 0, min: 0 },
    settings: {
      type: tenantSettingsSchema,
      default: DEFAULT_TENANT_SETTINGS,
    },
    settingsVersion: { type: Number, default: 0, min: 0 },
    settingsUpdatedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const record = ret as Record<string, unknown> & {
          _id?: unknown;
          __v?: number;
        };
        record.id = record._id?.toString?.() ?? "";
        delete record._id;
        delete record.__v;
        return record;
      },
    },
  },
);

tenantSchema.index({ status: 1 });

const TenantModel = mongoose.model<TenantDocument>("Tenant", tenantSchema);

export default TenantModel;
