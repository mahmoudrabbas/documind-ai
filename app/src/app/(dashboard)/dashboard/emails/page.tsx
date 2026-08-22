"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
  Input,
  Select,
} from "@/components/ui";
import { CompactPagination } from "@/components/ui/CompactPagination";
import { EmailPreviewDialog, type EmailPreviewData } from "@/components/email/email-preview-dialog";
import { usePlatformQuery } from "@/components/super-admin/use-platform-query";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { ApiError } from "@/lib/api-client";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import { emailService, type EmailMessage } from "@/services/email.service";

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 20;
const EMAIL_STATES = [
  "QUEUED",
  "PROCESSING",
  "SENT",
  "DELIVERED",
  "TEMPORARY_FAILURE",
  "PERMANENT_FAILURE",
  "CANCELLED",
  "SUPPRESSED",
] as const;

type EmailStateFilter = (typeof EMAIL_STATES)[number] | "";

interface EmailPageData {
  emails: EmailMessage[];
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
}

type Translate = (key: string, params?: Record<string, string>) => string;

function buildSummary(
  t: Translate,
  page: number,
  pageSize: number,
  totalRecords: number,
) {
  if (totalRecords === 0) return t("dashboard.emails.noResults");
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalRecords, page * pageSize);
  return t("dashboard.emails.showing", {
    start: String(start),
    end: String(end),
    total: String(totalRecords),
  });
}

function makeStateLabel(t: Translate, state: string) {
  return codeLabel(t, "dashboard.emailState", state);
}

