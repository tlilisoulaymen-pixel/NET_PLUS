# Analytics Hub Add-on — INTEGRATION.md

A complementary module for your existing ZIP: a **dashboard of KPIs, charts and metrics**
built on data fetched from the ERPNext/Frappe backend. It adds a new Desk page
(`/app/analytics-hub`) and can also be embedded as a widget on any report/extraction page.
Nothing from the existing pages or the Print Studio add-on is touched.

---

## 1. What is in this ZIP

```
analytics-addon/
├── analytics-hub/
│   ├── analytics-dashboard.js      ← UI: filters, KPI cards, charts, slow-mover table
│   ├── analytics-dashboard.css     ← all styles, .ah-* namespaced
│   ├── client/
│   │   ├── hooks-snippet.py.txt    ← lines to merge into hooks.py
│   │   └── page/analytics_hub/     ← ready-made Desk page bundle
│   │       ├── analytics_hub.json
│   │       ├── analytics_hub.js
│   │       └── analytics_hub.css
│   └── server/
│       └── analytics/
│           ├── __init__.py
│           └── api.py              ← whitelisted aggregation endpoints
└── INTEGRATION.md                  ← this file
```

## 2. What is fetched from the ERPNext backend (investigation summary)

All data comes from **standard ERPNext tables**, aggregated SQL-side (only small JSON
crosses the wire — no raw rows are shipped to the browser):

| Endpoint (`analytics.api.*`) | Source tables | Renders as |
|---|---|---|
| `kpi_summary` | `tabGL Entry` + `tabAccount`, `tabSales Invoice`, `tabPurchase Invoice`, `tabJournal Entry` | KPI row: revenue, expense, net profit + margin %, invoiced, collected, receivable, payable, draft JEs |
| `monthly_finance` | `tabGL Entry` (root_type Income/Expense) | Bar chart revenue vs expense + profit line, per month |
| `cash_flow` | `tabPayment Entry` (Receive/Pay) | Cash in / out bars per month |
| `expense_breakdown` | `tabGL Entry` grouped by parent account | Donut of where money is spent |
| `top_parties` | `tabSales Invoice` / `tabPurchase Invoice` | Top customers & suppliers bars |
| `top_items` | `tabSales Invoice Item` ⨝ `tabSales Invoice` | Top items by amount (+ qty available) |
| `stock_summary` | `tabStock Ledger Entry` | Warehouse valuation bars + slow-mover table |
| `list_companies` | `tabCompany` | Company filter dropdown |

Design rules applied on every endpoint:

- **Login + per-DocType read permission re-checked server-side** (`frappe.has_permission`)
  — a user without Sales Invoice access gets an empty card, not an error or leaked data.
- **`docstatus = 1` and `is_cancelled = 0`** respected, matching ERPNext's own reports.
- **Company + date-range filters** with safe defaults (last 365 days, user's default company).
- **Credit−debit on Income / debit−credit on Expense** — the correct GL sign convention
  (reversals cancel out automatically).
- Currency comes from the company's `default_currency`; multi-company filtering stays clean.

## 3. Installation

1. Copy `analytics-hub/` into your app (same level as the old ZIP content):
   - JS/CSS → `<your_app>/public/analytics-hub/`
   - `server/analytics/` → `<your_app>/analytics/`
   - `client/page/analytics_hub/` → `<your_app>/<your_app>/page/analytics_hub/`
2. Merge `client/hooks-snippet.py.txt` into `hooks.py` (replace `<your_app>`).
3. In `analytics_hub.json`, set `"module"` to your app's module name.
4. `bench build && bench migrate && bench restart`, then reload Desk (hard refresh).
5. Open **Awesome Bar → "Analytics Hub"** (or `/app/analytics-hub`).

To embed the dashboard on an existing report/extraction page instead of (or in addition
to) the page:

```js
AnalyticsHub.mount("#your-container", {
  company: "My Company",            // optional preselected filter
  fromDate: "2026-01-01", toDate: "2026-08-20",
});
```

## 4. Chart engine & UI/UX choices

- **Primary engine: `frappe.Chart`** — already bundled in every Frappe Desk, so zero extra
  weight and charts that visually match ERPNext (same palette, tooltips, donut/line/bar).
- **Zero-dependency fallback:** if `frappe.Chart` is absent (website portal, standalone
  page), a built-in SVG renderer takes over — bars, donut, legends, tooltips. The
  dashboard therefore **never shows a blank screen** and needs no npm/CDN.
- UX decisions: KPI cards carry **semantic colors** (green = income/profit, red = expense,
  amber = receivable/payable); all filters live in one sticky bar; every chart card is
  independent — a failed card degrades to a message instead of breaking the grid; the grid
  is responsive (1 column on mobile).
- Money formatting uses `frappe.format(..., Currency)` when available (locale-aware,
  respects the company's currency symbol).

## 5. Optional: native ERPNext Dashboard Charts / Number Cards

If you prefer ERPNext's built-in workspace widgets, every endpoint above can feed a
**Number Card** (Card Type = "Custom", Method = `analytics.api.kpi_summary`-style method
returning `{"value": …, "fieldtype": "Currency"}`) or a **Dashboard Chart**
(Chart Type = "Custom", same method returning `{labels, datasets}`). The aggregation
logic in `api.py` is written so you can wrap any function for this — nothing else changes.

## 6. Pitfalls studied & avoided

- **Raw-row transfer:** fetching `tabGL Entry` rows to the browser would be slow and
  leak data — everything is aggregated SQL-side with `SUM/GROUP BY`.
- **Wrong GL sign:** naive `SUM(debit)` double-counts revenue reversals; the endpoints use
  root-type-aware `credit−debit` / `debit−credit`, the same math as P&L.
- **Cancelled/draft docs:** excluded everywhere (`docstatus=1`, `is_cancelled=0`).
- **Permission leaks:** server re-checks per source DocType; the UI degrades per-card.
- **SQL injection:** all filters go through parameterized `%(name)s` bindings; the only
  string-formatted parts are static column/table names from a whitelist.
- **Percent literals in SQL:** `DATE_FORMAT` percents are escaped (`%%`) so Python's
  param binding doesn't eat them.
- **Date filter order:** `from_date > to_date` raises a clean error instead of empty data.
- **Empty datasets:** charts render a friendly "Data unavailable" state, KPIs show 0 —
  no JS exceptions on a fresh/empty site.
- **Style clashes:** all CSS is `.ah-*` namespaced; Desk pages also get the page-scoped
  padding fix in `analytics_hub.css`.
- **Coexistence with Print Studio:** different namespaces (`ah-` vs `ps-`), different
  server modules (`analytics` vs `print_studio`) — both add-ons live side by side.

## 7. Quick test checklist

1. `/app/analytics-hub` loads → KPI row filled, all 7 chart cards render. ✔
2. Change Company / date range → every card refreshes with filtered data. ✔
3. Compare "Revenue" KPI and the bar chart total against *Reports → Profit and Loss* for
   the same period → figures match. ✔
4. Log in as a user with only Stock role → sales/finance cards show "Data unavailable",
   stock card works; no errors in the console. ✔
5. On an empty company: no crashes, zeros and empty states everywhere. ✔
