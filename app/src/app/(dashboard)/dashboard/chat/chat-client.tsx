"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PdfViewerModal } from "@/components/documents/PdfViewerModal";
import { FeedbackWidget } from "@/components/domain/FeedbackWidget";
import { AssistantMarkdown } from "@/components/domain/AssistantMarkdown";
import { SourceList } from "@/components/domain/ChatSources";
import {
  ChatImageThumbnail,
  PersistedChatImageThumbnail,
} from "@/components/domain/ChatImageThumbnail";
import { ChatImagePreviewModal } from "@/components/domain/ChatImagePreviewModal";
import { UpgradePrompt } from "@/components/entitlement/UpgradePrompt";
import {
  mapEntitlementError,
  type EntitlementDenial,
} from "@/lib/entitlement-errors";
import {
  sendMessage,
  sendVisionMessage,
  transcribeAudio,
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
import { getContentDirection } from "@/lib/i18n/content-direction";

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
const MAX_TEXTAREA_HEIGHT = 128;

function formatRelativeTime(
  iso: string,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return new Date(iso).toLocaleString();
  }
  if (seconds < 60) return t("dashboard.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return t("dashboard.minutesAgo", { count: String(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("dashboard.hoursAgo", { count: String(hours) });
  const days = Math.floor(hours / 24);
  return t("dashboard.daysAgo", { count: String(days) });
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

const SUGGESTED_QUESTION_KEYS = [
  "chat.suggestedQuestion1",
  "chat.suggestedQuestion2",
  "chat.suggestedQuestion3",
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

function ThinkingIndicator({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2"
    >
      <span className="flex gap-1" aria-hidden="true">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/30 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/25 [animation-delay:300ms]" />
      </span>
      <span className="text-[13px] text-on-surface-variant">{label}</span>
    </div>
  );
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: Array<Array<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

interface WindowWithSpeech {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  currentAudioStream?: MediaStream | null;
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
  const [imagePreview, setImagePreview] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const liveSpeechCapturedRef = useRef<boolean>(false);
  const liveTranscriptRef = useRef<string>("");
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clientMessageIdRef = useRef<string | null>(null);
  const msgIdCounter = useRef(0);

  const startRecording = async () => {
    try {
      setError(null);
      audioChunksRef.current = [];
      liveSpeechCapturedRef.current = false;
      liveTranscriptRef.current = "";

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      (window as unknown as WindowWithSpeech).currentAudioStream = stream;

      // Set up MediaRecorder for native audio capture and Voxtral STT backend fallback
      try {
        if (typeof MediaRecorder !== "undefined") {
          let mimeType = "";
          if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
            mimeType = "audio/webm;codecs=opus";
          } else if (MediaRecorder.isTypeSupported("audio/webm")) {
            mimeType = "audio/webm";
          } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
            mimeType = "audio/mp4";
          } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
            mimeType = "audio/ogg";
          }

          const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };
          recorder.start(250);
          mediaRecorderRef.current = recorder;
        }
      } catch {
        // Ignore recorder creation errors
      }

      // Try browser Web Speech API for real-time live preview (if supported & network available)
      const win = window as unknown as WindowWithSpeech;
      const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang =
            navigator.language || document.documentElement.lang || "ar-EG";

          recognition.onresult = (event: { resultIndex: number; results: Array<Array<{ transcript: string }>> }) => {
            let transcript = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              transcript += event.results[i][0].transcript;
            }
            if (transcript.trim()) {
              liveSpeechCapturedRef.current = true;
              liveTranscriptRef.current = transcript.trim();
              setInput(transcript.trim());
            }
          };

          recognition.onerror = (event: { error: string }) => {
            if (event.error === "not-allowed") {
              setError(t("chat.error.micPermission"));
            }
          };

          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch {
          // Ignore SpeechRecognition start errors
        }
      }

      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch {
      setError(t("chat.error.micFailed"));
    }
  };

  const processRecordedAudio = async () => {
    // If live browser speech recognition already captured the exact spoken words, preserve them 100%
    if (liveSpeechCapturedRef.current && liveTranscriptRef.current.trim()) {
      setInput(liveTranscriptRef.current.trim());
      return;
    }

    const chunks = audioChunksRef.current;
    if (!chunks || chunks.length === 0) return;

    const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
    const audioBlob = new Blob(chunks, { type: mimeType });
    audioChunksRef.current = [];

    if (audioBlob.size < 500) return;

    try {
      setIsTranscribing(true);
      const res = await transcribeAudio(audioBlob);
      if (res && res.text && res.text.trim()) {
        const text = res.text.trim();
        // Prevent silent audio hallucinations from replacing user input
        if (
          !/simple circuit|light bulb|turn on the light|turn off the light|thank you for watching|subtitles by|amara\.org/i.test(text)
        ) {
          setInput(text);
        }
      }
    } catch {
      // Silently ignore STT errors to prevent Next.js dev overlay popups
    } finally {
      setIsTranscribing(false);
    }
  };

  const stopRecording = () => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      speechRecognitionRef.current = null;
    }

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    setIsRecording(false);

    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;

    const win = window as unknown as WindowWithSpeech;
    const stream = win.currentAudioStream;
    if (stream) {
      stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      win.currentAudioStream = null;
    }

    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        processRecordedAudio();
      };
      try {
        recorder.stop();
      } catch {
        processRecordedAudio();
      }
    } else {
      processRecordedAudio();
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

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [input]);

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

  const handleOpenSource = useCallback((source: ChatSource) => {
    setPdfViewer({
      documentId: source.documentId,
      pageNumber: source.pageNumber,
      highlightText: source.text,
      documentTitle: source.documentTitle,
    });
  }, []);

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
    <div className="flex h-[calc(100dvh-4rem)] overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface shadow-sm lg:h-[calc(100dvh-6rem)]">
      {/* Sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-e border-outline-variant/25 bg-surface-container-lowest md:flex">
        <div className="border-b border-outline-variant/20 px-4 py-3.5">
          <h2 className="text-sm font-semibold tracking-normal text-on-surface">
            {t("chat.conversationsTitle")}
          </h2>
          <button
            onClick={() => handleNewConversation()}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 text-sm font-semibold text-on-surface transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span className="material-symbols-outlined text-[17px]">add</span>
            {t("chat.newConversation")}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loadingConversations && conversations.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-on-surface-variant">
              {t("common.loading")}
            </div>
          ) : (
            conversations.map((conv) => {
              const titleDir = getContentDirection(conv.title);
              const previewDir = getContentDirection(conv.lastMessage);
              return (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`group relative flex w-full cursor-pointer flex-col gap-1.5 rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-surface-container-low ${
                    activeConversation === conv.id
                      ? "bg-primary/5"
                      : ""
                  }`}
                >
                  {activeConversation === conv.id && (
                    <span
                      className="absolute inset-y-3 start-0 w-1 rounded-full bg-primary/70"
                      aria-hidden="true"
                    />
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <span
                      dir={titleDir.dir}
                      lang={titleDir.lang}
                      className="min-w-0 flex-1 truncate text-[13.5px] font-semibold leading-5 text-on-surface"
                    >
                      {conv.title}
                    </span>
                    <button
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-on-surface-variant/0 transition-colors hover:bg-error/10 hover:text-error group-hover:text-on-surface-variant/50 focus-visible:text-on-surface-variant focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                      title={t("chat.deleteConversation")}
                    >
                      <span className="material-symbols-outlined text-[15px]">delete</span>
                    </button>
                  </div>
                  <span
                    dir={previewDir.dir}
                    lang={previewDir.lang}
                    className="truncate text-xs leading-4 text-on-surface-variant/70"
                  >
                    {previewText(conv.lastMessage) || t("chat.noMessagesYet")}
                  </span>
                  <span className="text-[10px] font-medium leading-4 text-outline/80">
                    {formatRelativeTime(conv.updatedAt, t)}
                  </span>
                </div>
              );
            })
          )}
          {!loadingConversations && conversations.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-on-surface-variant">
              {t("chat.noConversations")}
            </div>
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col bg-surface-container-lowest">
        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-5 sm:px-6 lg:pe-8 lg:ps-8">
          {currentMessages.length === 0 && !loadingMessages ? (
            <div className="flex h-full flex-col items-center justify-center gap-5 px-4 pb-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/10">
                <span
                  className="material-symbols-outlined text-[30px] text-primary/80"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  psychology
                </span>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-title-lg font-semibold text-on-surface">
                  {t("chat.emptyTitle")}
                </h2>
                <p className="mx-auto max-w-md text-sm leading-6 text-on-surface-variant">
                  {t("chat.emptyDescription")}
                </p>
              </div>
              <div className="flex max-w-2xl flex-wrap items-center justify-center gap-2">
                {SUGGESTED_QUESTION_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSend(t(key))}
                    disabled={isTyping || retryAfterSeconds !== null}
                    className="rounded-full border border-outline-variant/30 bg-surface px-3.5 py-1.5 text-sm text-on-surface-variant transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          ) : loadingMessages ? (
            <div className="flex h-full items-center justify-center">
              <div className="rounded-2xl border border-outline-variant/20 bg-surface px-3.5 py-2.5">
                <ThinkingIndicator label={t("chat.loadingConversation")} />
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-5xl flex-col gap-4">
              {currentMessages.map((msg) => {
                const contentDir = getContentDirection(msg.content);
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/10">
                        <span className="material-symbols-outlined text-[16px] text-primary/80">
                          smart_toy
                        </span>
                      </div>
                    )}
                    <div
                      className={`flex min-w-0 flex-col ${
                        msg.role === "user"
                          ? "max-w-[calc(100%-2.5rem)] items-end sm:max-w-[68%]"
                          : "max-w-[calc(100%-2.5rem)] items-start sm:max-w-[88%]"
                      }`}
                    >
                      <div
                        className={
                          msg.role === "user"
                            ? "w-fit max-w-full rounded-2xl rounded-ee-md bg-primary px-3.5 py-2 text-[15px] leading-6 text-on-primary shadow-sm"
                            : "w-full rounded-2xl rounded-ss-md border border-outline-variant/15 bg-surface/80 px-5 py-4 text-base leading-7 text-on-surface"
                        }
                      >
                        {msg.role === "user" && msg.localAttachmentUrl && (
                          <div className="mb-2">
                            <ChatImageThumbnail
                              src={msg.localAttachmentUrl}
                              alt={t("chat.attachmentPreview")}
                              onOpen={() =>
                                setImagePreview({
                                  src: msg.localAttachmentUrl as string,
                                  alt: t("chat.attachmentPreview"),
                                })
                              }
                            />
                          </div>
                        )}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {msg.attachments.map((attachment) => (
                              <PersistedChatImageThumbnail
                                key={attachment.id}
                                attachment={attachment}
                                alt={attachment.fileName}
                                onOpen={(src) =>
                                  setImagePreview({
                                    src,
                                    alt: attachment.fileName,
                                  })
                                }
                              />
                            ))}
                          </div>
                        )}
                        {msg.role === "user" ? (
                          <p
                            dir={contentDir.dir}
                            lang={contentDir.lang}
                            className="whitespace-pre-line break-words"
                          >
                            {msg.content}
                          </p>
                        ) : (
                          <AssistantMarkdown content={msg.content} />
                        )}
                      </div>
                      {msg.sources && msg.sources.length > 0 && (
                        <SourceList
                          sources={msg.sources}
                          onOpen={handleOpenSource}
                        />
                      )}
                      {msg.role === "assistant" && activeConversation && (
                        <FeedbackWidget
                          messageId={msg.id}
                          conversationId={activeConversation}
                        />
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-container-high/80 ring-1 ring-outline-variant/20">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant/80">
                          person
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
              {isTyping && (
                <div className="flex gap-2.5">
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/10">
                    <span className="material-symbols-outlined text-[16px] text-primary/80">
                      smart_toy
                    </span>
                  </div>
                  <div className="rounded-2xl rounded-ss-md border border-outline-variant/20 bg-surface px-4 py-3">
                    <ThinkingIndicator label={t("chat.thinking")} />
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
            {retryAfterSeconds !== null &&
              ` ${t("chat.error.retryCountdown", {
                seconds: String(retryAfterSeconds),
              })}`}
          </div>
        )}

        {/* Entitlement denial banner (429 quota exceeded / 403 subscription inactive) */}
        {entitlementBanner && (
          <div className="border-t border-outline-variant/25 bg-surface-container-lowest px-4 py-3 sm:px-6 lg:px-10">
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
        <div className="border-t border-outline-variant/20 bg-surface/95 px-4 pb-3 pt-3 sm:px-6 lg:pe-8 lg:ps-8">
          <div className="mx-auto max-w-5xl">
            {previewUrl && selectedFile && (
              <div className="mb-2 flex w-full items-center gap-3 rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-2 pe-3 sm:max-w-md">
                <img
                  src={previewUrl}
                  alt={t("chat.selectedImagePreview")}
                  className="h-12 w-16 shrink-0 rounded-lg object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-on-surface-variant">
                  {selectedFile.name}
                </span>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  aria-label={t("chat.removeImage")}
                  title={t("chat.removeImage")}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-error"
                >
                  <span
                    className="material-symbols-outlined text-[18px]"
                    aria-hidden="true"
                  >
                    close
                  </span>
                </button>
              </div>
            )}
            <div className="flex items-end gap-1.5 rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-2 shadow-sm transition-colors focus-within:border-primary/50 focus-within:bg-surface focus-within:ring-4 focus-within:ring-primary/10">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={retryAfterSeconds !== null}
                aria-label={t("chat.attachImage")}
                title={t("chat.attachImage")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant/75 transition-colors hover:bg-surface-container-high hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span
                  className="material-symbols-outlined text-[20px]"
                  aria-hidden="true"
                >
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
                type="button"
                onClick={toggleRecording}
                disabled={isTranscribing || retryAfterSeconds !== null}
                aria-label={
                  isRecording ? t("chat.stopRecording") : t("chat.voiceInput")
                }
                title={isRecording ? t("chat.stopRecording") : t("chat.voiceInput")}
                className={`flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                  isRecording
                    ? "bg-error/15 text-error ring-1 ring-error/40 hover:bg-error/25"
                    : "text-on-surface-variant/75 hover:bg-surface-container-high hover:text-primary"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {isTranscribing ? (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
                    aria-hidden="true"
                  />
                ) : isRecording ? (
                  <>
                    <span
                      className="h-2.5 w-2.5 animate-ping rounded-full bg-error"
                      aria-hidden="true"
                    />
                    <span className="font-mono text-xs font-medium tabular-nums">
                      {formatDuration(recordingDuration)}
                    </span>
                  </>
                ) : (
                  <span
                    className="material-symbols-outlined text-[20px]"
                    aria-hidden="true"
                  >
                    mic
                  </span>
                )}
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={retryAfterSeconds !== null}
                placeholder={t("chat.inputPlaceholder")}
                rows={1}
                className="max-h-32 min-h-[24px] flex-1 resize-none overflow-y-auto bg-transparent px-1.5 py-1.5 text-[15px] leading-6 text-on-surface outline-none placeholder:text-on-surface-variant/55"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() || isTyping || retryAfterSeconds !== null}
                aria-label={t("chat.sendAriaLabel")}
                title={t("chat.sendAriaLabel")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-on-primary disabled:cursor-not-allowed disabled:bg-primary/40 disabled:text-on-primary/80 disabled:hover:bg-primary/40 disabled:shadow-none"
              >
                {isTyping ? (
                  <span
                    className="material-symbols-outlined animate-spin text-[19px]"
                    aria-hidden="true"
                  >
                    progress_activity
                  </span>
                ) : (
                  <span
                    className="material-symbols-outlined text-[19px]"
                    aria-hidden="true"
                  >
                    send
                  </span>
                )}
              </button>
            </div>
            <p className="mt-2 text-center text-[10.5px] leading-4 text-outline">
              {t("chat.disclaimer")}
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

      <ChatImagePreviewModal
        src={imagePreview?.src ?? null}
        alt={imagePreview?.alt}
        onClose={() => setImagePreview(null)}
      />
    </div>
  );
}
