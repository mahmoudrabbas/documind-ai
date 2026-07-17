"use client";

import { useEffect, useState } from "react";
import { DashboardPage, DashboardPageHeader, DashboardPanel } from "@/components/ui/DashboardPage";
import { emailService, type EmailMessage } from "@/services/email.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmailPreviewDialog, type EmailPreviewData } from "@/components/email/email-preview-dialog";

export default function CompanyEmailsPage() {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [previewData, setPreviewData] = useState<EmailPreviewData | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    fetchEmails();
  }, []);

  const fetchEmails = async () => {
    try {
      setIsLoading(true);
      const data = await emailService.listEmails({ limit: 50 });
      setEmails(data.data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load emails");
    } finally {
      setIsLoading(false);
    }
  };

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
    try {
      await emailService.resendEmail(messageId);
      await fetchEmails();
    } catch (err: any) {
      alert("Failed to resend email: " + err.message);
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
                            variables: (email as any).variables ?? null,
                          });
                          setIsPreviewOpen(true);
                        }}
                      >
                        Details
                      </Button>
                      {(email.state === "PERMANENT_FAILURE" || email.state === "CANCELLED" || email.state === "TEMPORARY_FAILURE") && (
                        <Button variant="outline" size="sm" onClick={() => handleResend(email._id)}>
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
