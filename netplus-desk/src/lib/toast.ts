/**
 * Minimal toast helper — no external dependency.
 * Injects a toast container into the DOM on first use.
 */

const CONTAINER_ID = "np-toast-container";

function ensureContainer() {
  if (document.getElementById(CONTAINER_ID)) return;
  const el = document.createElement("div");
  el.id = CONTAINER_ID;
  Object.assign(el.style, {
    position: "fixed", bottom: "24px", right: "24px",
    zIndex: "99999", display: "flex", flexDirection: "column", gap: "8px",
    maxWidth: "360px", pointerEvents: "none",
  });
  document.body.appendChild(el);
}

function show(message: string, type: "success" | "error" | "info" = "info") {
  if (typeof window === "undefined") return;
  ensureContainer();
  const container = document.getElementById(CONTAINER_ID)!;

  const el = document.createElement("div");
  const bg = type === "success" ? "#10b981" : type === "error" ? "#ef4444" : "#6366f1";
  Object.assign(el.style, {
    background: bg, color: "#fff", borderRadius: "10px",
    padding: "12px 16px", fontSize: "13px", fontWeight: "500",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)", opacity: "0",
    transform: "translateY(8px)", transition: "all 0.25s ease",
    pointerEvents: "auto", lineHeight: "1.4",
  });
  el.textContent = message;
  container.appendChild(el);

  // Animate in
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });

  // Auto dismiss
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => el.remove(), 300);
  }, type === "error" ? 5000 : 3000);
}

export const toast = {
  success: (msg: string) => show(msg, "success"),
  error: (msg: string) => show(msg, "error"),
  info: (msg: string) => show(msg, "info"),
};
