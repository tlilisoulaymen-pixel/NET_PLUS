# NetPlus App (preliminary)

Custom Frappe app that adds the NetPlus operational layer on top of ERPNext:

- **Supervisor portal** (`/portal`) — team missions, alerts, rankings, contract generation
- **Client portal** (`/portal`) — interventions, feedback submission + history, satisfaction trend
- **Operator PWA** (`/netplus-pwa`) — Google Map, geofenced check-in/check-out, heartbeat, score
- **Guest feedback page** (`/feedback?token=...`) — 72h magic-link, no login required
- Doctypes: Service Contract, Mission Alert, Mission Operator (child), Operator Score, NetPlus Settings
- Custom fields injected into core **Task**, **Location**, **Quality Feedback**
- Scheduler jobs: lateness alert tiers (5/15/30 min), escalation, heartbeat watchdog,
  token expiry, feedback reminders, nightly score recompute, 90-day GPS purge (Loi 25)

## Install

```bash
# from your bench directory
bench get-app /path/to/netplus_app
bench --site yoursite install-app netplus
bench --site yoursite migrate

# convert portal roles to Website Users (blocks /app natively)
bench --site yoursite execute netplus.setup_users.convert_to_website_users
```

Then set your Google Maps API key in **NetPlus Settings**.

Read `INTEGRATION.md` for the full ERPNext + Google Maps/Firebase integration guide.

