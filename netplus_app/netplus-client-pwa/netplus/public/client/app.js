/* =============================================================
   NetPlus Client — portail de confiance (vanilla JS, zéro dépendance)
   Feedback < 30 s : étoiles -> détails optionnels -> envoi.
   ============================================================= */
(() => {
"use strict";

const CFG = window.NETPLUS || {};
const app = document.getElementById("app");

/* ------------------------------ état ------------------------------ */
const S = {
  boot: null,
  view: "home", params: {},
  seg: { interventions: "all" },
  intList: {}, fbList: null, ctList: null,
  rate: { task: null, subject: null, site: null, overall: 0, params: {}, nps: null },
};

/* ------------------------------ API ------------------------------ */
async function api(method, args = {}) {
  let res;
  try {
    res = await fetch(`/api/method/netplus.api.client_api.${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": CFG.csrf },
      body: JSON.stringify(args),
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

const parseDT = str => new Date(String(str).replace(" ", "T"));
const fmtDT = str => {
  if (!str) return "—";
  const d = parseDT(str);
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
};
const fmtDate = str => {
  if (!str) return "—";
  return parseDT(str).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
};
const timeAgo = str => {
  if (!str) return "";
  const s = (Date.now() - parseDT(str).getTime()) / 1000;
  if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
};
const stars = (n, max = 5) => "★".repeat(Math.round(n)) + "☆".repeat(max - Math.round(n));
const haptic = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
const initialOf = n => (String(n || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("") || "?").toUpperCase();

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
function successFull(title, sub, cb) {
  haptic(50);
  const el = document.createElement("div");
  el.className = "success-full";
  el.innerHTML = `<div class="check">✓</div><div class="s-title">${esc(title)}</div><div>${esc(sub || "")}</div>`;
  document.body.appendChild(el);
  setTimeout(() => { el.remove(); cb && cb(); }, 1100);
}

/* ------------------------------ icônes ------------------------------ */
const SW = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const I = {
  home: `<svg viewBox="0 0 24 24" ${SW}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></svg>`,
  list: `<svg viewBox="0 0 24 24" ${SW}><rect x="4" y="4" width="16" height="17" rx="3"/><path d="M9 3v3M15 3v3M8 11h8M8 15h5"/></svg>`,
  doc: `<svg viewBox="0 0 24 24" ${SW}><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>`,
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
  { v: "interventions", label: "Interventions", icon: I.list },
  { v: "rate-pick", fab: true },
  { v: "contracts", label: "Contrats", icon: I.doc },
  { v: "profile", label: "Profil", icon: I.user },
];

function navHTML() {
  const pending = S.boot ? S.boot.to_rate.length : 0;
  return `<nav class="bottom-nav">` + NAV.map(n => n.fab
    ? `<button class="fab" data-nav="rate-pick" aria-label="Évaluer">★</button>`
    : `<button class="tab ${S.view === n.v || (n.v === "interventions" && S.view === "feedback-history") ? "on" : ""}"
        data-nav="${n.v}">${n.icon}<span>${n.label}</span>
        ${n.v === "home" && pending ? `<span class="badge">${pending}</span>` : ""}</button>`
  ).join("") + `</nav>`;
}

/* ------------------------------ vues ------------------------------ */
const V = {};
const ST_PILL = { planned: ["blue", "Planifiée"], ongoing: ["green", "En cours"], done: ["gray", "Terminée"] };

V.home = () => {
  const b = S.boot, sat = b.satisfaction;
  const total = sat.dist.high + sat.dist.mid + sat.dist.low || 1;
  const bar = (n) => Math.round(n / total * 100);

  const hero = `<div class="hero">
    <div class="h-label">Votre satisfaction</div>
    ${sat.avg != null ? `
      <div class="h-score"><span class="n">${sat.avg.toFixed(1)}</span><span class="of">/ 5</span></div>
      <div class="stars">${stars(sat.avg)}</div>
      <div class="dist">
        <div class="d-row"><span class="lbl">5★</span><div class="bar"><div class="fill" style="width:${bar(sat.dist.high)}%"></div></div><span class="n">${sat.dist.high}</span></div>
        <div class="d-row"><span class="lbl">4★</span><div class="bar"><div class="fill" style="width:${bar(sat.dist.mid)}%"></div></div><span class="n">${sat.dist.mid}</span></div>
        <div class="d-row"><span class="lbl">≤3★</span><div class="bar"><div class="fill" style="width:${bar(sat.dist.low)}%"></div></div><span class="n">${sat.dist.low}</span></div>
      </div>`
    : `<div class="h-score"><span class="n">—</span></div>
       <div class="h-empty">Évaluez votre première intervention pour voir votre indice de satisfaction ici. Vos notes comptent : elles guident directement nos équipes.</div>`}
  </div>`;

  const rateCards = b.to_rate.map(t => `
    <div class="rate-card" data-rate="${esc(t.task)}">
      <div class="r-body"><div class="r-title">${esc(t.subject || t.task)}</div>
        <div class="r-meta">${esc(t.site || "")} · ${fmtDT(t.end || t.start)}</div></div>
      <button class="go">★ Évaluer</button>
    </div>`).join("");

  const upcoming = b.upcoming.map(t => `
    <div class="card int-card" data-nav-int>
      <div class="i-icon blue">📅</div>
      <div class="i-body"><div class="i-title">${esc(t.subject || t.task)}</div>
        <div class="i-meta">${esc(t.site || "")} · ${fmtDT(t.start)}</div></div>
      <span class="pill blue">Planifiée</span>
    </div>`).join("")
    || `<div class="empty"><div class="e-emoji">🌿</div>
        <div class="e-title">Rien de planifié</div><div>Vos prochaines interventions apparaîtront ici.</div></div>`;

  return `<div class="screen">
    <div class="head">
      <div class="avatar">${esc(initialOf(b.profile.full_name))}</div>
      <div><div class="hello">Bonjour 👋</div><div class="who">${esc(b.profile.first_name)}</div></div>
      <div class="org">${esc(b.profile.customer_label)}</div>
    </div>
    ${hero}
    ${rateCards ? `<div class="section-title">À évaluer <span class="pill green">${b.to_rate.length}</span></div>${rateCards}` : ""}
    <div class="section-title">Prochaines interventions <span class="more" data-nav="interventions">Tout voir →</span></div>
    ${upcoming}
  </div>`;
};

V.interventions = () => {
  const scope = S.seg.interventions;
  const list = S.intList[scope];
  const rows = (list || []).map(t => {
    const [cls, label] = ST_PILL[t.state] || ST_PILL.planned;
    const right = t.state === "done"
      ? (t.rated ? `<span class="pill green">${stars(t.my_rating || 0).slice(0, 5)}</span>`
                 : `<button class="go" data-rate="${esc(t.task)}" style="background:var(--green);color:#fff;border:none;border-radius:12px;min-height:40px;padding:0 12px;font-family:inherit;font-weight:800;font-size:12px;cursor:pointer">★ Évaluer</button>`)
      : `<span class="pill ${cls}">${label}</span>`;
    return `<div class="card int-card">
      <div class="i-icon ${t.state === "done" ? "green" : "blue"}">${t.state === "done" ? "✅" : t.state === "ongoing" ? "🧹" : "📅"}</div>
      <div class="i-body"><div class="i-title">${esc(t.subject || t.task)}</div>
        <div class="i-meta">${esc(t.site || "")} · ${fmtDT(t.start)}</div></div>
      ${right}
    </div>`;
  }).join("");

  return `<div class="screen">
    <div class="topbar"><h1>Interventions</h1></div>
    <div class="seg" data-seg="interventions">
      <button class="${scope === "all" ? "on" : ""}" data-val="all">Toutes</button>
      <button class="${scope === "upcoming" ? "on" : ""}" data-val="upcoming">À venir</button>
      <button class="${scope === "done" ? "on" : ""}" data-val="done">Terminées</button>
    </div>
    ${list == null ? `<div class="empty"><div class="e-emoji">⏳</div><div class="e-title">Chargement…</div></div>`
      : rows || `<div class="empty"><div class="e-emoji">🗂️</div>
        <div class="e-title">Aucune intervention</div><div>Rien sur cette période.</div></div>`}
    <button class="btn ghost" data-nav="feedback-history" style="margin-top:16px">Mes évaluations passées</button>
  </div>`;
};


/* ---------- choisir l'intervention à évaluer ---------- */
V["rate-pick"] = () => {
  const list = (S.intList.done || []).filter(t => !t.rated);
  const pending = list.length ? list : S.boot.to_rate;
  return `<div class="screen">
    ${topbarHTML("Évaluer une intervention")}
    ${pending.length ? pending.map(t => `
      <div class="card int-card" data-rate="${esc(t.task)}">
        <div class="i-icon green">✅</div>
        <div class="i-body"><div class="i-title">${esc(t.subject || t.task)}</div>
          <div class="i-meta">${esc(t.site || "")} · ${fmtDT(t.end || t.start)}</div></div>
        <span class="pill green">★ Évaluer</span>
      </div>`).join("")
    : `<div class="empty"><div class="e-emoji">🎉</div>
       <div class="e-title">Tout est évalué !</div>
       <div>Merci — vos retours guident directement nos équipes.</div></div>
       <button class="btn ghost" data-nav="feedback-history">Voir mes évaluations</button>`}
  </div>`;
};

/* ---------- formulaire feedback (< 30 s) ---------- */
V.rate = () => {
  const R = S.rate;
  if (!R.task) { navigate("rate-pick"); return ""; }
  const params = S.boot.feedback_params || [];
  return `<div class="screen">
    ${topbarHTML("Votre évaluation")}
    <div class="card" style="text-align:center">
      <div style="font-weight:800;color:var(--ink);font-size:15px">${esc(R.subject || R.task)}</div>
      <div style="font-size:12px;color:var(--ink-3);margin-top:2px">${esc(R.site || "")}</div>
      <div class="star-row" id="overallStars">
        ${[1,2,3,4,5].map(i => `<button class="st ${R.overall >= i ? "on" : ""}" data-star="${i}">★</button>`).join("")}
      </div>
      <div style="font-size:12px;color:var(--ink-3)" id="starHint">
        ${R.overall ? ["","Décevant","Passable","Correct","Très bien","Excellent !"][R.overall] : "Touchez une étoile pour noter"}
      </div>
    </div>

    <div class="card">
      <label style="font-size:12px;font-weight:800;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em">Détails (optionnel)</label>
      ${params.map(p => `
        <div class="param-row"><span class="p-name">${esc(p)}</span>
          <div class="star-row small" data-param="${esc(p)}" style="padding:0">
            ${[1,2,3,4,5].map(i => `<button class="st ${(R.params[p] || 0) >= i ? "on" : ""}" data-pstar="${i}">★</button>`).join("")}
          </div></div>`).join("")}
    </div>

    <div class="field"><label>Un commentaire ? (optionnel)</label>
      <textarea id="fbComment" placeholder="Dites-nous ce qui vous a plu, ou ce que nous pouvons améliorer…">${esc(R.comment || "")}</textarea></div>

    <div class="field"><label>Recommanderiez-vous NetPlus ? (optionnel)</label>
      <div class="nps-grid" id="npsGrid">
        ${Array.from({length: 11}, (_, i) =>
          `<button class="${R.nps === i ? "on" : ""}" data-nps="${i}">${i}</button>`).join("")}
      </div>
      <div class="nps-legend"><span>Pas du tout</span><span>Absolument</span></div></div>

    <button class="btn primary" id="sendFb" ${R.overall ? "" : "disabled"}>Envoyer mon évaluation</button>
  </div>`;
};

/* ---------- historique des évaluations ---------- */
V["feedback-history"] = () => {
  const list = S.fbList;
  const spark = sparkHTML();
  return `<div class="screen">
    ${topbarHTML("Mes évaluations")}
    ${spark}
    ${list == null ? `<div class="empty"><div class="e-emoji">⏳</div><div class="e-title">Chargement…</div></div>`
      : list.length ? list.map(f => `
        <div class="card fb-item">
          <div class="f-head"><span class="f-title">${esc(f.subject || f.task)}</span>
            <span class="f-when">${timeAgo(f.when)}</span></div>
          <div class="f-stars">${stars(f.overall)}</div>
          ${f.comment ? `<div class="f-comment">« ${esc(f.comment)} »</div>` : ""}
        </div>`).join("")
      : `<div class="empty"><div class="e-emoji">⭐</div>
         <div class="e-title">Aucune évaluation</div><div>Vos retours apparaîtront ici.</div></div>`}
  </div>`;
};

function sparkHTML() {
  const tr = (S.boot.satisfaction.trend || []).filter(t => t.overall);
  if (tr.length < 3) return "";
  const W = 320, H = 80, pad = 8;
  const xs = tr.map((_, i) => pad + i * (W - 2 * pad) / (tr.length - 1));
  const ys = tr.map(t => H - pad - (t.overall - 1) / 4 * (H - 2 * pad));
  const pts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const delta = tr[tr.length - 1].overall - tr[0].overall;
  return `<div class="card spark-wrap">
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block">
      <polygon points="${pad},${H - pad} ${pts} ${W - pad},${H - pad}" fill="rgba(79,194,33,0.12)"/>
      <polyline points="${pts}" fill="none" stroke="#4FC221" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${xs[xs.length - 1]}" cy="${ys[ys.length - 1]}" r="4.5"
        fill="#4FC221" stroke="#fff" stroke-width="2"/>
    </svg>
    <div class="spark-label">${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)} pt</div>
  </div>`;
}

/* ---------- contrats ---------- */
V.contracts = () => {
  const list = S.ctList;
  return `<div class="screen">
    <div class="topbar"><h1>Mes contrats</h1></div>
    ${list == null ? `<div class="empty"><div class="e-emoji">⏳</div><div class="e-title">Chargement…</div></div>`
      : list.length ? list.map(c => `
        <div class="card ct-card">
          <div class="c-head"><span class="c-name">${esc(c.name)}</span>
            <span class="pill ${c.active ? "green" : "gray"}">${esc(c.status || (c.active ? "Actif" : "—"))}</span></div>
          <div style="margin-top:12px">
            ${c.effective_date ? `<div class="c-kv"><span class="k">Date d'effet</span><span class="v">${fmtDate(c.effective_date)}</span></div>` : ""}
            ${c.expiry_date || c.end_date ? `<div class="c-kv"><span class="k">Échéance</span><span class="v">${fmtDate(c.expiry_date || c.end_date)}</span></div>` : ""}
            ${c.rate_per_intervention ? `<div class="c-kv"><span class="k">Tarif / intervention</span><span class="v">${Number(c.rate_per_intervention).toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}</span></div>` : ""}
          </div>
        </div>`).join("")
      : `<div class="empty"><div class="e-emoji">📄</div>
         <div class="e-title">Aucun contrat</div><div>Vos contrats de service apparaîtront ici.</div></div>`}
  </div>`;
};

/* ---------- profil ---------- */
V.profile = () => {
  const p = S.boot.profile;
  return `<div class="screen">
    <div class="profile-hero">
      <div class="avatar">${esc(initialOf(p.full_name))}</div>
      <div class="p-name">${esc(p.full_name)}</div>
      <div class="p-org">${esc(p.customer_label)}</div>
    </div>
    <div class="menu">
      <button class="mi" data-nav="feedback-history"><span class="ic">⭐</span> Mes évaluations <span class="arrow">→</span></button>
      <button class="mi" data-nav="contracts"><span class="ic">📄</span> Mes contrats <span class="arrow">→</span></button>
      <button class="mi" data-open="/portal"><span class="ic">🖥️</span> Portail complet (web) <span class="arrow">→</span></button>
    </div>
    <button class="btn ghost red" id="logoutBtn">Se déconnecter</button>
  </div>`;
};

const topbarHTML = t =>
  `<div class="topbar"><button class="back" data-back>‹</button><h1>${esc(t)}</h1></div>`;

/* ------------------------------ actions ------------------------------ */
function startRate(task) {
  const all = [].concat(S.boot.to_rate, S.intList.done || [], S.intList.all || []);
  const t = all.find(x => x && x.task === task);
  S.rate = { task, subject: t && t.subject, site: t && t.site,
    overall: 0, params: {}, nps: null, comment: "" };
  navigate("rate");
}

async function sendFeedback() {
  const R = S.rate;
  R.comment = (document.getElementById("fbComment") || {}).value || "";
  if (!R.overall) return toast("Choisissez une note globale", true);
  const close = overlay("Envoi de votre évaluation…");
  try {
    await api("submit_feedback", {
      task: R.task, overall: R.overall,
      ratings: JSON.stringify(R.params),
      comment: R.comment, nps: R.nps,
    });
    close();
    S.boot = await api("bootstrap");
    S.intList = {}; S.fbList = null;
    successFull("Merci ! 💚", "Votre évaluation a bien été transmise", () => navigate("home"));
  } catch (e) { close(); toast(e.message, true); }
}

/* ------------------------------ rendu + routeur ------------------------------ */
function render() {
  const html = (V[S.view] || V.home)();
  if (html === "") return;
  app.innerHTML = html + navHTML();
}

async function onRoute() {
  const { view, params } = parseHash();
  S.view = view; S.params = params;
  render();
  try {
    if ((view === "interventions" || view === "rate-pick")) {
      const scope = view === "rate-pick" ? "done" : S.seg.interventions;
      if (S.intList[scope] == null) {
        S.intList[scope] = await api("interventions", { scope });
        if (S.view === view) render();
      }
    }
    if (view === "feedback-history" && S.fbList == null) {
      S.fbList = await api("my_feedback");
      if (S.view === view) render();
    }
    if (view === "contracts" && S.ctList == null) {
      S.ctList = await api("contracts");
      if (S.view === view) render();
    }
  } catch (e) { toast(e.message, true); }
}

/* ------------------------------ événements ------------------------------ */
document.addEventListener("click", async ev => {
  const t = ev.target.closest(
    "[data-nav],[data-back],[data-open],[data-rate],[data-seg] button,[data-star],[data-pstar],[data-nps],#sendFb,#logoutBtn");
  if (!t) return;

  if (t.dataset.nav) return navigate(t.dataset.nav);
  if (t.dataset.back != null) return history.back();
  if (t.dataset.open) return void (location.href = t.dataset.open);
  if (t.dataset.rate) { haptic(20); return startRate(t.dataset.rate); }

  const segWrap = t.closest("[data-seg]");
  if (segWrap && t.dataset.val) {
    S.seg[segWrap.dataset.seg] = t.dataset.val;
    haptic(15);
    return onRoute();
  }

  if (t.dataset.star) {
    S.rate.overall = +t.dataset.star; haptic(20);
    S.rate.comment = (document.getElementById("fbComment") || {}).value || "";
    return render();
  }
  if (t.dataset.pstar) {
    const p = t.closest("[data-param]").dataset.param;
    S.rate.params[p] = +t.dataset.pstar; haptic(15);
    S.rate.comment = (document.getElementById("fbComment") || {}).value || "";
    return render();
  }
  if (t.dataset.nps != null && t.closest("#npsGrid")) {
    S.rate.nps = +t.dataset.nps; haptic(15);
    S.rate.comment = (document.getElementById("fbComment") || {}).value || "";
    return render();
  }

  if (t.id === "sendFb") return sendFeedback();
  if (t.id === "logoutBtn") {
    try { await fetch("/?cmd=web_logout", { redirect: "manual", credentials: "same-origin" }); } catch (e) {}
    window.location.replace("/netplus-login?redirect-to=/netplus-client");
  }
});

window.addEventListener("hashchange", onRoute);

/* ------------------------------ démarrage ------------------------------ */
(async function init() {
  try {
    S.boot = await api("bootstrap");
  } catch (e) {
    app.innerHTML = `<div class="screen"><div class="empty" style="padding-top:30vh">
      <div class="e-emoji">🍃</div><div class="e-title">Impossible de charger votre espace</div>
      <div>${esc(e.message)}</div></div>
      <button class="btn primary" onclick="location.reload()">Réessayer</button></div>`;
    return;
  }
  if (!location.hash) location.hash = "#/home";
  onRoute();
})();

})();
