# User Credential Management in netplus-desk — Detailed Plan & Build Prompt

## 0. Context and goal

Today, creating operators and setting their passwords requires the Frappe Desk at
`http://localhost:8080/app`. This feature moves the **entire user lifecycle** into the
Next.js `netplus-desk` frontend:

- Create a `User` (email-keyed) from the generic list/form pages.
- Assign roles, module profiles, role profiles, user permissions.
- Set/reset the password, send a welcome email, force logout, enable/disable —
  without ever touching the Desk.

**The core constraint (why a generic form is not enough):** Frappe never stores
passwords in the `User` DocType. Passwords are PBKDF2-hashed (via `passlib`) into the
internal `__Auth` table. The generic form renderer, which maps DocType fields to inputs,
therefore **cannot** render a password control. We need a route-level override of the
`User` form plus a dedicated security panel that calls Frappe's auth methods directly.

---

## 1. What Frappe actually exposes (backend contract)

Verified against the Frappe Framework (these are the methods we will call — no new
server code is required for the core flows):

| Capability | Method / endpoint | Notes |
|---|---|---|
| Create user | `POST /api/resource/User` (or `frappe.client.insert`) | `email` is the primary key; `user_type`: `System User` / `Website User`; `send_welcome_email`: 0/1 |
| Update user (roles, names, enabled) | `PUT /api/resource/User/{email}` / `frappe.client.set_value` | Roles are a **child table** (`roles[]`) — must be sent as full array, not appended one by one |
| Set password (admin) | `frappe.core.doctype.user.user.update_password` | Args: `user`, `new_password`, `logout_all_sessions` (0/1). Callable by System Manager only |
| Send welcome/reset email | `frappe.core.doctype.user.user.reset_password` | Args: `user`. Generates the time-sensitive single-use token and mails the link |
| Force logout | `logout_all_sessions=1` on `update_password`, or `frappe.sessions.clear_sessions(user=...)` | Purges `tabSessions` for that user |
| Enable/disable | `PUT /api/resource/User/{email}` with `enabled: 0/1` | Disabling purges sessions automatically — safest way to cut access without deleting history |
| 2FA state | `User` fields `otp_secret`, `two_factor_authentication` | Read state; enrollment stays user-side |
| API keys | `frappe.core.doctype.user.user.generate_keys` | Args: `user`. Returns API key + secret **once** — secret is not retrievable later |
| List roles / role profiles / module profiles | `GET /api/resource/Role`, `/Role Profile`, `/Module Profile` | For pickers |
| User permissions (row-level) | `POST /api/resource/User Permission` | `{ user, allow, for_value, apply_to_all_doctypes }` — e.g. `allow: "Company", for_value: "Acme Corp"` |

**Permission rule of thumb:** every one of these calls is enforced server-side
(System Manager or `User` write permission). The frontend must treat 403 as a normal
state ("you don't manage users"), not as an error.

---

## 2. Architecture — route override

Next.js App Router resolves more specific routes before catch-alls. We exploit that:

```
src/app/[locale]/desk/
├── [module]/[doctype]/
│   ├── page.tsx                  ← generic LIST (existing)
│   └── [name]/page.tsx           ← generic FORM (existing catch-all)
└── setup/User/
    ├── page.tsx                  ← [NEW] User list (or reuse generic list)
    ├── new/page.tsx              ← [NEW] create user
    └── [name]/page.tsx           ← [NEW] user form + Security Panel (this override)
```

`/desk/setup/User/anything` now resolves to our pages instead of the catch-all.
Everything else (`Sales Invoice`, `Item`, …) keeps using the generic renderer.

### Page composition (`[name]/page.tsx`)

```
┌────────────────────────────────────────────┐
│ User form (existing FormRenderer)          │  ← email, first_name, last_name,
│                                            │    user_type, enabled, roles[],
│                                            │    role_profile, module_profile
├────────────────────────────────────────────┤
│ 🛡 Security Panel (custom card)            │
│  • Set password (new + confirm + strength) │
│  • [ ] Force logout all sessions           │
│  • Send welcome/reset email                │
│  • API keys (generate / reveal once)       │
│  • 2FA status (read-only badge)            │
├────────────────────────────────────────────┤
│ 🔒 Access restrictions (custom card)       │
│  • User Permissions list (Company, …)      │
│  • Add/remove row-level restrictions       │
└────────────────────────────────────────────┘
```

Only `System Manager` (or users with `User` write perm) see the two custom cards —
fetch the current session user's roles first (`frappe.auth.get_logged_user` +
`/api/resource/User/{me}` or `frappe.call('frappe.get_roles')`) and hide the panels
otherwise. Never rely on the UI alone: the backend re-checks anyway.

---

## 3. Component & flow details

### 3.1 Create flow (`new/page.tsx`)
1. Minimal form: **Email** (validated, becomes the ID), **First name**, **Last name**,
   **User type** (System/Website), **Roles** (multi-select from `/api/resource/Role`),
   optional **Send welcome email** checkbox.
2. `POST /api/resource/User` with `send_welcome_email: 1` when checked — Frappe mails
   the single-use setup link; no password is ever typed.
3. On success → route to `/desk/setup/User/{email}` where the Security Panel is live.

### 3.2 Security Panel behaviors
- **Set password**: two inputs + client-side match check + a strength hint (length,
  classes). Submit calls:
  `frappe.call('frappe.core.doctype.user.user.update_password', { user, new_password, logout_all_sessions })`.
  Password travels only in the POST body over HTTPS — never in URLs, state logs, or
  localStorage; clear both inputs after submit. Show Frappe's own password-policy
  errors verbatim (Frappe validates strength server-side via System Settings).
