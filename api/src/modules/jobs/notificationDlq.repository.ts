import NotificationDlqModel, {
  type NotificationDlqDocument,
} from "../../db/models/notificationDlq.model.js";

export interface NotificationDlqListFilter {
  status?: "pending" | "replayed";
}

export interface NotificationDlqListItem {
  id: string;
  tenantId: string;
  jobId: string;
  notificationIds: string[];
  notificationCount: number;
  reason: string | null;
  payloadHash: string | null;
  failedAt: string | null;
  replayedAt: string | null;
  status: "pending" | "replayed";
}

function buildFilter(filter: NotificationDlqListFilter) {
  const query: Record<string, unknown> = {};
  if (filter.status === "pending") query.replayedAt = null;
  if (filter.status === "replayed") query.replayedAt = { $ne: null };
  return query;
}

export async function listNotificationDlqs(
  filter: NotificationDlqListFilter,
  page: number,
  pageSize: number,
) {
  const query = buildFilter(filter);
  const [items, totalRecords] = await Promise.all([
    NotificationDlqModel.find(query)
      .sort({ failedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean<NotificationDlqDocument[]>()
      .exec(),
    NotificationDlqModel.countDocuments(query).exec(),
  ]);
  return {
    items: items.map(serializeNotificationDlq),
    pagination: {
      page,
      pageSize,
      totalRecords,
      totalPages: Math.ceil(totalRecords / pageSize),
    },
  };
}

export function serializeNotificationDlq(
  doc: NotificationDlqDocument,
): NotificationDlqListItem {
  const failedAt = doc.failedAt ? doc.failedAt.toISOString() : null;
  const replayedAt = doc.replayedAt ? doc.replayedAt.toISOString() : null;
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId.toString(),
    jobId: doc.jobId,
    notificationIds: doc.notificationIds,
    notificationCount: doc.notificationCount,
    reason: doc.reason ?? null,
    payloadHash: doc.payloadHash ?? null,
    failedAt,
    replayedAt,
    status: replayedAt ? "replayed" : "pending",
  };
}
