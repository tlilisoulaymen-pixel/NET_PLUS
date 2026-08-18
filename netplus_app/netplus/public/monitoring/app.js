/* =============================================================
   NetPlus Monitoring — Real-time operator tracking dashboard
   Vanilla JS, zero dependencies (Google Maps loaded in HTML)
   ============================================================= */
(() => {
"use strict";

const CFG = window.NETPLUS || {};
const app = document.getElementById("app");
const REFRESH_INTERVAL = 30; // seconds

const S = {
  data: null,      // last live_monitoring() payload
  filter: "all",   // all | active | warning | offline
  map: null,
  markers: {},     // employee -> google.maps.Marker
  siteCircles: {}, // mission -> google.maps.Circle
  sitePins: {},    // mission -> google.maps.Marker
  refreshTimer: null,
  refreshProgress: 0,
  selectedOp: null,
  tooltip: null,
};

/* ---------- API ---------- */
async function api(method, args = {}) {
  const res = await fetch(`/api/method/netplus.api.supervisor_api.${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": CFG.csrf }, body: JSON.stringify(args)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.exception || "Erreur serveur");
  return data.message;
}

/* ---------- Formatters ---------- */
const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function timeAgo(str) {
  if (!str) return "—";
  const s = (Date.now() - new Date(String(str).replace(" ", "T")).getTime()) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} j`;
}

function fmtDist(m) {
  if (m == null) return "—";
  return m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m) + " m";
}

function fmtTime(str) {
  if (!str) return "—";
  const d = new Date(String(str).replace(" ", "T"));
  return d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}

function initial(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

/* ---------- Operator status ---------- */
function opStatus(op) {
  if (!op.lat || !op.lng) return "no-gps";
  if (op.out_of_zone || !op.in_zone) return "warning";
  if (op.heartbeat_age_min != null && op.heartbeat_age_min > 15) return "stale";
  return "active";
}

function opStatusBadge(op) {
  const s = opStatus(op);
  const map = {
    "active":   ["green", "● En zone"],
    "warning":  ["red", "⚠ Hors zone"],
    "stale":    ["amber", "⏱ Signal perdu"],
    "no-gps":   ["gray", "— Pas de GPS"],
  };
  const [cls, label] = map[s] || map["no-gps"];
  return `<span class="badge ${cls}">${label}</span>`;
}

function opStatusRing(op) {
  const s = opStatus(op);
  const cls = { active: "", warning: "red", stale: "amber", "no-gps": "gray" }[s] || "";
  return cls;
}

/* ---------- Filter ---------- */
function applyFilter(ops) {
  if (S.filter === "all") return ops;
  if (S.filter === "active") return ops.filter(o => opStatus(o) === "active");
  if (S.filter === "warning") return ops.filter(o => opStatus(o) === "warning" || opStatus(o) === "stale");
  return ops;
}

/* ---------- Render ---------- */
function render() {
  const d = S.data;
  if (!d) return;

  const ops = applyFilter(d.operators || []);
  const sups = d.supervisors || [];
  const total = (d.operators || []).length;
  const inZone = (d.operators || []).filter(o => o.in_zone).length;
  const warnings = (d.operators || []).filter(o => opStatus(o) === "warning").length;

  const userInitial = initial(CFG.fullName);

  app.innerHTML = `
  <div class="layout">
    <header class="header">
      <div class="header-logo">N+</div>
      <div>
        <div class="header-title">Monitoring Temps Réel</div>
        <div class="header-subtitle">NetPlus — Suivi opérateurs &amp; superviseurs</div>
      </div>
      <div class="header-spacer"></div>
      <div class="live-badge"><span class="live-dot"></span>LIVE</div>
      <div class="header-actions">
        <button class="hbtn" id="refreshBtn">↺ Actualiser</button>
        <button class="hbtn" id="fitMapBtn">🗺 Centrer carte</button>
        <a href="/app" class="hbtn primary">← ERP</a>
      </div>
      <div class="header-user">
        <div>
          <div class="header-user-name">${esc(CFG.fullName || CFG.user)}</div>
          <div class="header-user-role">Administrateur</div>
        </div>
        <div class="header-avatar">${userInitial}</div>
      </div>
    </header>

    <aside class="sidebar">
      <!-- Refresh progress bar -->
      <div class="refresh-bar">
        <span id="refreshLabel">Actualisation dans ${REFRESH_INTERVAL}s</span>
        <div class="refresh-progress"><div class="refresh-fill" id="refreshFill" style="width:0%"></div></div>
      </div>

      <!-- Stats -->
      <div class="stat-row">
        <div class="stat-card ${total > 0 ? "green" : ""}">
          <div class="sv">${total}</div>
          <div class="sl">Actifs</div>
        </div>
        <div class="stat-card ${warnings > 0 ? "red" : ""}">
          <div class="sv">${warnings}</div>
          <div class="sl">Alertes</div>
        </div>
        <div class="stat-card">
          <div class="sv">${sups.length}</div>
          <div class="sl">Superviseurs</div>
        </div>
      </div>

      <!-- Filters -->
      <div class="sidebar-section">
        <div class="section-head">
          <div class="section-title">Opérateurs</div>
          <span class="section-count">${ops.length}/${total}</span>
        </div>
        <div class="filter-bar">
          ${["all","active","warning"].map(f =>
            `<button class="filter-btn ${S.filter === f ? "on" : ""}" data-filter="${f}">${
              {all:"Tous", active:"En zone", warning:"Alertes"}[f]
            }</button>`
          ).join("")}
        </div>

        ${ops.length === 0
          ? `<div class="empty-state">
              <div class="icon">${total > 0 ? "🔍" : "🌙"}</div>
              <div class="msg">${total > 0 ? "Aucun résultat" : "Aucun opérateur actif"}</div>
              <div class="sub">${total > 0 ? "Modifiez le filtre" : "Les opérateurs en mission apparaîtront ici"}</div>
            </div>`
          : ops.map(op => `
          <div class="op-card ${opStatus(op) === "warning" ? "out-of-zone" : ""} ${S.selectedOp === op.employee ? "selected" : ""}"
               data-op="${esc(op.employee)}" data-lat="${op.lat || ""}" data-lng="${op.lng || ""}">
            <div class="op-avatar" style="background:${opStatus(op) === "active" ? "#34D399" : opStatus(op) === "warning" ? "#F87171" : "#475569"}">
              ${op.image ? `<img src="${esc(op.image)}" alt="">` : initial(op.name)}
              <div class="op-status-ring ${opStatusRing(op)}"></div>
            </div>
            <div class="op-body">
              <div class="op-name">${esc(op.name)}</div>
              <div class="op-site">${esc(op.site_label)}</div>
              <div class="op-meta">
                ${opStatusBadge(op)}
                ${op.distance_m != null ? `<span class="badge gray">${fmtDist(op.distance_m)}</span>` : ""}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:11px;color:var(--text3)">Check-in</div>
              <div style="font-size:12px;font-weight:700;color:var(--text)">${fmtTime(op.check_in_time)}</div>
              <div style="font-size:11px;color:var(--text4);margin-top:2px">HB ${timeAgo(op.last_heartbeat)}</div>
            </div>
          </div>`).join("")
        }
      </div>

      <!-- Supervisors -->
      <div class="sidebar-section">
        <div class="section-head">
          <div class="section-title">Superviseurs</div>
          <span class="section-count">${sups.length}</span>
        </div>
        ${sups.length === 0
          ? `<div class="empty-state"><div class="icon">👥</div><div class="sub">Aucun superviseur configuré</div></div>`
          : sups.map(s => `
          <div class="sup-card">
            <div class="sup-avatar">${s.image ? `<img src="${esc(s.image)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px">` : initial(s.name)}</div>
            <div>
              <div class="sup-name">${esc(s.name)}</div>
              <div class="sup-role">${esc(s.designation || "Superviseur")}</div>
            </div>
            <span class="badge purple" style="margin-left:auto">SUP</span>
          </div>`).join("")
        }
      </div>

      <!-- Last update -->
      <div class="sidebar-section">
        <div style="font-size:11px;color:var(--text4);text-align:center">
          Dernière mise à jour : ${d.timestamp ? new Date(d.timestamp).toLocaleTimeString("fr-CA") : "—"}
        </div>
      </div>
    </aside>

    <!-- Map -->
    <div class="map-area">
      <div id="mainMap"></div>
      <div class="map-overlay">
        <button class="map-ctrl-btn" id="mapFitBtn" title="Recadrer">⤢</button>
        <button class="map-ctrl-btn" id="mapSatBtn" title="Satellite">🛰</button>
        <button class="map-ctrl-btn" id="mapRoadBtn" title="Plan">🗺</button>
      </div>
      <div class="map-tooltip" id="mapTooltip">
        <div>
          <div class="mt-name" id="ttName"></div>
          <div class="mt-info" id="ttInfo"></div>
        </div>
      </div>
    </div>
  </div>`;

  // Bind events
  document.getElementById("refreshBtn")?.addEventListener("click", () => { fetchData(); resetTimer(); });
  document.getElementById("fitMapBtn")?.addEventListener("click", fitMap);
  document.getElementById("mapFitBtn")?.addEventListener("click", fitMap);
  document.getElementById("mapSatBtn")?.addEventListener("click", () => S.map && S.map.setMapTypeId("hybrid"));
  document.getElementById("mapRoadBtn")?.addEventListener("click", () => S.map && S.map.setMapTypeId("roadmap"));

  document.querySelectorAll("[data-filter]").forEach(btn =>
    btn.addEventListener("click", () => { S.filter = btn.dataset.filter; render(); }));

  document.querySelectorAll("[data-op]").forEach(card =>
    card.addEventListener("click", () => {
      const emp = card.dataset.op;
      const lat = parseFloat(card.dataset.lat);
      const lng = parseFloat(card.dataset.lng);
      S.selectedOp = emp;
      if (!isNaN(lat) && !isNaN(lng) && S.map) {
        S.map.panTo({ lat, lng });
        S.map.setZoom(18);
      }
      render();
    }));

  S.tooltip = document.getElementById("mapTooltip");

  initMap();
}

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

function initMap() {
  if (!window.google || !window.google.maps) {
    // retry until Google Maps API is ready
    setTimeout(initMap, 300);
    return;
  }
  const mapEl = document.getElementById("mainMap");
  if (!mapEl) return;

  if (!S.map) {
    S.map = new google.maps.Map(mapEl, {
      center: { lat: 45.5017, lng: -73.5673 }, // Montréal default
      zoom: 11,
      mapTypeId: "roadmap",
      disableDefaultUI: false,
      zoomControl: true,
      styles: COLOR_STYLE,
    });
  }

  updateMapMarkers();
}


function updateMapMarkers() {
  if (!S.map || !S.data) return;
  const d = S.data;

  // Clear old markers
  Object.values(S.markers).forEach(m => m.setMap(null));
  Object.values(S.siteCircles).forEach(c => c.setMap(null));
  Object.values(S.sitePins).forEach(p => p.setMap(null));
  S.markers = {}; S.siteCircles = {}; S.sitePins = {};

  // Site circles + pins
  (d.sites || []).forEach(site => {
    S.siteCircles[site.mission] = new google.maps.Circle({
      strokeColor: "#34D399", strokeOpacity: 0.6, strokeWeight: 2,
      fillColor: "#34D399", fillOpacity: 0.06,
      map: S.map, center: { lat: site.lat, lng: site.lng }, radius: site.radius,
    });
    S.sitePins[site.mission] = new google.maps.Marker({
      position: { lat: site.lat, lng: site.lng },
      map: S.map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 12, fillColor: "#34D399", fillOpacity: 0.9,
        strokeColor: "#fff", strokeWeight: 2,
      },
      title: site.label,
    });
  });

  // Operator markers
  const bounds = new google.maps.LatLngBounds();
  let hasBounds = false;

  (d.operators || []).forEach(op => {
    const lat = op.lat, lng = op.lng;
    if (!lat || !lng) return;

    const pos = { lat, lng };
    const status = opStatus(op);
    const color = { active: "#34D399", warning: "#F87171", stale: "#FBBF24", "no-gps": "#64748B" }[status] || "#64748B";

    const marker = new google.maps.Marker({
      position: pos, map: S.map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 16, fillColor: color, fillOpacity: 1,
        strokeColor: "#fff", strokeWeight: 3,
      },
      title: op.name,
      zIndex: op.employee === S.selectedOp ? 10 : 1,
    });

    // Label on marker
    const label = new google.maps.Marker({
      position: pos, map: S.map,
      label: { text: initial(op.name), color: "#fff", fontWeight: "800", fontSize: "13px" },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
      zIndex: 11,
    });

    marker.addListener("click", () => {
      S.selectedOp = op.employee;
      const tt = document.getElementById("mapTooltip");
      const ttN = document.getElementById("ttName");
      const ttI = document.getElementById("ttInfo");
      if (tt && ttN && ttI) {
        ttN.textContent = op.name;
        ttI.textContent = `${op.site_label} · ${op.in_zone ? "En zone" : "Hors zone"} · HB ${timeAgo(op.last_heartbeat)}`;
        tt.classList.add("show");
        setTimeout(() => tt.classList.remove("show"), 4000);
      }
      render();
    });

    S.markers[op.employee] = marker;
    bounds.extend(pos);
    hasBounds = true;
  });

  // Also extend bounds for sites
  (d.sites || []).forEach(site => {
    bounds.extend({ lat: site.lat, lng: site.lng });
    hasBounds = true;
  });

  if (hasBounds && !S._boundsSet) {
    S.map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
    S._boundsSet = true;
  }
}

function fitMap() {
  if (!S.map || !S.data) return;
  const bounds = new google.maps.LatLngBounds();
  let any = false;
  (S.data.operators || []).forEach(op => {
    if (op.lat && op.lng) { bounds.extend({ lat: op.lat, lng: op.lng }); any = true; }
  });
  (S.data.sites || []).forEach(s => { bounds.extend({ lat: s.lat, lng: s.lng }); any = true; });
  if (any) S.map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
}

/* ---------- Data fetch ---------- */
async function fetchData() {
  try {
    S.data = await api("live_monitoring");
    render();
    updateMapMarkers();
  } catch (e) {
    console.error("Monitoring fetch error:", e);
    // Don't clear existing data on error, just show stale indicator
  }
}

/* ---------- Auto-refresh timer ---------- */
function resetTimer() {
  if (S.refreshTimer) clearInterval(S.refreshTimer);
  S._elapsed = 0;
  S.refreshTimer = setInterval(() => {
    S._elapsed++;
    const pct = Math.min(100, (S._elapsed / REFRESH_INTERVAL) * 100);
    const fill = document.getElementById("refreshFill");
    const label = document.getElementById("refreshLabel");
    if (fill) fill.style.width = pct + "%";
    if (label) label.textContent = `Actualisation dans ${REFRESH_INTERVAL - S._elapsed}s`;
    if (S._elapsed >= REFRESH_INTERVAL) {
      S._elapsed = 0;
      fetchData();
    }
  }, 1000);
}

/* ---------- Init ---------- */
(async function init() {
  await fetchData();
  resetTimer();
  // Retry map init after Google Maps loads
  setTimeout(initMap, 800);
})();

})();
