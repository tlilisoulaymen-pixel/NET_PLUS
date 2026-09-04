/* ============================================================
 * Print Studio — embedded WYSIWYG template designer subsection
 * ------------------------------------------------------------
 * Adds a collapsible "Document Template" subsection UNDER the
 * existing Desk form (it never removes or alters any standard
 * field). The user edits the print template like a mini word
 * processor, sees the changes live with the CURRENT document's
 * values, and can save the template / set it as the default
 * template for this DocType.
 *
 * Placeholders use  {{fieldname}}  (converted to Jinja
 * {{ doc.fieldname }} on save) so they never clash with the
 * form fields themselves.
 * ========================================================== */
(function () {
  "use strict";

  const STORE_PREFIX = "ps_template_v1:";
  const DEFAULT_PREFIX = "ps_default_v1:";

  const FONT_FAMILIES = [
    "Arial", "Helvetica", "Times New Roman", "Georgia",
    "Courier New", "Verdana", "Tahoma", "Trebuchet MS",
  ];
  const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 22, 28, 36];

  // ---------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") el.className = attrs[k];
        else if (k === "html") el.innerHTML = attrs[k];
        else if (k === "text") el.textContent = attrs[k];
        else el.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach((c) => el.appendChild(c));
    return el;
  }

  function storageKey(doctype, name) {
    return STORE_PREFIX + doctype + ":" + name;
  }

  function listLocalTemplates(doctype) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(STORE_PREFIX + doctype + ":") === 0) {
        try {
          const t = JSON.parse(localStorage.getItem(k));
          out.push(t);
        } catch (e) { /* ignore corrupt entry */ }
      }
    }
    return out;
  }

  function getDefaultName(doctype) {
    return localStorage.getItem(DEFAULT_PREFIX + doctype) || null;
  }

  // Escape user HTML values before injecting into preview
  function esc(v) {
    if (v === null || v === undefined) return "";
    return String(v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Resolve {{field}} / {{doc.field}} placeholders against a doc object
  function renderTemplate(html, doc) {
    return html.replace(/\{\{\s*(?:doc\.)?([a-zA-Z0-9_\.]+)\s*\}\}/g,
      function (m, path) {
        const parts = path.split(".");
        let v = doc;
        for (let i = 0; i < parts.length; i++) {
          if (v === null || v === undefined) { v = ""; break; }
          v = v[parts[i]];
        }
        if (v === null || v === undefined || v === "") return "";
        if (window.frappe && frappe.format) {
          try { return esc(frappe.format(v, { fieldtype: "Data" })); }
          catch (e) { /* fall through */ }
        }
        return esc(v);
      });
  }

  // Convert designer placeholders to Jinja for server-side Print Format
  function toJinja(html) {
    return html.replace(/\{\{\s*(?:doc\.)?([a-zA-Z0-9_\.]+)\s*\}\}/g,
      "{{ doc.$1 }}");
  }

  // ---------------------------------------------------------------
  // The designer widget
  // ---------------------------------------------------------------
  function PrintStudio(container, opts) {
    this.opts = opts || {};
    this.doctype = opts.doctype || (opts.frm && opts.frm.doctype) || "Document";
    this.frm = opts.frm || null;
    this.container = container;
    this.currentTemplateName = null;
    this.build();
    this.loadDefaultOrBlank();
  }

  PrintStudio.prototype.getDoc = function () {
    if (this.frm && this.frm.doc) return this.frm.doc;
    return this.opts.sampleDoc || {};
  };

  PrintStudio.prototype.build = function () {
    const self = this;

    // ---- Section wrapper (collapsible, styled like a form section)
    this.sectionEl = h("div", { class: "ps-section" });
    const head = h("div", { class: "ps-section-head" }, [
      h("span", { class: "ps-caret", text: "▸" }),
      h("span", { class: "ps-title", text: __("Document Template Designer") }),
    ]);
    this.bodyEl = h("div", { class: "ps-section-body" });
    this.bodyEl.style.display = "none";
    head.addEventListener("click", function () {
      const open = self.bodyEl.style.display !== "none";
      self.bodyEl.style.display = open ? "none" : "block";
      head.querySelector(".ps-caret").textContent = open ? "▸" : "▾";
    });
    this.sectionEl.appendChild(head);
    this.sectionEl.appendChild(this.bodyEl);
    this.container.appendChild(this.sectionEl);

    // ---- Toolbar (mini word processor)
    const tb = h("div", { class: "ps-toolbar" });

    function cmdBtn(label, title, cmd, value) {
      const b = h("button", { class: "ps-btn", type: "button", title: title, text: label });
      b.addEventListener("mousedown", function (e) {
        e.preventDefault(); // keep editor selection
        document.execCommand(cmd, false, value || null);
        self.refreshPreview();
      });
      return b;
    }

    tb.appendChild(cmdBtn("B", "Bold", "bold"));
    tb.appendChild(cmdBtn("I", "Italic", "italic"));
    tb.appendChild(cmdBtn("U", "Underline", "underline"));
    tb.appendChild(cmdBtn("S̶", "Strikethrough", "strikeThrough"));

    const fontSel = h("select", { class: "ps-select", title: "Font" });
    FONT_FAMILIES.forEach(function (f) {
      fontSel.appendChild(h("option", { value: f, text: f }));
    });
    fontSel.addEventListener("change", function () {
      document.execCommand("fontName", false, fontSel.value);
      self.refreshPreview();
    });
    tb.appendChild(fontSel);

    const sizeSel = h("select", { class: "ps-select", title: "Size (pt)" });
    FONT_SIZES.forEach(function (s) {
      sizeSel.appendChild(h("option", { value: s, text: s + "pt" }));
    });
    sizeSel.addEventListener("change", function () {
      // execCommand fontSize only supports 1-7, wrap manually
      self.wrapSelection("span", "font-size:" + sizeSel.value + "pt");
      self.refreshPreview();
    });
    tb.appendChild(sizeSel);

    const colorIn = h("input", { type: "color", class: "ps-color", title: "Text color" });
    colorIn.addEventListener("input", function () {
      document.execCommand("foreColor", false, colorIn.value);
      self.refreshPreview();
    });
    tb.appendChild(colorIn);

    tb.appendChild(cmdBtn("⬅", "Align left", "justifyLeft"));
    tb.appendChild(cmdBtn("⬌", "Center", "justifyCenter"));
    tb.appendChild(cmdBtn("➡", "Align right", "justifyRight"));
    tb.appendChild(cmdBtn("• List", "Bullet list", "insertUnorderedList"));
    tb.appendChild(cmdBtn("1. List", "Numbered list", "insertOrderedList"));

    const tableBtn = h("button", { class: "ps-btn", type: "button", title: "Insert 2x2 table", text: "▦ Table" });
    tableBtn.addEventListener("mousedown", function (e) {
      e.preventDefault();
      document.execCommand("insertHTML", false,
        '<table class="ps-tbl" border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%">' +
        "<tr><th>Header 1</th><th>Header 2</th></tr>" +
        "<tr><td>&nbsp;</td><td>&nbsp;</td></tr></table><p></p>");
      self.refreshPreview();
    });
    tb.appendChild(tableBtn);

    // Insert-field dropdown, populated from the DocType meta
    this.fieldSel = h("select", { class: "ps-select ps-field-select", title: "Insert document field" });
    this.fieldSel.appendChild(h("option", { value: "", text: "⧉ Insert field…" }));
    this.populateFields();
    this.fieldSel.addEventListener("change", function () {
      if (!self.fieldSel.value) return;
      document.execCommand("insertHTML", false,
        '<span class="ps-field">{{' + self.fieldSel.value + "}}</span>&nbsp;");
      self.fieldSel.value = "";
      self.refreshPreview();
    });
    tb.appendChild(this.fieldSel);

    // QR code placeholder
    const qrBtn = h("button", { class: "ps-btn", type: "button", title: "Insert QR code (reference data)", text: "▣ QR" });
    qrBtn.addEventListener("mousedown", function (e) {
      e.preventDefault();
      document.execCommand("insertHTML", false,
        '<span class="ps-qr-slot" data-ps-qr="1">[QR]</span>');
      self.refreshPreview();
    });
    tb.appendChild(qrBtn);

    this.bodyEl.appendChild(tb);

    // ---- Editor + live preview side by side
    const split = h("div", { class: "ps-split" });
    this.editorEl = h("div", {
      class: "ps-editor", contenteditable: "true",
      "data-placeholder": "Design your document template here…",
    });
    this.editorEl.addEventListener("input", function () { self.refreshPreview(); });
    this.previewEl = h("div", { class: "ps-preview" });
    split.appendChild(h("div", { class: "ps-pane" }, [
      h("div", { class: "ps-pane-label", text: "Design" }), this.editorEl,
    ]));
    split.appendChild(h("div", { class: "ps-pane" }, [
      h("div", { class: "ps-pane-label", text: "Live preview (current document)" }), this.previewEl,
    ]));
    this.bodyEl.appendChild(split);

    // ---- Save / load / default actions
    const actions = h("div", { class: "ps-actions" });

    this.nameInput = h("input", {
      class: "ps-input", type: "text",
      placeholder: "Template name (e.g. Standard JV)",
    });

    const saveBtn = h("button", { class: "ps-btn ps-primary", type: "button", text: "💾 Save template" });
    saveBtn.addEventListener("click", function () { self.save(); });

    this.templateSel = h("select", { class: "ps-select" });
    this.refreshTemplateList();
    const loadBtn = h("button", { class: "ps-btn", type: "button", text: "📂 Load" });
    loadBtn.addEventListener("click", function () {
      if (self.templateSel.value) self.load(self.templateSel.value);
    });

    const defaultBtn = h("button", { class: "ps-btn", type: "button", text: "★ Set as default for " + this.doctype });
    defaultBtn.addEventListener("click", function () { self.setDefault(); });

    const printBtn = h("button", { class: "ps-btn", type: "button", text: "🖨 Print / PDF" });
    printBtn.addEventListener("click", function () { self.printDoc(); });

    actions.appendChild(this.nameInput);
    actions.appendChild(saveBtn);
    actions.appendChild(this.templateSel);
    actions.appendChild(loadBtn);
    actions.appendChild(defaultBtn);
    actions.appendChild(printBtn);
    this.bodyEl.appendChild(actions);

    this.statusEl = h("div", { class: "ps-status" });
    this.bodyEl.appendChild(this.statusEl);
  };

  PrintStudio.prototype.populateFields = function () {
    const self = this;
    let fields = [];
    if (this.frm && this.frm.meta && this.frm.meta.fields) {
      fields = this.frm.meta.fields
        .filter(function (f) {
          return ["Section Break", "Column Break", "Tab Break", "HTML", "Button", "Fold", "Table"]
            .indexOf(f.fieldtype) === -1 && f.fieldname;
        })
        .map(function (f) { return f.fieldname; });
    } else {
      // Standalone fallback: common reference fields
      fields = ["name", "doctype", "company", "posting_date", "title",
        "naming_series", "grand_total", "total_debit", "total_credit",
        "currency", "owner", "modified"];
    }
    fields.forEach(function (f) {
      self.fieldSel.appendChild(h("option", { value: f, text: f }));
    });
  };

  PrintStudio.prototype.wrapSelection = function (tag, style) {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const span = h(tag, { style: style });
    try {
      range.surroundContents(span);
    } catch (e) {
      // selection spans multiple nodes — extract + wrap
      span.appendChild(range.extractContents());
      range.insertNode(span);
    }
  };

  // Re-render the preview with the current document's values
  PrintStudio.prototype.refreshPreview = function () {
    let html = renderTemplate(this.editorEl.innerHTML, this.getDoc());
    html = this.injectQr(html);
    this.previewEl.innerHTML = html;
  };

  // Replace [QR] slots with a real QR of the doc's reference data
  PrintStudio.prototype.injectQr = function (html) {
    const self = this;
    const tmp = h("div", { html: html });
    const slots = tmp.querySelectorAll(".ps-qr-slot");
    if (!slots.length) return html;
    slots.forEach(function (slot) {
      const holder = h("span", { class: "ps-qr-render", text: "…" });
      slot.parentNode.replaceChild(holder, slot);
      if (window.PS_QR && window.PS_QR.render) {
        window.PS_QR.render(holder, self.getDoc());
      } else {
        holder.textContent = "[QR lib not loaded — see INTEGRATION.md §4]";
      }
    });
    return tmp.innerHTML;
  };

  PrintStudio.prototype.save = function () {
    const self = this;
    const name = (this.nameInput.value || "").trim();
    if (!name) { this.setStatus("⚠ Give the template a name first.", true); return; }
    const tpl = {
      name: name,
      doctype: this.doctype,
      html: this.editorEl.innerHTML,
      jinja: toJinja(this.editorEl.innerHTML),
      modified: new Date().toISOString(),
    };
    localStorage.setItem(storageKey(this.doctype, name), JSON.stringify(tpl));
    this.currentTemplateName = name;
    this.refreshTemplateList();

    // Server-side save (creates/updates a real Print Format) when available
    if (window.frappe && frappe.call) {
      frappe.call({
        method: "print_studio.api.save_template",
        args: { doctype: this.doctype, template_name: name, html: tpl.jinja },
        callback: function () { self.setStatus("✔ Saved to server + locally."); },
        error: function () { self.setStatus("✔ Saved locally (server module not installed — see INTEGRATION.md §5)."); },
      });
    } else {
      this.setStatus("✔ Saved locally.");
    }
  };

  PrintStudio.prototype.load = function (name) {
    const raw = localStorage.getItem(storageKey(this.doctype, name));
    if (!raw) { this.setStatus("⚠ Template not found: " + name, true); return; }
    const tpl = JSON.parse(raw);
    this.editorEl.innerHTML = tpl.html;
    this.nameInput.value = tpl.name;
    this.currentTemplateName = tpl.name;
    this.refreshPreview();
    this.setStatus("✔ Loaded « " + name + " ».");
  };

  PrintStudio.prototype.loadDefaultOrBlank = function () {
    const def = getDefaultName(this.doctype);
    if (def && localStorage.getItem(storageKey(this.doctype, def))) {
      this.load(def);
    } else {
      this.editorEl.innerHTML =
        '<h2 style="text-align:center">{{doctype}}</h2>' +
        "<p>Reference: <b>{{name}}</b> &nbsp;·&nbsp; Company: {{company}} &nbsp;·&nbsp; Date: {{posting_date}}</p>" +
        '<hr><p>Design your template here. Insert fields with « ⧉ Insert field… », add a QR code with « ▣ QR ».</p>';
      this.refreshPreview();
    }
  };

  PrintStudio.prototype.setDefault = function () {
    if (!this.currentTemplateName) { this.setStatus("⚠ Save the template first.", true); return; }
    localStorage.setItem(DEFAULT_PREFIX + this.doctype, this.currentTemplateName);
    if (window.frappe && frappe.call) {
      frappe.call({
        method: "print_studio.api.set_default_template",
        args: { doctype: this.doctype, template_name: this.currentTemplateName },
      });
    }
    this.setStatus("★ « " + this.currentTemplateName + " » is now the default for " + this.doctype + ".");
  };

  PrintStudio.prototype.refreshTemplateList = function () {
    const self = this;
    this.templateSel.innerHTML = "";
    this.templateSel.appendChild(h("option", { value: "", text: "— saved templates —" }));
    listLocalTemplates(this.doctype).forEach(function (t) {
      const opt = h("option", { value: t.name, text: t.name });
      if (getDefaultName(self.doctype) === t.name) opt.text += " ★";
      self.templateSel.appendChild(opt);
    });
  };

  PrintStudio.prototype.printDoc = function () {
    let html = renderTemplate(this.editorEl.innerHTML, this.getDoc());
    html = this.injectQr(html);
    const w = window.open("", "_blank");
    if (!w) { this.setStatus("⚠ Pop-up blocked.", true); return; }
    w.document.write(
      '<html><head><title>' + esc(this.doctype) + " " + esc(this.getDoc().name || "") +
      '</title><link rel="stylesheet" href="' + (this.opts.cssUrl || "print-studio.css") + '"></head>' +
      '<body class="ps-print">' + html +
      "<script>window.onload=function(){setTimeout(function(){window.print();},600);}<\/script></body></html>");
    w.document.close();
  };

  PrintStudio.prototype.setStatus = function (msg, isErr) {
    this.statusEl.textContent = msg;
    this.statusEl.className = "ps-status " + (isErr ? "ps-err" : "ps-ok");
  };

  // ---------------------------------------------------------------
  // Public: attach the subsection under a Frappe form
  // ---------------------------------------------------------------
  window.PrintStudio = {
    /**
     * attach(frm) — call from doctype_js / form script:
     *   frappe.ui.form.on('Journal Entry', { refresh(frm){ PrintStudio.attach(frm); } });
     * The subsection is appended at the END of the form layout —
     * nothing standard is removed or reordered.
     */
    attach: function (frm, opts) {
      opts = opts || {};
      if (frm.ps_attached) { frm.ps_widget.refreshPreview(); return frm.ps_widget; }
      const host = frm.layout && frm.layout.wrapper
        ? frm.layout.wrapper.get(0)
        : frm.wrapper.get(0);
      const container = h("div", { class: "ps-host" });
      host.appendChild(container);
      frm.ps_attached = true;
      frm.ps_widget = new PrintStudio(container, Object.assign({ frm: frm }, opts));
      // live update when any form value changes
      if (frm.fields_dict) {
        const origRefresh = frm.refresh.bind(frm);
        frm.refresh = function () {
          const r = origRefresh.apply(null, arguments);
          try { frm.ps_widget.refreshPreview(); } catch (e) {}
          return r;
        };
      }
      return frm.ps_widget;
    },

    /** Standalone usage (reports, custom pages, portals). */
    mount: function (selector, opts) {
      const container = typeof selector === "string"
        ? document.querySelector(selector) : selector;
      return new PrintStudio(container, opts || {});
    },

    /** Resolve the template to print for a doctype (user default > none). */
    getDefault: getDefaultName,
    render: renderTemplate,
    toJinja: toJinja,
  };
})();
