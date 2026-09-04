# Doc Flow Add-on — INTEGRATION.md

A complementary module that reproduces the studied "Achats" flow for **every module** of
the app — not only purchases. One generic engine drives all pages: list → create →
A4 preview modal (iframe `srcdoc`), wired into ERPNext persistence and into your two
previous add-ons (Print Studio templates + reference QR).

---

## 1. What is in this ZIP

```
doc-flow-addon/
├── doc-flow/
│   ├── doc-flow.js                 ← generic flow engine + MODULES registry (14 modules)
│   ├── doc-flow.css                ← all styles, .df-* namespaced
│   ├── client/
│   │   ├── hooks-snippet.py.txt    ← merge into hooks.py
│   │   └── page/doc_flow/          ← ready-made Desk page (route hash picks the module)
│   │       ├── doc_flow.json
│   │       ├── doc_flow.js
│   │       └── doc_flow.css
│   └── server/
│       └── doc_flow/
│           ├── __init__.py
│           └── api.py              ← whitelisted: list/get/save + lookups
└── INTEGRATION.md                  ← this file
```

## 2. Module coverage — the full page inventory (nothing missed)

The JS `MODULES` registry and the Python `MODULES` table are exact mirrors. Each entry =
one page, exactly as it appears in the studied app's sidebar:

| Group | Module key | Page | ERPNext DocType |
|---|---|---|---|
| Ventes | `quotation` | Devis | Quotation |
| Ventes | `sales_order` | Commande client | Sales Order |
| Ventes | `delivery_note` | Bon de Livraison | Delivery Note |
| Ventes | `sales_invoice` | Facture client | Sales Invoice |
| Ventes | `sales_credit_note` | Avoir client | Sales Invoice (`is_return=1`) |
| Achats | `purchase_order` | Commande fournisseur | Purchase Order |
| Achats | `purchase_receipt` | Bon de réception | Purchase Receipt |
| Achats | `purchase_invoice` | Facture d'achat | Purchase Invoice |
| Achats | `purchase_debit_note` | Avoir fournisseur | Purchase Invoice (`is_return=1`) |
| Achats | `supplier_return` | Bon de retour fournisseur | Purchase Receipt (`is_return=1`) |
| Trésorerie | `payment_in` | Paiement client | Payment Entry (Receive) |
| Trésorerie | `payment_out` | Paiement fournisseur | Payment Entry (Pay) |
| Trésorerie | `journal_entry` | Écriture de journal | Journal Entry (with balance check) |
| Retenue à la source | `withholding` | Retenue à la source | Journal Entry (`voucher_type=Withholding`) |
| Stock | `stock_entry` | Mouvement de stock | Stock Entry (Issue/Receipt/Transfer + entrepôts) |

Document-type-specific behaviour is data-driven by the registry: payment pages get a
**Montant** field instead of articles, journal pages get a **Débit/Crédit** grid with a
live **balance check** (Valider is blocked while unbalanced), stock pages get movement
type + source/target warehouses, delivery/receipt pages skip the HT/TTC toggle,
credit/debit notes map the reference field to `return_against`.

## 3. Installation

1. Copy `doc-flow/` into your app (same level as the previous add-ons):
   - JS/CSS → `<your_app>/public/doc-flow/`
   - `server/doc_flow/` → `<your_app>/doc_flow/`
   - `client/page/doc_flow/` → `<your_app>/<your_app>/page/doc_flow/`
2. Merge `client/hooks-snippet.py.txt` into `hooks.py` (replace `<your_app>`).
3. In `doc_flow.json`, set `"module"` to your app's module name.
4. `bench build && bench migrate && bench restart`, then hard-refresh Desk.