- **Force logout**: checkbox included in the same call (`logout_all_sessions: 1`).
- **Send welcome email**: `frappe.call('frappe.core.doctype.user.user.reset_password', { user })`
  — works for both new and existing users (it is the standard reset flow).
- **Enable/disable**: a switch bound to `enabled`; when turning off, confirm first and
  explain that sessions are purged and history is preserved.
- **API keys**: `generate_keys` returns the secret exactly once — show it in a modal
  with a copy button and an explicit "this will never be shown again" notice.

### 3.3 Access restrictions card
- Lists `User Permission` rows for this user.
- "Add restriction": pick the link DocType (`Company`, `Warehouse`, …), pick the value,
  optional `apply_to_all_doctypes`.
- Delete = `DELETE /api/resource/User Permission/{name}`.

### 3.4 Error & state handling
- Map Frappe error envelopes (`exc_type`, `_server_messages`) to inline messages.
- 403 → "Only System Managers can manage users" empty state.
- 409/duplicate email → field-level error on the create form.
- Disabled user trying actions → read-only panels.

---

## 4. Testing / verification plan

1. **Create**: `/desk/setup/User/new` → create `test.operator@…` with welcome email →
   mail arrives, link sets password, user can log in via the Next.js login screen.
2. **Manual password**: set one in the Security Panel → log in with it from an
   incognito window.
3. **Force logout**: set password with the checkbox while that user is logged in
   elsewhere → their other session is dead immediately.
4. **Disable**: toggle off → sessions purged, login refused; toggle on → works again.
5. **Roles**: add `Accounts User` → the user's UI shows accounting; remove → hidden.
6. **User Permission**: restrict to Company = X → list views show only company X rows.
7. **Permissions**: log in as a non-System-Manager → security cards hidden, direct
   URL access returns the clean 403 state.
8. **Regression**: `/desk/stock/Item/new` and other DocTypes still route to the generic
   pages (the override must not shadow them).

---

## 5. Ready-to-use build prompt

Copy-paste this into your coding agent:

```
Build "User Credential Management" in the netplus-desk Next.js (App Router, [locale])
frontend so admins never need Frappe Desk for user management.

KEY CONSTRAINT: passwords are NOT DocType fields — Frappe stores them hashed (PBKDF2)
in the internal __Auth table. The generic FormRenderer must NOT attempt to render a
password input. All password/auth operations go through Frappe methods.

ROUTING: Add src/app/[locale]/desk/setup/User/new/page.tsx and
src/app/[locale]/desk/setup/User/[name]/page.tsx so Next.js route priority overrides
the generic [module]/[doctype]/[name] catch-all ONLY for User. Verify other DocTypes
still use the generic pages.

PAGE [name]: render the existing FormRenderer for standard User fields (email,
first_name, last_name, user_type, enabled, roles child table, role_profile_name,
module_profile_name). Below it render a custom "Security" card and an "Access
restrictions" card, visible ONLY to users whose roles include "System Manager"
(fetch current roles first; backend enforces anyway — treat 403 as an empty state).

SECURITY CARD:
- Set password form: new_password + confirm (client-side match check, strength hint).
  On submit call frappe method frappe.core.doctype.user.user.update_password with
  { user, new_password, logout_all_sessions }. Never persist/log the password; clear
  inputs after submit; display server-side password-policy errors verbatim.
- "Force logout all sessions" checkbox bound to logout_all_sessions.
- "Send welcome email" button -> frappe.core.doctype.user.user.reset_password { user }.
- Enabled toggle -> PUT /api/resource/User/{email} { enabled: 0|1 } with a confirm
  dialog when disabling (explain sessions are purged, history preserved).
- API keys: button calling frappe.core.doctype.user.user.generate_keys { user };
  show api_key + api_secret ONCE in a modal with copy button and a "shown once" notice.
- 2FA: read-only badge from user.two_factor_authentication.

CREATE PAGE (new): email (validated; it is the primary key), first/last name,
user_type (System User | Website User), roles multi-select (GET /api/resource/Role),
"Send welcome email" checkbox -> POST /api/resource/User with send_welcome_email: 1.
On success redirect to /desk/setup/User/{email}.

ACCESS RESTRICTIONS CARD: list User Permission docs filtered by user
(GET /api/resource/User Permission?filters=[["user","=","{email}"]]); add row via
POST /api/resource/User Permission { user, allow, for_value, apply_to_all_doctypes };
delete via DELETE. Default "allow" options: Company, Warehouse, Customer, Supplier.

ERROR HANDLING: parse Frappe _server_messages/exc_type into inline messages; 403 ->
"Only System Managers can manage users" state; duplicate email -> field-level error.

TESTING: after build, verify (1) create user + welcome email login, (2) manual password
login from incognito, (3) force-logout kills an active session, (4) disable blocks
login, (5) non-System-Manager sees no security cards and gets clean 403, (6) generic
routes for other DocTypes unaffected.
```

---

## 6. Relation to the existing add-ons

This plan is frontend-only (Next.js) and complements the three ZIPs already delivered
(Print Studio, Analytics Hub, Doc Flow), which run inside Desk. The user records,
roles and permissions managed here apply to both worlds automatically — the Doc Flow
and Analytics endpoints already re-check `frappe.has_permission`, so an operator
created and restricted in netplus-desk is governed by the same rules inside Desk.
