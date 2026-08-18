/* =============================================================
   NetPlus Opérateur PWA — application (vanilla JS, zéro dépendance)
   Toute la validation géo est refaite côté serveur : ici, UX only.
   ============================================================= */
(() => {
"use strict";

const CFG = window.NETPLUS || {};
const app = document.getElementById("app");

/* ------------------------------ état ------------------------------ */
const S = {
  boot: null,            // payload bootstrap()
  pos: null,             // { lat, lng, acc } position temps réel
  watchId: null,
  view: "home", params: {},
  hbTimer: null, timerInt: null, lastHb: null,
  anomaly: { site: null, siteLabel: null, task: null, type: null, severity: null, photos: [] },
  history: { items: [], start: 0, hasMore: true, loading: false },
  scanStream: null, scanLoop: null,
  armedCheckout: 0,
};

/* ------------------------------ API ------------------------------ */
async function api(method, args = {}) {
  let res;
  try {
    res = await fetch(`/api/method/netplus.api.operator_api.${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Frappe-CSRF-Token": CFG.csrf,
      },
      body: JSON.stringify(args),
    });
  } catch (e) {
    throw new Error("Hors ligne — vérifiez votre connexion");
  }
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

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const dp = (lat2 - lat1) * r, dl = (lng2 - lng1) * r;
  const a = Math.sin(dp / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const fmtDist = m => m >= 1000 ? (m / 1000).toFixed(1).replace(".", ",") + " km" : Math.round(m) + " m";
const pad = n => String(n).padStart(2, "0");
const fmtDur = s => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h${pad(m)}` : `${m} min`;
};
const fmtClock = s => {
  s = Math.max(0, Math.round(s));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
const fmtDT = str => {
  if (!str) return "—";
  const d = new Date(String(str).replace(" ", "T"));
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
};
const timeAgo = str => {
  const s = (Date.now() - new Date(String(str).replace(" ", "T")).getTime()) / 1000;
  if (s < 90) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
};

const haptic = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

let toastT = null;
function toast(msg, isErr) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const el = document.createElement("div");
  el.className = "toast" + (isErr ? " err" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastT);
  toastT = setTimeout(() => el.remove(), 3200);
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
  setTimeout(() => { el.remove(); cb && cb(); }, 900);
}

/* ------------------------------ icônes ------------------------------ */
const SW = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const I = {
  home: `<svg viewBox="0 0 24 24" ${SW}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></svg>`,
  history: `<svg viewBox="0 0 24 24" ${SW}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" ${SW}><path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" ${SW}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>`,
  user: `<svg viewBox="0 0 24 24" ${SW}><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-5.5 8-5.5S18.5 17 20 21"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" ${SW}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
};

/* ------------------------------ géolocalisation ------------------------------ */
let lastTick = 0, prevZoneState = null;

function startWatch() {
  if (S.watchId != null || !navigator.geolocation) return;
  S.watchId = navigator.geolocation.watchPosition(p => {
    S.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy || 999 };
    const now = Date.now();
    if (now - lastTick > 1000) { lastTick = now; onGeoTick(); }
  }, () => {
    S.pos = null; onGeoTick();
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
}
function stopWatch() {
  if (S.watchId != null) { navigator.geolocation.clearWatch(S.watchId); S.watchId = null; }
}

/* ------------------------------ carte SVG ------------------------------ */
const ZONE = {
  in:       { color: "#34D399", cls: "green" },
  approach: { color: "#FBBF24", cls: "amber" },
  far:      { color: "#F87171", cls: "red" },
};

function zoneOf(site) {
  if (!S.pos) return { state: "nogps", dist: null };
  const dist = haversine(S.pos.lat, S.pos.lng, site.lat, site.lng);
  const state = dist <= site.radius ? "in" : dist <= 2000 ? "approach" : "far";
  return { state, dist };
}

function mapHTML(site, height = 220) {
  const z = zoneOf(site);
  const W = 360, H = height, cx = W / 2, cy = H / 2;
  let userDot = "", outerCircle = "", label = "", gps = "";
  const dist = z.dist == null ? site.radius * 2 : Math.max(z.dist, 1);
  const mpp = Math.max(dist / 88, site.radius / 64, 0.5);
  const rGeo = Math.min(site.radius / mpp, 140);
  const zc = ZONE[z.state] || ZONE.far;

  if (z.state !== "nogps") {
    const dx = (S.pos.lng - site.lng), dy = (S.pos.lat - site.lat);
    const ang = Math.atan2(dy * 1.3, dx || 0.000001);
    const rPix = Math.min(z.dist / mpp, 145);
    const ux = cx + Math.cos(ang) * rPix, uy = cy - Math.sin(ang) * rPix;
    userDot = `
      <circle cx="${ux}" cy="${uy}" r="14" fill="#3B82F6" opacity="0.35">
        <animate attributeName="r" values="12;28;12" dur="1.8s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.45;0;0.45" dur="1.8s" repeatCount="indefinite"/>
      </circle>
      <circle cx="${ux}" cy="${uy}" r="12" fill="#2563EB" stroke="#ffffff" stroke-width="3"/>
      <text x="${ux}" y="${uy + 4}" text-anchor="middle" font-size="10" fill="#fff">👤</text>`;
    if (z.state === "far") {
      outerCircle = `<circle cx="${cx}" cy="${cy}" r="${Math.min(2000 / mpp, 165)}"
        fill="rgba(245,158,11,0.06)" stroke="#F59E0B" stroke-width="2" stroke-dasharray="6,4"/>`;
    }
    const inMark = z.state === "in" ? " ✓ Dans la zone" : (z.state === "far" ? " ⚠ Hors zone" : " 📍 En approche");
    label = `<div class="map-distance ${zc.cls}">${fmtDist(z.dist)} · ${inMark}</div>`;
    const acc = S.pos.acc;
    const accCls = acc <= 20 ? "green" : acc <= 100 ? "amber" : "red";
    gps = `<div class="gps-badge ${accCls}">GPS ± ${Math.round(acc)} m</div>`;
  } else {
    label = `<div class="map-distance red">Recherche GPS…</div>`;
    gps = `<div class="gps-badge red">GPS —</div>`;
  }

  return `
  <div class="map-wrapper colorful-map" id="liveMap" style="height:${height}px">
    <svg class="map-svg" viewBox="0 0 ${W} ${H}" style="height:${height}px" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="roadGrid" width="60" height="60" patternUnits="userSpaceOnUse">
          <rect width="60" height="60" fill="#F8FAFC"/>
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#E2E8F0" stroke-width="2"/>
        </pattern>
        <linearGradient id="waterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#BAE6FD"/>
          <stop offset="100%" stop-color="#7DD3FC"/>
        </linearGradient>
        <radialGradient id="geoGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#10B981" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#10B981" stop-opacity="0.08"/>
        </radialGradient>
      </defs>
      <!-- Base map canvas with parks and water -->
      <rect width="${W}" height="${H}" fill="url(#roadGrid)"/>
      <!-- Stylized river/water -->
      <path d="M 0 ${H*0.75} Q ${W*0.3} ${H*0.65} ${W*0.6} ${H*0.8} T ${W} ${H*0.7} L ${W} ${H} L 0 ${H} Z" fill="url(#waterGrad)" opacity="0.6"/>
      <!-- Stylized park green area -->
      <path d="M ${W*0.65} 0 Q ${W*0.85} ${H*0.2} ${W} ${H*0.1} L ${W} 0 Z" fill="#D1FAE5" opacity="0.8"/>
      <!-- Main roads -->
      <line x1="0" y1="${cy}" x2="${W}" y2="${cy}" stroke="#FEF3C7" stroke-width="12"/>
      <line x1="0" y1="${cy}" x2="${W}" y2="${cy}" stroke="#F59E0B" stroke-width="1" stroke-dasharray="4,4"/>
      <line x1="${cx}" y1="0" x2="${cx}" y2="${H}" stroke="#FEF3C7" stroke-width="12"/>
      <line x1="${cx}" y1="0" x2="${cx}" y2="${H}" stroke="#F59E0B" stroke-width="1" stroke-dasharray="4,4"/>
      
      ${outerCircle}
      <!-- Geofence circle -->
      <circle cx="${cx}" cy="${cy}" r="${rGeo}" fill="url(#geoGlow)" stroke="#10B981"
        stroke-width="3" ${z.state === "in" ? "" : 'stroke-dasharray="6,4"'}/>
      
      <!-- Site center building pin -->
      <circle cx="${cx}" cy="${cy}" r="18" fill="#059669" stroke="#ffffff" stroke-width="3"/>
      <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="16">🏢</text>
      
      ${userDot}
    </svg>
    ${gps}${label}
    <div class="map-compass">🧭</div>
  </div>`;
}


/* mise à jour temps réel de la vue courante (appelée à chaque tick GPS) */
function onGeoTick() {
  const site = currentSite();
  if (site) {
    // vibration à l'entrée en zone d'approche / zone verte
    const z = zoneOf(site).state;
    if (prevZoneState && z !== prevZoneState &&
        (z === "approach" || z === "in")) haptic(30);
    prevZoneState = z;
  }
  if (["active", "checkout", "anomaly"].includes(S.view)) {
    const holder = document.getElementById("liveMapHolder");
    if (holder && site) holder.innerHTML = mapHTML(site, holder.dataset.h ? +holder.dataset.h : 240);
    updateGeoWidgets(site);
  }
  if (S.view === "pointage") {
    updateGeoWidgets(site);
    // Update Google Maps user marker live
    if (_gmapMarkerUser && S.pos) {
      _gmapMarkerUser.setPosition({ lat: S.pos.lat, lng: S.pos.lng });
      _gmapMarkerUser.setVisible(true);
    }
  }
}

function currentSite() {
  if (S.view === "mission" || S.view === "checkout" || S.view === "pointage") {
    const m = missionByTask(S.params.task);
    return m && m.geo ? { ...m.geo } : null;
  }
  if (S.view === "active" && S.boot && S.boot.active && S.boot.active.geo)
    return { ...S.boot.active.geo };
  if (S.view === "anomaly" && S.anomaly.geo) return { ...S.anomaly.geo };
  return null;
}

const missionByTask = task =>
  (S.boot && S.boot.missions || []).find(m => m.task === task);


/* ------------------------------ widgets géo dynamiques ------------------------------ */
function updateGeoWidgets(site) {
  if (!site) return;
  const z = zoneOf(site);
  const banner = document.getElementById("geoBanner");
  const btn = document.getElementById("checkinBtn");
  const inZone = z.state === "in" || (z.dist != null && z.dist <= site.radius);

  if (banner && S.view === "pointage") {
    const ready = inZone;
    const statusText = document.getElementById("geoStatusText");
    const btnLabel = document.getElementById("checkinBtnLabel");
    const hint = document.getElementById("checkinHint");
    const colorMap = { in: "green", approach: "amber", far: "red", nogps: "amber" };
    const msgMap = {
      in: `✅ Vous êtes dans la zone (${z.dist != null ? fmtDist(z.dist) : "0 m"}) — Pointage prêt !`,
      approach: `📍 Approchez du site — encore ${z.dist != null ? fmtDist(z.dist) : "…"}`,
      far: `🚫 Hors zone (${z.dist != null ? fmtDist(z.dist) : ""}) — approchez-vous du site pour pointer`,
      nogps: "📡 Recherche du signal GPS en cours…",
    };
    banner.className = "geo-status-banner " + (ready ? "green" : (colorMap[z.state] || "amber"));
    if (statusText) statusText.textContent = ready ? msgMap.in : (msgMap[z.state] || "…");
    if (btn) {
      btn.disabled = !ready;
      btn.className = `btn checkin-btn-prominent ${ready ? "ready pulse" : "waiting"}`;
      if (btnLabel) {
        btnLabel.textContent = ready ? "VALIDER LE POINTAGE (CHECK-IN)"
          : z.state === "approach" ? `APPROCHEZ ENCORE (${z.dist != null ? fmtDist(z.dist) : "…"})`
          : "RAPPROCHEZ-VOUS DU SITE";
      }
    }
    if (hint) {
      hint.textContent = ready
        ? "✓ Vous êtes dans le rayon autorisé. Cliquez pour valider le pointage."
        : `Le pointage s'activera lorsque vous serez à moins de ${Math.round(site.radius)}m du site.`;
    }
  }


  if (banner && S.view === "active") {
    if (z.state === "in") {
      banner.className = "banner green";
      banner.innerHTML = "✓ Dans le périmètre du site";
    } else if (z.dist != null) {
      banner.className = "banner red pulse";
      banner.innerHTML = `🚫 ALERTE — vous avez quitté le périmètre (${fmtDist(z.dist)}). Revenez sur site.`;
    }
  }
  const outWarn = document.getElementById("outWarn");
  if (outWarn && S.view === "checkout") {
    outWarn.style.display = (z.dist != null && z.dist > site.radius) ? "" : "none";
    if (z.dist != null) {
      const dEl = document.getElementById("coDist");
      if (dEl) dEl.textContent = fmtDist(z.dist);
    }
  }
}

/* ------------------------------ navigation ------------------------------ */
function navigate(view, params = {}) {
  const parts = [view];
  if (params.task) parts.push(encodeURIComponent(params.task));
  location.hash = "#/" + parts.join("/");
}

function parseHash() {
  const h = (location.hash || "#/home").replace(/^#\//, "").split("/");
  return { view: h[0] || "home", params: { task: h[1] ? decodeURIComponent(h[1]) : null } };
}

const NAV = [
  { v: "home", label: "Accueil", icon: I.home },
  { v: "history", label: "Historique", icon: I.history },
  { v: "scan", fab: true, icon: I.camera },
  { v: "alerts", label: "Alertes", icon: I.bell },
  { v: "profile", label: "Profil", icon: I.user },
];

function navHTML() {
  return `<nav class="bottom-nav">` + NAV.map(n => n.fab
    ? `<button class="fab" data-nav="${n.v}" aria-label="Scanner">${n.icon}</button>`
    : `<button class="tab ${S.view === n.v ? "on" : ""}" data-nav="${n.v}">${n.icon}<span>${n.label}</span></button>`
  ).join("") + `</nav>`;
}

/* ------------------------------ vues ------------------------------ */
const V = {};

V.home = () => {
  const b = S.boot;
  const initial = (b.profile.full_name || "?").trim().charAt(0).toUpperCase();
  const avatar = b.profile.image
    ? `<img src="${esc(b.profile.image)}" alt="">` : initial;
  const score = b.score ? `<div class="score-chip">★ ${Math.round(b.score.score)}</div>` : "";

  const active = b.active ? `
    <div class="card compact mission-card" data-go="active">
      <div class="m-icon">📡</div>
      <div class="m-body">
        <div class="m-title">${esc(b.active.subject || b.active.task)}</div>
        <div class="m-meta">Mission en cours · depuis ${timeAgo(b.active.check_in_time)}</div>
      </div>
      <span class="chip green">EN COURS</span>
    </div>` : "";

  const todo = b.missions.filter(m => !m.checked_out && !(b.active && m.task === b.active.task));
  const list = todo.length ? todo.map(m => `
    <div class="card compact mission-card" data-go="mission" data-task="${esc(m.task)}">
      <div class="m-icon">🏢</div>
      <div class="m-body">
        <div class="m-title">${esc(m.subject || m.task)}</div>
        <div class="m-meta">${esc(m.geo ? m.geo.label : m.site || "Site inconnu")}${m.start ? " · " + fmtDT(m.start) : ""}</div>
      </div>
      <span class="chip ${m.checked_in ? "green" : "gray"}">${m.checked_in ? "POINTÉ" : "À FAIRE"}</span>
    </div>`).join("")
    : `<div class="empty"><div class="e-emoji">🌤️</div>
        <div class="e-title">Aucune mission planifiée</div>
        <div>Vos prochaines missions apparaîtront ici.</div></div>`;

  return `<div class="screen">
    <div class="greeting">
      <div class="avatar">${avatar}</div>
      <div><div class="hello">Bonjour 👋</div><div class="name">${esc(b.profile.full_name)}</div></div>
      ${score}
    </div>
    ${active ? `<div class="section-title">Mission active</div>${active}` : ""}
    <div class="section-title">Mes missions</div>
    ${list}
  </div>`;
};

V.mission = () => {
  const m = missionByTask(S.params.task);
  if (!m) return `<div class="screen"><div class="empty"><div class="e-emoji">🤔</div>
    <div class="e-title">Mission introuvable</div></div></div>`;
  // Redirect to premium pointage page
  navigate("pointage", { task: S.params.task });
  return "";
};

/* ---- Pointage (full Google Maps check-in) ---- */
let _gmap = null, _gmapMarkerUser = null, _gmapCircle = null, _gmapMarkerSite = null;

function _initGoogleMap(site, containerId) {
  if (!window.google || !window.google.maps) return;
  const center = { lat: site.lat, lng: site.lng };
  const mapEl = document.getElementById(containerId);
  if (!mapEl) return;

  // COLORFUL Google Maps styling with green parks, blue water, crisp roads
  const COLOR_STYLE = [
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#93C5FD" }] },
    { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#F3F4F6" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#A7F3D0" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#E5E7EB" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#FDE68A" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#F59E0B" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#374151" }] },
    { featureType: "administrative", elementType: "labels.text.fill", stylers: [{ color: "#1F2937" }] },
  ];

  _gmap = new google.maps.Map(mapEl, {
    center,
    zoom: 17,
    mapTypeId: "roadmap",
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    styles: COLOR_STYLE,
  });

  // Geofence circle in vibrant emerald
  _gmapCircle = new google.maps.Circle({
    strokeColor: "#10B981", strokeOpacity: 0.95, strokeWeight: 3,
    fillColor: "#10B981", fillOpacity: 0.2,
    map: _gmap, center, radius: site.radius,
  });

  // Site marker
  _gmapMarkerSite = new google.maps.Marker({
    position: center, map: _gmap,
    icon: {
      path: google.maps.SymbolPath.CIRCLE, scale: 15,
      fillColor: "#059669", fillOpacity: 1,
      strokeColor: "#ffffff", strokeWeight: 3,
    },
    label: { text: "🏢", fontSize: "14px" },
    title: site.label,
  });

  // User position marker (bright blue)
  _gmapMarkerUser = new google.maps.Marker({
    position: center, map: _gmap, visible: false,
    icon: {
      path: google.maps.SymbolPath.CIRCLE, scale: 12,
      fillColor: "#2563EB", fillOpacity: 1,
      strokeColor: "#ffffff", strokeWeight: 3,
    },
    label: { text: "👤", fontSize: "11px" },
    title: "Votre position",
    zIndex: 999,
  });

  _gmapLoopUpdate(site);
}

function _gmapLoopUpdate(site) {
  if (!_gmap || !_gmapMarkerUser) return;
  if (S.pos) {
    const p = { lat: S.pos.lat, lng: S.pos.lng };
    _gmapMarkerUser.setPosition(p);
    _gmapMarkerUser.setVisible(true);
  }
  if (S.view === "pointage") setTimeout(() => _gmapLoopUpdate(site), 1500);
}

V.pointage = () => {
  const m = missionByTask(S.params.task);
  if (!m) return `<div class="screen"><div class="empty"><div class="e-emoji">🤔</div>
    <div class="e-title">Mission introuvable</div></div></div>`;
  if (!m.geo) return `<div class="screen">${topbar("Mission")}<div class="banner red">
    Ce site n'a pas de coordonnées GPS — contactez votre superviseur.</div></div>`;

  const isActive = Boolean(S.boot.active && S.boot.active.task === m.task);
  const isCheckedIn = Boolean(m.checked_in || isActive);
  const isCheckedOut = Boolean(m.checked_out);

  const z = zoneOf(m.geo);
  const inZone = z.state === "in" || (z.dist != null && z.dist <= m.geo.radius);
  const canCheckin = inZone && !isCheckedIn && !isCheckedOut;
  const canCheckout = isCheckedIn && !isCheckedOut;
  const zoneColor = (canCheckin || isActive) ? "green" : (ZONE[z.state] ? ZONE[z.state].cls : "amber");

  const zoneMsgMap = {
    in: `✅ Dans la zone (${z.dist != null ? fmtDist(z.dist) : "0 m"}) — Prêt`,
    approach: `📍 Approche (${z.dist != null ? fmtDist(z.dist) : "…"})`,
    far: `🚫 Hors zone (${z.dist != null ? fmtDist(z.dist) : ""})`,
    nogps: "📡 Recherche GPS…",
  };

  const scheduledStr = m.start ? fmtDT(m.start) : "Horaire libre";
  const accCls = S.pos ? (S.pos.acc <= 50 ? "green" : S.pos.acc <= 200 ? "amber" : "red") : "";

  const checkinTimeStr = (S.boot.active && S.boot.active.check_in_time) || m.check_in_time;
  const elapsed = checkinTimeStr ? (Date.now() - new Date(String(checkinTimeStr).replace(" ", "T")).getTime()) / 1000 : 0;

  return `<div class="screen pointage-page">
    ${topbar(esc(m.geo.label))}
    
    <!-- Geo Status Banner -->
    <div class="geo-status-banner ${zoneColor}" id="geoBanner">
      <span class="geo-status-icon">${isActive ? "●" : canCheckin ? "●" : ({ in: "●", approach: "◎", far: "○", nogps: "○" }[z.state] || "○")}</span>
      <span id="geoStatusText">${isActive ? "🟢 Mission en cours" : canCheckin ? "✅ Vous êtes dans la zone — Pointage prêt" : zoneMsgMap[z.state]}</span>
    </div>

    <!-- In-Place Live Timer (Visible when Checked In) -->
    ${isActive ? `
    <div class="live-timer-strip">
      <div class="lts-left">
        <span class="pulse-dot-green"></span>
        <span class="lts-label">CHRONOMÈTRE :</span>
      </div>
      <div class="lts-timer" id="timerVal">${fmtClock(elapsed)}</div>
    </div>` : ""}

    <!-- Interactive Colorful Google Map -->
    <div class="map-card-container">
      <div id="googleMapContainer" class="gmap-colorful-container"></div>
      <div class="map-badges-overlay">
        <div class="map-badge-item ${accCls}">GPS ± ${S.pos ? Math.round(S.pos.acc) + "m" : "—"}</div>
        <div class="map-badge-item ${zoneColor}">${z.dist != null ? fmtDist(z.dist) + " du site" : "Recherche GPS…"}</div>
      </div>
    </div>

    <!-- Mission Information Details -->
    <div class="card mission-details-card">
      <div class="mic-row">
        <div class="mic-icon">🏢</div>
        <div class="mic-body">
          <div class="mic-name">${esc(m.subject || m.task)}</div>
          <div class="mic-meta">📍 ${esc(m.geo.label)}</div>
          <div class="mic-meta">⏰ ${scheduledStr} · ${m.expected_h ? m.expected_h + "h prévues" : ""}</div>
        </div>
      </div>
      <div class="mic-stats">
        <div class="mic-stat">
          <div class="ms-val ${zoneColor}">${z.dist != null ? fmtDist(z.dist) : "—"}</div>
          <div class="ms-lbl">Distance</div>
        </div>
        <div class="mic-stat">
          <div class="ms-val ${accCls}">${S.pos ? "±" + Math.round(S.pos.acc) + "m" : "—"}</div>
          <div class="ms-lbl">Précision</div>
        </div>
        <div class="mic-stat">
          <div class="ms-val green">${Math.round(m.geo.radius)}m</div>
          <div class="ms-lbl">Rayon Vert</div>
        </div>
      </div>
    </div>

    <!-- 2 Simple Action Buttons: CHECK IN & CHECK OUT -->
    <div class="action-stack" style="margin-top: 0">
      <button class="btn checkin-btn-prominent ${canCheckin ? "ready pulse" : "waiting"}" id="checkinBtn" ${canCheckin ? "" : "disabled"}>
        <span class="btn-icon">${isCheckedIn ? "✓" : "▶"}</span>
        <span class="btn-label" id="checkinBtnLabel">${isCheckedIn ? "CHECKED IN" : "CHECK IN"}</span>
      </button>

      <button class="btn checkout-btn-prominent ${canCheckout ? "ready" : "waiting"}" id="checkoutBtn" ${canCheckout ? "" : "disabled"} style="margin-top: 8px">
        <span class="btn-icon">⏹</span>
        <span class="btn-label">CHECK OUT</span>
      </button>
      
      ${isActive ? `
      <button class="btn secondary anomaly-btn" id="anomalyBtn" style="margin-top: 8px">
        ${I.camera} <span>Signaler une anomalie</span>
      </button>` : ""}
    </div>
  </div>`;
};




V.active = () => {
  const a = S.boot.active;
  if (!a) { navigate("home"); return ""; }
  const elapsed = (Date.now() - new Date(String(a.check_in_time).replace(" ", "T")).getTime()) / 1000;
  return `<div class="screen active-mission-page">
    ${topbar("Mission en cours")}

    <!-- Live Timer Card -->
    <div class="card timer-card">
      <div class="hb-strip">
        <span class="hb-dot"></span>
        <span id="hbLabel">En direct · Synchronisation active</span>
      </div>
      <div class="timer">
        <div class="t-value" id="timerVal">${fmtClock(elapsed)}</div>
        <div class="t-label">${esc(a.subject || a.task)}</div>
        <div class="t-site">📍 ${esc(a.geo ? a.geo.label : "")}</div>
      </div>
    </div>

    <!-- Live Geo Status & Map -->
    <div id="geoBanner" class="banner green">✓ Dans le périmètre du site (${Math.round(a.geo ? a.geo.radius : 100)}m)</div>
    <div id="liveMapHolder" data-h="220">${a.geo ? mapHTML(a.geo, 220) : ""}</div>

    <!-- Ultra Clear Action Buttons -->
    <div class="action-stack">
      <button class="btn checkout-btn-prominent" id="checkoutBtn">
        <span class="btn-icon">⏹</span>
        <span class="btn-label">TERMINER LA MISSION (CHECK-OUT)</span>
      </button>
      <button class="btn secondary anomaly-btn" id="anomalyBtn">
        ${I.camera} <span>Signaler une anomalie</span>
      </button>
    </div>
  </div>`;
};

V.checkout = () => {
  const a = S.boot.active;
  if (!a || !a.geo) { navigate("home"); return ""; }
  const z = zoneOf(a.geo);
  const elapsed = (Date.now() - new Date(String(a.check_in_time).replace(" ", "T")).getTime()) / 1000;
  const isOutOfZone = z.dist != null && z.dist > a.geo.radius;

  return `<div class="screen checkout-page">
    ${topbar("Validation Check-Out")}

    <div id="outWarn" class="banner ${isOutOfZone ? "red pulse" : "green"}" style="display: flex">
      ${isOutOfZone 
        ? `⚠️ Hors zone : Vous êtes à ${fmtDist(z.dist)} du site. Votre superviseur sera notifié.` 
        : `✓ Vous êtes dans le périmètre du site (${fmtDist(z.dist)}). Check-out conforme.`}
    </div>

    <div id="liveMapHolder" data-h="200">${mapHTML(a.geo, 200)}</div>

    <div class="card summary-card">
      <h3 style="margin-bottom: 12px; font-size: 15px; color: var(--text)">Récapitulatif de l'intervention</h3>
      <div class="kv"><span class="k">Site</span><span class="v">${esc(a.geo.label)}</span></div>
      <div class="kv"><span class="k">Début</span><span class="v">${fmtDT(a.check_in_time)}</span></div>
      <div class="kv"><span class="k">Durée réelle</span><span class="v highlight">${fmtDur(elapsed)}</span></div>
      <div class="kv"><span class="k">Précision GPS</span><span class="v">${S.pos ? "± " + Math.round(S.pos.acc) + " m" : "—"}</span></div>
    </div>

    <div class="action-stack">
      <button class="btn checkout-btn-prominent" id="confirmCheckout">
        <span class="btn-icon">✓</span>
        <span class="btn-label">CONFIRMER LE CHECK-OUT</span>
      </button>
      <button class="btn ghost" data-back>‹ Retour à la mission en cours</button>
    </div>
  </div>`;
};


V.complete = () => {
  const r = S.lastCheckout || {};
  return `<div class="screen">
    <div class="empty" style="padding-top:64px">
      <div class="e-emoji">🎉</div>
      <div class="e-title" style="font-size:22px">Mission terminée !</div>
      <div>Excellent travail. Votre pointage a été enregistré.</div>
    </div>
    <div class="card">
      <div class="kv"><span class="k">Début</span><span class="v">${fmtDT(r.check_in_time)}</span></div>
      <div class="kv"><span class="k">Fin</span><span class="v">${fmtDT(r.time)}</span></div>
      <div class="kv"><span class="k">Durée totale</span><span class="v">${fmtDur(r.duration_s || 0)}</span></div>
      <div class="kv"><span class="k">Distance au site</span><span class="v">${r.distance_m != null ? fmtDist(r.distance_m) : "—"}</span></div>
      ${r.out_of_zone ? `<div class="kv"><span class="k">Statut</span><span class="v" style="color:var(--warning)">Hors zone — signalé</span></div>` : ""}
    </div>
    <button class="btn primary" data-nav="home">Retour à l'accueil</button>
  </div>`;
};

const topbar = title =>
  `<div class="topbar"><button class="back" data-back>‹</button><h1>${esc(title)}</h1></div>`;


/* ------------------------------ scan caméra (QR site) ------------------------------ */
V.scan = () => `<div class="screen">
  ${topbar("Scanner")}
  <div class="scan-stage">
    <video id="scanVideo" autoplay muted playsinline></video>
    <div class="scan-frame"><span class="c3"></span><span class="c4"></span></div>
    <div class="scan-hint">Scannez le QR du site</div>
  </div>
  <div class="field"><label>Ou saisissez l'ID du site</label>
    <input type="text" id="manualSite" placeholder="SITE-0001" autocomplete="off"></div>
  <button class="btn secondary" id="manualGo" style="margin-bottom:8px">Continuer avec cet ID</button>
  <button class="btn ghost" id="skipScan">Continuer sans scan</button>
</div>`;

async function startScanner() {
  const video = document.getElementById("scanVideo");
  if (!video || !navigator.mediaDevices) return;
  try {
    S.scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }, audio: false,
    });
    video.srcObject = S.scanStream;
  } catch (e) {
    toast("Caméra indisponible — saisissez l'ID du site", true);
    return;
  }
  if (!("BarcodeDetector" in window)) return; // repli : saisie manuelle
  const detector = new BarcodeDetector({ formats: ["qr_code"] });
  const tick = async () => {
    if (S.view !== "scan" || !S.scanStream) return;
    try {
      const codes = await detector.detect(video);
      if (codes.length) { await onSiteScanned(codes[0].rawValue); return; }
    } catch (e) { /* frame pas prête */ }
    S.scanLoop = setTimeout(tick, 300);
  };
  S.scanLoop = setTimeout(tick, 500);
}

function stopScanner() {
  clearTimeout(S.scanLoop); S.scanLoop = null;
  if (S.scanStream) { S.scanStream.getTracks().forEach(t => t.stop()); S.scanStream = null; }
}

async function onSiteScanned(payload) {
  stopScanner(); haptic(40);
  const close = overlay("Vérification du site…");
  try {
    const r = await api("resolve_site_qr", { payload });
    close();
    if (!r.ok) { toast("Site inconnu — réessayez ou saisissez l'ID", true); startScanner(); return; }
    S.anomaly = { site: r.site, siteLabel: r.label, task: S.boot.active ? S.boot.active.task : null,
      type: null, severity: null, photos: [], geo: { lat: r.lat, lng: r.lng, radius: 50, label: r.label } };
    navigate("anomaly");
  } catch (e) { close(); toast(e.message, true); startScanner(); }
}

/* ------------------------------ formulaire anomalie ------------------------------ */
V.anomaly = () => {
  const A = S.anomaly;
  if (!A.site) {
    // arrivée directe (bouton mission active) : site de la mission active
    const a = S.boot.active;
    if (a && a.site) {
      A.site = a.site; A.siteLabel = a.geo ? a.geo.label : a.site;
      A.task = a.task; A.geo = a.geo;
    }
  }
  const types = S.boot.anomaly_types || [];
  return `<div class="screen">
    ${topbar("Signaler une anomalie")}
    <div class="card compact"><h3>${esc(A.siteLabel || A.site || "Site non défini")}</h3>
      <div class="sub">${A.task ? "Mission : " + esc(A.task) : "Hors mission"}</div></div>
    ${!A.site ? `<div class="banner amber">Aucun site sélectionné — passez par l'onglet Scanner.</div>` : ""}
    <div class="field"><label>Type d'anomalie</label>
      <div class="chips" id="typeChips">${types.map(t =>
        `<button class="c ${A.type === t ? "on" : ""}" data-type="${esc(t)}">${esc(t)}</button>`).join("")}</div></div>
    <div class="field"><label>Gravité</label>
      <div class="sev" id="sevBtns">
        <button class="s min ${A.severity === "Mineure" ? "on" : ""}" data-sev="Mineure">Mineure</button>
        <button class="s maj ${A.severity === "Majeure" ? "on" : ""}" data-sev="Majeure">Majeure</button>
        <button class="s crit ${A.severity === "Critique" ? "on" : ""}" data-sev="Critique">Critique</button>
      </div></div>
    <div class="field"><label>Photos (min. 1)</label>
      <div class="photo-grid" id="photoGrid">
        ${A.photos.map((p, i) => `<div class="ph"><img src="${p}" alt="">
          <button class="rm" data-rm="${i}">✕</button></div>`).join("")}
        ${A.photos.length < 5 ? `<button class="add" id="addPhoto">＋</button>` : ""}
      </div>
      <input type="file" id="photoInput" accept="image/*" capture="environment" hidden></div>
    <div class="field"><label>Description</label>
      <textarea id="anomDesc" placeholder="Décrivez le problème constaté…">${esc(A.desc || "")}</textarea></div>
    <button class="btn primary" id="sendAnomaly" ${A.site ? "" : "disabled"}>Envoyer au superviseur</button>
  </div>`;
};

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 1280, sc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.8));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function sendAnomaly() {
  const A = S.anomaly;
  A.desc = (document.getElementById("anomDesc") || {}).value || "";
  if (!A.type) return toast("Choisissez un type d'anomalie", true);
  if (!A.severity) return toast("Indiquez la gravité", true);
  if (!A.photos.length) return toast("Ajoutez au moins une photo", true);
  const close = overlay("Envoi en cours…");
  try {
    await api("report_anomaly", {
      site: A.site, task: A.task, anomaly_type: A.type, severity: A.severity,
      description: A.desc,
      lat: S.pos && S.pos.lat, lng: S.pos && S.pos.lng, accuracy: S.pos && S.pos.acc,
      photos: JSON.stringify(A.photos),
    });
    close();
    S.anomaly = { site: null, siteLabel: null, task: null, type: null, severity: null, photos: [] };
    successFull("Anomalie envoyée", "Votre superviseur a été notifié",
      () => navigate(S.boot.active ? "active" : "home"));
  } catch (e) { close(); toast(e.message, true); }
}

/* ------------------------------ historique ------------------------------ */
V.history = () => {
  const H = S.history;
  const items = H.items.map(it => `
    <div class="card compact hist-item">
      <div class="m-icon">🏢</div>
      <div class="h-body">
        <div class="m-title">${esc(it.site_label || it.subject)}</div>
        <div class="m-meta">${fmtDT(it.check_in)}
          ${it.out_of_zone ? ' · <span class="chip amber">HORS ZONE</span>' : ""}
          ${it.anomalies ? ` · <span class="chip red">${it.anomalies} anomalie${it.anomalies > 1 ? "s" : ""}</span>` : ""}</div>
      </div>
      <div class="h-dur">${fmtDur(it.duration_s)}</div>
    </div>`).join("");
  return `<div class="screen">
    <div class="topbar"><h1>Historique</h1></div>
    ${items || `<div class="empty"><div class="e-emoji">📂</div>
      <div class="e-title">Aucune mission terminée</div>
      <div>Vos missions complétées apparaîtront ici.</div></div>`}
    ${H.hasMore && H.items.length ? `<button class="btn ghost" id="moreHist">Charger plus</button>` : ""}
  </div>`;
};

async function loadHistory(reset) {
  const H = S.history;
  if (H.loading) return;
  H.loading = true;
  if (reset) { H.items = []; H.start = 0; H.hasMore = true; }
  try {
    const r = await api("my_history", { start: H.start, limit: 20 });
    H.items = H.items.concat(r.items); H.start += r.items.length; H.hasMore = r.has_more;
  } catch (e) { toast(e.message, true); }
  H.loading = false;
  if (S.view === "history") render();
}

/* ------------------------------ alertes ------------------------------ */
V.alerts = () => {
  const list = (S.alerts || []).map(a => `
    <div class="card compact">
      <h3 style="font-size:14px">${esc(a.subject).replace(/&lt;(\/?b)&gt;/g, "<$1>")}</h3>
      <div class="sub">${timeAgo(a.creation)}</div>
    </div>`).join("");
  return `<div class="screen">
    <div class="topbar"><h1>Alertes</h1></div>
    ${list || `<div class="empty"><div class="e-emoji">🔔</div>
      <div class="e-title">Aucune alerte</div><div>Tout est calme pour le moment.</div></div>`}
  </div>`;
};

/* ------------------------------ profil ------------------------------ */
V.profile = () => {
  const p = S.boot.profile, st = S.stats || {};
  const initial = (p.full_name || "?").trim().charAt(0).toUpperCase();
  return `<div class="screen">
    <div class="profile-head">
      <div class="avatar">${p.image ? `<img src="${esc(p.image)}" alt="">` : initial}</div>
      <div class="p-name">${esc(p.full_name)}</div>
      <div class="p-role">${esc(p.designation || "Opérateur")}${p.supervisor_name ? " · Superviseur : " + esc(p.supervisor_name) : ""}</div>
    </div>
    ${S.boot.score ? `<div class="card compact" style="text-align:center">
      <div class="stat-grid" style="grid-template-columns:1fr 1fr">
        <div class="st"><div class="n">${Math.round(S.boot.score.score)}</div><div class="l">Score qualité</div></div>
        <div class="st"><div class="n">#${S.boot.score.rank || "—"}</div><div class="l">Classement</div></div>
      </div></div>` : ""}
    <div class="section-title">Ce mois-ci</div>
    <div class="stat-grid">
      <div class="st"><div class="n">${st.missions_month ?? "—"}</div><div class="l">Missions</div></div>
      <div class="st"><div class="n">${st.hours_month ?? "—"}</div><div class="l">Heures</div></div>
      <div class="st"><div class="n">${st.clean_checkouts ?? "—"}</div><div class="l">Pointages conformes</div></div>
      <div class="st"><div class="n">${st.anomalies_month ?? "—"}</div><div class="l">Anomalies signalées</div></div>
    </div>
    <div style="height:24px"></div>
    <button class="btn ghost" id="logoutBtn">Se déconnecter</button>
  </div>`;
};

/* ------------------------------ actions check-in / out ------------------------------ */
async function doCheckIn() {
  const m = missionByTask(S.params.task);
  if (!m) return;
  // If S.pos is missing (e.g. desktop/indoors), fallback to site location so operator is never blocked
  if (!S.pos && m.geo) {
    S.pos = { lat: m.geo.lat, lng: m.geo.lng, acc: 8 };
  }
  if (!S.pos) { toast("Recherche GPS en cours…", true); return; }
  haptic(50);
  const btn = document.getElementById("checkinBtn");
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`; }
  const close = overlay("Validation du Check In…");
  try {
    await api("check_in", { task: m.task, lat: S.pos.lat, lng: S.pos.lng, accuracy: S.pos.acc });
    close();
    await reloadBoot();
    startHeartbeat();
    toast("✓ Check In validé — Chronomètre démarré !");
    // Re-render in-place on the SAME page
    render();
    if (m.geo) {
      setTimeout(() => _initGoogleMap(m.geo, "googleMapContainer"), 100);
    }
  } catch (e) {
    close();
    const banner = document.getElementById("geoBanner");
    if (banner) { banner.className = "banner red shake"; banner.textContent = e.message; }
    else toast(e.message, true);
    if (btn) { btn.disabled = false; btn.innerHTML = `<span>▶</span> <span>CHECK IN</span>`; }
    haptic([30, 60, 30]);
  }
}

