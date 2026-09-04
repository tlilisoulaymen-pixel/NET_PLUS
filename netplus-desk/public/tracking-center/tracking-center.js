/* ============================================================
 * Tracking Center — administrator monitoring hub
 * ------------------------------------------------------------
 * Sub-pages (tabs):
 *   1. Vue d'ensemble  — operator cards: status, last activity,
 *                        sessions, today's actions count.
 *   2. Carte temps réel— Google Maps, live operator markers,
 *                        trail polylines, clustering-free clear view.
 *   3. Superviseurs    — users holding supervisor/manager roles,
 *                        their team size and team activity.
 *   4. Retours clients — client feedback feed (rating + comment)
 *                        linked to documents & operators.
 *
 * Real-time: operator browsers report geolocation via
 *   navigator.geolocation.watchPosition -> tracking_center.api.report_location
 * The map polls tracking_center.api.list_locations every 15s.
 *
 * Design: modern, coherent with the other add-ons (.tc-*),
 * light elegant cards, clear typography, no clutter.
 *
 * Public API:  TrackingCenter.mount("#container")
 * ========================================================== */
(function () {
  "use strict";

  var API = "netplus.tracking_center.api.";
  var MAP_POLL_MS = 15000;

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k === "html") el.innerHTML = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { el.appendChild(c); });
    return el;
  }

  function esc(v) {
    if (v === null || v === undefined) return "";
    return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function call(method, args) {
    if (window.frappe && frappe.call) {
      return new Promise(function (resolve, reject) {
        frappe.call({
          method: API + method, args: args || {},
          callback: function (r) { resolve(r.message); }, error: reject,
        });
      });
    }
    return fetch("/api/method/" + API + method, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args || {}),
    }).then(function (r) { return r.json(); }).then(function (j) { return j.message; });
  }

  function timeAgo(iso) {
    if (!iso) return "—";
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "à l'instant";
    if (s < 3600) return "il y a " + Math.floor(s / 60) + " min";
    if (s < 86400) return "il y a " + Math.floor(s / 3600) + " h";
    return "il y a " + Math.floor(s / 86400) + " j";
  }

  function initials(name) {
    return (name || "?").split(/\s+/).map(function (w) { return w[0]; })
      .slice(0, 2).join("").toUpperCase();
  }

  // ---------------------------------------------------------------
  function App(container) {
    this.container = typeof container === "string"
      ? document.querySelector(container) : container;
    this.root = h("div", { class: "tc-root" });
    this.container.appendChild(this.root);
    this.tab = "overview";
    this.buildShell();
    this.showTab("overview");
    this.startLocationReporting();
  }

  App.prototype.buildShell = function () {
    var self = this;
    var head = h("div", { class: "tc-head" }, [
      h("div", {}, [
        h("h1", { class: "tc-title", text: "Tracking Center" }),
        h("div", { class: "tc-sub", text: "Supervision en temps réel des opérateurs" }),
      ]),
    ]);
    this.liveBadge = h("span", { class: "tc-live", html: "&#9679; LIVE" });
    head.appendChild(this.liveBadge);
    this.root.appendChild(head);

    var tabs = h("div", { class: "tc-tabs" });
    this.tabBtns = {};
    [["overview", "Vue d'ensemble"],
     ["map", "Carte temps réel"],
     ["supervisors", "Superviseurs"],
     ["feedback", "Retours clients"]].forEach(function (pair) {
      var b = h("button", { class: "tc-tab", type: "button", text: pair[1] });
      b.addEventListener("click", function () { self.showTab(pair[0]); });
      self.tabBtns[pair[0]] = b;
      tabs.appendChild(b);
    });
    this.root.appendChild(tabs);
    this.body = h("div", { class: "tc-body" });
    this.root.appendChild(this.body);
  };

  App.prototype.showTab = function (tab) {
    var self = this;
    this.tab = tab;
    Object.keys(this.tabBtns).forEach(function (k) {
      self.tabBtns[k].className = "tc-tab" + (k === tab ? " tc-tab-on" : "");
    });
    this.body.innerHTML = "";
    if (tab === "overview") this.renderOverview();
    else if (tab === "map") this.renderMap();
    else if (tab === "supervisors") this.renderSupervisors();
    else if (tab === "feedback") this.renderFeedback();
  };

  // ====================== 1. OVERVIEW ============================
  App.prototype.renderOverview = function () {
    var self = this;
    this.body.innerHTML = '<div class="tc-loading">Chargement des opérateurs…</div>';
    call("list_operators", {}).then(function (res) {
      self.body.innerHTML = "";
      var ops = (res && res.operators) || [];
      // Summary strip
      var online = ops.filter(function (o) { return o.online; }).length;
      var strip = h("div", { class: "tc-strip" });
      [["Opérateurs", ops.length, ""],
       ["En ligne", online, "tc-green"],
       ["Hors ligne", ops.length - online, "tc-grey"],
       ["Actions aujourd'hui", (res && res.today_actions) || 0, "tc-blue"],
      ].forEach(function (s) {
        strip.appendChild(h("div", { class: "tc-strip-item" }, [
          h("div", { class: "tc-strip-val " + s[2], text: String(s[1]) }),
          h("div", { class: "tc-strip-lbl", text: s[0] }),
        ]));
      });
      self.body.appendChild(strip);

      var grid = h("div", { class: "tc-grid" });
      ops.forEach(function (o) {
        var stCls = o.online ? "tc-dot-on" : "tc-dot-off";
        var card = h("div", { class: "tc-card tc-op" }, [
          h("div", { class: "tc-op-head" }, [
            h("div", { class: "tc-avatar", text: initials(o.full_name) }),
            h("div", {}, [
              h("div", { class: "tc-op-name", text: o.full_name || o.name }),
              h("div", { class: "tc-op-mail", text: o.name }),
            ]),
            h("span", { class: "tc-dot " + stCls }),
          ]),
          h("div", { class: "tc-op-rows" }, [
            row("Rôles", (o.roles || []).slice(0, 3).join(", ") || "—"),
            row("Dernière activité", timeAgo(o.last_activity)),
            row("Sessions actives", String(o.sessions || 0)),
            row("Actions aujourd'hui", String(o.actions_today || 0)),
          ]),
        ]);
        grid.appendChild(card);
      });
      if (!ops.length) {
        self.body.appendChild(h("div", { class: "tc-empty",
          text: "Aucun opérateur actif trouvé." }));
      } else {
        self.body.appendChild(grid);
      }
      function row(l, v) {
        return h("div", { class: "tc-op-row" }, [
          h("span", { class: "tc-op-k", text: l }),
          h("span", { class: "tc-op-v", text: v }),
        ]);
      }
    }).catch(function () {
      self.body.innerHTML = '<div class="tc-empty">Module serveur non installé — voir INTEGRATION.md §3.</div>';
    });
  };

  // ====================== 2. LIVE MAP ============================
  App.prototype.renderMap = function () {
    var self = this;
    var wrap = h("div", { class: "tc-card tc-map-card" });
    var toolbar = h("div", { class: "tc-map-toolbar" }, [
      h("span", { class: "tc-map-hint",
        text: "Positions mises à jour toutes les 15 s" }),
    ]);
    var refreshB = h("button", { class: "tc-btn", type: "button", text: "Rafraîchir" });
    refreshB.addEventListener("click", function () { self.loadMapData(); });
    toolbar.appendChild(refreshB);
    this.mapEl = h("div", { class: "tc-map" });
    this.mapList = h("div", { class: "tc-map-list" });
    wrap.appendChild(toolbar);
    wrap.appendChild(this.mapEl);
    wrap.appendChild(this.mapList);
    this.body.appendChild(wrap);
    this.mapEl.innerHTML = '<div class="tc-loading">Chargement de la carte…</div>';
    this.initGoogleMap();
  };

  App.prototype.initGoogleMap = function () {
    var self = this;
    function ready() {
      self.gmap = new window.google.maps.Map(self.mapEl, {
        center: { lat: 36.8065, lng: 10.1815 }, // Tunis — recentré dès les 1ères positions
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        styles: [
          { featureType: "poi", stylers: [{ visibility: "off" }] },
          { featureType: "transit", stylers: [{ visibility: "off" }] },
        ],
      });
      self.markers = {};
      self.trails = {};
      self.loadMapData();
      if (self.mapTimer) clearInterval(self.mapTimer);
      self.mapTimer = setInterval(function () {
        if (self.tab === "map") self.loadMapData();
      }, MAP_POLL_MS);
    }
    if (window.google && window.google.maps) { ready(); return; }
    call("get_maps_key", {}).then(function (res) {
      var key = res && res.key;
      if (!key) {
        self.mapEl.innerHTML = '<div class="tc-empty">Clé Google Maps manquante — ' +
          "renseignez-la dans les réglages (INTEGRATION.md §4).</div>";
        return;
      }
      var s = h("script", {
        src: "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key),
      });
      s.onload = ready;
      s.onerror = function () {
        self.mapEl.innerHTML = '<div class="tc-empty">Échec du chargement de Google Maps.</div>';
      };
      document.head.appendChild(s);
    }).catch(function () {
      self.mapEl.innerHTML = '<div class="tc-empty">Module serveur non installé.</div>';
    });
  };

  App.prototype.loadMapData = function () {
    var self = this;
    if (!this.gmap) return;
    call("list_locations", {}).then(function (res) {
      var rows = (res && res.locations) || [];
      var bounds = new window.google.maps.LatLngBounds();
      var seen = {};
      rows.forEach(function (r) {
        seen[r.user] = true;
        var pos = { lat: +r.latitude, lng: +r.longitude };
        bounds.extend(pos);
        if (!self.markers[r.user]) {
          self.markers[r.user] = new window.google.maps.Marker({
            map: self.gmap,
            position: pos,
            title: r.full_name || r.user,
            label: {
              text: initials(r.full_name || r.user),
              color: "#ffffff", fontWeight: "700", fontSize: "11px",
            },
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 16, fillColor: r.online ? "#2490ef" : "#8d99a6",
              fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2.5,
            },
          });
          var info = new window.google.maps.InfoWindow({
            content:
              '<div style="font-family:inherit;font-size:13px">' +
              "<b>" + esc(r.full_name || r.user) + "</b><br>" +
              esc(r.user) + "<br>" +
              '<span style="color:#8d99a6">' + esc(timeAgo(r.reported_at)) + "</span>" +
              "</div>",
          });
          self.markers[r.user].addListener("click", function () {
            info.open(self.gmap, self.markers[r.user]);
          });
          self.trails[r.user] = new window.google.maps.Polyline({
            map: self.gmap, strokeColor: "#2490ef", strokeOpacity: .45,
            strokeWeight: 2.5, path: [],
          });
        } else {
          self.markers[r.user].setPosition(pos);
        }
        if (r.trail && r.trail.length) {
          self.trails[r.user].setPath(r.trail.map(function (p) {
            return { lat: +p.latitude, lng: +p.longitude };
          }));
        }
      });
      // Remove stale markers
      Object.keys(self.markers).forEach(function (u) {
        if (!seen[u]) {
          self.markers[u].setMap(null);
          self.trails[u].setMap(null);
          delete self.markers[u]; delete self.trails[u];
        }
      });
      if (rows.length === 1) {
        self.gmap.setCenter(bounds.getCenter()); self.gmap.setZoom(14);
      } else if (rows.length > 1 && !self._fitted) {
        self.gmap.fitBounds(bounds, 60); self._fitted = true;
      }
      // Side list
      self.mapList.innerHTML = "";
      if (!rows.length) {
        self.mapList.appendChild(h("div", { class: "tc-empty",
          text: "Aucune position signalée pour le moment. Les opérateurs doivent autoriser la géolocalisation." }));
      }
      rows.forEach(function (r) {
        var item = h("button", { class: "tc-map-item", type: "button" }, [
          h("span", { class: "tc-dot " + (r.online ? "tc-dot-on" : "tc-dot-off") }),
          h("span", { class: "tc-map-item-name", text: r.full_name || r.user }),
          h("span", { class: "tc-map-item-time", text: timeAgo(r.reported_at) }),
        ]);
        item.addEventListener("click", function () {
          self.gmap.panTo({ lat: +r.latitude, lng: +r.longitude });
          self.gmap.setZoom(15);
        });
        self.mapList.appendChild(item);
      });
    }).catch(function () {});
  };

  // ====================== 3. SUPERVISORS =========================
  App.prototype.renderSupervisors = function () {
    var self = this;
    this.body.innerHTML = '<div class="tc-loading">Chargement des superviseurs…</div>';
    call("list_supervisors", {}).then(function (res) {
      self.body.innerHTML = "";
      var sups = (res && res.supervisors) || [];
      if (!sups.length) {
        self.body.appendChild(h("div", { class: "tc-empty",
          text: "Aucun utilisateur avec un rôle superviseur/manager." }));
        return;
      }
      var grid = h("div", { class: "tc-grid" });
      sups.forEach(function (s) {
        var card = h("div", { class: "tc-card" }, [
          h("div", { class: "tc-op-head" }, [
            h("div", { class: "tc-avatar tc-avatar-sup", text: initials(s.full_name) }),
            h("div", {}, [
              h("div", { class: "tc-op-name", text: s.full_name || s.name }),
              h("div", { class: "tc-op-mail", text: (s.roles || []).join(", ") }),
            ]),
          ]),
          h("div", { class: "tc-sup-stats" }, [
            stat("Équipe", s.team_size),
            stat("Membres en ligne", s.team_online),
            stat("Actions équipe (auj.)", s.team_actions_today),
          ]),
          (s.team && s.team.length
            ? h("div", { class: "tc-sup-team" },
                s.team.map(function (m) {
                  return h("div", { class: "tc-sup-member" }, [
                    h("span", { class: "tc-dot " + (m.online ? "tc-dot-on" : "tc-dot-off") }),
                    h("span", { text: m.full_name || m.name }),
                  ]);
                }))
            : h("div", { class: "tc-empty tc-empty-sm", text: "Aucun membre rattaché" })),
        ]);
        grid.appendChild(card);
      });
      self.body.appendChild(grid);
      function stat(l, v) {
        return h("div", { class: "tc-strip-item" }, [
          h("div", { class: "tc-strip-val", text: String(v || 0) }),
          h("div", { class: "tc-strip-lbl", text: l }),
        ]);
      }
    }).catch(function () {
      self.body.innerHTML = '<div class="tc-empty">Module serveur non installé.</div>';
    });
  };

  // ====================== 4. FEEDBACK ============================
  App.prototype.renderFeedback = function () {
    var self = this;
    var wrap = h("div", { class: "tc-card" });
    wrap.appendChild(h("div", { class: "tc-card-title", text: "Retours clients" }));
    var feed = h("div", { class: "tc-feed" });
    feed.innerHTML = '<div class="tc-loading">Chargement…</div>';
    wrap.appendChild(feed);
    this.body.appendChild(wrap);
    call("list_feedback", {}).then(function (res) {
      feed.innerHTML = "";
      var rows = (res && res.feedback) || [];
      if (!rows.length) {
        feed.appendChild(h("div", { class: "tc-empty",
          text: "Aucun retour client enregistré." }));
        return;
      }
      // Average strip
      var avg = rows.reduce(function (a, r) { return a + (+r.rating || 0); }, 0) / rows.length;
      feed.appendChild(h("div", { class: "tc-strip" }, [
        h("div", { class: "tc-strip-item" }, [
          h("div", { class: "tc-strip-val tc-amber",
            text: (Math.round(avg * 10) / 10) + " / 5" }),
          h("div", { class: "tc-strip-lbl", text: "Note moyenne" }),
        ]),
        h("div", { class: "tc-strip-item" }, [
          h("div", { class: "tc-strip-val", text: String(rows.length) }),
          h("div", { class: "tc-strip-lbl", text: "Retours" }),
        ]),
      ]));
      rows.forEach(function (r) {
        var stars = "";
        for (var i = 1; i <= 5; i++) stars += i <= (+r.rating || 0) ? "★" : "☆";
        feed.appendChild(h("div", { class: "tc-fb" }, [
          h("div", { class: "tc-fb-head" }, [
            h("span", { class: "tc-fb-stars", text: stars }),
            h("span", { class: "tc-fb-who", text: r.customer || "Client" }),
            h("span", { class: "tc-fb-when", text: timeAgo(r.creation) }),
          ]),
          h("div", { class: "tc-fb-text", text: r.feedback || "" }),
          (r.reference || r.operator
            ? h("div", { class: "tc-fb-meta",
                text: (r.reference ? "Document : " + r.reference : "") +
                      (r.operator ? " · Opérateur : " + r.operator : "") })
            : h("div")),
        ]));
      });
    }).catch(function () {
      feed.innerHTML = '<div class="tc-empty">Module serveur non installé.</div>';
    });
  };

  // ====================== LOCATION REPORTING =====================
  // The current browser reports its position so it appears on the map.
  App.prototype.startLocationReporting = function () {
    if (!navigator.geolocation) return;
    var lastSent = 0;
    navigator.geolocation.watchPosition(function (pos) {
      var now = Date.now();
      if (now - lastSent < 60000) return; // 1 report / minute max
      lastSent = now;
      call("report_location", {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy || 0),
      }).catch(function () {});
    }, function () { /* denied — user just won't appear on the map */ },
    { enableHighAccuracy: true, maximumAge: 30000 });
  };

  // ---------------------------------------------------------------
  window.TrackingCenter = {
    mount: function (selector) { return new App(selector); },
  };
})();
