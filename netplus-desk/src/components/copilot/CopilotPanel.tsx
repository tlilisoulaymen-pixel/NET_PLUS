"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Sparkles, ArrowRight, CornerDownLeft, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { query, GREETING, type CopilotResponse } from "./copilot-brain";
import { useTranslations } from "next-intl";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  response?: CopilotResponse;
  text?: string;
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function CopilotPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: "greeting", role: "assistant", response: GREETING },
  ]);
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  function handleSend() {
    const text = input.trim();
    if (!text || thinking) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    // Small delay for "thinking" feel
    setTimeout(() => {
      const response = query(text);
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        response,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setThinking(false);
    }, 350);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleLinkClick(href: string) {
    onClose();
    router.push(href);
  }

  const SUGGESTIONS = [
    "Créer une mission",
    "Voir les factures",
    "Scores opérateurs",
    "Tracking en temps réel",
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 transition-opacity duration-300",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
        style={{ backgroundColor: "rgba(0,0,0,0.25)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-screen w-[420px] max-w-[95vw] flex-col",
          "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "translate-x-0" : "translate-x-full"
        )}
        style={{
          backgroundColor: "var(--bg-surface)",
          borderLeft: "1px solid var(--line)",
          boxShadow: "-24px 0 60px rgba(0,0,0,0.12)",
        }}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div
          className="flex shrink-0 items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div className="flex items-center gap-2.5">
            {/* Glowing icon */}
            <div
              className="grid size-9 place-items-center rounded-xl"
              style={{
                background: "linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%)",
                boxShadow: "0 0 16px color-mix(in srgb, var(--accent) 50%, transparent)",
              }}
            >
              <Sparkles className="size-4 text-white" />
            </div>
            <div>
              <p className="text-[14px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                Assistant NetPlus
              </p>
              <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                Navigation intelligente
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-[var(--bg-muted)]"
            style={{ color: "var(--ink-secondary)" }}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── Messages ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg) =>
            msg.role === "user" ? (
              <UserBubble key={msg.id} text={msg.text!} />
            ) : (
              <AssistantBubble
                key={msg.id}
                response={msg.response!}
                onNavigate={handleLinkClick}
              />
            )
          )}

          {thinking && <ThinkingBubble />}
          <div ref={bottomRef} />
        </div>

        {/* ── Quick suggestions ─────────────────────────────────────────── */}
        <div
          className="shrink-0 px-4 pb-2 pt-3"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>
            Suggestions rapides
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setInput(s);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className="rounded-full border px-3 py-1 text-[12px] font-medium transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                style={{
                  borderColor: "var(--line)",
                  color: "var(--ink-secondary)",
                  backgroundColor: "var(--bg-muted)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* ── Chat input ────────────────────────────────────────────────── */}
        <div
          className="shrink-0 px-4 pb-5 pt-3"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          {/* BorderBeam-style container */}
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: "var(--bg-muted)",
              border: "1px solid var(--line)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            {/* Animated accent beam */}
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--accent) 20%, transparent) 50%, transparent 100%)",
                animation: "copilot-beam 3s linear infinite",
              }}
            />

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Où voulez-vous aller ? Ex: créer une mission…"
              rows={2}
              className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-[13px] outline-none placeholder:opacity-40"
              style={{ color: "var(--ink-primary)" }}
            />

            <div className="flex items-center justify-between px-3 pb-2.5">
              <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                <kbd className="rounded bg-[var(--bg-app)] px-1 py-px text-[10px] font-mono" style={{ border: "1px solid var(--line)" }}>
                  Enter
                </kbd>{" "}
                pour envoyer
              </p>
              <button
                onClick={handleSend}
                disabled={!input.trim() || thinking}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, var(--accent), #7c3aed)" }}
              >
                <CornerDownLeft className="size-3" />
                Envoyer
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Keyframe for beam animation */}
      <style>{`
        @keyframes copilot-beam {
          0%   { transform: translateX(-100%); opacity: 0; }
          20%  { opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateX(200%); opacity: 0; }
        }
      `}</style>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-[13px] text-white"
        style={{ background: "linear-gradient(135deg, var(--accent), #7c3aed)" }}
      >
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({
  response,
  onNavigate,
}: {
  response: CopilotResponse;
  onNavigate: (href: string) => void;
}) {
  // Render **bold** markdown
  function renderMarkdown(text: string) {
    return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("*") && part.endsWith("*"))
        return <em key={i}>{part.slice(1, -1)}</em>;
      return part;
    });
  }

  return (
    <div className="flex items-start gap-2.5">
      {/* Bot avatar */}
      <div
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg"
        style={{
          background: "linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%)",
          boxShadow: "0 0 10px color-mix(in srgb, var(--accent) 40%, transparent)",
        }}
      >
        <Bot className="size-3.5 text-white" />
      </div>

      <div className="min-w-0 flex-1">
        {/* Answer text */}
        <div
          className="rounded-2xl rounded-tl-sm px-4 py-3 text-[13px] leading-relaxed"
          style={{
            backgroundColor: "var(--bg-muted)",
            border: "1px solid var(--line)",
            color: "var(--ink-primary)",
          }}
        >
          {renderMarkdown(response.answer)}
        </div>

        {/* Links */}
        {response.links.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {response.links.map((link) => (
              <button
                key={link.href}
                onClick={() => onNavigate(link.href)}
                className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--line)",
                  color: "var(--ink-primary)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
                  (e.currentTarget as HTMLElement).style.backgroundColor = "color-mix(in srgb, var(--accent) 6%, var(--bg-surface))";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--line)";
                  (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-surface)";
                }}
              >
                <div
                  className="grid size-7 shrink-0 place-items-center rounded-lg"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
                    color: "var(--accent)",
                  }}
                >
                  <ArrowRight className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{link.label}</p>
                  {link.description && (
                    <p className="truncate text-[11px]" style={{ color: "var(--ink-muted)" }}>
                      {link.description}
                    </p>
                  )}
                </div>
                <ArrowRight
                  className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: "var(--accent)" }}
                />
              </button>
            ))}
          </div>
        )}

        {/* Follow-up hint */}
        {response.followUp && (
          <p className="mt-2 px-1 text-[11px] italic leading-relaxed" style={{ color: "var(--ink-muted)" }}>
            {renderMarkdown(response.followUp)}
          </p>
        )}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg"
        style={{ background: "linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%)" }}
      >
        <Bot className="size-3.5 text-white" />
      </div>
      <div
        className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm px-4 py-3"
        style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--line)" }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full"
            style={{
              backgroundColor: "var(--accent)",
              animation: `copilot-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes copilot-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
