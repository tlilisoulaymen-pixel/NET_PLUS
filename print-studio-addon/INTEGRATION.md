# Print Studio Add-on — INTEGRATION.md

A complementary module for your existing ZIP: an embedded, **WYSIWYG template designer**
("mini Microsoft Office") that appears as a collapsible subsection **under** any page that
does reporting or document extraction (Desk forms like *Journal Entry*, custom report pages,
extraction views). It embeds the **current document's values** directly into the template,
shows changes **live**, saves templates, and manages the **default template** logic plus a
**reference QR code**.

Nothing from the existing pages is removed or reordered — the subsection is **appended after
the standard form layout**.

---

## 1. What is in this ZIP

```
print-studio-addon/
├── print-studio/
│   ├── print-studio.js        ← the designer (toolbar, live preview, save/load/default)
│   ├── print-studio.css       ← all styles, .ps-* namespaced (no clash with Desk)
│   ├── qr-reference.js        ← QR generation + reference-data payload + ZATCA TLV
│   ├── client/
│   │   ├── journal_entry_print_studio.js   ← example: attach under Journal Entry
│   │   └── hooks-snippet.py.txt            ← lines to merge into hooks.py
│   └── server/
│       └── print_studio/
│           ├── __init__.py
│           └── api.py         ← whitelisted: save/list/set-default/delete templates
└── INTEGRATION.md             ← this file
```

Copy `print-studio/` into the **same folder level** as the old ZIP's assets (e.g.
`<your_app>/public/print-studio/`). Keep the file names identical — `print-studio.js`
references the CSS and the local QR lib by relative name.

---

## 2. Attach under a Desk form (Journal Entry, Sales Invoice, …)

**Option A — from your app (recommended).** Merge `client/hooks-snippet.py.txt` into
`hooks.py`, then register the DocType script:

```python
# hooks.py
app_include_js  = ["/assets/<your_app>/print-studio/qr-reference.js",
                   "/assets/<your_app>/print-studio/print-studio.js"]
app_include_css = ["/assets/<your_app>/print-studio/print-studio.css"]

doctype_js = {"Journal Entry": "public/js/journal_entry_print_studio.js"}
```

**Option B — no code deploy.** Desk → *Customize → Client Script* → DocType = Journal Entry
→ paste the `frappe.ui.form.on(...)` block from `client/journal_entry_print_studio.js`.
(Requires the two core assets to be loaded globally first, via Option A or the site's
`app_include_js`.)

The subsection appears at the **bottom** of the form, collapsed. Every standard field
(Company, Posting Date, Accounting Entries grid, Tax Withholding, Letter Head, Print
Heading, …) stays exactly as it was.

## 3. Attach under a report / extraction page (no `frm` object)

```js
PrintStudio.mount("#your-container", {
  doctype: "Journal Entry",
  sampleDoc: theExtractedRow,   // any plain object: { name, company, posting_date, ... }
});
```

Saved templates are keyed per DocType and shared between forms and pages, so a template
designed on a report opens identically on the Desk form.

## 4. QR code — required dependency & the reference-data logic

`qr-reference.js` needs the tiny **qrcodejs** library. It tries, in order:

1. a local `qrcode.min.js` sitting next to `qr-reference.js` (**offline installs — put the
   file there**; download: https://github.com/davidshimjs/qrcodejs),
2. the cdnjs CDN automatically.

If neither is available, the designer shows an explicit placeholder instead of breaking.

**What the QR contains** — scanning it identifies and opens the exact document:

```json
{
  "doctype": "Journal Entry",
  "name": "JV-2026-00041",
  "company": "…",
  "posting_date": "2026-08-20",
  "total_debit": 1250.0, "total_credit": 1250.0,
  "currency": "TND",
  "modified": "…",
  "verify_url": "https://your-site/app/journal-entry/JV-2026-00041"
}
```

Only fields that exist on the document are included (invoices get `grand_total`, journal
entries get `total_debit/total_credit`, etc.). For **ZATCA / e-invoicing** compliance, a
TLV (tag-length-value → base64) encoder is included:

```js
PS_QR.render(holder, doc, { mode: "tlv", companyVat: "TN1234567A" });
```

## 5. Server-side persistence (optional but recommended)

Without the server module, everything still works — templates are saved in the browser
(localStorage). To make templates **real ERPNext Print Formats** (usable from Print, PDF,
email, and API):

1. Copy `server/print_studio/` into your app: `<your_app>/print_studio/`.
2. Run `bench build && bench migrate` (whitelisted methods need no schema changes).

Then *Save template* also creates/updates a Print Format named
`PS <Template> - <DocType>` (`custom_format = 1`, Jinja), and *Set as default* writes both
the DocType default and a per-user default.

## 6. Studied ERPNext pitfalls — how the module avoids them

- **Print Format Builder vs custom HTML (issue #7133):** the visual Builder *destroys*
  custom HTML templates when opened. Templates saved here are created as
  `custom_format = 1` and prefixed `PS `, and the designer edits its own copy — never
  through the Builder. Tell users: **don't open `PS *` formats in Print Format Builder**.
- **Standard fields must not be removed:** `PrintStudio.attach()` only *appends* a host
  div to `frm.layout.wrapper`; it never mutates `frm.meta`, the layout, or any field.
- **Live preview must not hijack the form:** the preview re-renders on `refresh` (wrapped,
  original kept) and on editor input — values are read-only, never written back to `frm.doc`.
- **Placeholder/Jinja clash:** the designer uses `{{fieldname}}`; on save it converts to
  Jinja `{{ doc.fieldname }}`. Values are HTML-escaped before injection (no XSS from
  document data), and the server rejects templates containing `<script`.
- **New / unsaved documents:** the subsection is skipped on `is_new()` (no `name` yet — the
  QR would encode nothing meaningful). It appears as soon as the doc exists.
- **List view & permissions:** attach runs on form `refresh` only; `save_template`
  re-checks `read` permission on the DocType server-side.
- **Offline / intranet sites:** everything except the QR lib CDN fallback is local; ship
  `qrcode.min.js` locally for fully offline use.
- **Print CSS isolation:** all styles are `.ps-*` namespaced; the `@media print` rule hides
  the designer chrome so printing the page prints only the document.
- **Default priority:** user default (per-user) > DocType default > none — the same
  resolution ERPNext itself uses, so behaviour stays predictable.

## 7. Quick test checklist

1. Open *Accounting → Journal Entry → an existing entry* → subsection *Document Template
   Designer* at the bottom, collapsed. ✔ all standard fields unchanged.
2. Expand → insert fields (`⧉ Insert field…`), style text, insert `▣ QR` → right pane
   updates live with **this entry's** values and a scannable QR.
3. Name it, *Save template*, *★ Set as default* → reload → the default template auto-loads.
4. *🖨 Print / PDF* → clean document, no toolbars.
5. Scan the QR → opens the exact Journal Entry (`verify_url`).
