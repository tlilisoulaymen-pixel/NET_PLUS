/* ============================================================
 * Doc Flow — generic document flow for ALL modules
 * (Ventes, Achats, Trésorerie, Retenue à la source, Stock)
 * ------------------------------------------------------------
 * One engine reproducing the studied flow for every module:
 *   1. LIST view    — title + "Créer" button, filter bar
 *                     (party, date début/fin, statut), table
 *                     (Référence, Tiers, Statut, Montant, Actions),
 *                     pagination.
 *   2. CREATE view  — full-page form: tiers, date d'émission,
 *                     n° référence, mode HT/TTC, lignes d'articles
 *                     avec totaux en direct, remise globale, notes,
 *                     conditions générales.
 *                     Barre d'action: Retour · Brouillon · Aperçu · Valider.
 *   3. PREVIEW modal— dialog (Fermer / Télécharger / Imprimer) avec
 *                     un <iframe srcdoc> contenant un template A4
 *                     HTML/CSS autonome (210mm, mis à l'échelle).
 *
 * Coverage (nothing missed):
 *   Ventes   : Devis, Commande client, Bon de livraison, Facture client, Avoir client
 *   Achats   : Commande fournisseur, Bon de réception, Facture d'achat,
 *              Avoir fournisseur, Bon de retour fournisseur
 *   Trésorerie : Paiement client, Paiement fournisseur, Écriture de journal
 *   Retenue  : Retenue à la source
 *   Stock    : Entrée / Sortie / Transfert de stock
 *
 * Integrations with the existing add-ons (all optional):
 *   - Print Studio — default template per DocType used as preview body.
 *   - PS_QR        — reference QR embedded in the document.
 *   - Server       — doc_flow.api.* persists real ERPNext documents.
 *
 * Public API:  DocFlow.mount("#container", { module: "sales_invoice" })
 *              DocFlow.MODULES  (the whole registry)
 * ========================================================== */