export default function CompanyEmailsPage() {
  const { t, dir } = useI18n();
  const intlLocale = useIntlLocale();
  const permissions = usePermissions();
  const canUpdateEmail = permissions.can(Permission.COMPANY_SETTINGS_UPDATE);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [stateFilter, setStateFilter] = useState<EmailStateFilter>("");
  const [previewData, setPreviewData] = useState<EmailPreviewData | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [resendCooldowns, setResendCooldowns] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      page,
      limit: pageSize,
      ...(stateFilter ? { state: stateFilter } : {}),
      ...(recipientEmail.trim() ? { recipientEmail: recipientEmail.trim() } : {}),
      ...(templateId.trim() ? { templateId: templateId.trim() } : {}),
    }),
    [page, pageSize, stateFilter, recipientEmail, templateId],
  );

  const state = usePlatformQuery(async (params: typeof query, signal?: AbortSignal) => {
    const response = await emailService.listEmails(params, signal);
    return {
      data: {
        emails: response.data,
        pagination: {
          page: response.meta.page,
          pageSize: response.meta.limit,
          totalRecords: response.meta.total,
          totalPages: Math.max(1, Math.ceil(response.meta.total / response.meta.limit)),
        },
      },
    };
  }, query);

  const data: EmailPageData | null = state.data;
  const emails = data?.emails ?? [];
  const pagination = data?.pagination;
  const totalRecords = pagination?.totalRecords ?? 0;
  const totalPages = pagination?.totalPages ?? 1;
  const summary = buildSummary(t, page, pageSize, totalRecords);

  const statusOptions = [
    { value: "", label: t("dashboard.emails.allStatuses") },
    ...EMAIL_STATES.map((value) => ({
      value,
      label: makeStateLabel(t, value),
    })),
  ];

  function resetFilters() {
    setPage(1);
    setRecipientEmail("");
    setTemplateId("");
    setStateFilter("");
  }

  function updatePageSize(nextSize: number) {
    setPageSize(nextSize);
    setPage(1);
  }

  async function handleResend(messageId: string) {
    if (!canUpdateEmail || resendCooldowns[messageId] === true) return;
    setActionError(null);
    try {
      await emailService.resendEmail(messageId);
      await state.reload();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 429) {
        const seconds = err.retryAfterSeconds ?? 60;
        setResendCooldowns((current) => ({ ...current, [messageId]: true }));
        window.setTimeout(() => {
          setResendCooldowns((current) => {
            const next = { ...current };
            delete next[messageId];
            return next;
          });
        }, seconds * 1000);
      }
      setActionError(
        err instanceof Error ? err.message : t("dashboard.emails.resendFailed"),
      );
    }
  }

  const pageCountLabel = t("dashboard.emails.pageOf", {
    page: String(page),
    total: String(totalPages),
  });

  return (
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        guideId="page-heading-emails"
        title={t("dashboard.emails.title")}
        description={t("dashboard.emails.description")}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void state.reload()}
            isLoading={state.loading || state.refreshing}
          >
            {t("dashboard.emails.refresh")}
          </Button>
        }
      />

      <DashboardPanel tone="muted" padding="compact" className="mb-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Input
            label={t("dashboard.emails.recipientFilter")}
            value={recipientEmail}
            onChange={(event) => {
              setRecipientEmail(event.target.value);
              setPage(1);
            }}
            placeholder="name@company.com"
          />
          <Input
            label={t("dashboard.emails.templateFilter")}
            value={templateId}
            onChange={(event) => {
              setTemplateId(event.target.value);
              setPage(1);
            }}
            placeholder="invite_user"
          />
          <Select
            label={t("dashboard.emails.statusFilter")}
            value={stateFilter}
            onChange={(event) => {
              setStateFilter(event.target.value as EmailStateFilter);
              setPage(1);
            }}
            options={statusOptions}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-on-surface-variant">
            {pagination ? pageCountLabel : t("dashboard.emails.noResults")}
          </p>
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            {t("dashboard.emails.clearFilters")}
          </Button>
        </div>
      </DashboardPanel>

      {actionError ? (
        <p
          className="mb-4 rounded-lg bg-error-container p-3 text-sm text-on-error-container"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      {state.loading && !data ? (
        <DashboardPanel>
          <div className="space-y-3" role="status">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-14 animate-pulse rounded-xl bg-surface-container"
              />
            ))}
            <span className="sr-only">{t("common.loading")}</span>
          </div>
        </DashboardPanel>
      ) : state.error ? (
        <DashboardPanel>
          <div
            role="alert"
            className="rounded-xl border border-error/20 bg-error-container p-4 text-on-error-container"
          >
            <p>{state.error}</p>
            <Button
              className="mt-3"
              variant="secondary"
              size="sm"
              onClick={() => void state.reload()}
            >
              {t("common.retry")}
            </Button>
          </div>
        </DashboardPanel>
      ) : !data || emails.length === 0 ? (
        <DashboardPanel>
          <div className="py-10 text-center">
            <p className="text-title-md font-semibold text-on-surface">
              {t("dashboard.emails.noEmails")}
            </p>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              {t("dashboard.emails.noResultsHint")}
            </p>
          </div>
        </DashboardPanel>
      ) : (
        <DashboardPanel padding="none">
          {state.refreshing ? (
            <div
              role="progressbar"
              aria-label={t("common.loading")}
              className="h-0.5 overflow-hidden bg-surface-container-high"
            >
              <div className="h-full w-full animate-pulse bg-primary" />
            </div>
          ) : null}

          <div className="overflow-x-auto" data-guide-id="emails-table">
            <table className="w-full min-w-[1040px] border-collapse text-start text-sm">
              <thead className="bg-surface-container-low">
                <tr className="border-b border-outline-variant/30">
                  <th className="px-5 py-3 text-label-sm font-semibold text-on-surface-variant">
                    {t("dashboard.emails.recipient")}
                  </th>
                  <th className="px-5 py-3 text-label-sm font-semibold text-on-surface-variant">
                    {t("dashboard.emails.subject")}
                  </th>
                  <th className="px-5 py-3 text-label-sm font-semibold text-on-surface-variant">
                    {t("dashboard.emails.template")}
                  </th>
                  <th className="px-5 py-3 text-label-sm font-semibold text-on-surface-variant">
                    {t("dashboard.emails.status")}
                  </th>
                  <th className="px-5 py-3 text-label-sm font-semibold text-on-surface-variant">
                    {t("dashboard.emails.date")}
                  </th>
                  <th className="px-5 py-3 text-end text-label-sm font-semibold text-on-surface-variant">
                    {t("dashboard.emails.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {emails.map((email) => {
                  const isDisabled =
                    resendCooldowns[email._id] === true ||
                    !canUpdateEmail ||
                    !["PERMANENT_FAILURE", "CANCELLED", "TEMPORARY_FAILURE"].includes(email.state);

                  return (
                    <tr
                      key={email._id}
                      className="transition-colors hover:bg-surface-container-low/50"
                    >
                      <td className="px-5 py-4 align-top">
                        <span
                          className="block max-w-56 truncate font-medium text-on-surface"
                          title={email.recipientEmail}
                        >
                          {email.recipientEmail}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <span
                          className="block max-w-72 truncate text-on-surface-variant"
                          title={email.subject || t("dashboard.emails.noSubject")}
                        >
                          {email.subject || t("dashboard.emails.noSubject")}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-top text-on-surface-variant">
                        <span className="block max-w-44 truncate" title={email.templateId}>
                          {email.templateId}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <Badge
                          status={
                            email.state === "DELIVERED" || email.state === "SENT"
                              ? "success"
                              : email.state === "PERMANENT_FAILURE" || email.state === "CANCELLED" || email.state === "SUPPRESSED"
                                ? "error"
                                : email.state === "TEMPORARY_FAILURE" || email.state === "PROCESSING" || email.state === "QUEUED"
                                  ? "warning"
                                  : "neutral"
                          }
                          label={codeLabel(t, "dashboard.emailState", email.state)}
                        />
                      </td>
                      <td className="px-5 py-4 align-top text-on-surface-variant">
                        <time
                          dateTime={email.createdAt}
                          title={new Date(email.createdAt).toLocaleString(intlLocale)}
                          className="whitespace-nowrap"
                        >
                          {new Date(email.createdAt).toLocaleString(intlLocale)}
                        </time>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            data-guide-id="emails-details-button"
                            className="h-9 px-3 text-label-sm font-medium text-primary hover:bg-primary/10"
                            onClick={() => {
                              void emailService.getEmailStatus(email._id).then((detail) => setPreviewData({
                                subject: email.subject || t("dashboard.emails.noSubject"),
                                recipientEmail: email.recipientEmail,
                                templateId: email.templateId,
                                state: email.state,
                                createdAt: detail.message.createdAt,
                                scheduledFor: detail.message.scheduledFor,
                                sentAt: detail.message.sentAt,
                                lastAttemptAt: detail.message.lastAttemptAt,
                                attemptCount: detail.message.attemptCount,
                                providerMessageId: detail.message.providerMessageId,
                                correlationId: detail.message.correlationId,
                                errorCategory: detail.message.errorCategory,
                                attempts: detail.attempts,
                              })).catch(() => setPreviewData({ subject: email.subject || t("dashboard.emails.noSubject"), recipientEmail: email.recipientEmail, templateId: email.templateId, state: email.state }));
                              setIsPreviewOpen(true);
                            }}
                          >
                            {t("dashboard.emails.details")}
                          </Button>
                          {canUpdateEmail &&
                          ["PERMANENT_FAILURE", "CANCELLED", "TEMPORARY_FAILURE"].includes(email.state) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isDisabled}
                              data-guide-id="emails-resend-button"
                              title={
                                resendCooldowns[email._id] === true
                                  ? t("dashboard.emails.rateLimitedTitle")
                                  : undefined
                              }
                              className="h-9 px-3 text-label-sm font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                              onClick={() => void handleResend(email._id)}
                            >
                              {t("dashboard.emails.resend")}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pagination ? (
            <CompactPagination
              dir={dir}
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={updatePageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              summary={summary}
              previousLabel={t("dashboard.emails.previous")}
              nextLabel={t("dashboard.emails.next")}
              rowsPerPageLabel={t("dashboard.emails.rowsPerPage")}
            />
          ) : null}
        </DashboardPanel>
      )}

      <EmailPreviewDialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        data={previewData}
      />
    </DashboardPage>
  );
}
