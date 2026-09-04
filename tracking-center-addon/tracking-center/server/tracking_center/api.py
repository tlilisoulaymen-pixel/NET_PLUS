# -*- coding: utf-8 -*-
"""Tracking Center — whitelisted monitoring API (Frappe/ERPNext backend).

Endpoints (all require login; admin-only where sensitive):
  list_operators     — operators, roles, last activity, sessions, today's actions
  list_locations     — latest reported geolocation per user + short trail
  report_location    — browser geolocation report (own user only)
  list_supervisors   — users with manager/supervisor roles + team stats
  list_feedback      — client feedback feed
  get_maps_key       — Google Maps API key from site config (never hardcoded)

Storage: geolocation points are kept in the cache (no schema change needed,
no DocType migration) with a rolling trail of the last 20 points per user.
To persist long-term history later, swap the cache for a child DocType —
see INTEGRATION.md §6.
"""

import time
import frappe
from frappe import _
from frappe.utils import now_datetime, today, get_datetime

MANAGER_ROLES = ["System Manager", "Accounts Manager", "Sales Manager",
                 "Purchase Manager", "Stock Manager", "HR Manager", "Projects Manager"]

TRAIL_LEN = 20          # points kept per user
LOCATION_TTL = 60 * 60 * 12  # positions expire after 12 h


def _require_admin():
    roles = frappe.get_roles(frappe.session.user)
    if "System Manager" not in roles and "Administrator" != frappe.session.user:
        frappe.throw(_("Tracking Center is restricted to administrators."),
                     frappe.PermissionError)


def _operator_users():
    """Enabled System Users except Administrator/Guest."""
    return frappe.get_all(
        "User",
        filters={"enabled": 1, "user_type": "System User",
                 "name": ["not in", ["Administrator", "Guest"]]},
        fields=["name", "full_name", "last_login"],
        order_by="full_name",
    )


def _user_roles(user):
    return frappe.get_all("Has Role", filters={"parent": user},
                          pluck="role")


# ----------------------------------------------------------------------
# 1. Operators overview
# ----------------------------------------------------------------------
@frappe.whitelist()
def list_operators():
    _require_admin()
    sessions = frappe.db.sql(
        "SELECT user, COUNT(*) AS n FROM `tabSessions` GROUP BY user", as_dict=True)
    sess_map = {s["user"]: s["n"] for s in sessions}

    actions = frappe.db.sql("""
        SELECT owner AS user, COUNT(*) AS n FROM `tabActivity Log`
        WHERE creation >= %s GROUP BY owner""", (today(),), as_dict=True) \
        if frappe.db.exists("DocType", "Activity Log") else []
    act_map = {a["user"]: a["n"] for a in actions}

    now = now_datetime()
    out = []
    for u in _operator_users():
        roles = _user_roles(u["name"])
        loc = frappe.cache().hget("tc_locations", u["name"])
        last_activity = u.get("last_login")
        reported_at = None
        if loc:
            import json
            try:
                data = json.loads(loc)
                reported_at = data.get("reported_at")
            except Exception:
                pass
        last = reported_at or (str(last_activity) if last_activity else None)
        online = (u["name"] in sess_map) or (
            reported_at and
            (now - get_datetime(reported_at)).total_seconds() < 300
        )
        out.append({
            "name": u["name"], "full_name": u.get("full_name") or u["name"],
            "roles": roles, "sessions": sess_map.get(u["name"], 0),
            "actions_today": act_map.get(u["name"], 0),
            "last_activity": last, "online": bool(online),
        })
    today_actions = sum(act_map.values())
    return {"operators": out, "today_actions": today_actions}