(function () {
  "use strict";

  var API = "doc_flow.api.";

  // ---------------------------------------------------------------
  // MODULE REGISTRY — one entry per page of the studied app.
  // Add a module = add one object; the engine handles everything.
  // ---------------------------------------------------------------
  var MODULES = {
    // ---------------- VENTES ----------------
    quotation: {
      group: "Ventes", label: "Devis", createLabel: "Créer un Devis",
      doctype: "Quotation", partyField: "party_name", partyLabel: "Client",
      partyDoctype: "Customer", refField: null, items: true,
      statusField: "status",
    },
    sales_order: {
      group: "Ventes", label: "Commande client", createLabel: "Créer une Commande client",
      doctype: "Sales Order", partyField: "customer", partyLabel: "Client",
      partyDoctype: "Customer", refField: "po_no", items: true,
    },
    delivery_note: {
      group: "Ventes", label: "Bon de Livraison", createLabel: "Créer un Bon de Livraison",
      doctype: "Delivery Note", partyField: "customer", partyLabel: "Client",
      partyDoctype: "Customer", refField: null, items: true, noTax: true,
    },
    sales_invoice: {
      group: "Ventes", label: "Facture client", createLabel: "Créer une Facture client",
      doctype: "Sales Invoice", partyField: "customer", partyLabel: "Client",
      partyDoctype: "Customer", refField: null, items: true,
    },
    sales_credit_note: {
      group: "Ventes", label: "Avoir client", createLabel: "Créer un Avoir client",
      doctype: "Sales Invoice", partyField: "customer", partyLabel: "Client",
      partyDoctype: "Customer", refField: "return_against", items: true,
      extraFilters: { is_return: 1 }, docLabel: "Avoir client",
    },
    // ---------------- ACHATS ----------------
    purchase_order: {
      group: "Achats", label: "Commande fournisseur", createLabel: "Créer une Commande fournisseur",
      doctype: "Purchase Order", partyField: "supplier", partyLabel: "Fournisseur",
      partyDoctype: "Supplier", refField: null, items: true,
    },
    purchase_receipt: {
      group: "Achats", label: "Bon de réception", createLabel: "Créer un Bon de réception",
      doctype: "Purchase Receipt", partyField: "supplier", partyLabel: "Fournisseur",
      partyDoctype: "Supplier", refField: null, items: true, noTax: true,
    },
    purchase_invoice: {
      group: "Achats", label: "Facture d'achat", createLabel: "Créer une Facture d'Achat",
      doctype: "Purchase Invoice", partyField: "supplier", partyLabel: "Fournisseur",
      partyDoctype: "Supplier", refField: "bill_no", items: true,
    },
    purchase_debit_note: {
      group: "Achats", label: "Avoir fournisseur", createLabel: "Créer un Avoir fournisseur",
      doctype: "Purchase Invoice", partyField: "supplier", partyLabel: "Fournisseur",
      partyDoctype: "Supplier", refField: "return_against", items: true,
      extraFilters: { is_return: 1 }, docLabel: "Avoir fournisseur",
    },
    supplier_return: {
      group: "Achats", label: "Bon de retour fournisseur",
      createLabel: "Créer un Bon de retour fournisseur",
      doctype: "Purchase Receipt", partyField: "supplier", partyLabel: "Fournisseur",
      partyDoctype: "Supplier", refField: "return_against", items: true,
      extraFilters: { is_return: 1 }, docLabel: "Bon de retour", noTax: true,
    },
    // ---------------- CONTRATS ----------------
    service_contract: {
      group: "Contrats", label: "Contrat de Service", createLabel: "Créer un Contrat de Service",
      doctype: "Service Contract", partyField: "party_name", partyLabel: "Client",
      partyDoctype: "Customer", refField: null, items: false, noTax: true,
      statusField: "status", amountField: "tarif_par_intervention"
    },
    // ---------------- TRÉSORERIE ----------------
    payment_in: {
      group: "Trésorerie", label: "Paiement client", createLabel: "Créer un Paiement client",
      doctype: "Payment Entry", partyField: "party", partyLabel: "Client",
      partyDoctype: "Customer", refField: "reference_no", items: false,
      amountField: "paid_amount", extraFilters: { payment_type: "Receive" },
      paymentType: "Receive",
    },
    payment_out: {
      group: "Trésorerie", label: "Paiement fournisseur",
      createLabel: "Créer un Paiement fournisseur",
      doctype: "Payment Entry", partyField: "party", partyLabel: "Fournisseur",
      partyDoctype: "Supplier", refField: "reference_no", items: false,
      amountField: "paid_amount", extraFilters: { payment_type: "Pay" },
      paymentType: "Pay",
    },
    journal_entry: {
      group: "Trésorerie", label: "Écriture de journal",
      createLabel: "Créer une Écriture de journal",
      doctype: "Journal Entry", partyField: null, partyLabel: null,
      refField: "cheque_no", items: false, isJournal: true,
      amountField: "total_debit",
    },
    // ---------------- RETENUE À LA SOURCE ----------------
    withholding: {
      group: "Retenue à la source", label: "Retenue à la source",
      createLabel: "Créer une Retenue à la source",
      doctype: "Journal Entry", partyField: null, partyLabel: null,
      refField: null, items: false, isJournal: true, isWithholding: true,
      extraFilters: { voucher_type: "Withholding" }, docLabel: "Retenue à la source",
      amountField: "total_debit",
    },
    // ---------------- STOCK ----------------
    stock_entry: {
      group: "Stock", label: "Mouvement de stock", createLabel: "Créer un Mouvement de stock",
      doctype: "Stock Entry", partyField: null, partyLabel: null,
      refField: null, items: true, isStock: true, noTax: true,
      amountField: "total_amount",
    },
  };

  var STATUS_LABELS = {
    "0": { txt: "Brouillon", cls: "df-st-draft" },
    "1": { txt: "Validée", cls: "df-st-ok" },
    "2": { txt: "Annulée", cls: "df-st-cancel" },
  };

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

  function money(v, cur) {
    var n = (Math.round((+v || 0) * 1000) / 1000).toFixed(3);
    return n.replace(".", ",") + (cur ? " " + cur : "");
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

  // ---------------------------------------------------------------
  // App shell — list <-> create views
  // ---------------------------------------------------------------
  function App(container, opts) {
    this.opts = opts || {};
    this.module = MODULES[opts.module] ? opts.module : "sales_invoice";
    this.cfg = MODULES[this.module];
    this.container = typeof container === "string"
      ? document.querySelector(container) : container;
    this.root = h("div", { class: "df-root" });
    this.container.appendChild(this.root);
    this.showList();
  }

  // =========================== LIST ==============================
  App.prototype.showList = function () {
    var self = this, cfg = this.cfg;
    this.root.innerHTML = "";

    var createBtn = h("button", { class: "df-btn df-primary", type: "button",
      text: "+ " + cfg.createLabel });
    createBtn.addEventListener("click", function () { self.showCreate(); });
    this.root.appendChild(h("div", { class: "df-head" }, [
      h("h1", { class: "df-title", text: cfg.label + "s".replace(/ss$/, "s") }),
      createBtn,
    ]));

    // Filter bar
    var filters = h("div", { class: "df-filters" });
    if (cfg.partyField) {
      this.fParty = h("input", { class: "df-input", type: "text",
        placeholder: "Rechercher un " + cfg.partyLabel.toLowerCase() + "..." });
      filters.appendChild(lbl(cfg.partyLabel, this.fParty));
    }
    this.fFrom = h("input", { class: "df-input", type: "date" });
    this.fTo = h("input", { class: "df-input", type: "date" });
    this.fStatus = h("select", { class: "df-select" }, [
      h("option", { value: "", text: "Tous" }),
      h("option", { value: "0", text: "Brouillon" }),
      h("option", { value: "1", text: "Validée" }),
      h("option", { value: "2", text: "Annulée" }),
    ]);
    filters.appendChild(lbl("Date de début", this.fFrom));
    filters.appendChild(lbl("Date de fin", this.fTo));
    filters.appendChild(lbl("Statut", this.fStatus));
    [this.fParty, this.fFrom, this.fTo, this.fStatus].forEach(function (el) {
      if (el) el.addEventListener("change", function () { self.page = 0; self.loadList(); });
    });
    this.root.appendChild(filters);

    this.tableWrap = h("div", { class: "df-card" });
    this.root.appendChild(this.tableWrap);

    // Pagination
    this.page = 0; this.pageLen = 20;
    var pag = h("div", { class: "df-pagination" });
    this.pageSel = h("select", { class: "df-select df-page-size" },
      [10, 20, 50].map(function (n) { return h("option", { value: n, text: String(n) }); }));
    this.pageSel.value = "20";
    this.pageSel.addEventListener("change", function () {
      self.pageLen = +self.pageSel.value; self.page = 0; self.loadList();
    });
    this.prevBtn = h("button", { class: "df-btn", type: "button",
      text: "<", title: "Aller à la page précédente" });
    this.nextBtn = h("button", { class: "df-btn", type: "button",
      text: ">", title: "Aller à la page suivante" });
    this.pageInfo = h("span", { class: "df-page-info" });
    this.prevBtn.addEventListener("click", function () {
      if (self.page > 0) { self.page--; self.loadList(); }
    });
    this.nextBtn.addEventListener("click", function () { self.page++; self.loadList(); });
    pag.appendChild(this.pageSel); pag.appendChild(this.prevBtn);
    pag.appendChild(this.pageInfo); pag.appendChild(this.nextBtn);
    this.root.appendChild(pag);

    this.loadList();

    function lbl(t, el) {
      return h("label", { class: "df-lbl" }, [h("span", { text: t }), el]);
    }
  };

  App.prototype.loadList = function () {
    var self = this, cfg = this.cfg;
    this.tableWrap.innerHTML = '<div class="df-loading">Chargement...</div>';
    call("list_documents", {
      module: this.module,
      party: this.fParty ? (this.fParty.value || null) : null,
      from_date: this.fFrom.value || null,
      to_date: this.fTo.value || null,
      status: this.fStatus.value === "" ? null : this.fStatus.value,
      start: this.page * this.pageLen, page_length: this.pageLen,
    }).then(function (res) {
      self.renderTable(res || { rows: [], total: 0 });
    }).catch(function () {
      self.tableWrap.innerHTML =
        '<div class="df-empty">Impossible de charger — module serveur non installé ? (INTEGRATION.md §3)</div>';
    });
  };

  App.prototype.renderTable = function (res) {
    var self = this, cfg = this.cfg;
    var rows = res.rows || [];
    if (!rows.length) {
      this.tableWrap.innerHTML = '<div class="df-empty">Aucun document</div>';
    } else {
      var headers = ["Référence"];
      if (cfg.partyField) headers.push(cfg.partyLabel);
      headers.push("Statut", "Montant", "Actions");
      var table = h("table", { class: "df-table" });
      table.appendChild(h("thead", {}, [h("tr", {},
        headers.map(function (t) { return h("th", { text: t }); }))]));
      var tbody = h("tbody");
      rows.forEach(function (r) {
        var st = STATUS_LABELS[String(r.docstatus)] || STATUS_LABELS["0"];
        var cells = [h("td", { class: "df-ref", text: r.name })];
        if (cfg.partyField) {
          cells.push(h("td", { text: r.party || "—" }));
        }
        cells.push(h("td", {}, [h("span", { class: "df-status " + st.cls, text: st.txt })]));
        cells.push(h("td", { class: "df-amount",
          text: money(r.amount, r.currency || self.opts.currency || "TND") }));
        var td = h("td", { class: "df-actions" });
        var view = h("button", { class: "df-btn df-sm", type: "button", text: "Aperçu" });
        view.addEventListener("click", function () {
          call("get_document", { module: self.module, name: r.name }).then(function (doc) {
            self.openPreview(self.docToForm(doc));
          });
        });
        td.appendChild(view);
        cells.push(td);
        tbody.appendChild(h("tr", {}, cells));
      });
      table.appendChild(tbody);
      this.tableWrap.innerHTML = "";
      this.tableWrap.appendChild(table);
    }
    var totalPages = Math.max(1, Math.ceil((res.total || 0) / this.pageLen));
    this.pageInfo.textContent = "Page " + (this.page + 1) + " / " + totalPages;
    this.prevBtn.disabled = this.page === 0;
    this.nextBtn.disabled = this.page + 1 >= totalPages;
  };

  // ========================== CREATE =============================
  App.prototype.showCreate = function () {
    var self = this, cfg = this.cfg;
    this.root.innerHTML = "";
    this.form = {
      module: this.module, party: "",
      posting_date: new Date().toISOString().slice(0, 10),
      ref_no: "", tax_mode: "ht", items: [], discount: 0,
      notes: "", terms: "", currency: this.opts.currency || "TND",
      payment_type: cfg.paymentType || null,
    };

    // Action bar — Retour · Brouillon · Aperçu · Valider
    var bar = h("div", { class: "df-actionbar" });
    var back = h("button", { class: "df-btn", type: "button", text: "< Retour" });
    back.addEventListener("click", function () { self.showList(); });
    var draft = h("button", { class: "df-btn", type: "button", text: "Brouillon" });
    draft.addEventListener("click", function () { self.save(0); });
    var preview = h("button", { class: "df-btn", type: "button", text: "Aperçu" });
    preview.addEventListener("click", function () { self.recalc(); self.openPreview(self.form); });
    var submit = h("button", { class: "df-btn df-primary", type: "button", text: "Valider" });
    submit.addEventListener("click", function () { self.save(1); });
    bar.appendChild(back);
    bar.appendChild(h("h2", { class: "df-subtitle", text: "Ajouter — " + cfg.label }));
    var right = h("div", { class: "df-actionbar-right" });
    [draft, preview, submit].forEach(function (b) { right.appendChild(b); });
    bar.appendChild(right);
    this.root.appendChild(bar);

    // --- Header card: party / date / reference
    var headCard = h("div", { class: "df-card df-grid3" });
    if (cfg.partyField) {
      this.inParty = h("input", { class: "df-input", type: "text",
        placeholder: "Rechercher des " + cfg.partyLabel.toLowerCase() + "s...",
        list: "df-parties" });
      var dl = h("datalist", { id: "df-parties" });
      call("get_parties", { module: this.module }).then(function (list) {
        (list || []).forEach(function (s) { dl.appendChild(h("option", { value: s })); });
      }).catch(function () {});
      headCard.appendChild(lbl(cfg.partyLabel, this.inParty));
      headCard.appendChild(dl);
    }
    this.inDate = h("input", { class: "df-input", type: "date" });
    this.inDate.value = this.form.posting_date;
    headCard.appendChild(lbl("Date d'émission", this.inDate));
    if (cfg.refField) {
      this.inRef = h("input", { class: "df-input", type: "text",
        placeholder: "Saisir le numéro de référence" });
      headCard.appendChild(lbl("N° Référence", this.inRef));
    }
    // Payment entries: amount field instead of items
    if (cfg.amountField && !cfg.items) {
      this.inAmount = h("input", { class: "df-input df-narrow", type: "number",
        step: "0.001", value: "0" });
      this.inAmount.addEventListener("input", function () { self.recalc(); });
      headCard.appendChild(lbl("Montant", this.inAmount));
    }
    this.root.appendChild(headCard);

    // --- Tax mode toggle (HT / TTC) — only for taxed docs
    if (cfg.items && !cfg.noTax) {
      var modeCard = h("div", { class: "df-card df-mode" });
      [["ht", "Hors taxes"], ["ttc", "Taxe incluse"]].forEach(function (pair) {
        var val = pair[0], txt = pair[1];
        var id = "df-mode-" + val;
        var radio = h("input", { type: "radio", name: "df-taxmode", id: id, value: val });
        if (val === "ht") radio.checked = true;
        radio.addEventListener("change", function () {
          self.form.tax_mode = val; self.recalc();
        });
        modeCard.appendChild(radio);
        modeCard.appendChild(h("label", { for: id, text: txt }));
      });
      this.root.appendChild(modeCard);
    }

    // --- Items table
    if (cfg.items) {
      var itemsCard = h("div", { class: "df-card" });
      itemsCard.appendChild(h("div", { class: "df-card-title", text: "Articles" }));
      this.itemsTable = h("table", { class: "df-table df-items" });
      this.itemsTable.appendChild(h("thead", {}, [h("tr", {},
        ["Article", "Qté", "Prix unitaire", "TVA %", "Total ligne", ""].map(function (t) {
          return h("th", { text: t });
        }))]));
      this.itemsBody = h("tbody");
      this.itemsTable.appendChild(this.itemsBody);
      itemsCard.appendChild(this.itemsTable);
      this.emptyHint = h("div", { class: "df-empty df-items-empty", text: "Aucun article" });
      itemsCard.appendChild(this.emptyHint);
      var addBtn = h("button", { class: "df-btn", type: "button",
        text: "+ Ajouter une Ligne Vide" });
      addBtn.addEventListener("click", function () { self.addItemRow(); });
      itemsCard.appendChild(addBtn);
      this.root.appendChild(itemsCard);
      call("get_items", { module: this.module }).then(function (list) {
        self.itemCatalog = list || [];
        var dli = h("datalist", { id: "df-items-dl" });
        self.itemCatalog.forEach(function (it) {
          dli.appendChild(h("option", { value: it.item_name }));
        });
        itemsCard.appendChild(dli);
      }).catch(function () { self.itemCatalog = []; });
      this.addItemRow();
    }

    // --- Stock movement: source/target warehouse + movement type
    if (cfg.isStock) {
      var whCard = h("div", { class: "df-card df-grid3" });
      var typeSel = h("select", { class: "df-select" },
        ["Material Issue", "Material Receipt", "Material Transfer"].map(function (t) {
          return h("option", { value: t, text: t });
        }));
      typeSel.addEventListener("change", function () { self.form.stock_type = typeSel.value; });
      this.form.stock_type = "Material Issue";
      this.inWhFrom = h("input", { class: "df-input", type: "text",
        placeholder: "Entrepôt source", list: "df-warehouses" });
      this.inWhTo = h("input", { class: "df-input", type: "text",
        placeholder: "Entrepôt cible", list: "df-warehouses" });
      var whDl = h("datalist", { id: "df-warehouses" });
      call("get_warehouses", {}).then(function (list) {
        (list || []).forEach(function (w) { whDl.appendChild(h("option", { value: w })); });
      }).catch(function () {});
      whCard.appendChild(lbl("Type de mouvement", typeSel));
      whCard.appendChild(lbl("Entrepôt source", this.inWhFrom));
      whCard.appendChild(lbl("Entrepôt cible", this.inWhTo));
      whCard.appendChild(whDl);
      this.root.appendChild(whCard);
    }

    // --- Journal entries: debit/credit account lines
    if (cfg.isJournal) {
      var jeCard = h("div", { class: "df-card" });
      jeCard.appendChild(h("div", { class: "df-card-title",
        text: cfg.isWithholding ? "Écriture de retenue" : "Écritures comptables" }));
      this.jeTable = h("table", { class: "df-table" });
      this.jeTable.appendChild(h("thead", {}, [h("tr", {},
        ["Compte", "Débit", "Crédit", ""].map(function (t) {
          return h("th", { text: t });
        }))]));
      this.jeBody = h("tbody");
      this.jeTable.appendChild(this.jeBody);
      jeCard.appendChild(this.jeTable);
      var addJe = h("button", { class: "df-btn", type: "button", text: "+ Ajouter une ligne" });
      addJe.addEventListener("click", function () { self.addJeRow(); });
      jeCard.appendChild(addJe);
      this.jeTotals = h("div", { class: "df-tot-line" });
      jeCard.appendChild(this.jeTotals);
      this.root.appendChild(jeCard);
      this.form.journal = [];
      call("get_accounts", {}).then(function (list) {
        self.accountCatalog = list || [];
        var adl = h("datalist", { id: "df-accounts-dl" });
        self.accountCatalog.forEach(function (a) {
          adl.appendChild(h("option", { value: a }));
        });
        jeCard.appendChild(adl);
      }).catch(function () { self.accountCatalog = []; });
      this.addJeRow(); this.addJeRow();
    }

    // --- Discount + totals (items modules)
    if (cfg.items) {
      var totCard = h("div", { class: "df-card df-totals" });
      this.inDiscount = h("input", { class: "df-input df-narrow", type: "number",
        min: "0", step: "0.001", value: "0" });
      this.inDiscount.addEventListener("input", function () { self.recalc(); });
      totCard.appendChild(lbl("Remise globale", this.inDiscount));
      this.totHT = h("div", { class: "df-tot-line" });
      this.totTVA = h("div", { class: "df-tot-line" });
      this.totTTC = h("div", { class: "df-tot-line df-tot-ttc" });
      totCard.appendChild(this.totHT);
      totCard.appendChild(this.totTVA);
      totCard.appendChild(this.totTTC);
      this.root.appendChild(totCard);
    }

    // --- Notes & conditions
    var metaCard = h("div", { class: "df-card df-grid2" });
    this.inNotes = h("textarea", { class: "df-input", rows: "3",
      placeholder: "Visible sur le document final" });
    this.inTerms = h("textarea", { class: "df-input", rows: "3",
      placeholder: "Conditions générales pour ce document" });
    metaCard.appendChild(lbl("Notes", this.inNotes));
    metaCard.appendChild(lbl("Conditions Générales", this.inTerms));
    this.root.appendChild(metaCard);

    this.statusEl = h("div", { class: "df-status-line" });
    this.root.appendChild(this.statusEl);
    this.recalc();

    function lbl(t, el) {
      return h("label", { class: "df-lbl" }, [h("span", { text: t }), el]);
    }
  };

  App.prototype.addItemRow = function (preset) {
    var self = this;
    var row = { item_name: "", qty: 1, rate: 0, tax: 19 };
    Object.assign(row, preset || {});
    var tr = h("tr");
    var inName = h("input", { class: "df-input", type: "text",
      placeholder: "Sélectionner un article...", list: "df-items-dl" });
    inName.value = row.item_name;
    var inQty = num(row.qty, function (v) { row.qty = v; });
    var inRate = num(row.rate, function (v) { row.rate = v; });
    var inTax = num(row.tax, function (v) { row.tax = v; });
    inName.addEventListener("change", function () {
      row.item_name = inName.value;
      var hit = (self.itemCatalog || []).find(function (it) {
        return it.item_name === inName.value;
      });
      if (hit && hit.rate) { row.rate = hit.rate; inRate.value = hit.rate; }
      if (hit) row.item_code = hit.item_code;
      self.recalc();
    });
    var tdTotal = h("td", { class: "df-amount" });
    var del = h("button", { class: "df-btn df-sm", type: "button", text: "x" });
    del.addEventListener("click", function () {
      self.form.items = self.form.items.filter(function (r) { return r !== row; });
      tr.remove(); self.recalc();
      if (!self.form.items.length) self.emptyHint.style.display = "block";
    });
    tr.appendChild(h("td", {}, [inName]));
    tr.appendChild(h("td", {}, [inQty]));
    tr.appendChild(h("td", {}, [inRate]));
    tr.appendChild(h("td", {}, [inTax]));
    tr.appendChild(tdTotal);
    tr.appendChild(h("td", {}, [del]));
    row._totalCell = tdTotal;
    this.form.items.push(row);
    this.itemsBody.appendChild(tr);
    this.emptyHint.style.display = "none";

    function num(v, set) {
      var i = h("input", { class: "df-input df-narrow", type: "number",
        step: "0.001", value: String(v) });
      i.addEventListener("input", function () { set(+i.value || 0); self.recalc(); });
      return i;
    }
  };

  App.prototype.addJeRow = function () {
    var self = this;
    var row = { account: "", debit: 0, credit: 0 };
    var tr = h("tr");
    var inAcc = h("input", { class: "df-input", type: "text",
      placeholder: "Compte...", list: "df-accounts-dl" });
    inAcc.addEventListener("change", function () { row.account = inAcc.value; });
    var inD = num(row.debit, function (v) { row.debit = v; });
    var inC = num(row.credit, function (v) { row.credit = v; });
    var del = h("button", { class: "df-btn df-sm", type: "button", text: "x" });
    del.addEventListener("click", function () {
      self.form.journal = self.form.journal.filter(function (r) { return r !== row; });
      tr.remove(); self.recalc();
    });
    tr.appendChild(h("td", {}, [inAcc]));
    tr.appendChild(h("td", {}, [inD]));
    tr.appendChild(h("td", {}, [inC]));
    tr.appendChild(h("td", {}, [del]));
    this.form.journal.push(row);
    this.jeBody.appendChild(tr);

    function num(v, set) {
      var i = h("input", { class: "df-input df-narrow", type: "number",
        step: "0.001", value: String(v) });
      i.addEventListener("input", function () { set(+i.value || 0); self.recalc(); });
      return i;
    }
  };

  // Live totals — items / payment / journal
  App.prototype.recalc = function () {
    var f = this.form, cfg = this.cfg;
    if (this.inParty) f.party = this.inParty.value;
    if (this.inDate) f.posting_date = this.inDate.value;
    if (this.inRef) f.ref_no = this.inRef.value;
    if (this.inNotes) f.notes = this.inNotes.value;
    if (this.inTerms) f.terms = this.inTerms.value;
    if (this.inDiscount) f.discount = +this.inDiscount.value || 0;

    if (cfg.isJournal) {
      var d = 0, c = 0;
      (f.journal || []).forEach(function (r) { d += r.debit || 0; c += r.credit || 0; });
      f.total_debit = d; f.total_credit = c;
      f.total_ht = d; f.total_tva = 0; f.total_ttc = d;
      if (this.jeTotals) {
        this.jeTotals.innerHTML = "Total Débit&nbsp;: <b>" + esc(money(d, "")) +
          "</b> &nbsp;·&nbsp; Total Crédit&nbsp;: <b>" + esc(money(c, "")) +
          "</b> &nbsp;·&nbsp; Différence&nbsp;: <b class='" +
          (Math.abs(d - c) < 0.001 ? "df-ok" : "df-err") + "'>" +
          esc(money(d - c, "")) + "</b>";
      }
      return;
    }

    if (!cfg.items) { // payment entries
      f.total_ht = f.total_ttc = this.inAmount ? (+this.inAmount.value || 0) : 0;
      f.total_tva = 0;
      return;
    }

    var ht = 0, tva = 0;
    f.items.forEach(function (r) {
      var line = (r.qty || 0) * (r.rate || 0);
      var lineHT, lineTVA;
      if (f.tax_mode === "ttc" && !cfg.noTax) {
        lineHT = line / (1 + (r.tax || 0) / 100);
        lineTVA = line - lineHT;
      } else {
        lineHT = line;
        lineTVA = cfg.noTax ? 0 : line * (r.tax || 0) / 100;
      }
      ht += lineHT; tva += lineTVA;
      if (r._totalCell) r._totalCell.textContent = money(lineHT + lineTVA, "");
    });
    var discount = Math.min(f.discount, ht);
    var ratio = ht > 0 ? (ht - discount) / ht : 1;
    f.total_ht = ht - discount;
    f.total_tva = tva * ratio;
    f.total_ttc = f.total_ht + f.total_tva;

    if (this.totHT) {
      this.totHT.innerHTML = "Total HT&nbsp;: <b>" + esc(money(f.total_ht, f.currency)) + "</b>";
      this.totTVA.innerHTML = "TVA&nbsp;: <b>" + esc(money(f.total_tva, f.currency)) + "</b>";
      this.totTTC.innerHTML = "Total TTC&nbsp;: <b>" + esc(money(f.total_ttc, f.currency)) + "</b>";
    }
  };

  App.prototype.docToForm = function (doc) {
    var cfg = this.cfg;
    return {
      name: doc.name, module: this.module,
      party: doc.party || "", posting_date: doc.posting_date,
      ref_no: doc.ref_no || "", currency: doc.currency || "TND",
      items: (doc.items || []).map(function (it) {
        return { item_name: it.item_name, qty: it.qty, rate: it.rate, tax: 0 };
      }),
      journal: (doc.accounts || []).map(function (a) {
        return { account: a.account, debit: a.debit, credit: a.credit };
      }),
      discount: doc.discount_amount || 0, notes: doc.remarks || "",
      terms: doc.terms || "", tax_mode: "ht",
      total_ht: doc.net_total != null ? doc.net_total : doc.amount,
      total_tva: doc.total_taxes_and_charges || 0,
      total_ttc: doc.amount != null ? doc.amount : doc.grand_total,
    };
  };

  App.prototype.save = function (docstatus) {
    var self = this;
    this.recalc();
    var f = this.form, cfg = this.cfg;
    if (cfg.partyField && !f.party) {
      this.setStatus("⚠ Sélectionnez un " + cfg.partyLabel.toLowerCase() + ".", true); return;
    }
    if (cfg.items && !f.items.some(function (r) { return r.item_name && r.qty > 0; })) {
      this.setStatus("⚠ Ajoutez au moins un article.", true); return;
    }
    if (cfg.isJournal && Math.abs(f.total_debit - f.total_credit) > 0.001) {
      this.setStatus("⚠ L'écriture n'est pas équilibrée (débit ≠ crédit).", true); return;
    }
    if (cfg.isJournal && !f.journal.some(function (r) { return r.account; })) {
      this.setStatus("⚠ Ajoutez au moins une ligne comptable.", true); return;
    }
    this.setStatus(docstatus ? "Validation..." : "Enregistrement du brouillon...");
    call("save_document", { payload: JSON.stringify(f), submit: docstatus })
      .then(function (res) {
        self.setStatus("✔ " + (docstatus ? "Document validé" : "Brouillon enregistré") +
          " — " + res.name);
        setTimeout(function () { self.showList(); }, 900);
      })
      .catch(function () {
        self.setStatus("⚠ Échec de l'enregistrement — voir INTEGRATION.md §3.", true);
      });
  };

  App.prototype.setStatus = function (msg, isErr) {
    this.statusEl.textContent = msg;
    this.statusEl.className = "df-status-line " + (isErr ? "df-err" : "df-ok");
  };

  // ========================== PREVIEW ============================
  App.prototype.openPreview = function (form) {
    var overlay = h("div", { class: "df-overlay", role: "dialog" });
    var modal = h("div", { class: "df-modal" });
    var bar = h("div", { class: "df-modal-bar" }, [
      h("span", { class: "df-modal-title", text: "Aperçu" }),
    ]);
    var btns = h("div", { class: "df-modal-btns" });
    var closeB = h("button", { class: "df-btn", type: "button", text: "Fermer" });
    var dlB = h("button", { class: "df-btn", type: "button", text: "Télécharger" });
    var prB = h("button", { class: "df-btn df-primary", type: "button", text: "Imprimer" });
    btns.appendChild(closeB); btns.appendChild(dlB); btns.appendChild(prB);
    bar.appendChild(btns);

    var frameWrap = h("div", { class: "df-modal-body" });
    var iframe = h("iframe", { class: "df-preview-frame" });
    frameWrap.appendChild(iframe);
    modal.appendChild(bar);
    modal.appendChild(frameWrap);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var html = this.buildDocumentHTML(form);
    iframe.setAttribute("srcdoc", html);

    closeB.addEventListener("click", function () { overlay.remove(); });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.remove();
    });
    prB.addEventListener("click", function () {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) {}
    });
    dlB.addEventListener("click", function () {
      var blob = new Blob([html], { type: "text/html;charset=utf-8" });
      var a = h("a", { href: URL.createObjectURL(blob),
        download: (form.module || "doc") + "-" + (form.ref_no || form.name || "brouillon") + ".html" });
      document.body.appendChild(a); a.click(); a.remove();
    });

    iframe.addEventListener("load", function () {
      var holder = iframe.contentDocument &&
        iframe.contentDocument.getElementById("df-qr");
      if (holder && window.PS_QR) {
        window.PS_QR.render(holder, {
          doctype: form.module, name: form.name || form.ref_no || "",
          company: form.party, posting_date: form.posting_date,
          grand_total: form.total_ttc, currency: form.currency,
        });
      }
    });
  };

  // Build the self-contained A4 document (the "srcdoc template").
  // Print Studio default template (if any) replaces the built-in layout.
  App.prototype.buildDocumentHTML = function (f) {
    var cfg = this.cfg;
    var body = null;
    if (window.PrintStudio && PrintStudio.getDefault &&
        PrintStudio.getDefault(cfg.doctype)) {
      try {
        var key = "ps_template_v1:" + cfg.doctype + ":" +
          PrintStudio.getDefault(cfg.doctype);
        var tpl = JSON.parse(localStorage.getItem(key));
        if (tpl && tpl.html) {
          body = PrintStudio.render(tpl.html, {
            doctype: cfg.label, name: f.name || "",
            party: f.party, posting_date: f.posting_date,
            ref_no: f.ref_no, grand_total: money(f.total_ttc, f.currency),
          }) + '<div id="df-qr" class="qr"></div>';
        }
      } catch (e) { body = null; }
    }

    if (!body) {
      var docTitle = cfg.docLabel || cfg.label;
      var rowsHtml = "";
      if (cfg.items && f.items && f.items.length) {
        rowsHtml = '<table class="items"><thead><tr><th>Article</th><th>Qté</th>' +
          "<th>P.U.</th><th>TVA</th><th>Total</th></tr></thead><tbody>" +
          f.items.filter(function (r) { return r.item_name; }).map(function (r) {
            var line = (r.qty || 0) * (r.rate || 0);
            return "<tr><td>" + esc(r.item_name) + "</td><td>" + esc(r.qty) +
              "</td><td>" + esc(money(r.rate, "")) + "</td><td>" +
              esc(cfg.noTax ? "—" : (r.tax || 0) + "%") + "</td><td class='num'>" +
              esc(money(line, "")) + "</td></tr>";
          }).join("") + "</tbody></table>";
      }
      if (cfg.isJournal && f.journal && f.journal.length) {
        rowsHtml = '<table class="items"><thead><tr><th>Compte</th>' +
          "<th>Débit</th><th>Crédit</th></tr></thead><tbody>" +
          f.journal.filter(function (r) { return r.account; }).map(function (r) {
            return "<tr><td>" + esc(r.account) + "</td><td class='num'>" +
              esc(money(r.debit, "")) + "</td><td class='num'>" +
              esc(money(r.credit, "")) + "</td></tr>";
          }).join("") + "</tbody></table>";
      }
      var totals =
        '<div class="totals">' +
        (cfg.noTax || cfg.isJournal || !cfg.items
          ? "<div>Montant : " + esc(money(f.total_ttc, f.currency)) + "</div>"
          : "<div>Total HT : " + esc(money(f.total_ht, f.currency)) + "</div>" +
            "<div>TVA : " + esc(money(f.total_tva, f.currency)) + "</div>" +
            (f.discount ? "<div>Remise : −" + esc(money(f.discount, f.currency)) + "</div>" : "") +
            '<div class="ttc">Total TTC : ' + esc(money(f.total_ttc, f.currency)) + "</div>") +
        "</div>";
      body =
        '<div class="header">' +
        '<div class="company-info"><div class="company-label">' + esc(docTitle) + "</div>" +
        "<div>" + esc(f.name || "Brouillon") + "</div>" +
        (f.ref_no ? "<div>Référence : " + esc(f.ref_no) + "</div>" : "") +
        "<div>Date d'émission : " + esc(f.posting_date || "") + "</div></div>" +
        '<div class="entity-info">' +
        (cfg.partyLabel
          ? '<div class="entity-label">' + esc(cfg.partyLabel) + "</div>" +
            "<div>" + esc(f.party || "—") + "</div>"
          : "") +
        '<div id="df-qr" class="qr"></div></div>' +
        "</div>" +
        rowsHtml + totals +
        (f.notes ? '<div class="notes"><b>Notes</b><br>' + esc(f.notes) + "</div>" : "") +
        (f.terms ? '<div class="notes"><b>Conditions Générales</b><br>' + esc(f.terms) + "</div>" : "");
    }

    // A4 shell — 210mm content scaled to viewport, print-clean.
    var fitScript =
      "window.addEventListener('load',function(){" +
      "var c=document.getElementById('document-content');" +
      "var s=document.querySelector('.document-scaler');" +
      "function fit(){var w=s.clientWidth;var mm=c.offsetWidth;" +
      "if(mm>0){var k=Math.min(1,w/mm);c.style.transform='scale('+k+')';" +
      "c.parentElement.style.height=(c.offsetHeight*k)+'px';}}" +
      "fit();window.addEventListener('resize',fit);});";
    return "<html><head><meta charset='utf-8'>" +
      "<meta name='viewport' content='width=device-width, initial-scale=1.0'>" +
      "<style>" +
      "*{margin:0;padding:0;box-sizing:border-box}" +
      "html,body{background:#f3f4f6;min-height:100%}" +
      "body{font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#000}" +
      ".preview-container{display:flex;justify-content:center;padding:20px}" +
      ".document-scaler{width:100%;max-width:650px}" +
      ".document-preview-page{background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.15);border-radius:2px;overflow:hidden}" +
      ".document-content{width:210mm;min-height:297mm;transform-origin:top left;padding:15mm}" +
      ".header{display:flex;justify-content:space-between;border-bottom:2px solid #a8a8a8;" +
      "padding-bottom:8px;margin-bottom:14px}" +
      ".company-label,.entity-label{font-size:12px;font-weight:700;text-transform:uppercase;" +
      "letter-spacing:.5px;color:#374151}" +
      ".entity-info{text-align:right}" +
      ".qr{margin-top:8px;display:inline-block}" +
      "table.items{width:100%;border-collapse:collapse;margin:12px 0}" +
      "table.items th,table.items td{border:1px solid #d1d5db;padding:6px 8px;text-align:left}" +
      "table.items th{background:#f3f4f6;font-size:11px;text-transform:uppercase}" +
      "td.num{text-align:right}" +
      ".totals{margin-left:auto;width:260px;text-align:right;margin-top:10px}" +
      ".totals div{padding:3px 0;border-bottom:1px solid #eee}" +
      ".totals .ttc{font-weight:700;font-size:14px;border-bottom:2px solid #374151}" +
      ".notes{margin-top:14px;font-size:11px;color:#374151}" +
      "@media print{html,body{background:#fff}.preview-container{padding:0}" +
      ".document-preview-page{box-shadow:none}.document-content{padding:10mm;transform:none!important}}" +
      "</style><scr" + "ipt>" + fitScript + "</scr" + "ipt></head><body>" +
      '<div class="preview-container"><div class="document-scaler">' +
      '<div class="document-preview-page"><div class="document-content" id="document-content">' +
      body +
      "</div></div></div></div></body></html>";
  };

  // ---------------------------------------------------------------
  // Grouped module picker (the sidebar menu, one block per group)
  // ---------------------------------------------------------------
  function buildMenu(container, onPick) {
    var wrap = h("div", { class: "df-menu" });
    var groups = {};
    Object.keys(MODULES).forEach(function (key) {
      var g = MODULES[key].group;
      (groups[g] = groups[g] || []).push(key);
    });
    Object.keys(groups).forEach(function (g) {
      var box = h("div", { class: "df-menu-group" }, [
        h("div", { class: "df-menu-title", text: g }),
      ]);
      groups[g].forEach(function (key) {
        var b = h("button", { class: "df-menu-item", type: "button",
          text: MODULES[key].label });
        b.addEventListener("click", function () { onPick(key); });
        box.appendChild(b);
      });
      wrap.appendChild(box);
    });
    container.appendChild(wrap);
    return wrap;
  }

  // ---------------------------------------------------------------
  window.DocFlow = {
    MODULES: MODULES,
    mount: function (selector, opts) { return new App(selector, opts || {}); },
    buildMenu: buildMenu,
  };
})();
