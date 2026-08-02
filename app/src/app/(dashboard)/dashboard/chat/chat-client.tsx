"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { PdfViewerModal } from "@/components/documents/PdfViewerModal";
import {
  sendMessage,
  listConversations,
  getConversationMessages,
  deleteConversation,
} from "@/services/chat.service";
import type { ChatSource, ChatSourceClip, ConversationListItem } from "@/types/api/chat.types";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  sourceClips?: ChatSourceClip[];
};

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

function InlineCitations({
  text,
  sourceClips,
  onOpenPdf,
}: {
  text: string;
  sourceClips?: ChatSourceClip[];
  onOpenPdf: (clip: ChatSourceClip) => void;
}) {
  const parts = text.split(/(\[(\d+)\])/g);
  if (!sourceClips || sourceClips.length === 0) return <>{text}</>;
  const clipByRef = new Map(sourceClips.map((c) => [c.referenceNumber, c]));

  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < parts.length) {
    const full = parts[i];
    const num = parts[i + 1];
    if (full && num) {
      const ref = parseInt(num, 10);
      const clip = clipByRef.get(ref);
      if (clip) {
        elements.push(
          <button
            key={`cite-${ref}`}
            onClick={() => onOpenPdf(clip)}
            title={`${clip.documentTitle}${clip.sectionTitle ? ` — ${clip.sectionTitle}` : ""}${clip.pageNumber ? ` (p.${clip.pageNumber})` : ""}`}
            className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded bg-primary/10 px-[3px] text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            {ref}
          </button>,
        );
      } else {
        elements.push(full);
      }
      i += 3;
    } else if (full) {
      elements.push(full);
      i += 1;
    } else {
      i += 1;
    }
  }

  return <>{elements}</>;
}

function NotebookLmSources({
  clips,
  onOpenPdf,
}: {
  clips: ChatSourceClip[];
  onOpenPdf: (clip: ChatSourceClip) => void;
}) {
  return (
    <div className="mt-3 border-t border-outline-variant/20 pt-2">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
        Sources
      </p>
      <div className="space-y-2">
        {clips.map((clip) => (
          <button
            key={`clip-${clip.referenceNumber}`}
            onClick={() => onOpenPdf(clip)}
            className="flex w-full items-start gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-2.5 text-start text-xs transition-colors hover:border-primary/30 hover:bg-primary/[0.03]"
          >
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-semibold text-primary">
              {clip.referenceNumber}
            </span>
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-on-surface">
                {clip.documentTitle}
              </span>
              {clip.sectionTitle && (
                <span className="text-outline"> — {clip.sectionTitle}</span>
              )}
              {clip.pageNumber && (
                <span className="text-outline"> (p.{clip.pageNumber})</span>
              )}
              <div className="mt-0.5 line-clamp-2 italic text-on-surface-variant">
                &ldquo;{clip.excerpt}&rdquo;
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const SUGGESTED_QUESTIONS = [
  "What is the company holidays schedule?",
  "How do I request time off?",
  "What are the IT security guidelines?",
];

export function ChatClient() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeConversation, setActiveConversation] = useState<string>("");
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [pdfViewer, setPdfViewer] = useState<{
    documentId: string;
    pageNumber?: number;
    highlightText?: string;
    documentTitle?: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgIdCounter = useRef(0);

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

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      setLoadingMessages(true);
      const result = await getConversationMessages(conversationId);
      const mapped: Message[] = result.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources,
        sourceClips: m.sourceClips,
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

  async function handleSend(text?: string) {
    const question = (text || input).trim();
    if (!question || isTyping) return;

    const convId = activeConversation;
    const userMsg: Message = {
      id: `u-${++msgIdCounter.current}`,
      role: "user",
      content: question,
    };

    setMessages((prev) => ({
      ...prev,
      [convId]: [...(prev[convId] ?? []), userMsg],
    }));

    setInput("");
    setIsTyping(true);
    setError(null);

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
      const response = await sendMessage({
        message: question,
        conversationId: convId || undefined,
      });

      const actualConvId = response.conversationId;
      const aiMsg: Message = {
        id: `a-${++msgIdCounter.current}`,
        role: "assistant",
        content: response.answer,
        sources: response.sources,
        sourceClips: response.sourceClips,
      };

      // If this was a new conversation, the server created it — update state
      if (!convId) {
        setActiveConversation(actualConvId);
        setMessages((prev) => ({ ...prev, [actualConvId]: [userMsg, aiMsg] }));

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
          [convId]: [...(prev[convId] ?? []), aiMsg],
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
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to get response. Please try again.";
      setError(errorMsg);
      const targetId = convId || activeConversation;
      setMessages((prev) => ({
        ...prev,
        [targetId]: [
          ...(prev[targetId] ?? []),
          {
            id: `e-${++msgIdCounter.current}`,
            role: "assistant",
            content: `Sorry, something went wrong: ${errorMsg}`,
          },
        ],
      }));
    } finally {
      setIsTyping(false);
    }
  }

  return (
    <div id="chat-page" className="flex h-[calc(100dvh-4rem)] overflow-hidden rounded-3xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm lg:h-[calc(100dvh-6rem)]">
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
                  {conv.lastMessage || "No messages yet"}
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
                      <div className="whitespace-pre-line text-sm leading-relaxed [&_a]:text-primary [&_a]:underline-offset-2 [&_a]:hover:underline">
                        <InlineCitations
                          text={msg.content}
                          sourceClips={msg.sourceClips}
                          onOpenPdf={(clip) =>
                            setPdfViewer({
                              documentId: clip.documentId,
                              pageNumber: clip.pageNumber,
                              highlightText: clip.excerpt,
                              documentTitle: clip.documentTitle,
                            })
                          }
                        />
                      </div>
                    {msg.sourceClips && msg.sourceClips.length > 0 && (
                      <NotebookLmSources
                        clips={msg.sourceClips}
                        onOpenPdf={(clip) =>
                          setPdfViewer({
                            documentId: clip.documentId,
                            pageNumber: clip.pageNumber,
                            highlightText: clip.excerpt,
                            documentTitle: clip.documentTitle,
                          })
                        }
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
          </div>
        )}

        {/* Input */}
        <div className="border-t border-outline-variant/30 bg-surface-container-lowest px-4 py-4 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-3 rounded-2xl border border-outline-variant/40 bg-surface px-4 py-3 shadow-sm transition-all focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask about your documents..."
                rows={1}
                className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/50"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isTyping}
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
