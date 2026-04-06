"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { signOutAction } from "@/components/auth-actions";
import {
  ChartNoAxesColumn,
  ImagePlus,
  LoaderCircle,
  PanelLeft,
  Pencil,
  Plus,
  SendHorizontal,
  Settings,
  X
} from "lucide-react";
import { MessageContent } from "@/components/message-content";

type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  lastAssistantMessage: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageMimeType: string | null;
  imageBase64: string | null;
  createdAt: string;
};

type Props = {
  initialConversations: ConversationSummary[];
  userLabel: string;
};

type PendingImage = {
  mimeType: string;
  data: string;
  previewUrl: string;
};

type GroupedConversations = {
  label: string;
  items: ConversationSummary[];
};

type UsageSummary = {
  model: string;
  todayRequests: number;
  todayTokens: number;
  minuteRequests: number;
  minuteTokens: number;
  requestLimit: number;
  minuteRequestLimit: number;
  minuteTokenLimit: number;
  dayResetLabel: string;
  trackedOnly: boolean;
};

type UsageMeterProps = {
  label: string;
  value: number;
  limit: number;
  helper: string;
};

function formatConversationTitle(title: string) {
  const normalized = title.replace(/\s+/g, " ").trim();
  return normalized || "Untitled chat";
}

function getDateGroupLabel(updatedAt: string) {
  const today = new Date();
  const date = new Date(updatedAt);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (todayStart.getTime() - dateStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) {
    return "Today";
  }

  if (diffDays === 1) {
    return "Yesterday";
  }

  if (diffDays < 7) {
    return "Last 7 days";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric"
  });
}

function groupConversations(conversations: ConversationSummary[]): GroupedConversations[] {
  const groups = new Map<string, ConversationSummary[]>();

  for (const conversation of conversations) {
    const label = getDateGroupLabel(conversation.updatedAt);
    const existing = groups.get(label);

    if (existing) {
      existing.push(conversation);
      continue;
    }

    groups.set(label, [conversation]);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0
  }).format(value);
}

function getMeterTone(ratio: number) {
  if (ratio >= 0.9) {
    return "danger";
  }

  if (ratio >= 0.7) {
    return "warning";
  }

  return "safe";
}

