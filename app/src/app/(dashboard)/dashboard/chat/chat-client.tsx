"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PdfViewerModal } from "@/components/documents/PdfViewerModal";
import { FeedbackWidget } from "@/components/domain/FeedbackWidget";
import { AssistantMarkdown } from "@/components/domain/AssistantMarkdown";
import { UpgradePrompt } from "@/components/entitlement/UpgradePrompt";
import {
  mapEntitlementError,
  type EntitlementDenial,
} from "@/lib/entitlement-errors";
import {
  sendMessage,
  sendVisionMessage,
  transcribeAudio,
  fetchChatAttachmentUrl,
  listConversations,
  getConversationMessages,
  deleteConversation,
} from "@/services/chat.service";
import type {
  ChatAttachment,
  ChatResponse,
  ChatSource,
  ChatVisionResponse,
  ConversationListItem,
} from "@/types/api/chat.types";
import { useI18n } from "@/providers/i18n-provider";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { getChatErrorPresentation } from "./chat-error";
import { previewText } from "./preview-text";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  attachments?: ChatAttachment[];
  localAttachmentUrl?: string;
};

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

const SUGGESTED_QUESTIONS = [
  "What is the company holidays schedule?",
  "How do I request time off?",
  "What are the IT security guidelines?",
];

function resolveDimensionLabel(
  t: (key: string) => string,
  dimension: string,
): string {
  const key = `usage.dimension.${dimension}`;
  const label = t(key);
  if (label !== key) return label;
  return dimension
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

function isVisionResponse(
  response: ChatResponse | ChatVisionResponse,
): response is ChatVisionResponse {
  return "attachment" in response;
}

function AttachmentThumbnail({
  attachment,
  alt,
}: {
  attachment: ChatAttachment;
  alt?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchChatAttachmentUrl(attachment.id)
      .then((url) => {
        if (cancelled) return;
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => {
        // Silently fail; the bubble still shows the message text.
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  if (!src) {
    return (
      <div className="h-28 w-36 animate-pulse rounded-xl bg-on-surface/10" />
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? attachment.fileName}
      className="h-28 w-36 rounded-xl border border-outline-variant/30 object-cover"
    />
  );
}

export function ChatClient() {
  const { t } = useI18n();
  const permissions = usePermissions();
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeConversation, setActiveConversation] = useState<string>("");
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entitlementBanner, setEntitlementBanner] =
    useState<EntitlementDenial | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [pdfViewer, setPdfViewer] = useState<{
    documentId: string;
    pageNumber?: number;
    highlightText?: string;
    documentTitle?: string;
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clientMessageIdRef = useRef<string | null>(null);
  const msgIdCounter = useRef(0);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());

        if (audioBlob.size === 0) return;

        setIsTranscribing(true);
        try {
          const res = await transcribeAudio(audioBlob);
          if (res?.text) {
            setInput((prev) => (prev ? `${prev} ${res.text}` : res.text));
          }
        } catch (err: unknown) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to transcribe audio. Please try speaking again.";
          setError(message);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch {
      setError(
        "Microphone access denied or unsupported browser. Please check microphone permissions.",
      );
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const currentMessages = messages[activeConversation] ?? [];

  const loadConversations = useCallback(async () => {
    try {
      setLoadingConversations(true);
      const result = await listConversations();
      setConversations(result.conversations);
    } catch {
      // Silently fail on initial load
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Refresh relative timestamps every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setConversations((prev) => [...prev]);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (retryAfterSeconds === null) return;
    if (retryAfterSeconds <= 0) {
      setRetryAfterSeconds(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      setRetryAfterSeconds((remaining) =>
        remaining === null ? null : remaining - 1,
      );
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [retryAfterSeconds]);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      setLoadingMessages(true);
      const result = await getConversationMessages(conversationId);
      const mapped: Message[] = result.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources,
        attachments: m.attachments,
      }));
      setMessages((prev) => ({ ...prev, [conversationId]: mapped }));
    } catch {
      // Handle silently
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages.length, isTyping]);

  function handleSelectConversation(id: string) {
    setActiveConversation(id);
    if (!messages[id]) {
      loadMessages(id);
    }
  }

  async function handleNewConversation() {
    setActiveConversation("");
    setMessages((prev) => {
      const next = { ...prev };
      delete next[""];
      return next;
    });
  }

  async function handleDeleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setMessages((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (activeConversation === id) {
        setActiveConversation("");
      }
    } catch {
      // Handle silently
    }
  }

  function handleSelectImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError(t("chat.error.unsupportedFileType"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t("chat.error.fileTooLarge"));
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    clientMessageIdRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `cm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setError(null);
  }

  function handleRemoveImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    clientMessageIdRef.current = null;
  }

  async function handleSend(text?: string) {
    const question = (text || input).trim();
    if (!question || isTyping || retryAfterSeconds !== null) return;

    const convId = activeConversation;
    const tempMsgId = `u-${++msgIdCounter.current}`;
    const userMsg: Message = {
      id: tempMsgId,
      role: "user",
      content: question,
      ...(selectedFile
        ? {
            localAttachmentUrl: previewUrl ?? undefined,
          }
        : {}),
    };

    setMessages((prev) => ({
      ...prev,
      [convId]: [...(prev[convId] ?? []), userMsg],
    }));

    setInput("");
    setIsTyping(true);
    setError(null);
    setEntitlementBanner(null);

    // Optimistically update sidebar
    if (convId) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                lastMessage: question.slice(0, 100),
                updatedAt: new Date().toISOString(),
                messageCount: c.messageCount + 1,
              }
            : c,
        ),
      );
    }

    try {
      const clientMessageId = selectedFile
        ? (clientMessageIdRef.current ?? undefined)
        : undefined;
      const response = selectedFile
        ? await sendVisionMessage({
            question,
            conversationId: convId || undefined,
            clientMessageId,
            image: selectedFile,
          })
        : await sendMessage({
            message: question,
            conversationId: convId || undefined,
          });

      const actualConvId = response.conversationId;
      const aiMsg: Message = {
        id: response.messageId,
        role: "assistant",
        content: response.answer,
        sources: response.sources,
      };

      let resolvedUserMsg: Message = userMsg;
      if (selectedFile && isVisionResponse(response)) {
        resolvedUserMsg = {
          ...userMsg,
          attachments: [response.attachment],
          localAttachmentUrl: undefined,
        };
      }

      // If this was a new conversation, the server created it — update state
      if (!convId) {
        setActiveConversation(actualConvId);
        setMessages((prev) => ({
          ...prev,
          [actualConvId]: [resolvedUserMsg, aiMsg],
        }));

        // Add to sidebar
        setConversations((prev) => [
          {
            id: actualConvId,
            title: question.length > 60 ? question.slice(0, 57) + "..." : question,
            lastMessage: response.answer.slice(0, 100),
            updatedAt: new Date().toISOString(),
            messageCount: 2,
          },
          ...prev,
        ]);
      } else {
        setMessages((prev) => ({
          ...prev,
          [convId]: [
            ...(prev[convId] ?? []).map((m) =>
              m.id === tempMsgId ? resolvedUserMsg : m,
            ),
            aiMsg,
          ],
        }));

        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  lastMessage: response.answer.slice(0, 100),
                  updatedAt: new Date().toISOString(),
                }
              : c,
          ),
        );
      }

      if (selectedFile) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setSelectedFile(null);
        setPreviewUrl(null);
        clientMessageIdRef.current = null;
      }
    } catch (err) {
      const denial = mapEntitlementError(err);
      if (denial) {
        // Entitlement denial (429 quota exceeded / 403 subscription
        // inactive): surface the UpgradePrompt banner in place and keep all
        // prior conversation messages visible.
        setEntitlementBanner(denial);
        setRetryAfterSeconds(null);
      } else {
        // Single retryable error presentation: show one error banner and keep
        // all prior conversation messages visible. Do not inject an assistant
        // bubble with the error text, which would duplicate the banner and
        // look like a model answer.
        const presentation = getChatErrorPresentation(err, t);
        setError(presentation.message);
        if (presentation.retryAfterSeconds !== null) {
          setRetryAfterSeconds(presentation.retryAfterSeconds);
        }
      }
    } finally {
      setIsTyping(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] overflow-hidden rounded-3xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm lg:h-[calc(100dvh-6rem)]">
      {/* Sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-e border-outline-variant/30 bg-surface-container-low md:flex">
        <div className="border-b border-outline-variant/30 p-4">
          <h2 className="text-title-sm font-bold text-on-surface">Conversations</h2>
          <button
            onClick={() => handleNewConversation()}
            className="mt-3 flex w-full items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConversations && conversations.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-on-surface-variant">
              Loading...
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                className={`group flex w-full cursor-pointer flex-col gap-1 border-b border-outline-variant/20 px-4 py-3 text-start transition-colors hover:bg-surface-container ${
                  activeConversation === conv.id
                    ? "bg-primary/5 border-s-4 border-s-primary"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-semibold text-on-surface">
                    {conv.title}
                  </span>
                  <button
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    className="hidden shrink-0 rounded p-0.5 text-on-surface-variant/40 transition-colors hover:bg-error/10 hover:text-error group-hover:block"
                    title="Delete conversation"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
                <span className="truncate text-xs text-on-surface-variant">
                  {previewText(conv.lastMessage) || "No messages yet"}
                </span>
                <span className="text-[11px] text-outline">
                  {formatRelativeTime(conv.updatedAt)}
                </span>
              </div>
            ))
          )}
          {!loadingConversations && conversations.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-on-surface-variant">
              No conversations yet
            </div>
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
          {currentMessages.length === 0 && !loadingMessages ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <span
                  className="material-symbols-outlined text-[32px] text-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  psychology
                </span>
              </div>
              <div>
                <h3 className="text-title-lg font-bold text-on-surface">
                  DocuMind AI
                </h3>
                <p className="mt-1 max-w-sm text-sm text-on-surface-variant">
                  Ask questions about your company documents and get instant
                  answers sourced from your knowledge base.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    disabled={isTyping || retryAfterSeconds !== null}
                    className="rounded-full border border-outline-variant/40 bg-surface px-4 py-2 text-sm text-on-surface-variant transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : loadingMessages ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-on-surface-variant/40 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-on-surface-variant/40 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-on-surface-variant/40 [animation-delay:300ms]" />
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {currentMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <span className="material-symbols-outlined text-[18px] text-primary">
                        smart_toy
                      </span>
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container border border-outline-variant/30 text-on-surface"
                    }`}
                  >
                    {msg.role === "user" && msg.localAttachmentUrl && (
                      <img
                        src={msg.localAttachmentUrl}
                        alt={t("chat.attachmentPreview")}
                        className="mb-2 h-28 w-36 rounded-xl border border-outline-variant/30 object-cover"
                      />
                    )}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {msg.attachments.map((attachment) => (
                          <AttachmentThumbnail
                            key={attachment.id}
                            attachment={attachment}
                          />
                        ))}
                      </div>
                    )}
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-line">{msg.content}</p>
                    ) : (
                      <AssistantMarkdown content={msg.content} />
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 border-t border-outline-variant/20 pt-2">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                          Sources
                        </p>
                        {msg.sources.map((src) => (
                            <button
                              key={src.chunkId}
                              onClick={() => setPdfViewer({
                                documentId: src.documentId,
                                pageNumber: src.pageNumber,
                                highlightText: src.text,
                                documentTitle: src.documentTitle,
                              })}
                              className="flex items-center gap-1 text-xs text-on-surface-variant transition-colors hover:text-primary"
                            >
                              <span className="material-symbols-outlined text-[14px]">
                                description
                              </span>
                              <span className="underline-offset-2 hover:underline">
                                {src.documentTitle ?? "Document"}
                              </span>
                              {src.sectionTitle && (
                                <span className="text-outline">
                                  — {src.sectionTitle}
                                </span>
                              )}
                              {src.pageNumber && (
                                <span className="text-outline">
                                  (p.{src.pageNumber})
                                </span>
                              )}
                              <span className="ml-1 text-outline">
                                ({(src.score * 100).toFixed(0)}%)
                              </span>
                            </button>
                          ))}
                      </div>
                    )}
                    {msg.role === "assistant" && activeConversation && (
                      <FeedbackWidget
                        messageId={msg.id}
                        conversationId={activeConversation}
                      />
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container-high">
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                        person
                      </span>
                    </div>
                  )}
                </div>
              ))}
              {isTyping && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <span className="material-symbols-outlined text-[18px] text-primary">
                      smart_toy
                    </span>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/30 bg-surface-container px-4 py-3">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-on-surface-variant/40 [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-on-surface-variant/40 [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-on-surface-variant/40 [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="border-t border-error/20 bg-error/5 px-4 py-2 text-center text-xs text-error">
            {error}
            {retryAfterSeconds !== null && ` Retry in ${retryAfterSeconds}s.`}
          </div>
        )}

        {/* Entitlement denial banner (429 quota exceeded / 403 subscription inactive) */}
        {entitlementBanner && (
          <div className="border-t border-outline-variant/30 bg-surface-container-lowest px-4 py-3 sm:px-6 lg:px-10">
            <div className="mx-auto max-w-3xl">
              {entitlementBanner.kind === "subscription-inactive" ? (
                <UpgradePrompt
                  variant="subscription-inactive"
                  dimension="subscription"
                  onUpgradeClick={() => router.push("/checkout")}
                  hasBillingPermission={permissions.can(Permission.BILLING_MANAGE)}
                  title={t("entitlement.denial.subscriptionInactiveTitle")}
                  description={t(
                    "entitlement.denial.subscriptionInactiveDescription",
                  )}
                  ctaLabel={t("entitlement.denial.reactivateCta")}
                  hintLabel={t("entitlement.denial.reactivateHint")}
                />
              ) : (
                <UpgradePrompt
                  dimension={resolveDimensionLabel(
                    t,
                    entitlementBanner.dimension,
                  )}
                  current={entitlementBanner.current}
                  limit={entitlementBanner.limit}
                  onUpgradeClick={() => router.push("/checkout")}
                  hasBillingPermission={permissions.can(Permission.BILLING_MANAGE)}
                  warningThreshold={0}
                  title={t("entitlement.denial.quotaTitle", {
                    dimension: resolveDimensionLabel(
                      t,
                      entitlementBanner.dimension,
                    ),
                  })}
                  description={t("entitlement.denial.quotaDescription")}
                />
              )}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-outline-variant/30 bg-surface-container-lowest px-4 py-4 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-3xl">
            {previewUrl && selectedFile && (
              <div className="mb-2 flex items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface p-2 pr-3">
                <img
                  src={previewUrl}
                  alt={t("chat.selectedImagePreview")}
                  className="h-16 w-20 rounded-xl object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-on-surface-variant">
                  {selectedFile.name}
                </span>
                <button
                  onClick={handleRemoveImage}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
                  title={t("chat.removeImage")}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    close
                  </span>
                </button>
              </div>
            )}
            <div className="flex items-end gap-3 rounded-2xl border border-outline-variant/40 bg-surface px-4 py-3 shadow-sm transition-all focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={retryAfterSeconds !== null}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                title={t("chat.attachImage")}
              >
                <span className="material-symbols-outlined text-[20px]">
                  image
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleSelectImage}
              />
              <button
                onClick={toggleRecording}
                disabled={isTranscribing || retryAfterSeconds !== null}
                className={`flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 transition-colors ${
                  isRecording
                    ? "bg-error/15 text-error ring-1 ring-error/40 hover:bg-error/25"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-primary"
                } disabled:cursor-not-allowed disabled:opacity-40`}
                title={isRecording ? "Stop Voice Recording" : "Voice Input"}
              >
                {isTranscribing ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : isRecording ? (
                  <>
                    <span className="h-2.5 w-2.5 animate-ping rounded-full bg-error" />
                    <span className="font-mono text-xs font-medium">
                      {formatDuration(recordingDuration)}
                    </span>
                  </>
                ) : (
                  <span className="material-symbols-outlined text-[20px]">
                    mic
                  </span>
                )}
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={retryAfterSeconds !== null}
                placeholder="Ask about your documents..."
                rows={1}
                className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/50"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isTyping || retryAfterSeconds !== null}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[20px]">
                  send
                </span>
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-outline">
              AI responses are based on your company documents. Always verify
              critical information.
            </p>
          </div>
        </div>
      </div>

      {pdfViewer && (
        <PdfViewerModal
          documentId={pdfViewer.documentId}
          pageNumber={pdfViewer.pageNumber}
          highlightText={pdfViewer.highlightText}
          documentTitle={pdfViewer.documentTitle}
          onClose={() => setPdfViewer(null)}
        />
      )}
    </div>
  );
}