**Usage:**
- `/app/doc_flow` → grouped menu (Ventes / Achats / Trésorerie / Retenue / Stock).
- `/app/doc_flow#<module_key>` → directly the flow of one module (e.g.
  `/app/doc_flow#purchase_invoice` = the studied Facture d'achat page).
- Embed in your own pages: `DocFlow.mount("#container", { module: "sales_invoice" })`.

## 4. Flow recap (what the engine reproduces on every module)

1. **List** — page title + primary "Créer …" button, filter bar (tiers when relevant,
   date début/fin, statut Brouillon/Validée/Annulée), table Référence / Tiers / Statut /
   Montant / Actions, page-size selector + prev/next pagination (server-side).
2. **Create** — full-page form (tiers with autocomplete, date d'émission, référence,
   HT/TTC toggle where taxed, dynamic article lines with **live HT/TVA/TTC totals**,
   remise globale, notes, conditions générales) and the action bar
   **Retour · Brouillon · Aperçu · Valider** — same order and wording as studied.
3. **Preview** — modal with **Fermer / Télécharger / Imprimer** over an
   `<iframe srcdoc>` holding a self-contained A4 template (210mm content, scaled to the
   viewport via `transform`, print-clean `@media print`). Form data is injected as
   escaped HTML. *Télécharger* saves the standalone HTML (print-to-PDF keeps the layout);
   *Imprimer* prints the iframe content directly.
4. **Brouillon / Valider** — `doc_flow.api.save_document` creates the real ERPNext
   document (`docstatus 0`) or submits it (`docstatus 1`), applying each module's static
   filters (returns, payment types, withholding voucher type).

## 5. Integration with the two previous add-ons

- **Print Studio** — the preview checks `PrintStudio.getDefault(<DocType>)`; if the user
  designed a default template for that DocType, it replaces the built-in A4 layout
  (rendered with the document's values). So the designer subsection from the first add-on
  becomes the template engine for every module here.
- **PS_QR** — a reference QR (doctype, name, tiers, date, total, currency) is injected
  into the `#df-qr` slot of every generated document; absent gracefully if not loaded.
- **Analytics Hub** — documents created through Doc Flow are standard ERPNext documents,
  so every KPI/chart of the analytics add-on reflects them immediately.

## 6. Pitfalls studied & avoided

- **Docstatus discipline:** drafts insert as `docstatus=0`, "Valider" calls `.submit()`;
  the list filter maps exactly to ERPNext docstatus values (0/1/2), and cancelled
  documents stay visible with the red badge instead of disappearing.
- **Returns are separate pages:** credit/debit notes and supplier returns reuse their
  base DocType with `is_return=1` and the reference field mapped to `return_against`
  (ERPNext's own convention), so they never mix into the parent lists.
- **Journal balance:** the create form computes a live debit−credit difference and
  blocks submission while unbalanced — matches ERPNext's own validation, so no server
  error surprises the user.
- **Permissions:** every endpoint re-checks `read` (list/get/lookups) or `write` (save)
  on the target DocType; a role without access gets a clean refusal, not leaked data.
- **List filters:** `posting_date` conditions are merged into a single `between` when
  both dates are set (two separate conditions on the same field would silently drop
  rows in `frappe.get_all`).
- **Payment Entry specifics:** `party_type`/`party`, `paid_amount`/`received_amount` and
  `reference_no`/`reference_date` are set explicitly — ERPNext validation requires them.
- **XSS:** all document values are HTML-escaped before entering the `srcdoc` template.
- **Style clashes:** `.df-*` namespace; coexists with `.ps-*` (Print Studio) and
  `.ah-*` (Analytics Hub) — verified selectors share no prefix.
- **Empty catalogues:** missing suppliers/items/accounts degrade to free-text inputs
  instead of breaking the form.
- **No page missed:** the §2 table is the checklist — the sidebar groups of the studied
  app (Ventes, Achats, Trésorerie, Retenue à la source, Stock) are all present.

## 7. Quick test checklist

1. `/app/doc_flow` shows the five groups with all 14 pages. ✔
2. `#purchase_invoice` → create a draft with two lines → totals update live → Aperçu
   shows the A4 document with QR → Valider → the invoice appears in the list with the
   green "Validée" badge. ✔
3. `#journal_entry` → two unbalanced lines → Valider blocked with a clear message;
   balance them → submits. ✔
4. `#payment_out` → Montant field instead of articles → submits as Payment Entry "Pay". ✔
5. Design a Print Studio template for "Purchase Invoice", set it as default → reopen the
   preview → the custom template renders with the document values. ✔
6. The new documents appear in the Analytics Hub KPIs and charts. ✔