function UsageMeter({ label, value, limit, helper }: UsageMeterProps) {
  const safeLimit = Math.max(limit, 1);
  const ratio = Math.min(value / safeLimit, 1);
  const tone = getMeterTone(ratio);

  return (
    <div className="usage-meter">
      <div className="usage-meter-head">
        <div>
          <p>{label}</p>
          <strong>
            {formatCompactNumber(value)} / {formatCompactNumber(limit)}
          </strong>
        </div>
        <span className={`usage-meter-badge ${tone}`}>{Math.round(ratio * 100)}%</span>
      </div>
      <div
        aria-hidden="true"
        className="usage-meter-track"
      >
        <div
          className={`usage-meter-fill ${tone}`}
          style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 6 : 0)}%` }}
        />
      </div>
      <p className="usage-meter-helper">{helper}</p>
    </div>
  );
}

export function ChatShell({ initialConversations, userLabel }: Props) {
  const [conversations, setConversations] = useState(initialConversations);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversations[0]?.id ?? null
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [isUsageLoading, setIsUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const currentConversation =
    conversations.find((conversation) => conversation.id === conversationId) ?? null;
  const groupedConversations = groupConversations(conversations);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      setIsPending(true);
      const response = await fetch(`/api/conversations/${conversationId}`);
      const payload = (await response.json()) as { messages?: ChatMessage[]; error?: string };

      if (cancelled) {
        setIsPending(false);
        return;
      }

      if (!response.ok) {
        setError(payload.error ?? "Failed to load messages.");
        setIsPending(false);
        return;
      }

      setMessages(payload.messages ?? []);
      setError(null);
      setIsPending(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setIsUsageLoading(true);

      const response = await fetch("/api/usage/summary", {
        cache: "no-store"
      });
      const payload = (await response.json()) as UsageSummary & { error?: string };

      if (cancelled) {
        return;
      }

      if (!response.ok) {
        setUsageError(payload.error ?? "Failed to load usage summary.");
        setIsUsageLoading(false);
        return;
      }

      setUsageSummary(payload);
      setUsageError(null);
      setIsUsageLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isSettingsOpen]);

  async function handleImageChange(file: File | null) {
    if (!file) {
      setPendingImage(null);
      return;
    }

    const data = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(data).reduce(
        (accumulator, byte) => accumulator + String.fromCharCode(byte),
        ""
      )
    );

    setPendingImage({
      mimeType: file.type,
      data: base64,
      previewUrl: URL.createObjectURL(file)
    });
  }

  async function submitPrompt() {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      return;
    }

    setError(null);

    const optimisticUserMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedPrompt,
      imageMimeType: pendingImage?.mimeType ?? null,
      imageBase64: pendingImage?.data ?? null,
      createdAt: new Date().toISOString()
    };

    setMessages((current) => [...current, optimisticUserMessage]);
    setPrompt("");

    const currentImage = pendingImage;
    setPendingImage(null);

    setIsPending(true);

    void (async () => {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          conversationId,
          prompt: trimmedPrompt,
          image: currentImage
            ? {
                mimeType: currentImage.mimeType,
                data: currentImage.data
              }
            : undefined
        })
      });

      const payload = (await response.json()) as {
        conversationId?: string;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.message || !payload.conversationId) {
        setError(payload.error ?? "Request failed.");
        setMessages((current) =>
          current.filter((message) => message.id !== optimisticUserMessage.id)
        );
        setIsPending(false);
        return;
      }

      const nextConversationId = payload.conversationId;
      const assistantText = payload.message;

      setConversationId(nextConversationId);
      setMessages((current) => [
        ...current.filter((message) => message.id !== optimisticUserMessage.id),
        optimisticUserMessage,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: assistantText,
          imageMimeType: null,
          imageBase64: null,
          createdAt: new Date().toISOString()
        }
      ]);

      setConversations((current) => {
        const existing = current.find((item) => item.id === nextConversationId);
        const nextItem = {
          id: nextConversationId,
          title: formatConversationTitle(trimmedPrompt.slice(0, 80)),
          updatedAt: new Date().toISOString(),
          lastAssistantMessage: assistantText
        };

        if (!existing) {
          return [nextItem, ...current];
        }

        return [nextItem, ...current.filter((item) => item.id !== nextConversationId)];
      });
      setIsPending(false);
    })();
  }

  async function handleRenameConversation(target: ConversationSummary) {
    const nextTitle = window.prompt("Rename conversation", target.title)?.trim();

    if (!nextTitle || nextTitle === target.title) {
      return;
    }

    setIsRenaming(true);

    const response = await fetch(`/api/conversations/${target.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title: nextTitle })
    });

    const payload = (await response.json()) as { title?: string; error?: string };

    if (!response.ok || !payload.title) {
      setError(payload.error ?? "Failed to rename conversation.");
      setIsRenaming(false);
      return;
    }

    const renamedTitle = formatConversationTitle(payload.title);

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === target.id
          ? { ...conversation, title: renamedTitle }
          : conversation
      )
    );
    setError(null);
    setIsRenaming(false);
  }

  function startNewChat() {
    setConversationId(null);
    setMessages([]);
    setError(null);
    setIsDrawerOpen(false);
  }

  function renderConversationList() {
    return groupedConversations.map((group) => (
      <section key={group.label} className="conversation-group">
        <p className="conversation-group-label">{group.label}</p>
        <div className="conversation-group-list">
          {group.items.map((conversation) => (
            <div
              key={conversation.id}
              className={`conversation-card ${
                conversation.id === conversationId ? "active" : ""
              }`}
            >
              <button
                className="conversation-card-main"
                onClick={() => {
                  setConversationId(conversation.id);
                  setIsDrawerOpen(false);
                }}
                type="button"
              >
                <span>{formatConversationTitle(conversation.title)}</span>
              </button>
              <button
                aria-label={`Rename ${conversation.title}`}
                className="conversation-card-edit"
                disabled={isRenaming}
                onClick={() => void handleRenameConversation(conversation)}
                type="button"
              >
                <Pencil size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
    ));
  }

  function renderUsagePanel() {
    return (
      <div className="settings-panel-card">
        <div className="settings-account-card">
          <div className="settings-account-copy">
            <p className="eyebrow">Signed in as</p>
            <strong>{userLabel}</strong>
          </div>
          <form action={signOutAction}>
            <button className="ghost-button" type="submit">
              Sign out
            </button>
          </form>
        </div>

        <div className="settings-panel-copy">
          <p className="eyebrow">Usage tracking</p>
          <h2>Gemini free tier monitor</h2>
          <p>
            Progress bars reflect requests made by this app only. Google AI Studio remains the
            source of truth for project-wide quota and billing.
          </p>
        </div>

        {isUsageLoading ? (
          <div className="settings-loading">
            <LoaderCircle className="spin" size={18} />
            <span>Loading usage summary…</span>
          </div>
        ) : null}

        {usageError ? <p className="error-text">{usageError}</p> : null}

        {usageSummary ? (
          <div className="usage-summary">
            <div className="usage-summary-head">
              <div>
                <p className="eyebrow">Current model</p>
                <strong>{usageSummary.model}</strong>
              </div>
              <a
                className="ghost-button"
                href="https://aistudio.google.com/"
                rel="noreferrer"
                target="_blank"
              >
                <ChartNoAxesColumn size={16} />
                Open AI Studio
              </a>
            </div>

            <UsageMeter
              helper={`Resets around ${usageSummary.dayResetLabel} Pacific Time.`}
              label="Today requests"
              limit={usageSummary.requestLimit}
              value={usageSummary.todayRequests}
            />
            <UsageMeter
              helper="Minute-level request pressure for the current model."
              label="This minute requests"
              limit={usageSummary.minuteRequestLimit}
              value={usageSummary.minuteRequests}
            />
            <UsageMeter
              helper={`Approximate token budget tracked from Gemini usage metadata. Today: ${formatCompactNumber(
                usageSummary.todayTokens
              )} tokens.`}
              label="This minute tokens"
              limit={usageSummary.minuteTokenLimit}
              value={usageSummary.minuteTokens}
            />

            {usageSummary.trackedOnly ? (
              <p className="settings-footnote">
                This view excludes any Gemini usage triggered outside this application, even if it
                uses the same API key or project.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const floatingUi = (
    <>
      <div className="top-toolbar">
        <div className="top-toolbar-group">
          <button
            aria-label="Open conversation drawer"
            className={`icon-button history-fab ${isDrawerOpen ? "open" : ""}`}
            onClick={() => setIsDrawerOpen(true)}
            type="button"
          >
            <PanelLeft size={18} />
          </button>
        </div>

        <div className="top-toolbar-group top-toolbar-actions">
          <button
            aria-label="Start new chat"
            className="icon-button toolbar-icon-button"
            onClick={startNewChat}
            type="button"
          >
            <Plus size={18} />
          </button>
          <button
            aria-label="Open settings"
            className="icon-button toolbar-icon-button"
            onClick={() => setIsSettingsOpen(true)}
            type="button"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      <aside
        className={`chat-sidebar ${isDrawerOpen ? "open" : ""}`}
        aria-hidden={!isDrawerOpen}
      >
        <div className="drawer-head desktop-drawer-head">
          <p className="eyebrow">History</p>
          <button
            aria-label="Close conversation drawer"
            className="icon-button"
            onClick={() => setIsDrawerOpen(false)}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <button
          className="ghost-button"
          onClick={startNewChat}
          type="button"
        >
          New chat
        </button>
        <div className="conversation-list">{renderConversationList()}</div>
        <button
          className="ghost-button sidebar-settings-button"
          onClick={() => setIsSettingsOpen(true)}
          type="button"
        >
          <Settings size={16} />
          Settings
        </button>
      </aside>

      {isDrawerOpen ? (
        <button
          aria-label="Close conversation drawer"
          className="drawer-backdrop"
          onClick={() => setIsDrawerOpen(false)}
          type="button"
        />
      ) : null}

      {isSettingsOpen ? (
        <>
          <button
            aria-label="Close settings panel"
            className="settings-backdrop"
            onClick={() => setIsSettingsOpen(false)}
            type="button"
          />
          <section
            aria-modal="true"
            className="settings-panel"
            role="dialog"
          >
            <div className="settings-panel-head">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>Quota overview</h2>
              </div>
              <button
                aria-label="Close settings panel"
                className="icon-button"
                onClick={() => setIsSettingsOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            {renderUsagePanel()}
          </section>
        </>
      ) : null}

      <div className="composer">
        {pendingImage ? (
          <div className="image-chip">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Selected file preview" src={pendingImage.previewUrl} />
            <button onClick={() => setPendingImage(null)} type="button">
              Remove
            </button>
          </div>
        ) : null}

        {error ? <p className="error-text">{error}</p> : null}

        <div className="composer-row">
          <label className="icon-button toolbar-icon-button" htmlFor="image-input">
            <ImagePlus size={18} />
          </label>
          <input
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
            id="image-input"
            onChange={(event) => void handleImageChange(event.target.files?.[0] ?? null)}
            type="file"
          />
          <textarea
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask anything..."
            rows={1}
            value={prompt}
          />
          <button
            className="primary-button composer-send"
            disabled={isPending || prompt.trim().length === 0}
            onClick={() => void submitPrompt()}
            type="button"
          >
            <SendHorizontal size={18} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="chat-shell">
      {isMounted ? createPortal(floatingUi, document.body) : null}

      <section className="chat-panel">
        <div className="chat-header">
          <div className="chat-header-row">
            <div>
              <p className="eyebrow">Gemini + Cloudflare</p>
              <h1>{currentConversation ? formatConversationTitle(currentConversation.title) : "New chat"}</h1>
              <p className="conversation-subtitle">
                {currentConversation
                  ? "Open history to switch or rename this conversation."
                  : "Start a new conversation from scratch."}
              </p>
            </div>
          </div>
        </div>

        <div className="message-list">
          {messages.length === 0 ? (
            <div className="empty-state">
              <p>Ask about text, screenshots, Japanese phrases, or daily questions.</p>
              <p>The first version stores conversations in D1 and calls Gemini from Workers.</p>
            </div>
          ) : null}

          {messages.map((message) => (
            <article
              key={message.id}
              className={`message-bubble ${message.role === "assistant" ? "assistant" : "user"}`}
            >
              <header>{message.role === "assistant" ? "Gemini" : "You"}</header>
              {message.imageBase64 && message.imageMimeType ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt="Uploaded preview"
                  className="message-image"
                  src={`data:${message.imageMimeType};base64,${message.imageBase64}`}
                />
              ) : null}
              {message.role === "assistant" ? (
                <MessageContent content={message.content} />
              ) : (
                <p className="user-message-text">{message.content}</p>
              )}
            </article>
          ))}

          {isPending ? (
            <div className="loading-row">
              <LoaderCircle className="spin" size={18} />
              <span>Working…</span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
