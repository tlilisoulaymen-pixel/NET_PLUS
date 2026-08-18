Building on ERPNext is the right call for this project — but the key insight is that you won't really be building "inside ERPNext" so much as building a custom Frappe app that sits alongside ERPNext (and Frappe HR) on the same bench. Roughly 40% of the NetPlus spec already exists in the stack; here's the full mapping.

One upfront note: the PDF recommends Node/Express + PostgreSQL/PostGIS. Adopting ERPNext means you drop that — the stack becomes Python + MariaDB + Redis + Socket.IO, which is fine: haversine geofencing at your scale (hundreds of check-ins/day) doesn't need PostGIS, and Frappe already ships JWT-equivalent auth, RBAC, rate limiting, audit trail, file storage, and a scheduler.

Target architecture overview

Current stable is ERPNext v16 (v15 still maintained) — start on v16. github.com

``mermaid
flowchart TB
    subgraph Clients["Frontends"]
        A["Operator PWA<br/>(Frappe UI · Vue 3 · mobile-first)"]
        B["Client Feedback Portal<br/>(tokenized web page, no login)"]
        C["Desk UI<br/>(Super Admin & Supervisor)"]
    end
    subgraph Bench["Frappe Bench"]
        D["netplus (custom app)<br/>DocTypes · API · scoring · alerts"]
        E["Frappe HR<br/>Employee Checkin · Shift Location"]
        F["ERPNext<br/>Customer · Employee · Projects"]
        G["Frappe Framework<br/>Auth · RBAC · Scheduler · Files · Realtime"]
    end
    subgraph Infra["Infrastructure"]
        H[(MariaDB)]
        I[(Redis<br/>cache · queue · realtime)]
        J["FCM / SendGrid / Twilio"]
    end
    A & B & C --> D
    D --> E & F
    E & F --> G
    G --> H & I
    D --> J
