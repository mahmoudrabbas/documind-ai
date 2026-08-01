export interface DashboardRecentActivityItem {
  id: string;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  createdAt: string;
}

export interface DashboardSummary {
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
  };
  users: {
    total: number;
    active: number;
    pendingInvitations: number;
    disabled: number;
  };
  documents: {
    total: number;
    processed: number;
    processing: number;
    failed: number;
  };
  usage: {
    questionsAsked7d: number;
    questionsAsked30d: number;
  };
  knowledgeGaps: {
    open: number;
    total: number;
  };
  recentActivity: DashboardRecentActivityItem[];
  generatedAt: string;
}
