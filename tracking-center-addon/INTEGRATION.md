# Tracking Center Add-on — INTEGRATION.md

An administrator-only monitoring hub (`/app/tracking-center`) with four sub-pages:
**Vue d'ensemble**, **Carte temps réel** (Google Maps), **Superviseurs**, **Retours clients**.
Design: modern, clear, coherent with the other add-ons (`.tc-*` namespace).

---

## 1. What is in this ZIP

```
tracking-center-addon/
├── tracking-center/
│   ├── tracking-center.js          ← UI: tabs, operator cards, map, supervisors, feedback
│   ├── tracking-center.css         ← styles (.tc-* namespaced)
│   ├── client/
│   │   ├── hooks-snippet.py.txt    ← merge into hooks.py
│   │   └── page/tracking_center/   ← ready-made Desk page (System Manager only)
│   │       ├── tracking_center.json
│   │       ├── tracking_center.js
│   │       └── tracking_center.css
│   └── server/
│       └── tracking_center/
│           ├── __init__.py
│           └── api.py              ← whitelisted monitoring endpoints
└── INTEGRATION.md                  ← this file
```

## 2. Sub-pages

| Tab | Content |
|---|---|
| Vue d'ensemble | Summary strip (opérateurs, en ligne, actions du jour) + one card per operator: avatar, rôles, dernière activité, sessions actives, actions aujourd'hui, statut en ligne (pastille verte/grise) |
| Carte temps réel | Google Map centrée sur Tunis, un marqueur circulaire par opérateur (initiales, bleu = en ligne, gris = hors ligne), trace (polyline des 20 derniers points), info-bulle au clic, liste latérale cliquable pour centrer la carte, rafraîchissement auto toutes les 15 s |
| Superviseurs | Cartes par utilisateur ayant un rôle manager (System/Accounts/Sales/Purchase/Stock/HR/Projects Manager): taille d'équipe, membres en ligne, liste des membres avec statut |
| Retours clients | Note moyenne + flux des feedbacks (étoiles, client, commentaire, document lié, opérateur, date) issus des Communications ERPNext |

## 3. Installation

1. Copy `tracking-center/` into your app (same level as the other add-ons):
   - JS/CSS → `<your_app>/public/tracking-center/`
   - `server/tracking_center/` → `<your_app>/tracking_center/`
   - `client/page/tracking_center/` → `<your_app>/<your_app>/page/tracking_center/`
2. Merge `client/hooks-snippet.py.txt` into `hooks.py` (replace `<your_app>`).
3. In `tracking_center.json`, set `"module"` to your app's module name.
4. `bench build && bench migrate && bench restart`, hard-refresh Desk.
5. Open **Awesome Bar → "Tracking Center"** (System Manager role required).

## 4. Google Maps key (required for the map tab)

The repo you referenced (deusyu/google-maps-skill) is a Claude Code skill around the
Google Maps API — not an embeddable UI library. What matters from it is the API-key
pattern, which this module follows exactly: the key lives in configuration, never in code.

1. Create a key in Google Cloud Console with **Maps JavaScript API** enabled.
2. Add it to your site config (`site_config.json`):
   ```json
   { "google_maps_api_key": "YOUR_KEY" }
   ```
3. `bench restart`. The key is served only to administrators via `get_maps_key` —
   it never appears in the shipped JS.
4. Restrict the key to your domain in Google Cloud Console (HTTP referrers).

Without a key, the map tab shows a clear setup hint instead of breaking; the three
other tabs work regardless.

## 5. How real-time works

- Each logged-in browser (operators included) runs `navigator.geolocation.watchPosition`
  and reports its own position **at most once per minute** to
  `tracking_center.api.report_location` — a user can only ever report their *own*
  position (`frappe.session.user` server-side), no spoofing of colleagues.
- Positions and trails (last 20 points) live in the **Frappe cache** with a 12 h TTL —
  **no DocType, no migration** needed.
- The map polls `list_locations` every 15 s and updates markers in place (no flicker,
  stale markers are removed).

**Consent note:** operators must accept the browser geolocation prompt. Refusal is
handled silently — they simply don't appear on the map. Inform your team and check
your local privacy obligations before enabling.

## 6. Pitfalls studied & avoided

- **Admin-only data:** every endpoint requires login; sensitive ones (`list_operators`,
  `list_locations`, `list_supervisors`, `list_feedback`, `get_maps_key`) additionally
  require the **System Manager** role — a regular operator cannot read colleague data.
  The Desk page itself is also role-restricted in `tracking_center.json`.
- **No schema changes:** location storage uses the cache, so the module installs with
  `bench build` only — no migration risk on production.
- **Graceful degradation:** missing Maps key, denied geolocation, empty feedback, or a
  site without Activity Log all render clear empty states instead of errors.
- **Feedback source:** read from `Communication.feedback_rating` (ERPNext's native
  feedback mechanism), so existing feedback flows in with zero data entry change.
- **Supervisor teams:** built on the `User.reports_to` link when present; without it,
  supervisor cards still show with an explicit "Aucun membre rattaché" state.
- **Style isolation:** `.tc-*` namespace — no collision with `.ps-*`, `.ah-*`, `.df-*`.
- **Map hygiene:** POI/transit layers disabled for a clean staff-only view; initial
  viewport auto-fits to reported positions instead of a hardcoded zoom.

## 7. Quick test checklist

1. `/app/tracking-center` as Administrator → 4 tabs visible, LIVE badge. ✔
2. Vue d'ensemble → operator cards show online status and today's actions. ✔
3. Map tab with the key configured → your own marker appears after accepting the
   geolocation prompt (blue = online); wait 15 s → position refreshes. ✔
4. Log in as a non-System-Manager → the page is not listed and the API returns 403. ✔
5. Supervisors tab → managers listed with team stats. ✔
6. Add a feedback rating on a Communication → it appears in Retours clients. ✔