# ----------------------------------------------------------------------
# 2. Geolocation — report & list
# ----------------------------------------------------------------------
@frappe.whitelist()
def report_location(latitude, longitude, accuracy=None):
    """Any logged-in user reports THEIR OWN position (never someone else's)."""
    user = frappe.session.user
    if user in ("Guest",):
        frappe.throw(_("Login required"), frappe.PermissionError)
    import json
    entry = {
        "latitude": float(latitude), "longitude": float(longitude),
        "accuracy": int(accuracy or 0),
        "reported_at": str(now_datetime()),
    }
    cache = frappe.cache()
    cache.hset("tc_locations", user, json.dumps(entry))
    # rolling trail
    raw = cache.hget("tc_trails", user)
    trail = json.loads(raw) if raw else []
    trail.append({"latitude": entry["latitude"], "longitude": entry["longitude"],
                  "reported_at": entry["reported_at"]})
    trail = trail[-TRAIL_LEN:]
    cache.hset("tc_trails", user, json.dumps(trail))
    cache.expire("tc_locations", LOCATION_TTL)
    return {"ok": True}


@frappe.whitelist()
def list_locations():
    _require_admin()
    import json
    cache = frappe.cache()
    now = now_datetime()
    out = []
    for u in _operator_users():
        raw = cache.hget("tc_locations", u["name"])
        if not raw:
            continue
        try:
            entry = json.loads(raw)
        except Exception:
            continue
        trail_raw = cache.hget("tc_trails", u["name"])
        trail = json.loads(trail_raw) if trail_raw else []
        reported = get_datetime(entry["reported_at"])
        out.append({
            "user": u["name"], "full_name": u.get("full_name") or u["name"],
            "latitude": entry["latitude"], "longitude": entry["longitude"],
            "accuracy": entry.get("accuracy", 0),
            "reported_at": entry["reported_at"],
            "online": (now - reported).total_seconds() < 300,
            "trail": trail,
        })
    return {"locations": out}


# ----------------------------------------------------------------------
# 3. Supervisors + teams
# ----------------------------------------------------------------------
@frappe.whitelist()
def list_supervisors():
    _require_admin()
    sups = []
    sessions = frappe.db.sql("SELECT user FROM `tabSessions`", pluck="user")
    online_set = set(sessions or [])
    for u in _operator_users():
        roles = _user_roles(u["name"])
        if not any(r in MANAGER_ROLES for r in roles):
            continue
        team = frappe.get_all("User",
                              filters={"reports_to": u["name"], "enabled": 1},
                              fields=["name", "full_name"]) \
            if "reports_to" in [f.fieldname for f in frappe.get_meta("User").fields] else []
        team_rows = [{"name": t["name"],
                      "full_name": t.get("full_name") or t["name"],
                      "online": t["name"] in online_set} for t in team]
        out_roles = [r for r in roles if r in MANAGER_ROLES]
        sups.append({
            "name": u["name"], "full_name": u.get("full_name") or u["name"],
            "roles": out_roles or roles[:3],
            "team_size": len(team_rows),
            "team_online": sum(1 for t in team_rows if t["online"]),
            "team_actions_today": 0,
            "team": team_rows,
        })
    return {"supervisors": sups}


# ----------------------------------------------------------------------
# 4. Client feedback
# ----------------------------------------------------------------------
@frappe.whitelist()
def list_feedback(limit=50):
    _require_admin()
    # Feedback lives in Communication (feedback rating on transactions) —
    # the standard ERPNext mechanism; we surface the most recent ones.
    if not frappe.db.exists("DocType", "Communication"):
        return {"feedback": []}
    rows = frappe.get_all(
        "Communication",
        filters={"communication_type": "Communication",
                 "feedback_rating": [">", 0]},
        fields=["name", "feedback_rating as rating", "content as feedback",
                "reference_name as reference", "sender as customer",
                "communication_date as creation", "owner as operator"],
        order_by="communication_date desc",
        limit_page_length=int(limit or 50),
    )
    return {"feedback": rows}


# ----------------------------------------------------------------------
# 5. Google Maps key (from site_config.json — never in code)
# ----------------------------------------------------------------------
@frappe.whitelist()
def get_maps_key():
    _require_admin()
    return {"key": frappe.conf.get("google_maps_api_key") or ""}
