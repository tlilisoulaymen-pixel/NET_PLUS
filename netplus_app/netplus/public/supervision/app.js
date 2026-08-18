/* =============================================================
   NetPlus Supervision — cockpit superviseur (vanilla JS, zéro dépendance)
   ============================================================= */
(() => {
"use strict";

const CFG = window.NETPLUS || {};
const app = document.getElementById("app");

/* ------------------------------ état ------------------------------ */
const S = {
  boot: null,
  view: "home", params: {},
  seg: { missions: "today", alerts: "alerts", team: "all" },
  missions: {}, alertsFeed: null, anomaliesList: null, rankingList: null,
  refreshTimer: null,
};

/* ------------------------------ API ------------------------------ */
async function api(method, args = {}) {
  let res;
  try {
    res = await fetch(`/api/method/netplus.api.supervisor_api.${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": CFG.csrf }, body: JSON.stringify(args)
    });
  } catch (e) { throw new Error("Hors ligne — vérifiez votre connexion"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = "Erreur serveur";
    try {
      const srv = JSON.parse(data._server_messages || "[]");
      if (srv.length) msg = String(JSON.parse(srv[0]).message || "").replace(/<[^>]*>/g, "");
    } catch (e) {
      if (data.exception) msg = String(data.exception).split(":").pop().trim();
    }
    if (res.status === 403 && /csrf/i.test(msg)) msg = "Session expirée — rechargez la page";
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return data.message;
}

/* ------------------------------ utils ------------------------------ */
const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const pad = n => String(n).padStart(2, "0");
const fmtDur = s => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h${pad(m)}` : `${m} min`;
};
const parseDT = str => new Date(String(str).replace(" ", "T"));
const fmtTime = str => {
  if (!str) return "—";
  const d = parseDT(str);
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
};
const timeAgo = str => {
  if (!str) return "";
  const s = (Date.now() - parseDT(str).getTime()) / 1000;
  if (s < 90) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
};
const haptic = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

const GREETINGS = [[5, "Bonne matinée"], [12, "Bon après-midi"], [18, "Bonne soirée"]];
function greeting() {
  const h = new Date().getHours();
  let g = "Bonne soirée";
  for (const [from, label] of GREETINGS) if (h >= from) g = label;
  return g;
}
function todayLabel() {
  return new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" })
    .replace(/^./, c => c.toUpperCase());
}

/* dégradé unique par nom (reconnaissance visuelle sans photo) */
const GRADS = [
  ["#6366F1", "#8B5CF6"], ["#0EA5E9", "#6366F1"], ["#10B981", "#0EA5E9"],
  ["#F59E0B", "#EF4444"], ["#EC4899", "#8B5CF6"], ["#14B8A6", "#10B981"],
  ["#F97316", "#F59E0B"], ["#3B82F6", "#06B6D4"],
];
function gradOf(name) {
  let h = 0;
  for (const c of String(name || "?")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = GRADS[h % GRADS.length];
  return `background:linear-gradient(135deg,${a},${b})`;
}
const initialOf = name => (String(name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("") || "?").toUpperCase();
function avatarHTML(name, image, cls = "avatar") {
  return image
    ? `<div class="${cls}"><img src="${esc(image)}" alt=""></div>`
    : `<div class="${cls}" style="${gradOf(name)}">${esc(initialOf(name))}</div>`;
}

let toastT = null;
function toast(msg, isErr) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const el = document.createElement("div");
  el.className = "toast" + (isErr ? " err" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastT);
  toastT = setTimeout(() => el.remove(), 3000);
}
function overlay(msg) {
  const el = document.createElement("div");
  el.className = "overlay";
  el.innerHTML = `<div class="big-spinner"></div><div>${esc(msg)}</div>`;
  document.body.appendChild(el);
  return () => el.remove();
}

/* count-up des KPI */
function countUp(el) {
  const target = parseFloat(el.dataset.count);
  if (isNaN(target)) return;
  const dec = el.dataset.count.includes(".") ? 1 : 0;
  const t0 = performance.now(), dur = 600;
  const step = t => {
    const p = Math.min((t - t0) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (target * eased).toFixed(dec) + (el.dataset.suffix || "");
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* anneau de progression SVG */
function ringHTML(progress) {
  if (progress == null) return "";
  const pct = Math.round(progress * 100);
  const r = 16, c = 2 * Math.PI * r;
  const color = pct >= 100 ? "#F59E0B" : "#10B981";
  return `<div class="ring-wrap">
    <svg width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="${r}" fill="none" stroke="#ECECEF" stroke-width="4"/>
      <circle cx="20" cy="20" r="${r}" fill="none" stroke="${color}" stroke-width="4"
        stroke-linecap="round" stroke-dasharray="${c}"
        stroke-dashoffset="${c * (1 - Math.min(progress, 1))}"
        style="transition:stroke-dashoffset .8s ease"/>
    </svg>
    <div class="ring-txt">${pct}%</div>
  </div>`;
}

/* ------------------------------ icônes ------------------------------ */
const SW = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const I = {
  home: `<svg viewBox="0 0 24 24" ${SW}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></svg>`,
  team: `<svg viewBox="0 0 24 24" ${SW}><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1.2-3.4 4-4.5 6.5-4.5s5.3 1.1 6.5 4.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 15.7c2 .3 4.2 1.4 5 4.3"/></svg>`,
  missions: `<svg viewBox="0 0 24 24" ${SW}><rect x="4" y="4" width="16" height="17" rx="3"/><path d="M9 3v3M15 3v3M8 11h8M8 15h5"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" ${SW}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>`,
  user: `<svg viewBox="0 0 24 24" ${SW}><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-5.5 8-5.5S18.5 17 20 21"/></svg>`,
};

/* ------------------------------ navigation ------------------------------ */
function navigate(view, params = {}) {
  location.hash = "#/" + view + (params.id ? "/" + encodeURIComponent(params.id) : "");
}
function parseHash() {
  const h = (location.hash || "#/home").replace(/^#\//, "").split("/");
  return { view: h[0] || "home", params: { id: h[1] ? decodeURIComponent(h[1]) : null } };
}

const NAV = [
  { v: "home", label: "Accueil", icon: I.home },
  { v: "team", label: "Équipe", icon: I.team },
  { v: "missions", label: "Missions", icon: I.missions },
  { v: "alerts", label: "Alertes", icon: I.bell, badge: () => S.boot ? S.boot.kpis.alerts : 0 },
  { v: "profile", label: "Profil", icon: I.user },
];

function navHTML() {
  return `<nav class="bottom-nav">` + NAV.map(n => {
    const b = n.badge ? n.badge() : 0;
    return `<button class="tab ${S.view === n.v ? "on" : ""}" data-nav="${n.v}">
      ${n.icon}<span>${n.label}</span>
      ${b ? `<span class="badge">${b}</span>` : ""}</button>`;
  }).join("") + `</nav>`;
}


/* ------------------------------ vues ------------------------------ */
const V = {};

/* ---------- Accueil : le cockpit ---------- */
V.home = () => {
  const b = S.boot, k = b.kpis;
  const deltaM = k.missions_today - k.missions_yesterday;
  const kpis = [
    { icon: "📋", bg: "var(--indigo-soft)", val: k.missions_today, label: "Missions auj.",
      delta: deltaM ? `${deltaM > 0 ? "↑" : "↓"} ${Math.abs(deltaM)} vs hier` : "= hier",
      dcls: deltaM > 0 ? "up" : deltaM < 0 ? "down" : "flat" },
    { icon: "👥", bg: "var(--green-soft)", val: `${k.active}/${k.team_size}`, label: "Actifs",
      raw: true, delta: k.on_the_way ? `${k.on_the_way} en route` : "—", dcls: "flat" },
    { icon: "🚨", bg: "var(--red-soft)", val: k.alerts, label: "Alertes",
      delta: k.critical ? `${k.critical} critique${k.critical > 1 ? "s" : ""}` : "aucune critique",
      dcls: k.critical ? "down" : "flat" },
    { icon: "⭐", bg: "var(--orange-soft)", val: k.team_score ?? "—",
      raw: k.team_score == null, label: "Score équipe", delta: "moyenne 30 j", dcls: "flat" },
  ];

  const alertsHTML = b.alerts_preview.filter(a => a.level !== "past").slice(0, 3).map(alertCard).join("")
    || `<div class="empty ok"><div class="e-emoji">✅</div>
        <div class="e-title">Tout va bien</div><div>Aucune alerte active.</div></div>`;

  const missionsHTML = b.active_missions.map(m => `
    <div class="card" style="display:flex;gap:12px;align-items:center">
      ${ringHTML(m.progress)}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;color:var(--ink);font-size:14px">${esc(m.subject || m.task)}</div>
        <div style="font-size:12px;color:var(--ink-3)">${esc(m.site || "")} · ${esc(m.operator)}</div>
        <div style="font-size:11px;color:var(--ink-3);margin-top:2px">
          Depuis ${fmtTime(m.since)} · ${fmtDur(m.elapsed_s)}${m.expected_s ? " / " + fmtDur(m.expected_s) : ""}
          ${m.heartbeat ? " · 📡 " + timeAgo(m.heartbeat) : ""}</div>
      </div>
      <span class="pill green">En cours</span>
    </div>`).join("")
    || `<div class="empty ok"><div class="e-emoji">🌙</div>
        <div class="e-title">Aucune mission en cours</div><div>Les missions actives s'afficheront ici en temps réel.</div></div>`;

  const MEDALS = ["🥇", "🥈", "🥉"];
  const topHTML = b.top.length ? `<div class="top-scroll">${b.top.map((t, i) => `
    <div class="top-card" data-nav="ranking">
      <div class="medal">${MEDALS[i] || "·"}</div>
      ${avatarHTML(t.name, t.image)}
      <div class="t-name">${esc(t.name.split(" ")[0])}</div>
      <div class="t-score">${t.score != null ? t.score.toFixed(1) : "—"}</div>
    </div>`).join("")}</div>` : "";

  return `<div class="screen">
    <div class="dash-head">
      ${avatarHTML(b.profile.full_name, b.profile.image)}
      <div><div class="greet">${greeting()} 👋</div><div class="who">${esc(b.profile.full_name)}</div></div>
      <div class="date">${todayLabel()}</div>
    </div>
    <div class="kpi-scroll">${kpis.map(x => `
      <div class="kpi">
        <div class="k-icon" style="background:${x.bg}">${x.icon}</div>
        <div class="k-val" ${x.raw ? "" : `data-count="${x.val}"`}>${x.raw ? x.val : "0"}</div>
        <div class="k-label">${x.label}</div>
        <div class="k-delta ${x.dcls}">${x.delta}</div>
      </div>`).join("")}</div>
    <div class="section-title">Alertes en cours <span class="more" data-nav="alerts">Tout voir →</span></div>
    ${alertsHTML}
    <div class="section-title">Missions en cours <span class="more" data-nav="missions">Planning →</span></div>
    ${missionsHTML}
    ${topHTML ? `<div class="section-title">Top performeurs <span class="more" data-nav="ranking">Classement →</span></div>${topHTML}` : ""}
  </div>`;
};

function alertCard(a) {
  const pill = a.level === "critical" ? `<span class="pill red pulse">${esc(a.severity || "Critique")}</span>`
    : a.level === "warning" ? `<span class="pill orange">${esc(a.severity || "Alerte")}</span>`
    : `<span class="pill gray">Passée</span>`;
  const actions = a.level === "past" ? "" : `
    <div class="a-actions">
      ${a.kind === "anomaly"
        ? `<button class="btn soft" data-anom-view="${esc(a.ref)}">Examiner</button>`
        : `<button class="btn outline" data-ack="${esc(a.kind)}|${esc(a.ref)}">✓ Acquitter</button>`}
      ${a.phone ? `<a class="btn dark" style="text-decoration:none" href="tel:${esc(a.phone)}">📞 Appeler</a>` : ""}
    </div>`;
  return `<div class="card alert-card ${a.level}">
    <div class="a-head"><span class="a-title">${esc(a.title)}</span>${pill}
      <span class="a-when">${timeAgo(a.when)}</span></div>
    <div class="a-meta">${esc(a.site_label || "")}${a.who_name ? " · " + esc(a.who_name) : ""}</div>
    ${a.detail ? `<div class="a-desc">${esc(a.detail).slice(0, 200)}</div>` : ""}
    ${actions}
  </div>`;
}

/* ---------- Équipe ---------- */
const ST_LABEL = { mission: "📍 En mission", late: "⏰ En retard", available: "🟦 Disponible", offline: "Hors ligne" };
V.team = () => {
  const f = S.seg.team;
  let list = S.boot.team;
  if (f === "mission") list = list.filter(o => o.status === "mission");
  if (f === "late") list = list.filter(o => o.status === "late");

  const cards = list.map(o => `
    <div class="op-card" ${o.phone ? `data-tel="${esc(o.phone)}"` : ""}>
      <div class="band ${o.status}"></div>
      <div class="dot ${o.status}"></div>
      ${avatarHTML(o.name, o.image)}
      <div class="o-name">${esc(o.name)}</div>
      <div class="o-role">${esc(o.designation || "Opérateur")}</div>
      <div class="o-score">${o.score != null ? o.score.toFixed(1) : "—"}</div>
      <div class="o-status ${o.status}">${o.status === "mission" && o.mission
        ? "📍 " + esc(o.mission.site || "En mission") : ST_LABEL[o.status]}</div>
    </div>`).join("");

  const empty = f === "late"
    ? `<div class="empty"><div class="e-emoji">🎉</div>
       <div class="e-title">Aucun opérateur en retard</div><div>Belle journée !</div></div>`
    : `<div class="empty"><div class="e-emoji">👥</div>
       <div class="e-title">Aucun opérateur</div><div>Vérifiez le champ « reports_to » des fiches Employé.</div></div>`;

  return `<div class="screen">
    <div class="topbar"><h1>Mon équipe</h1></div>
    <div class="seg" data-seg="team">
      <button class="${f === "all" ? "on" : ""}" data-val="all">Tous</button>
      <button class="${f === "mission" ? "on" : ""}" data-val="mission">En mission</button>
      <button class="${f === "late" ? "on" : ""}" data-val="late">En retard</button>
    </div>
    ${list.length ? `<div class="team-grid">${cards}</div>` : empty}
  </div>`;
};

/* ---------- Missions ---------- */
const M_PILL = {
  planned: ["blue", "Planifiée"],
  ongoing: ["green", "En cours"],
  done: ["gray", "Terminée"],
  late: ["orange", "En retard"],
  missed: ["red", "Non réalisée"],
  cancelled: ["gray", "Annulée"],
};
V.missions = () => {
  const scope = S.seg.missions;
  const list = S.missions[scope];
  const rows = (list || []).map(m => {
    const [cls, label] = M_PILL[m.status] || M_PILL.planned;
    return `<div class="mission-row">
      <div class="time"><div class="h">${fmtTime(m.start)}</div>
        <div class="d">${m.expected_h ? m.expected_h + "h" : ""}</div></div>
      <div class="sep"></div>
      <div class="body">
        <div class="m-client">${esc(m.subject || m.task)}
          <span class="pill ${cls} ${m.status === "late" ? "pulse" : ""}">${label}</span></div>
        <div class="m-meta">📍 ${esc(m.site || "Site non défini")}</div>
        <div class="avatars">${m.operators.map(o =>
          `<div class="avatar-mini" style="${gradOf(o.name)}" title="${esc(o.name)}">${esc(initialOf(o.name))}</div>`).join("")}
          ${m.operators.some(o => o.out_of_zone) ? `<span class="pill orange" style="margin-left:8px">Hors zone</span>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");

  return `<div class="screen">
    <div class="topbar"><h1>Missions</h1></div>
    <div class="seg" data-seg="missions">
      <button class="${scope === "today" ? "on" : ""}" data-val="today">Aujourd'hui</button>
      <button class="${scope === "week" ? "on" : ""}" data-val="week">Semaine</button>
      <button class="${scope === "past" ? "on" : ""}" data-val="past">Passées</button>
    </div>
    ${list == null ? `<div class="empty"><div class="e-emoji">⏳</div><div class="e-title">Chargement…</div></div>`
      : rows || `<div class="empty"><div class="e-emoji">📭</div>
        <div class="e-title">Aucune mission</div><div>Rien de planifié sur cette période.</div></div>`}
  </div>`;
};


/* ---------- Alertes (timeline) + Anomalies ---------- */
const ANOM_BG = {
  "Accès bloqué": "var(--red-soft)", "Dégât des eaux": "var(--blue-soft)",
  "Matériel manquant": "var(--orange-soft)", "Problème électrique": "var(--orange-soft)",
  "Infestation": "var(--green-soft)", "Bris d'équipement": "var(--indigo-soft)",
};
const ANOM_EMOJI = {
  "Accès bloqué": "🚧", "Dégât des eaux": "💧", "Matériel manquant": "🧰",
  "Problème électrique": "⚡", "Infestation": "🐜", "Bris d'équipement": "🔧", "Autre": "❓",
};
const SEV_PILL = { Critique: "red", Majeure: "orange", Mineure: "green" };

V.alerts = () => {
  const seg = S.seg.alerts;
  let viewBody;
  if (seg === "alerts") {
    const feed = S.alertsFeed;
    viewBody = feed == null
      ? `<div class="empty"><div class="e-emoji">⏳</div><div class="e-title">Chargement…</div></div>`
      : feed.length
        ? `<div class="timeline">${feed.map(a =>
            `<div class="t-item"><div class="t-dot ${a.level}"></div>${alertCard(a)}</div>`).join("")}</div>`
        : `<div class="empty ok"><div class="e-emoji">✅</div>
           <div class="e-title">Tout va bien</div><div>Aucune alerte — l'historique s'affichera ici.</div></div>`;
  } else {
    const list = S.anomaliesList;
    viewBody = list == null
      ? `<div class="empty"><div class="e-emoji">⏳</div><div class="e-title">Chargement…</div></div>`
      : list.length ? list.map(anomCard).join("")
        : `<div class="empty ok"><div class="e-emoji">✨</div>
           <div class="e-title">Aucune anomalie</div><div>Les signalements terrain apparaîtront ici.</div></div>`;
  }
  return `<div class="screen">
    <div class="topbar"><h1>Alertes</h1></div>
    <div class="seg" data-seg="alerts">
      <button class="${seg === "alerts" ? "on" : ""}" data-val="alerts">Alertes</button>
      <button class="${seg === "anomalies" ? "on" : ""}" data-val="anomalies">Anomalies
        ${S.boot.kpis.open_anomalies ? " (" + S.boot.kpis.open_anomalies + ")" : ""}</button>
    </div>
    ${viewBody}
  </div>`;
};

function anomCard(a) {
  const open = a.status === "Ouverte", inProgress = a.status === "En cours";
  const img = a.photos && a.photos.length
    ? `style="background-image:url('${esc(a.photos[0])}')"`
    : `style="background:${ANOM_BG[a.anomaly_type] || "var(--gray-soft)"}"`;
  return `<div class="card anom-card" data-anom="${esc(a.name)}">
    <div class="a-img" ${img}>
      ${a.photos && a.photos.length ? "" : `<span style="opacity:.8">${ANOM_EMOJI[a.anomaly_type] || "❓"}</span>`}
      <span class="pill ${SEV_PILL[a.severity] || "gray"}">${esc(a.severity)}</span>
    </div>
    <div class="a-body">
      <div class="a-type">${esc(a.anomaly_type)}
        <span class="a-when">${timeAgo(a.creation)}</span></div>
      <div class="a-site">📍 ${esc(a.site_label || a.site)}${inProgress ? ' · <span class="pill blue">En cours</span>' : ""}
        ${a.status === "Résolue" ? ' · <span class="pill gray">Résolue</span>' : ""}</div>
      <div class="a-by">${avatarHTML(a.who_name, null, "avatar-mini")} Signalé par ${esc(a.who_name)}</div>
      ${a.description ? `<div class="a-desc">« ${esc(a.description).slice(0, 240)} »</div>` : ""}
    </div>
    ${open ? `<div class="a-actions">
      <button class="btn outline red" data-anom-act="reject|${esc(a.name)}">Rejeter</button>
      <button class="btn green" data-anom-act="validate|${esc(a.name)}">Valider</button>
    </div>` : inProgress ? `<div class="a-actions">
      <button class="btn green block" data-anom-act="resolve|${esc(a.name)}">Marquer résolue</button>
    </div>` : ""}
  </div>`;
}

/* ---------- Classement ---------- */
V.ranking = () => {
  const list = S.rankingList;
  if (list == null) return `<div class="screen">${topbarHTML("Classement")}
    <div class="empty"><div class="e-emoji">⏳</div><div class="e-title">Chargement…</div></div></div>`;
  const scored = list.filter(r => r.score != null);
  const podium = scored.slice(0, 3);
  const order = [1, 0, 2].filter(i => podium[i]); // argent, or, bronze
  const BAR = ["gold", "silver", "bronze"];
  const podiumHTML = podium.length >= 2 ? `<div class="podium">${order.map(i => {
    const p = podium[i];
    return `<div class="col">
      ${avatarHTML(p.name, p.image)}
      <div class="bar ${BAR[i]}">${p.score.toFixed(1)}</div>
      <div class="p-name">${esc(p.name.split(" ")[0])}</div>
    </div>`;
  }).join("")}</div>` : "";

  return `<div class="screen">
    ${topbarHTML("Classement")}
    ${podiumHTML}
    <div class="card">${list.map(r => `
      <div class="rank-row">
        <div class="r-pos">${r.position}</div>
        ${avatarHTML(r.name, r.image)}
        <div class="r-body"><div class="r-name">${esc(r.name)}</div>
          <div class="r-role">${esc(r.designation || "Opérateur")}</div></div>
        <div class="r-score">${r.score != null ? r.score.toFixed(1) : "—"}</div>
      </div>`).join("")}</div>
  </div>`;
};

/* ---------- Profil ---------- */
V.profile = () => {
  const p = S.boot.profile, k = S.boot.kpis;
  return `<div class="screen">
    <div class="profile-hero">
      ${avatarHTML(p.full_name, p.image)}
      <div class="p-name">${esc(p.full_name)}</div>
      <div class="p-role">${esc(p.designation || "Superviseur")}</div>
      <div class="p-stats">
        <div class="s"><div class="n">${k.team_size}</div><div class="l">Opérateurs</div></div>
        <div class="s"><div class="n">${k.missions_today}</div><div class="l">Missions auj.</div></div>
        <div class="s"><div class="n">${k.team_score ?? "—"}</div><div class="l">Score équipe</div></div>
      </div>
    </div>
    <div class="menu">
      <button class="mi" data-nav="ranking"><span class="ic">🏆</span> Classement de l'équipe <span class="arrow">→</span></button>
      <button class="mi" data-nav="alerts"><span class="ic">🚨</span> Historique des alertes <span class="arrow">→</span></button>
      <button class="mi" data-open="/portal"><span class="ic">🖥️</span> Portail complet (web) <span class="arrow">→</span></button>
      <button class="mi" data-refresh><span class="ic">🔄</span> Actualiser les données <span class="arrow">→</span></button>
    </div>
    <button class="btn outline red block" id="logoutBtn">Se déconnecter</button>
  </div>`;
};

const topbarHTML = t =>
  `<div class="topbar"><button class="back" data-back>‹</button><h1>${esc(t)}</h1></div>`;

/* ------------------------------ rendu + routeur ------------------------------ */
async function reloadBoot() { S.boot = await api("bootstrap"); }

function render() {
  const html = (V[S.view] || V.home)();
  app.innerHTML = html + navHTML();
  if (S.view === "home") document.querySelectorAll("[data-count]").forEach(countUp);
}

async function onRoute() {
  const { view, params } = parseHash();
  S.view = view; S.params = params;
  render();
  // chargements paresseux par onglet
  try {
    if (view === "missions" && S.missions[S.seg.missions] == null) {
      S.missions[S.seg.missions] = await api("missions", { scope: S.seg.missions });
      if (S.view === "missions") render();
    }
    if (view === "alerts") {
      if (S.seg.alerts === "alerts" && S.alertsFeed == null) {
        S.alertsFeed = await api("alerts_feed");
        if (S.view === "alerts") render();
      }
      if (S.seg.alerts === "anomalies" && S.anomaliesList == null) {
        S.anomaliesList = await api("anomalies");
        if (S.view === "alerts") render();
      }
    }
    if (view === "ranking" && S.rankingList == null) {
      S.rankingList = await api("ranking");
      if (S.view === "ranking") render();
    }
  } catch (e) { toast(e.message, true); }
}

/* rafraîchissement du cockpit toutes les 60 s */
function startAutoRefresh() {
  clearInterval(S.refreshTimer);
  S.refreshTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const prev = S.boot ? S.boot.kpis.alerts : 0;
      await reloadBoot();
      S.alertsFeed = null; S.anomaliesList = null;
      if (S.boot.kpis.alerts > prev) haptic(30);
      if (["home", "team"].includes(S.view)) render();
      else render(); // met à jour le badge nav
    } catch (e) { /* silencieux */ }
  }, 60000);
}

/* ------------------------------ événements ------------------------------ */
document.addEventListener("click", async ev => {
  const t = ev.target.closest(
    "[data-nav],[data-back],[data-seg] button,[data-ack],[data-anom-act],[data-anom-view],[data-tel],[data-open],[data-refresh],#logoutBtn");
  if (!t) return;

  if (t.dataset.nav) return navigate(t.dataset.nav);
  if (t.dataset.back != null) return history.back();
  if (t.dataset.open) return void (location.href = t.dataset.open);
  if (t.dataset.tel) return void (location.href = "tel:" + t.dataset.tel);

  const segWrap = t.closest("[data-seg]");
  if (segWrap && t.dataset.val) {
    const key = segWrap.dataset.seg;
    S.seg[key] = t.dataset.val;
    haptic(15);
    if (key === "missions" && S.missions[t.dataset.val] == null) return onRoute();
    if (key === "alerts") return onRoute();
    return render();
  }

  if (t.dataset.ack) {
    const [kind, ref] = t.dataset.ack.split("|");
    try {
      await api("acknowledge_alert", { kind, ref });
      haptic(30); toast("Alerte acquittée ✓");
      S.alertsFeed = null; await reloadBoot(); onRoute();
    } catch (e) { toast(e.message, true); }
    return;
  }

  if (t.dataset.anomView) {
    S.seg.alerts = "anomalies"; S.anomaliesList = null;
    return navigate("alerts");
  }

  if (t.dataset.anomAct) {
    const [action, name] = t.dataset.anomAct.split("|");
    const close = overlay(action === "reject" ? "Rejet en cours…" : "Validation…");
    try {
      await api("review_anomaly", { name, action });
      close(); haptic(40);
      toast(action === "reject" ? "Anomalie rejetée" : action === "resolve" ? "Anomalie résolue ✓" : "Anomalie prise en charge ✓");
      S.anomaliesList = null; S.alertsFeed = null;
      await reloadBoot(); onRoute();
    } catch (e) { close(); toast(e.message, true); }
    return;
  }

  if (t.dataset.refresh != null) {
    const close = overlay("Actualisation…");
    try {
      await reloadBoot();
      S.missions = {}; S.alertsFeed = null; S.anomaliesList = null; S.rankingList = null;
      close(); toast("Données à jour ✓"); render();
    } catch (e) { close(); toast(e.message, true); }
    return;
  }

  if (t.id === "logoutBtn") {
    try {
      await fetch("/?cmd=web_logout", { redirect: "manual", credentials: "same-origin" });
    } catch (e) {}
    window.location.replace("/netplus-login?redirect-to=/netplus-supervision");
  }
});

window.addEventListener("hashchange", onRoute);

/* ------------------------------ démarrage ------------------------------ */
(async function init() {
  try {
    S.boot = await api("bootstrap");
  } catch (e) {
    app.innerHTML = `<div class="screen"><div class="empty" style="padding-top:30vh">
      <div class="e-emoji">📡</div><div class="e-title">Impossible de charger le cockpit</div>
      <div>${esc(e.message)}</div></div>
      <button class="btn dark block" onclick="location.reload()">Réessayer</button></div>`;
    return;
  }
  startAutoRefresh();
  if (!location.hash) location.hash = "#/home";
  onRoute();
})();

})();
