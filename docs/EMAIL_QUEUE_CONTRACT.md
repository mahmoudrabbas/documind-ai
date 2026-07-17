# Email Queue Contract

This document details the contract and workflow for the reliable email delivery system in DocuMind AI.

## Architecture

1.  **API Producer:** The `EmailService` (`api/src/modules/email/email.service.ts`) receives email requests (via the `enqueue` method). It generates a unique hash for idempotency if one isn't provided, and checks the recipient against the `EmailSuppressionModel`.
2.  **Job Envelope:** If the email is valid to send, it writes a permanent record to `EmailMessageModel` with a `PENDING` or `QUEUED` state and enqueues an `email.send` job to BullMQ via the `ApiJobDispatcher`.
3.  **Worker Consumer:** A standalone Node.js worker pulls `email.send` jobs.
    -   The worker uses `createEmailSendJobHandler` to fetch the message.
    -   It uses the `templateRegistry.ts` to dynamically render the final HTML and text content.
    -   It dispatches the email via the `EmailDispatchPort` (which resolves to either `SmtpEmailProvider` or `FakeEmailProvider`).
4.  **Resilience:** Failures are classified into `TEMPORARY_FAILURE` (transient network issues) which trigger BullMQ retries, and `PERMANENT_FAILURE` (hard bounces, malformed data) which result in immediate failure and potential addition to the suppression list.

## Webhooks

Providers (like Resend/SendGrid) post delivery events (e.g., delivered, bounced, complained) to the `/emails/webhooks/provider` endpoint. 
These events update the `EmailMessageModel` status and modify the `EmailSuppressionModel` accordingly to prevent future dispatches to invalid/complaining users.

## Idempotency

Email sending is inherently idempotent based on the `idempotencyKey` provided during the `enqueue` call. This key is used to look up existing `EmailMessageModel` documents before inserting. If an existing record is found, the system skips duplicate queuing and returns the original message ID.

## Deprecations

The synchronous `EmailAdapter` (found in `api/src/modules/auth/email-adapter.ts`) has been deprecated and will be removed in a future release. All new email dispatches should route through `emailService.enqueue()`.