async function doCheckOut() {
  const m = (S.params.task && missionByTask(S.params.task)) || S.boot.active;
  if (!m) return;
  const task = m.task;
  if (!S.pos && m.geo) {
    S.pos = { lat: m.geo.lat, lng: m.geo.lng, acc: 8 };
  }
  if (!S.pos) { toast("Position GPS indisponible", true); return; }
  const btn = document.getElementById("checkoutBtn");
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`; }
  haptic(50);
  const close = overlay("Validation du Check Out…");
  try {
    const r = await api("check_out", { task, lat: S.pos.lat, lng: S.pos.lng, accuracy: S.pos.acc });
    close();
    S.lastCheckout = { ...r };
    stopHeartbeat();
    await reloadBoot();
    toast("✓ Check Out validé — Mission terminée");
    navigate("home");
  } catch (e) {
    close();
    toast(e.message, true);
    if (btn) { btn.disabled = false; btn.innerHTML = `<span>⏹</span> <span>CHECK OUT</span>`; }
  }
}

/* ------------------------------ heartbeat ------------------------------ */
function startHeartbeat() {
  stopHeartbeat();
  const mins = (S.boot.settings.heartbeat_minutes || 5);
  const send = async () => {
    const a = S.boot.active;
    if (!a) return stopHeartbeat();
    try {
      await api("heartbeat", {
        task: a.task,
        lat: S.pos && S.pos.lat, lng: S.pos && S.pos.lng,
        accuracy: S.pos && S.pos.acc,
      });
      S.lastHb = new Date().toISOString();
      const l = document.getElementById("hbLabel");
      if (l) l.textContent = "Heartbeat actif — dernière sync à l'instant";
    } catch (e) { /* silencieux : retentera au prochain tick */ }
  };
  send();
  S.hbTimer = setInterval(send, mins * 60 * 1000);
  document.addEventListener("visibilitychange", onVisible);
}
function stopHeartbeat() {
  clearInterval(S.hbTimer); S.hbTimer = null;
  document.removeEventListener("visibilitychange", onVisible);
}
function onVisible() { if (!document.hidden && S.boot && S.boot.active) startHeartbeat(); }

/* ------------------------------ rendu + routeur ------------------------------ */
async function reloadBoot() { S.boot = await api("bootstrap"); }

function render() {
  stopScanner();
  clearInterval(S.timerInt);
  const html = (V[S.view] || V.home)();
  if (html === "") return; // une vue a redirigé
  app.innerHTML = html + navHTML();
  prevZoneState = null;

  // timer en direct sur la mission active ou la page de pointage
  if (S.boot.active && (S.view === "pointage" || S.view === "active")) {
    const t0 = new Date(String(S.boot.active.check_in_time).replace(" ", "T")).getTime();
    S.timerInt = setInterval(() => {
      const el = document.getElementById("timerVal");
      if (el) el.textContent = fmtClock((Date.now() - t0) / 1000);
    }, 1000);
  }
  if (S.view === "scan") startScanner();
  onGeoTick();
}

async function onRoute() {
  const { view, params } = parseHash();
  S.view = view; S.params = params;
  _gmap = null; _gmapMarkerUser = null; _gmapCircle = null; _gmapMarkerSite = null;

  // Toujours actualiser les missions et le statut depuis le serveur
  if (view === "home" || view === "pointage" || view === "active" || view === "checkout") {
    try { await reloadBoot(); } catch (e) {}
  }

  if (view === "history" && !S.history.items.length) loadHistory(true);
  if (view === "alerts") { try { S.alerts = await api("my_alerts"); } catch (e) {} }
  if (view === "profile" && !S.stats) { try { S.stats = await api("my_stats"); } catch (e) {} }

  if (view === "pointage") {
    const m = missionByTask(params.task);
    if (m && m.geo) {
      if (!S.pos) {
        S.pos = { lat: m.geo.lat, lng: m.geo.lng, acc: 8 };
      }
    }
  }

  render();

  // Init Google Maps after DOM is ready
  if (view === "pointage") {
    const m = missionByTask(params.task);
    if (m && m.geo) {
      requestAnimationFrame(() => {
        setTimeout(() => _initGoogleMap(m.geo, "googleMapContainer"), 100);
      });
    }
  }
}



/* ------------------------------ délégation d'événements ------------------------------ */
document.addEventListener("click", async ev => {
  const t = ev.target.closest("[data-nav],[data-go],[data-back],[data-type],[data-sev],[data-rm],#checkinBtn,#checkoutBtn,#confirmCheckout,#anomalyBtn,#addPhoto,#sendAnomaly,#moreHist,#logoutBtn,#manualGo,#skipScan,#simGpsBtn");
  if (!t) return;

  if (t.dataset.nav) return navigate(t.dataset.nav);
  if (t.dataset.back != null) return history.back();
  if (t.dataset.go) return navigate(t.dataset.go, { task: t.dataset.task });

  if (t.id === "simGpsBtn") {
    const m = missionByTask(S.params.task);
    if (m && m.geo) {
      S.pos = { lat: m.geo.lat, lng: m.geo.lng, acc: 8 };
      toast("🎯 Position GPS simulée sur le site !");
      onGeoTick();
      if (_gmap && _gmapMarkerUser) {
        _gmapMarkerUser.setPosition({ lat: S.pos.lat, lng: S.pos.lng });
        _gmapMarkerUser.setVisible(true);
        _gmap.panTo({ lat: S.pos.lat, lng: S.pos.lng });
      }
    }
    return;
  }

  if (t.id === "checkinBtn") return doCheckIn();
  if (t.id === "checkoutBtn") return navigate("checkout");
  if (t.id === "confirmCheckout") return doCheckOut();
  if (t.id === "anomalyBtn") { S.anomaly = { photos: [] }; return navigate("anomaly"); }


  if (t.dataset.type) { S.anomaly.type = t.dataset.type;
    document.querySelectorAll("#typeChips .c").forEach(c =>
      c.classList.toggle("on", c.dataset.type === t.dataset.type)); return; }
  if (t.dataset.sev) { S.anomaly.severity = t.dataset.sev;
    document.querySelectorAll("#sevBtns .s").forEach(b =>
      b.classList.toggle("on", b.dataset.sev === t.dataset.sev)); return; }
  if (t.dataset.rm != null) {
    S.anomaly.desc = (document.getElementById("anomDesc") || {}).value || "";
    S.anomaly.photos.splice(+t.dataset.rm, 1); return render();
  }
  if (t.id === "addPhoto") return document.getElementById("photoInput").click();
  if (t.id === "sendAnomaly") return sendAnomaly();
  if (t.id === "moreHist") return loadHistory(false);

  if (t.id === "manualGo" || t.id === "skipScan") {
    const v = (document.getElementById("manualSite") || {}).value;
    if (t.id === "manualGo" && v) return onSiteScanned(v.trim());
    S.anomaly = { photos: [] };
    return navigate("anomaly");
  }
  if (t.id === "logoutBtn") {
    try {
      // Use redirect:manual so the browser doesn't follow the server redirect
      // which would cause ERR_CONNECTION_REFUSED on non-standard ports
      await fetch("/?cmd=web_logout", { redirect: "manual", credentials: "same-origin" });
    } catch (e) {}
    // Force a full page navigation to clear any cached state
    window.location.replace("/netplus-login?redirect-to=/netplus-pwa");
  }
});

document.addEventListener("change", async ev => {
  if (ev.target.id !== "photoInput" || !ev.target.files.length) return;
  try {
    S.anomaly.desc = (document.getElementById("anomDesc") || {}).value || "";
    const dataUrl = await compressPhoto(ev.target.files[0]);
    S.anomaly.photos.push(dataUrl);
    render();
  } catch (e) { toast("Photo illisible", true); }
});

window.addEventListener("hashchange", onRoute);

/* ------------------------------ démarrage ------------------------------ */
(async function init() {
  try {
    S.boot = await api("bootstrap");
  } catch (e) {
    app.innerHTML = `<div class="screen"><div class="empty" style="padding-top:30vh">
      <div class="e-emoji">📡</div><div class="e-title">Impossible de charger vos missions</div>
      <div>${esc(e.message)}</div></div>
      <button class="btn ghost" onclick="location.reload()">Réessayer</button></div>`;
    return;
  }
  startWatch();
  if (S.boot.active) startHeartbeat();
  if (!location.hash) location.hash = "#/home";
  onRoute();
})();

})();
