# Net Plus Desk — Custom ERPNext Frontend

A complete, production-oriented **Next.js / React / TypeScript** frontend that replaces the
ERPNext Desk UI while keeping **every ERPNext feature** through the Frappe API.

ERPNext remains the business engine (accounting, inventory, CRM, HR, manufacturing,
permissions, workflows). Net Plus Desk is only the presentation layer.

---

## Why nothing breaks on any page

Instead of hard-coded screens, the app uses **generic, metadata-driven routes**:

| Route | Purpose |
|---|---|
| `/desk` | Module grid (Desk home) |
| `/desk/[module]` | Module landing with quick links |
| `/desk/[module]/[doctype]` | **Generic list view for ANY DocType** |
| `/desk/[module]/[doctype]/[name]` | **Generic form for ANY DocType** |
| `/desk/_doctype/<name>` | Escape hatch: list any arbitrary DocType |
| `/login` | Frappe session login |

List columns come from the DocType's `in_list_view` fields; forms are rendered from
DocType metadata (Data / Link / Select / Date / Currency / Check / Table children /
Attach). A DocType the designers never heard of still gets a fully working list + form.

Sidebar modules are the most-used shortcuts; the global search
(`Sales Order: SO-0001`) and `/desk/_doctype/…` cover everything else.

---

## Requirements

- Node.js 18.17+ (or 20+)
- A running Frappe/ERPNext site (bench / docker / Frappe Cloud)

## 1. Setup

```bash
unzip netplus-desk.zip
cd netplus-desk
cp .env.example .env
# edit .env:
FRAPPE_URL=http://localhost:8000   # your site URL
npm install
npm run dev
```

Open http://localhost:3000 → login with your ERPNext credentials.

## 2. How the backend integration works

All API traffic goes through the Next.js server (`next.config.mjs`):

```text
Browser → Next.js (:3000) → rewrites /api/** → Frappe (:8000)
```

This makes the browser same-origin, so the Frappe `sid` session cookie flows
automatically. Login posts to `/api/method/login` and Frappe issues the cookie.

In production, serve the built app behind the same origin (or set `FRAPPE_URL`
to your site and allow CORS with `Access-Control-Allow-Credentials`).

## 3. What talks to Frappe

| Feature | Endpoint |
|---|---|
| Login / logout | `/api/method/login`, `/api/method/logout` |
| Current user | `/api/method/frappe.auth.get_logged_user` |
| Lists | `/api/resource/<DocType>?fields=…&limit_start=…` |
| Counts | `/api/method/frappe.client.get_count` |
| Read one doc | `/api/resource/<DocType>/<name>` |
| Create / update | POST/PUT `/api/resource/<DocType>` |
| Delete | DELETE `/api/resource/<DocType>/<name>` |
| Submit / cancel | PUT with `docstatus=1` / `docstatus=2` |
| DocType metadata | `/api/resource/DocType/<name>` |
| Link search | `/api/method/frappe.desk.search.search_link` |
| File upload | `/api/method/upload_file` |
| Custom app methods | `/api/method/<your.method.path>` |

`src/lib/frappe/client.ts` wraps all of these; hooks in `src/lib/frappe/hooks.ts`.

## 4. Permissions & security

Authorization stays server-side in Frappe (role permissions, docstatus rules,
workflow). The UI hides actions for convenience only — Frappe enforces them.
Never connect the frontend to MariaDB directly.

## 5. Adding modules / DocTypes

Edit `src/config/modules.ts`:

```ts
{
  slug: "custom", name: "Custom Module", icon: SomeIcon, tint: "bg-... text-...",
  description: "…",
  doctypes: [{ name: "My Custom DocType" }],
}
```

Custom Frappe app endpoints are reachable via `frappe.call("my_app.api.method")`.

## 6. Branding

- Place the official Net Plus logo at `public/logo.png` (already referenced by the Sidebar).
- Colors/fonts are tokens in `tailwind.config.ts` (brand green = logo leaf,
  netblue = logo drop, cobalt primary, Inter font).

## 7. Production build

```bash
npm run build
npm run start          # or deploy to Vercel / Docker / bench www proxy
```

Recommended: put the app on the same domain as Frappe (reverse proxy) so sessions
just work.

---

## Project structure

```
netplus-desk/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx, page.tsx, globals.css
│  │  ├─ login/page.tsx
│  │  └─ desk/
│  │     ├─ page.tsx                     (Desk home)
│  │     ├─ [module]/page.tsx            (module landing)
│  │     ├─ [module]/[doctype]/page.tsx  (generic list)
│  │     └─ [module]/[doctype]/[name]/page.tsx (generic form)
│  ├─ components/
│  │  ├─ layout/{AppShell,Sidebar,Topbar}.tsx
│  │  └─ {ModuleCard,DataTable,FormRenderer,StatusBadge,providers}.tsx
│  ├─ config/modules.ts                  (all ERPNext modules + doctypes)
│  └─ lib/
│     ├─ frappe/{client,hooks}.tsx       (API layer)
│     └─ utils.ts
├─ next.config.mjs                       (API proxy to Frappe)
├─ tailwind.config.ts                    (design tokens)
└─ INTEGRATION.md                        (this file)
```
