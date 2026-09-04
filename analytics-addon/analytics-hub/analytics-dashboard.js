/* ============================================================
 * Analytics Hub — dashboard UI (KPI cards + charts + filters)
 * ------------------------------------------------------------
 * Renders:
 *   • a KPI row (number cards with trend vs previous period)
 *   • revenue vs expense (bar + profit line)
 *   • cash in / out (bars)
 *   • expense breakdown (donut)
 *   • top customers / suppliers / items (horizontal bars)
 *   • stock valuation per warehouse + slow-mover table
 *
 * Chart engine: uses frappe.Chart (bundled with every Frappe
 * Desk) when available; otherwise falls back to a tiny built-in
 * SVG renderer so the module also works on portals / standalone
 * pages with zero dependencies.
 *
 * Public API:
 *   AnalyticsHub.mount("#container", { company, fromDate, toDate, api })
 * ========================================================== */
(function () {
  "use strict";

  const API = "analytics.api."; // server module prefix — see INTEGRATION.md §3

  // ---------------------------------------------------------------
  // Tiny SVG chart fallback (only used when frappe.Chart is absent)
  // ---------------------------------------------------------------
  const PALETTE = ["#5e64ff", "#29cd42", "#ec8648", "#743ee2", "#ff5858",
                   "#ffa00a", "#7cd6fd", "#b8c2cc", "#4463f0", "#d64545"];

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function svgBar(container, labels, datasets, opts) {
    opts = opts || {};
    const W = 560, H = 240, pad = 34;
    const all = datasets.reduce((a, d) => a.concat(d.values), []);
    const max = Math.max.apply(null, all.concat([1]));
    const n = labels.length || 1;
    const groupW = (W - pad * 2) / n;
    const barW = groupW / (datasets.length + 1);
    let s = '<svg viewBox="0 0 ' + W + " " + H + '" class="ah-svg">';
    for (let i = 0; i <= 4; i++) {
      const y = pad + (H - pad * 2) * i / 4;
      s += '<line x1="' + pad + '" y1="' + y + '" x2="' + (W - pad) + '" y2="' + y + '" stroke="#e5e9ec"/>';
      s += '<text x="2" y="' + (y + 4) + '" class="ah-axis">' +
           Math.round(max * (1 - i / 4)) + "</text>";
    }
    labels.forEach(function (lb, i) {
      datasets.forEach(function (d, j) {
        const h = (H - pad * 2) * (d.values[i] || 0) / max;
        s += '<rect x="' + (pad + i * groupW + j * barW + 2) + '" y="' + (H - pad - h) +
             '" width="' + (barW - 4) + '" height="' + h + '" fill="' + PALETTE[j % PALETTE.length] +
             '" rx="2"><title>' + esc(d.name + " — " + lb + ": " + (d.values[i] || 0)) + "</title></rect>";
      });
      if (n <= 12) s += '<text x="' + (pad + i * groupW + groupW / 2) + '" y="' + (H - pad + 14) +
                        '" class="ah-axis" text-anchor="middle">' + esc(lb) + "</text>";
    });
    s += "</svg>" + legend(datasets);
    container.innerHTML = s;
  }

  function svgDonut(container, labels, values) {
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const R = 80, CX = 100, CY = 100;
    let angle = -Math.PI / 2, s = '<svg viewBox="0 0 200 200" class="ah-svg ah-donut">';
    values.forEach(function (v, i) {
      const frac = v / total, a2 = angle + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const x1 = CX + R * Math.cos(angle), y1 = CY + R * Math.sin(angle);
      const x2 = CX + R * Math.cos(a2), y2 = CY + R * Math.sin(a2);
      s += '<path d="M' + CX + " " + CY + " L" + x1 + " " + y1 + " A" + R + " " + R + " 0 " +
           large + " 1 " + x2 + " " + y2 + ' Z" fill="' + PALETTE[i % PALETTE.length] +
           '"><title>' + esc(labels[i] + ": " + v + " (" + Math.round(frac * 100) + "%)") + "</title></path>";
      angle = a2;
    });
    s += '<circle cx="' + CX + '" cy="' + CY + '" r="48" fill="#fff"/></svg>';
    s += '<div class="ah-legend-col">' + labels.map(function (l, i) {
      return '<div class="ah-legend-item"><span class="ah-dot" style="background:' +
             PALETTE[i % PALETTE.length] + '"></span>' + esc(l) + "</div>";
    }).join("") + "</div>";
    container.innerHTML = '<div class="ah-donut-wrap">' + s + "</div>";
  }

  function legend(datasets) {
    return '<div class="ah-legend-row">' + datasets.map(function (d, i) {
      return '<span class="ah-legend-item"><span class="ah-dot" style="background:' +
             PALETTE[i % PALETTE.length] + '"></span>' + esc(d.name) + "</span>";
    }).join("") + "</div>";
  }

  // ---------------------------------------------------------------
  // Chart adapter — frappe.Chart when present, SVG fallback otherwise
  // ---------------------------------------------------------------
  function drawBar(el, labels, datasets, opts) {
    el.innerHTML = "";
    if (window.frappe && frappe.Chart) {
      // eslint-disable-next-line no-undef
      new frappe.Chart(el, {
        type: (opts && opts.line) ? "axis-mixed" : "bar",
        data: { labels: labels, datasets: datasets.map(function (d, i) {
          return { name: d.name, chartType: d.chartType || "bar", values: d.values };
        })},
        colors: PALETTE, height: 260, barOptions: { stacked: false },
        axisOptions: { xIsSeries: labels.length > 12 },
        tooltipOptions: { formatTooltipY: function (v) { return fmtNum(v); } },
      });
    } else {
      svgBar(el, labels, datasets, opts);
    }
  }

  function drawDonut(el, labels, values) {
    el.innerHTML = "";
    if (window.frappe && frappe.Chart) {
      new frappe.Chart(el, {
        type: "donut", height: 260, colors: PALETTE,
        data: { labels: labels, datasets: [{ values: values }] },
      });
    } else {
      svgDonut(el, labels, values);
    }
  }

  function fmtNum(v) {
    if (window.frappe && frappe.format) {
      try { return frappe.format(v, { fieldtype: "Currency" }); } catch (e) {}
    }
    return Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M"
         : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + "k"
         : Math.round(v * 100) / 100;
  }

  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k === "html") el.innerHTML = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { el.appendChild(c); });
    return el;
  }

  // ---------------------------------------------------------------
  // Data fetch — whitelisted API first, graceful demo fallback
  // ---------------------------------------------------------------
  function call(method, args) {
    if (window.frappe && frappe.call) {
      return new Promise(function (resolve, reject) {
        frappe.call({
          method: API + method, args: args,
          callback: function (r) { resolve(r.message); },
          error: reject,
        });
      });
    }
    // fetch fallback (works on portals where frappe.call isn't bootstrapped)
    return fetch("/api/method/" + API + method, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args || {}),
    }).then(function (r) { return r.json(); }).then(function (j) { return j.message; });
  }

  // ---------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------
  function Dashboard(container, opts) {
    this.opts = opts || {};
    this.container = typeof container === "string"
      ? document.querySelector(container) : container;
    this.build();
    this.load();
  }

  Dashboard.prototype.build = function () {
    const self = this;
    this.root = h("div", { class: "ah-root" });

    // ---- Filter bar
    const bar = h("div", { class: "ah-filters" });
    this.companySel = h("select", { class: "ah-select" }, [
      h("option", { value: "", text: "All companies" }),
    ]);
    this.fromIn = h("input", { type: "date", class: "ah-input" });
    this.toIn = h("input", { type: "date", class: "ah-input" });
    const now = new Date(), yr = new Date(now);
    yr.setFullYear(yr.getFullYear() - 1);
    this.fromIn.value = this.opts.fromDate || yr.toISOString().slice(0, 10);
    this.toIn.value = this.opts.toDate || now.toISOString().slice(0, 10);
    [this.companySel, this.fromIn, this.toIn].forEach(function (el) {
      el.addEventListener("change", function () { self.load(); });
    });
    const refreshBtn = h("button", { class: "ah-btn", type: "button", text: "⟳ Refresh" });
    refreshBtn.addEventListener("click", function () { self.load(); });
    bar.appendChild(labeled("Company", this.companySel));
    bar.appendChild(labeled("From", this.fromIn));
    bar.appendChild(labeled("To", this.toIn));
    bar.appendChild(refreshBtn);
    this.root.appendChild(bar);

    // ---- KPI row
    this.kpiRow = h("div", { class: "ah-kpi-row" });
    this.root.appendChild(this.kpiRow);

    // ---- Chart grid
    this.grid = h("div", { class: "ah-grid" });
    this.cards = {};
    [["finance", "Revenue vs Expense (monthly)"],
     ["cashflow", "Cash Flow (in / out)"],
     ["expenses", "Expense Breakdown"],
     ["customers", "Top Customers"],
     ["suppliers", "Top Suppliers"],
     ["items", "Top Items (by amount)"],
     ["stock", "Stock Valuation per Warehouse"],
    ].forEach(function ([key, title]) {
      const body = h("div", { class: "ah-chart" }, [h("div", { class: "ah-loading", text: "…" })]);
      const card = h("div", { class: "ah-card" }, [
        h("div", { class: "ah-card-title", text: title }), body]);
      self.grid.appendChild(card);
      self.cards[key] = body;
    });
    this.root.appendChild(this.grid);

    // ---- Slow movers table
    this.slowEl = h("div", { class: "ah-card ah-wide" }, [
      h("div", { class: "ah-card-title", text: "⚠ Slow-moving / dead stock" }),
      h("div", { class: "ah-table-wrap" }),
    ]);
    this.root.appendChild(this.slowEl);

    this.statusEl = h("div", { class: "ah-status" });
    this.root.appendChild(this.statusEl);
    this.container.appendChild(this.root);

    function labeled(label, el) {
      return h("label", { class: "ah-lbl" }, [h("span", { text: label }), el]);
    }
  };

  Dashboard.prototype.filters = function () {
    return {
      company: this.companySel.value || null,
      from_date: this.fromIn.value || null,
      to_date: this.toIn.value || null,
    };
  };

  Dashboard.prototype.load = function () {
    const self = this, f = this.filters();
    this.setStatus("Loading…");

    // companies (once)
    if (!this._companiesLoaded) {
      call("list_companies").then(function (list) {
        (list || []).forEach(function (c) {
          self.companySel.appendChild(h("option", { value: c, text: c }));
        });
        if (self.opts.company) self.companySel.value = self.opts.company;
      }).catch(function () {});
      this._companiesLoaded = true;
    }

    // KPIs
    call("kpi_summary", f).then(function (k) { self.renderKpis(k); })
      .catch(function (e) { self.setStatus("KPI load failed — is the server module installed? (INTEGRATION.md §3)", true); });

    call("monthly_finance", f).then(function (d) {
      drawBar(self.cards.finance, d.labels, [
        { name: "Revenue", values: d.revenue },
        { name: "Expense", values: d.expense },
        { name: "Profit", values: d.profit, chartType: "line" },
      ], { line: true });
    }).catch(function () { self.fail(self.cards.finance); });

    call("cash_flow", f).then(function (d) {
      drawBar(self.cards.cashflow, d.labels, [
        { name: "Cash in", values: d.cash_in },
        { name: "Cash out", values: d.cash_out },
      ]);
    }).catch(function () { self.fail(self.cards.cashflow); });

    call("expense_breakdown", f).then(function (d) {
      drawDonut(self.cards.expenses, d.labels, d.values);
    }).catch(function () { self.fail(self.cards.expenses); });

    call("top_parties", Object.assign({ kind: "customer" }, f)).then(function (d) {
      drawBar(self.cards.customers, d.labels, [{ name: "Total sales", values: d.values }]);
    }).catch(function () { self.fail(self.cards.customers); });

    call("top_parties", Object.assign({ kind: "supplier" }, f)).then(function (d) {
      drawBar(self.cards.suppliers, d.labels, [{ name: "Total purchases", values: d.values }]);
    }).catch(function () { self.fail(self.cards.suppliers); });

    call("top_items", f).then(function (d) {
      drawBar(self.cards.items, d.labels, [{ name: "Amount", values: d.amounts }]);
    }).catch(function () { self.fail(self.cards.items); });

    call("stock_summary", f).then(function (d) {
      drawBar(self.cards.stock, d.labels, [{ name: "Valuation", values: d.values }]);
      self.renderSlow(d.slow_movers || []);
    }).catch(function () { self.fail(self.cards.stock); });

    this.setStatus("");
  };

  Dashboard.prototype.renderKpis = function (k) {
    const self = this;
    this.kpiRow.innerHTML = "";
    const cur = k.currency ? " " + k.currency : "";
    const defs = [
      { key: "revenue", label: "Revenue", cls: "ah-pos" },
      { key: "expense", label: "Expense", cls: "ah-neg" },
      { key: "net_profit", label: "Net Profit", cls: k.net_profit >= 0 ? "ah-pos" : "ah-neg",
        sub: "Margin " + (Math.round(k.margin_pct * 10) / 10) + "%" },
      { key: "invoiced", label: "Invoiced" },
      { key: "collected", label: "Collected", cls: "ah-pos" },
      { key: "receivable", label: "Receivable", cls: "ah-warn" },
      { key: "payable", label: "Payable", cls: "ah-warn" },
      { key: "open_journal_entries", label: "Draft JEs", num: true },
    ];
    defs.forEach(function (d) {
      const v = k[d.key];
      self.kpiRow.appendChild(h("div", { class: "ah-kpi" }, [
        h("div", { class: "ah-kpi-label", text: d.label }),
        h("div", { class: "ah-kpi-value " + (d.cls || ""), text: d.num ? String(v) : fmtNum(v) + cur }),
        d.sub ? h("div", { class: "ah-kpi-sub", text: d.sub }) : h("div", { class: "ah-kpi-sub", text: "" }),
      ]));
    });
  };

  Dashboard.prototype.renderSlow = function (rows) {
    const wrap = this.slowEl.querySelector(".ah-table-wrap");
    if (!rows.length) {
      wrap.innerHTML = '<div class="ah-empty">No dead stock 🎉</div>';
      return;
    }
    let html = '<table class="ah-table"><thead><tr><th>Item</th><th>Warehouse</th><th>Qty on hand</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += "<tr><td>" + esc(r.item_code) + "</td><td>" + esc(r.warehouse) +
              "</td><td>" + esc(r.qty) + "</td></tr>";
    });
    wrap.innerHTML = html + "</tbody></table>";
  };

  Dashboard.prototype.fail = function (cardEl) {
    cardEl.innerHTML = '<div class="ah-empty">Data unavailable for this card<br>' +
      "<small>(permission or module — see INTEGRATION.md §6)</small></div>";
  };

  Dashboard.prototype.setStatus = function (msg, isErr) {
    this.statusEl.textContent = msg || "";
    this.statusEl.className = "ah-status " + (isErr ? "ah-err" : "");
  };

  // ---------------------------------------------------------------
  window.AnalyticsHub = {
    mount: function (selector, opts) { return new Dashboard(selector, opts); },
    /** Register as a Frappe Desk page: put this in a page_js file. */
    registerPage: function (pageName) {
      if (!window.frappe || !frappe.pages) return;
      frappe.pages[pageName].on_page_load = function (wrapper) {
        const host = h("div");
        wrapper.appendChild(host);
        wrapper.analyticsHub = new Dashboard(host, {});
      };
    },
    fmtNum: fmtNum,
  };
})();
