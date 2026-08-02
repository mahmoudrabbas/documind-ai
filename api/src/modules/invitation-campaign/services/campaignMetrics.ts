import promClient from "prom-client";

export const invitationCampaignsCreated = new promClient.Counter({
  name: "invitation_campaigns_created_total",
  help: "Total number of invitation campaigns created",
  labelNames: ["tenant_id"] as const,
});

export const invitationCampaignsConfirmed = new promClient.Counter({
  name: "invitation_campaigns_confirmed_total",
  help: "Total number of invitation campaigns confirmed and queued",
});

export const invitationCampaignsCompleted = new promClient.Counter({
  name: "invitation_campaigns_completed_total",
  help: "Total number of invitation campaigns completed, labeled by final state",
  labelNames: ["state"] as const,
});

export const invitationCampaignProcessingDuration = new promClient.Histogram({
  name: "invitation_campaign_processing_duration_seconds",
  help: "Duration of invitation campaign processing in seconds",
  buckets: [1, 5, 15, 30, 60, 120, 300],
});

export const invitationCampaignRows = new promClient.Counter({
  name: "invitation_campaign_rows_total",
  help: "Total number of rows processed in invitation campaigns, labeled by outcome",
  labelNames: ["outcome"] as const,
});
