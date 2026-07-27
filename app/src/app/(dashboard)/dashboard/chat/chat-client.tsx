"use client";

import { useState, useRef, useEffect } from "react";
import { sendMessage } from "@/services/chat.service";
import type { ChatSource } from "@/types/api/chat.types";

let nextId = 1;
function uniqueId(prefix: string) {
  return `${prefix}-${nextId++}`;
}

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
};

type Conversation = {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  messageCount: number;
};

const SUGGESTED_QUESTIONS = [
  "What is the company holidays schedule?",
  "How do I request time off?",
  "What are the IT security guidelines?",
];

export function ChatClient() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string>("");
  const [messages, setMessages] = useState<Record<string, Message[]>>(
    {},
  );
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentMessages = messages[activeConversation] ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages.length, isTyping]);

  function createNewConversation(): string {
    const id = uniqueId("conv");
    setConversations((prev) => [
      {
        id,
        title: "New conversation",
        lastMessage: "",
        updatedAt: "Just now",
        messageCount: 0,
      },
      ...prev,
    ]);
    setActiveConversation(id);
    setMessages((prev) => ({ ...prev, [id]: [] }));
    return id;
  }

  function ensureConversation(): string {
    if (activeConversation) return activeConversation;
    return createNewConversation();
  }

  async function handleSend(text?: string) {
    const question = (text || input).trim();
    if (!question || isTyping) return;

    const convId = ensureConversation();
    const userMsg: Message = {
      id: uniqueId("u"),
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

    // Build history from current messages (before adding the new user message)
    const history = (messages[convId] ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Update conversation title from first question
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const isFirstMessage = c.messageCount === 0;
        return {
          ...c,
          title: isFirstMessage
            ? question.slice(0, 60) + (question.length > 60 ? "..." : "")
            : c.title,
          messageCount: c.messageCount + 1,
          updatedAt: "Just now",
          lastMessage: question,
        };
      }),
    );

    try {
      const response = await sendMessage({
        message: question,
        conversationId: convId,
        history,
      });

      const aiMsg: Message = {
        id: uniqueId("a"),
        role: "assistant",
        content: response.answer,
        sources: response.sources,
      };

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
                updatedAt: "Just now",
              }
            : c,
        ),
      );
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to get response. Please try again.";
      setError(errorMsg);
      setMessages((prev) => ({
        ...prev,
        [convId]: [
          ...(prev[convId] ?? []),
          {
            id: uniqueId("e"),
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
    <div className="flex h-[calc(100dvh-4rem)] overflow-hidden rounded-3xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm lg:h-[calc(100dvh-6rem)]">
      {/* Sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-e border-outline-variant/30 bg-surface-container-low md:flex">
        <div className="border-b border-outline-variant/30 p-4">
          <h2 className="text-title-sm font-bold text-on-surface">Conversations</h2>
          <button
            onClick={() => createNewConversation()}
            className="mt-3 flex w-full items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setActiveConversation(conv.id)}
              className={`flex w-full flex-col gap-1 border-b border-outline-variant/20 px-4 py-3 text-start transition-colors hover:bg-surface-container ${
                activeConversation === conv.id
                  ? "bg-primary/5 border-s-4 border-s-primary"
                  : ""
              }`}
            >
              <span className="truncate text-sm font-semibold text-on-surface">
                {conv.title}
              </span>
              <span className="truncate text-xs text-on-surface-variant">
                {conv.lastMessage || "No messages yet"}
              </span>
              <span className="text-[11px] text-outline">{conv.updatedAt}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
          {currentMessages.length === 0 ? (
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
                    <p className="whitespace-pre-line">{msg.content}</p>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 border-t border-outline-variant/20 pt-2">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                          Sources
                        </p>
                        {msg.sources.map((src) => (
                          <p
                            key={src.chunkId}
                            className="flex items-center gap-1 text-xs text-on-surface-variant"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              description
                            </span>
                            {src.documentTitle ?? "Document"}
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
                          </p>
                        ))}
                      </div>
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
    </div>
  );
}