`

The rule of thumb: never fork ERPNext core. Everything custom lives in the netplus app via new DocTypes, hooks, and whitelisted API methods, so you can keep pulling upstream updates.

Role mapping (spec → Frappe)

| NetPlus role | Frappe implementation |
|---|---|
| Super Admin | Custom role NetPlus Admin (near-System Manager, scoped) |
| Superviseur | Custom role + User Permission on Employee records they supervise — this gives you the "sees only HIS operators" isolation for free |
| Opérateur | Employee (Frappe HR) + role NetPlus Operator, access only via the PWA |
| Client | Customer + website user (portal-only), no Desk access |

Frappe's permission engine already covers the spec's RBAC matrix (role + doctype + action + row-level via User Permissions). The audit trail requirement is also free: every DocType has versioning and a change log.

Module 1 — Pointage (the one with the most reuse)

Frappe HR already ships Employee Checkin with geolocation capture and Shift Location with geofencing (allowed radius validated at check-in). docs.frappe.io docs.frappe.io

What you still build in netplus:

• Mission DocType — client (link → Customer), site (link → Site DocType with lat/lng + radius), scheduled time, type, status workflow (PLANIFIÉE → EN COURS → TERMINÉE / EN RETARD CRITIQUE), child table Mission Operator (employee, islead, checkin, checkout). Use Frappe's Workflow engine for the status transitions.
• Check-in API — a whitelisted method netplus.api.checkin(mission, lat, lng, accuracy) that: validates GPS accuracy ≤ 100m, computes haversine distance to the site, enforces the 200m threshold (configurable in a NetPlus Settings single DocType), writes an Employee Checkin + updates the Mission child row. Same for check-out + feedback-token generation.
• Heartbeat — a lightweight endpoint hit every 5 min by the PWA; store last ping on the Mission Operator row. A missing heartbeat > 15 min triggers a supervisor alert.
• Alert engine — Mission Alert DocType (level, status, justification, escalation trail) + a scheduler job (schedulerevents in hooks.py, cron */5) that scans unpointed missions and fires the 5/15/30-min tiers exactly as specified, with the 10-min escalation rule. Frappe's scheduler replaces the spec's cron job one-for-one.
• Notifications — Frappe handles email natively (plug SendGrid via SMTP); add FCM for push (the HR PWA pattern) and Twilio via a thin integration for the CRITIQUE tier.

Module 2 — Feedback Client (mostly custom, but on rails)

Nothing in ERPNext matches this closely enough — build it clean:

• Mission Feedback DocType — stars (1–5, required), comment (max 1000), categories (Table MultiSelect), NPS boolean, attachments. Unique constraint on mission enforces one-feedback-per-mission; a modified check enforces the 24h edit window.
• Tokenized access — on check-out, generate a random token stored on the Mission with a 72h expiry; the link points to a custom portal page (www/feedback.html + Vue) that resolves the token server-side, no login needed. This matches the spec's magic-link UX exactly. A daily scheduler job expires stale tokens and marks missions "Feedback en attente" (quality defaults to neutral 3, per spec).
• Photos — Frappe's File manager with isprivate=1 gives you restricted storage and signed-ish access URLs; do the resize/compression (1200px, JPEG q85) and EXIF stripping in a before_insert hook with Pillow.
• Reminder at 24h — another scheduler job.

Module 3 — Classement & Dashboard (pure business logic + built-in analytics)
• Scoring engine — a nightly (or on-feedback-submit) job that recomputes per-operator scores into an Operator Score DocType (period, quality, punctuality, completion, global). Implement the exact formula from the report — (stars/5 × 50) + (punctuality × 30) + (completion × 20) − penalties — including team split (equal vs 60/40 lead mode) and individual punctuality. Keep it as a pure Python function with unit tests; it's the most business-critical code in the app.
• Dashboards — Frappe's built-in Dashboards, Number Cards, and Dashboard Charts cover the Super Admin and Supervisor views (with role/user-permission filtering giving each supervisor only their team automatically). PDF/Excel export is native. For the operator's personal score view, render it in the PWA. If you later want richer analytics, Frappe Insights drops in on the same bench.

Frontend strategy

Don't build one monolithic SPA — split by audience:

Desk (built-in) for Super Admin and Supervisors: mission planning, alert management, dashboards, operator onboarding. Zero frontend code; you get list views, filters, workflows, and permissions for free. This is the biggest time-saver of adopting ERPNext.
Operator PWA — a Vue 3 + Frappe UI + Tailwind app (same pattern as the official Frappe HR mobile PWA, which already does geolocation check-in — study its source before writing yours). Screens: today's mission, GPS-gated check-in button, in-mission notes/photos, check-out, personal score. Installable on phones, uses the browser Geolocation API + FCM push.
Client feedback portal — tokenized public web pages (portal pages in the netplus app), plus a small logged-in client dashboard using Frappe's website portal.

Phased plan (adjusted for ERPNext)

| Phase | Scope | Est. |
|---|---|---|
| 0 | Bench setup (v16 + HR + netplus` skeleton), roles, Employee/Customer onboarding flow | 1 wk |
| 1 | Mission + Site DocTypes, check-in/out API with geofencing, operator PWA MVP | 4–5 wks |
| 2 | Alert engine + escalation, FCM/Twilio, supervisor Desk views | 3 wks |
| 3 | Feedback module (token flow, portal page, photos), scoring engine, dashboards | 4 wks |
| 4 | Hardening: Loi 25/RGPD retention job (90-day GPS purge), load tests, training | 2 wks |

That's roughly the same 18-week envelope as the PDF's plan, but with materially less risk because auth, RBAC, admin UI, audit, files, and scheduling are inherited rather than written.

The one thing I'd validate in week 0: whether Frappe HR's native Shift Location geofencing is close enough to reuse directly for check-in validation, or whether your mission-centric model (geofence per mission site, not per shift) forces the custom API path — the custom path is what I've assumed above, since your operators visit different client sites daily, and it keeps HR's attendance features as a bonus rather than a dependency.