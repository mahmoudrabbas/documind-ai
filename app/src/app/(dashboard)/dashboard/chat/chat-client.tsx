"use client";

import { useState, useRef, useEffect } from "react";

let nextId = 1;
function uniqueId(prefix: string) {
  return `${prefix}-${nextId++}`;
}

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
};

type Conversation = {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  messageCount: number;
};

const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "1",
    title: "Employee leave policy",
    lastMessage: "You are entitled to 20 days of annual leave...",
    updatedAt: "2 min ago",
    messageCount: 4,
  },
  {
    id: "2",
    title: "Remote work guidelines",
    lastMessage: "Remote work is allowed up to 3 days per week...",
    updatedAt: "1 hour ago",
    messageCount: 6,
  },
  {
    id: "3",
    title: "Expense reimbursement process",
    lastMessage: "Submit receipts within 30 days via the portal...",
    updatedAt: "Yesterday",
    messageCount: 3,
  },
];

const MOCK_MESSAGES: Record<string, Message[]> = {
  "1": [
    {
      id: "m1",
      role: "user",
      content: "How many annual leave days am I entitled to?",
    },
    {
      id: "m2",
      role: "assistant",
      content:
        "According to the Employee Handbook (Section 4.2), you are entitled to **20 days of annual leave** per calendar year. This accrues at a rate of 1.67 days per month for full-time employees. Part-time employees accrue on a pro-rata basis.",
      sources: ["Employee Handbook v3.1 — Section 4.2"],
    },
    {
      id: "m3",
      role: "user",
      content: "Can I carry over unused days to next year?",
    },
    {
      id: "m4",
      role: "assistant",
      content:
        "Yes, you may carry over up to **5 unused days** to the next calendar year, provided you submit a carry-over request to HR before December 31st. Any days beyond this limit will expire. Carry-over days must be used by March 31st of the following year.",
      sources: ["Employee Handbook v3.1 — Section 4.3"],
    },
  ],
  "2": [
    {
      id: "m5",
      role: "user",
      content: "What is the company's remote work policy?",
    },
    {
      id: "m6",
      role: "assistant",
      content:
        "The Remote Work Policy (effective Jan 2025) allows eligible employees to work remotely **up to 3 days per week**. Your manager must approve the schedule. Fully remote arrangements require VP-level approval and are subject to role suitability review.",
      sources: ["Remote Work Policy 2025 — Page 1-2"],
    },
    {
      id: "m7",
      role: "user",
      content: "Do I need special equipment for working from home?",
    },
    {
      id: "m8",
      role: "assistant",
      content:
        "Yes. The company provides a **laptop, monitor, and ergonomic chair** for remote workers. You must submit an IT Equipment Request form. Internet reimbursement of up to $50/month is also available upon submission of monthly bills to Finance.",
      sources: ["Remote Work Policy 2025 — Section 3.1", "IT Equipment Guidelines"],
    },
  ],
  "3": [
    {
      id: "m9",
      role: "user",
      content: "How do I submit an expense report?",
    },
    {
      id: "m10",
      role: "assistant",
      content:
        "To submit an expense report:\n\n1. Log into the **Expense Portal** (finance.company.com)\n2. Select the category (travel, meals, supplies, etc.)\n3. Upload receipts as PDF or images\n4. Add a description and submit for approval\n\nAll receipts must be submitted within **30 days** of the expense. Reports over $500 require manager + finance approval.",
      sources: ["Expense Policy 2024 — Section 2"],
    },
  ],
};

const SUGGESTED_QUESTIONS = [
  "What is the company holidays schedule?",
  "How do I request time off?",
  "What are the IT security guidelines?",
];

export function ChatClient() {
  const [activeConversation, setActiveConversation] = useState("1");
  const [messages, setMessages] = useState<Record<string, Message[]>>(
    MOCK_MESSAGES,
  );
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentMessages = messages[activeConversation] ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages.length, isTyping]);

  function handleSend(text?: string) {
    const question = (text || input).trim();
    if (!question || isTyping) return;

    const userMsg: Message = {
      id: uniqueId("u"),
      role: "user",
      content: question,
    };

    setMessages((prev) => ({
      ...prev,
      [activeConversation]: [...(prev[activeConversation] ?? []), userMsg],
    }));
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const aiMsg: Message = {
        id: uniqueId("a"),
        role: "assistant",
        content:
          "This is a mock response. The AI chat feature will be connected to the document knowledge base once the RAG pipeline is implemented.",
        sources: ["Mock Source — Coming Soon"],
      };
      setMessages((prev) => ({
        ...prev,
        [activeConversation]: [...(prev[activeConversation] ?? []), aiMsg],
      }));
      setIsTyping(false);
    }, 1200);
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] overflow-hidden rounded-3xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm lg:h-[calc(100dvh-6rem)]">
      {/* Sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-e border-outline-variant/30 bg-surface-container-low md:flex">
        <div className="border-b border-outline-variant/30 p-4">
          <h2 className="text-title-sm font-bold text-on-surface">Conversations</h2>
          <button
            onClick={() => {
              const id = uniqueId("new");
              setActiveConversation(id);
              setMessages((prev) => ({ ...prev, [id]: [] }));
            }}
            className="mt-3 flex w-full items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {MOCK_CONVERSATIONS.map((conv) => (
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
                {conv.lastMessage}
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
                            key={src}
                            className="flex items-center gap-1 text-xs text-on-surface-variant"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              description
                            </span>
                            {src}
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
