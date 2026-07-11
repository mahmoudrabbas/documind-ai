# Usage events

Call `recordQuestionAsked({ tenantId, requestId })` exactly once after a future
chat/query endpoint has authenticated the user and accepted a valid question.
Pass the request correlation ID so retries are idempotent. Do not call it for
failed authentication, failed validation, assistant/system/tool messages, or
failed requests that were never accepted.
