"use client";

import { useEffect, useState } from "react";
import { DashboardPage, DashboardPageHeader, DashboardPanel } from "@/components/ui/DashboardPage";
import { emailService, type EmailMessage } from "@/services/email.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmailPreviewDialog, type EmailPreviewData } from "@/components/email/email-preview-dialog";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { ApiError } from "@/lib/api-client";

export default function CompanyEmailsPage() {
  const permissions = usePermissions();
  const canUpdateEmail = permissions.can(Permission.COMPANY_SETTINGS_UPDATE);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resendCooldowns, setResendCooldowns] = useState<
    Record<string, boolean>
  >({});
  
  const [previewData, setPreviewData] = useState<EmailPreviewData | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const fetchEmails = async () => {
    try {
      setIsLoading(true);
      const data = await emailService.listEmails({ limit: 50 });
      setEmails(data.data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load emails");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const getStatusBadgeVariant = (state: string) => {
    switch (state) {
      case "DELIVERED":
      case "SENT":
        return "success";
      case "PERMANENT_FAILURE":
      case "CANCELLED":
      case "SUPPRESSED":
        return "error";
      case "TEMPORARY_FAILURE":
      case "PROCESSING":
      case "QUEUED":
        return "warning";
      default:
        return "neutral";
    }
  };

  const handleResend = async (messageId: string) => {
    if (
      !canUpdateEmail ||
      resendCooldowns[messageId] === true
    ) {
      return;
    }
    setActionError(null);
    try {
      await emailService.resendEmail(messageId);
      await fetchEmails();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 429) {
        const seconds = err.retryAfterSeconds ?? 60;
        setResendCooldowns((current) => ({
          ...current,
          [messageId]: true,
        }));
        window.setTimeout(() => {
          setResendCooldowns((current) => {
            const next = { ...current };
            delete next[messageId];
            return next;
          });
        }, seconds * 1000);
      }
      setActionError(
        err instanceof Error ? err.message : "Failed to resend email.",
      );
    }
  };

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Email Delivery Log"
        description="Monitor outgoing emails sent from your organization."
        actions={
          <Button variant="outline" onClick={fetchEmails} isLoading={isLoading}>
            Refresh
          </Button>
        }
      />
      {actionError ? (
        <p className="mb-4 rounded-lg bg-error-container p-3 text-sm text-on-error-container" role="alert">
          {actionError}
        </p>
      ) : null}
      <DashboardPanel padding="none">
        {error ? (
          <div className="p-8 text-center text-error">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-container-high border-b border-outline-variant text-on-surface-variant text-xs font-semibold uppercase">
                <tr>
                  <th className="px-6 py-4">Recipient</th>
                  <th className="px-6 py-4">Subject</th>
                  <th className="px-6 py-4">Template</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {emails.map((email) => (
                  <tr key={email._id} className="hover:bg-surface-container-high/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-on-surface">{email.recipientEmail}</td>
                    <td className="px-6 py-4 text-on-surface-variant max-w-[250px] truncate">{email.subject || "N/A"}</td>
                    <td className="px-6 py-4 text-on-surface-variant">{email.templateId}</td>
                    <td className="px-6 py-4">
                      <Badge status={getStatusBadgeVariant(email.state)}>
                        {email.state}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-on-surface-variant">
                      {new Date(email.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPreviewData({
                            subject: email.subject || "No Subject",
                            recipientEmail: email.recipientEmail,
                            templateId: email.templateId,
                            state: email.state,
                          });
                          setIsPreviewOpen(true);
                        }}
                      >
                        Details
                      </Button>
                      {canUpdateEmail && (email.state === "PERMANENT_FAILURE" || email.state === "CANCELLED" || email.state === "TEMPORARY_FAILURE") && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resendCooldowns[email._id] === true}
                          title={
                            resendCooldowns[email._id] === true
                              ? "Rate limited. Try again after the cooldown."
                              : undefined
                          }
                          onClick={() => handleResend(email._id)}
                        >
                          Resend
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {emails.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-on-surface-variant">
                      No emails found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </DashboardPanel>
      <EmailPreviewDialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        data={previewData}
      />
    </DashboardPage>
  );
}
