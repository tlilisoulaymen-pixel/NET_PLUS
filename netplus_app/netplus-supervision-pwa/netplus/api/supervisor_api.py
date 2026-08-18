"""NetPlus Supervisor API — endpoints du cockpit superviseur.

L'équipe d'un superviseur = les Employees dont `reports_to` pointe vers son
Employee (relation native ERPNext, même logique que portal_api._team_of()).

Les noms de champs custom sont centralisés dans FIELD — identiques à
operator_api.py : alignez les deux fichiers avec votre schéma réel.
"""

import frappe
from frappe import _
from frappe.utils import (
    cint, flt, get_datetime, getdate, now_datetime,
    time_diff_in_seconds, add_days,
)

ROLE_SUPERVISOR = "NetPlus Supervisor"

FIELD = {
    "task_site": "site",
    "task_operators": "operators",
    "loc_radius": "geofence_radius",
    "mo_user": "employee",
    "mo_checkin": "checkin_time",
    "mo_checkout": "checkout_time",
    "mo_out_flag": "checkout_out_of_zone",
    "mo_hb_time": "last_heartbeat",
    "mo_hb_lat": "last_lat",
    "mo_hb_lng": "last_lng",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _require_supervisor():
    if frappe.session.user == "Guest":
        frappe.throw(_("Connexion requise"), frappe.AuthenticationError)
    if not ({ROLE_SUPERVISOR, "System Manager"} & set(frappe.get_roles())):
        frappe.throw(_("Réservé aux superviseurs"), frappe.PermissionError)


def _my_employee():
    return frappe.db.get_value(
        "Employee", {"user_id": frappe.session.user},
        ["name", "employee_name", "designation", "image"], as_dict=True,
    )


def _team(emp=None):
    """Employees rattachés au superviseur (reports_to). Repli sur tous les opérateurs actifs si non configuré."""
    emp = emp or _my_employee()
    if emp:
        rows = frappe.get_all(
            "Employee", filters={"status": "Active", "reports_to": emp.name},
            fields=["name", "employee_name", "designation", "user_id", "image", "cell_number"],
            limit_page_length=0,
        )
        if not rows:
            op_users = set(frappe.get_all(
                "Has Role", filters={"role": "NetPlus Operator", "parenttype": "User"},
                pluck="parent"))
            rows = frappe.get_all(
                "Employee", filters={"status": "Active", "user_id": ["in", list(op_users)]},
                fields=["name", "employee_name", "designation", "user_id", "image", "cell_number"],
                limit_page_length=0,
            )
        return [r for r in rows if r.user_id]

    op_users = set(frappe.get_all(
        "Has Role", filters={"role": "NetPlus Operator", "parenttype": "User"},
        pluck="parent"))
    rows = frappe.get_all(
        "Employee", filters={"status": "Active", "user_id": ["in", list(op_users)]},
        fields=["name", "employee_name", "designation", "user_id", "image", "cell_number"],
        limit_page_length=0,
    )
    return [r for r in rows if r.user_id]


def _team_employees(team=None):
    return [e.name for e in (team if team is not None else _team())]


def _scores(employees):
    if not employees or not frappe.db.exists("DocType", "Operator Score"):
        return {}
    return {
        s.employee: s for s in frappe.get_all(
            "Operator Score", filters={"employee": ["in", employees]},
            fields=["employee", "global_score as score", "rank"], limit_page_length=0,
        )
    }


def _mission_rows(users, extra_filters=None):
    if not users:
        return []
    filters = {FIELD["mo_user"]: ["in", users]}
    filters.update(extra_filters or {})
    return frappe.get_all(
        "Mission Operator", filters=filters,
        fields=["name", "parent", "parenttype", FIELD["mo_user"], FIELD["mo_checkin"],
                FIELD["mo_checkout"], FIELD["mo_out_flag"], FIELD["mo_hb_time"]],
        limit_page_length=0,
    )


def _tasks(names, fields=None):
    if not names:
        return {}
    res = {}
    if frappe.db.exists("DocType", "Mission"):
        for m in frappe.get_all(
            "Mission",
            filters={"name": ["in", list(set(names))]},
            fields=["name", "customer", "site_address", "site_lat", "site_lng", "scheduled_start", "scheduled_end", "mission_status"],
            limit_page_length=0,
        ):
            res[m.name] = frappe._dict(
                name=m.name,
                subject=f"{m.customer} — {m.site_address or m.name}",
                status=m.mission_status,
                exp_start_date=m.scheduled_start,
                exp_end_date=m.scheduled_end,
                expected_time=2.0,
                site=m.site_address or m.customer,
            )
    for t in frappe.get_all(
        "Task", filters={"name": ["in", list(set(names))]},
        fields=fields or ["name", "subject", "status", "exp_start_date",
                          "exp_end_date", "expected_time", "project",
                          FIELD["task_site"]],
        limit_page_length=0,
    ):
        if t.name not in res:
            res[t.name] = t
    return res


def _site_labels(sites):
    sites = [s for s in set(sites) if s]
    if not sites:
        return {}
    return {
        l.name: (l.location_name or l.name) for l in frappe.get_all(
            "Location", filters={"name": ["in", sites]},
            fields=["name", "location_name"], limit_page_length=0,
        )
    }


def _user_names(users):
    users = [u for u in set(users) if u]
    if not users:
        return {}
    return {
        u.name: (u.full_name or u.name) for u in frappe.get_all(
            "User", filters={"name": ["in", users]},
            fields=["name", "full_name"], limit_page_length=0,
        )
    }

def _employee_names(names):
    names = [n for n in set(names) if n]
    if not names:
        return {}
    return {
        e.name: (e.employee_name or e.name) for e in frappe.get_all(
            "Employee", filters={"name": ["in", names]},
            fields=["name", "employee_name"], limit_page_length=0,
        )
    }


def _operator_status(user, active_rows_by_user, today_pending_by_user):
    """mission / late / available / offline."""
    if user in active_rows_by_user:
        return "mission"
    pending = today_pending_by_user.get(user)
    if pending:
        start = pending.get("exp_start")
        if start:
            from frappe.utils import add_to_date
            if add_to_date(get_datetime(start), minutes=15) < now_datetime():
                return "late"
        return "available"
    return "offline"


def _today_window():
    d = getdate(now_datetime())
    return d, add_days(d, 1)


# ---------------------------------------------------------------------------
# Bootstrap — 1 appel au chargement
# ---------------------------------------------------------------------------
@frappe.whitelist()
def bootstrap():
    _require_supervisor()
    user = frappe.session.user
    emp = _my_employee()
    team = _team(emp)
    emps = _team_employees(team)
    scores = _scores([e.name for e in team])
    today, tomorrow = _today_window()

    # Lignes mission de l'équipe (aujourd'hui + actives)
    all_rows = _mission_rows(emps)
    active = [r for r in all_rows if r.get(FIELD["mo_checkin"]) and not r.get(FIELD["mo_checkout"])]
    active_by_user = {r.get(FIELD["mo_user"]): r for r in active}

    task_meta = _tasks([r.parent for r in all_rows])
    sites = _site_labels([t.get(FIELD["task_site"]) for t in task_meta.values()])
    names = _employee_names(emps)

    # Missions du jour + en-retard potentiels
    today_tasks, today_pending_by_user = {}, {}
    for r in all_rows:
        t = task_meta.get(r.parent)
        if not t or t.status in ("Cancelled", "Template"):
            continue
        start = t.exp_start_date
        if start and today <= getdate(start) < tomorrow:
            today_tasks[t.name] = t
            if not r.get(FIELD["mo_checkin"]):
                today_pending_by_user.setdefault(r.get(FIELD["mo_user"]), {
                    "task": t.name, "exp_start": start,
                })

    # KPI hier (delta missions)
    yesterday_count = 0
    for t in task_meta.values():
        if t.exp_start_date and getdate(t.exp_start_date) == add_days(today, -1):
            yesterday_count += 1

    # Statuts équipe
    team_cards, late_count = [], 0
    for e in team:
        st = _operator_status(e.name, active_by_user, today_pending_by_user)
        if st == "late":
            late_count += 1
        sc = scores.get(e.name)
        row = active_by_user.get(e.name)
        current = None
        if row:
            t = task_meta.get(row.parent)
            current = {
                "task": row.parent,
                "subject": t and t.subject,
                "site": t and sites.get(t.get(FIELD["task_site"])),
                "since": str(row.get(FIELD["mo_checkin"]) or ""),
                "heartbeat": str(row.get(FIELD["mo_hb_time"]) or ""),
            }
        team_cards.append({
            "employee": e.name, "user": e.user_id,
            "name": e.employee_name or names.get(e.name) or e.name,
            "designation": e.designation, "image": e.image,
            "phone": e.cell_number,
            "status": st, "score": sc and flt(sc.score), "rank": sc and sc.rank,
            "mission": current,
        })

    # Missions actives détaillées (anneaux de progression)
    active_missions = []
    for r in active:
        t = task_meta.get(r.parent)
        if not t:
            continue
        cin = get_datetime(r.get(FIELD["mo_checkin"]))
        elapsed = time_diff_in_seconds(now_datetime(), cin)
        expected_s = flt(t.expected_time or 0) * 3600
        progress = min(elapsed / expected_s, 1) if expected_s else None
        site_label = t.get("site") or sites.get(t.get(FIELD["task_site"])) or ""
        active_missions.append({
            "task": r.parent, "subject": t.subject,
            "site": site_label,
            "operator": names.get(r.get(FIELD["mo_user"]), r.get(FIELD["mo_user"])),
            "operator_user": frappe.db.get_value("Employee", r.get(FIELD["mo_user"]), "user_id") or r.get(FIELD["mo_user"]),
            "since": str(cin), "elapsed_s": cint(elapsed),
            "expected_s": cint(expected_s), "progress": progress,
            "heartbeat": str(r.get(FIELD["mo_hb_time"]) or ""),
        })

    # Alertes ouvertes (aperçu) + anomalies ouvertes
    alerts = alerts_feed(limit=5, _internal=True)
    open_anomalies = 0
    if frappe.db.exists("DocType", "Site Anomaly"):
        open_anomalies = frappe.db.count("Site Anomaly", {"status": "Ouverte"})

    team_scores = [flt(s.score) for s in scores.values() if s.score is not None]
    kpis = {
        "missions_today": len(today_tasks),
        "missions_yesterday": yesterday_count,
        "active": len(active),
        "team_size": len(team),
        "on_the_way": max(len(today_pending_by_user) - late_count, 0),
        "alerts": len([a for a in alerts if a.get("level") != "past"]),
        "critical": len([a for a in alerts if a.get("level") == "critical"]),
        "late": late_count,
        "open_anomalies": open_anomalies,
        "team_score": round(sum(team_scores) / len(team_scores), 1) if team_scores else None,
    }

    top = sorted(
        [c for c in team_cards if c["score"] is not None],
        key=lambda c: -c["score"]
    )[:5]

    return {
        "profile": {
            "user": user,
            "full_name": (emp and emp.employee_name)
                or frappe.db.get_value("User", user, "full_name") or user,
            "image": (emp and emp.image) or frappe.db.get_value("User", user, "user_image"),
            "designation": (emp and emp.designation) or "Superviseur",
        },
        "kpis": kpis,
        "team": team_cards,
        "active_missions": active_missions,
        "alerts_preview": alerts,
        "top": top,
    }


# ---------------------------------------------------------------------------
# Missions — aujourd'hui / semaine / passées
# ---------------------------------------------------------------------------
@frappe.whitelist()
def missions(scope="today"):
    _require_supervisor()
    emp = _my_employee()
    emps = _team_employees()
    rows = _mission_rows(emps)

    today, tomorrow = _today_window()
    names = _employee_names(emps)

    by_task = {}
    for r in rows:
        by_task.setdefault(r.parent, []).append(r)

    # Also find all Mission docs supervised by this supervisor
    sup_missions = {}
    if frappe.db.exists("DocType", "Mission"):
        filters = {"mission_status": ["not in", ["Annulée"]]}
        if emp:
            filters["supervisor"] = emp.name
        for m in frappe.get_all(
            "Mission",
            filters=filters,
            fields=["name", "customer", "site_address", "site_lat", "site_lng", "scheduled_start", "scheduled_end", "mission_status"],
            limit_page_length=0,
        ):
            sup_missions[m.name] = frappe._dict(
                name=m.name,
                subject=f"{m.customer} — {m.site_address or m.name}",
                status=m.mission_status,
                exp_start_date=m.scheduled_start,
                exp_end_date=m.scheduled_end,
                expected_time=2.0,
                site=m.site_address or m.customer,
            )

    all_task_ids = set(by_task.keys()) | set(sup_missions.keys())
    task_meta = _tasks(list(all_task_ids))
    task_meta.update(sup_missions)
    sites = _site_labels([t.get(FIELD["task_site"]) for t in task_meta.values() if t.get(FIELD["task_site"])])

    out = []
    for tname, t in task_meta.items():
        if not t or t.status in ("Cancelled", "Template"):
            continue
        start = t.exp_start_date and getdate(t.exp_start_date)
        if scope == "today" and not (start and today <= start < tomorrow):
            continue
        if scope == "week" and not (start and today <= start < add_days(today, 7)):
            continue
        if scope == "past" and not (start and start < today):
            continue

        trows = by_task.get(tname, [])
        checked_in = [r for r in trows if r.get(FIELD["mo_checkin"])]
        done = [r for r in trows if r.get(FIELD["mo_checkout"])]

        now = now_datetime()
        start_dt = get_datetime(t.exp_start_date) if t.exp_start_date else None
        end_dt = get_datetime(t.exp_end_date) if t.exp_end_date else None

        from frappe.utils import add_to_date

        if t.status in ("Terminée", "Completed") or (len(done) == len(trows) and trows):
            status = "done"
        elif checked_in and len(done) < len(trows):
            status = "ongoing"
        elif t.status in ("Annulée", "Cancelled"):
            status = "cancelled"
        elif end_dt and end_dt < now:
            status = "missed" if not checked_in else "done"
        elif start_dt and add_to_date(start_dt, minutes=15) < now:
            status = "late"
        else:
            status = "planned"

        out.append({
            "task": tname, "subject": t.subject,
            "site": t.get("site") or sites.get(t.get(FIELD["task_site"])) or "",
            "start": str(t.exp_start_date or ""), "end": str(t.exp_end_date or ""),
            "expected_h": flt(t.expected_time or 0),
            "status": status,
            "operators": [
                {"user": r.get(FIELD["mo_user"]),
                 "name": names.get(r.get(FIELD["mo_user"]), r.get(FIELD["mo_user"])),
                 "checked_in": bool(r.get(FIELD["mo_checkin"])),
                 "checked_out": bool(r.get(FIELD["mo_checkout"])),
                 "out_of_zone": cint(r.get(FIELD["mo_out_flag"]))}
                for r in trows
            ],
        })
    out.sort(key=lambda m: m["start"] or "9999", reverse=(scope == "past"))
    return out[:100]


# ---------------------------------------------------------------------------
# Alertes — fil combiné Mission Alert + anomalies + hors-zone
# ---------------------------------------------------------------------------
@frappe.whitelist()
def alerts_feed(limit=30, _internal=False):
    if not _internal:
        _require_supervisor()
    limit = min(cint(limit) or 30, 50)
    items = []

    if frappe.db.exists("DocType", "Site Anomaly"):
        for a in frappe.get_all(
            "Site Anomaly",
            fields=["name", "site", "anomaly_type", "severity", "status",
                    "reported_by", "description", "creation"],
            order_by="creation desc", limit_page_length=limit,
        ):
            level = ("critical" if a.severity == "Critique" and a.status == "Ouverte"
                     else "warning" if a.status == "Ouverte" else "past")
            items.append({
                "kind": "anomaly", "ref": a.name, "level": level,
                "title": _("Anomalie — {0}").format(a.anomaly_type),
                "detail": a.description or "",
                "site": a.site, "who": a.reported_by,
                "severity": a.severity, "status": a.status,
                "when": str(a.creation),
            })

    if frappe.db.exists("DocType", "Mission Alert"):
        meta_fields = {f.fieldname for f in frappe.get_meta("Mission Alert").fields}
        fields = ["name", "creation"] + [f for f in
                  ("alert_type", "details", "status", "operator", "task", "site")
                  if f in meta_fields]
        for a in frappe.get_all("Mission Alert", fields=fields,
                                order_by="creation desc", limit_page_length=limit):
            status = (a.get("status") or "").lower()
            level = "past" if status in ("resolved", "closed", "acquittée", "résolue") else "warning"
            items.append({
                "kind": "mission_alert", "ref": a.name, "level": level,
                "title": a.get("alert_type") or _("Alerte mission"),
                "detail": a.get("details") or "",
                "site": a.get("site"), "who": a.get("operator"),
                "status": a.get("status"), "when": str(a.creation),
            })

    items.sort(key=lambda i: i["when"], reverse=True)
    user_names_dict = _user_names([i["who"] for i in items if i.get("kind") == "anomaly"])
    emp_names_dict = _employee_names([i["who"] for i in items if i.get("kind") == "mission_alert"])
    sites = _site_labels([i["site"] for i in items])
    for i in items:
        if i.get("kind") == "anomaly":
            i["who_name"] = user_names_dict.get(i["who"], i["who"])
        else:
            i["who_name"] = emp_names_dict.get(i["who"], i["who"])
        i["site_label"] = sites.get(i["site"], i["site"])
        # téléphone pour l'action "Appeler"
        if i["who"]:
            if i.get("kind") == "anomaly":
                i["phone"] = frappe.db.get_value("Employee", {"user_id": i["who"]}, "cell_number")
            else:
                i["phone"] = frappe.db.get_value("Employee", i["who"], "cell_number")
    return items[:limit]


@frappe.whitelist()
def acknowledge_alert(kind, ref):
    _require_supervisor()
    if kind == "mission_alert" and frappe.db.exists("Mission Alert", ref):
        meta_fields = {f.fieldname for f in frappe.get_meta("Mission Alert").fields}
        if "status" in meta_fields:
            frappe.db.set_value("Mission Alert", ref, "status", "Resolved",
                                update_modified=False)
            return {"ok": True}
    frappe.throw(_("Impossible d'acquitter cette alerte."))


# ---------------------------------------------------------------------------
# Anomalies — valider / rejeter
# ---------------------------------------------------------------------------
@frappe.whitelist()
def anomalies(status=None, limit=30):
    _require_supervisor()
    filters = {}
    if status:
        filters["status"] = status
    rows = frappe.get_all(
        "Site Anomaly", filters=filters,
        fields=["name", "site", "task", "anomaly_type", "severity", "status",
                "reported_by", "description", "latitude", "longitude", "creation"],
        order_by="creation desc", limit_page_length=min(cint(limit) or 30, 50),
    )
    names = _user_names([r.reported_by for r in rows])
    sites = _site_labels([r.site for r in rows])
    photos = {}
    if rows:
        for f in frappe.get_all(
            "File",
            filters={"attached_to_doctype": "Site Anomaly",
                     "attached_to_name": ["in", [r.name for r in rows]]},
            fields=["attached_to_name", "file_url"], limit_page_length=0,
        ):
            photos.setdefault(f.attached_to_name, []).append(f.file_url)
    for r in rows:
        r["who_name"] = names.get(r.reported_by, r.reported_by)
        r["site_label"] = sites.get(r.site, r.site)
        r["photos"] = photos.get(r.name, [])
    return rows


@frappe.whitelist()
def review_anomaly(name, action):
    """action: 'validate' -> En cours ; 'resolve' -> Résolue ; 'reject' -> Résolue (rejetée)."""
    _require_supervisor()
    doc = frappe.get_doc("Site Anomaly", name)
    if action == "validate":
        doc.status = "En cours"
    elif action in ("resolve", "reject"):
        doc.status = "Résolue"
    else:
        frappe.throw(_("Action inconnue"))
    if action == "reject":
        doc.description = (doc.description or "") + _("\n[Rejetée par {0}]").format(
            frappe.session.user)
    doc.save(ignore_permissions=True)

    # informer l'opérateur
    label = {"validate": _("prise en charge"), "resolve": _("résolue"),
             "reject": _("rejetée")}[action]
    try:
        frappe.get_doc({
            "doctype": "Notification Log",
            "for_user": doc.reported_by,
            "type": "Alert",
            "subject": _("Votre anomalie {0} a été {1}").format(name, label),
            "document_type": "Site Anomaly", "document_name": name,
        }).insert(ignore_permissions=True)
    except Exception:
        pass
    return {"ok": True, "status": doc.status}


# ---------------------------------------------------------------------------
# Classement
# ---------------------------------------------------------------------------
@frappe.whitelist()
def ranking():
    _require_supervisor()
    team = _team()
    scores = _scores([e.name for e in team])
    rows = []
    for e in team:
        s = scores.get(e.name)
        rows.append({
            "employee": e.name, "name": e.employee_name,
            "designation": e.designation, "image": e.image,
            "score": s and flt(s.score), "rank": s and s.rank,
        })
    rows.sort(key=lambda r: (r["score"] is None, -(r["score"] or 0)))
    for i, r in enumerate(rows, 1):
        r["position"] = i
    return rows


# ---------------------------------------------------------------------------
# Monitoring temps réel (admin dashboard)
# ---------------------------------------------------------------------------
@frappe.whitelist()
def live_monitoring():
    """Retourne les positions GPS en temps réel de tous les opérateurs actifs.
    Accessible par System Manager et NetPlus Supervisor."""
    if frappe.session.user == "Guest":
        frappe.throw(_("Connexion requise"), frappe.AuthenticationError)
    roles = set(frappe.get_roles())
    if not ({"System Manager", "Administrator", ROLE_SUPERVISOR} & roles):
        frappe.throw(_("Accès refusé"), frappe.PermissionError)

    # All active Mission Operator rows (checked in, not checked out)
    active_rows = frappe.get_all(
        "Mission Operator",
        filters={
            FIELD["mo_checkin"]: ["is", "set"],
            FIELD["mo_checkout"]: ["is", "not set"],
        },
        fields=[
            "name", "parent", "parenttype",
            FIELD["mo_user"], FIELD["mo_checkin"],
            FIELD["mo_hb_time"], FIELD["mo_hb_lat"], FIELD["mo_hb_lng"],
            FIELD["mo_out_flag"],
        ],
        limit_page_length=0,
    )

    if not active_rows:
        return {"operators": [], "supervisors": [], "sites": [], "timestamp": now_datetime().isoformat()}

    # Resolve mission/task details
    mission_names = list({r.parent for r in active_rows})
    task_meta = _tasks(mission_names)

    # Resolve employee info
    emp_names = list({r.get(FIELD["mo_user"]) for r in active_rows})
    emps = {e.name: e for e in frappe.get_all(
        "Employee", filters={"name": ["in", emp_names]},
        fields=["name", "employee_name", "user_id", "image", "designation"],
        limit_page_length=0,
    )} if emp_names else {}

    # Resolve supervisor info
    sup_rows = frappe.get_all(
        "Employee",
        filters={"status": "Active"},
        fields=["name", "employee_name", "user_id", "image", "designation", "reports_to"],
        limit_page_length=0,
    )
    # Map which supervisors are linked to which operators
    supervisor_map = {}
    for emp in sup_rows:
        if emp.user_id:
            sup_roles = set(frappe.get_roles(emp.user_id))
            if ROLE_SUPERVISOR in sup_roles:
                supervisor_map[emp.name] = emp

    # Collect unique site identifiers and resolve GPS coords
    site_keys = []
    for r in active_rows:
        t = task_meta.get(r.parent)
        if t:
            site_keys.append(r.parent)

    operators = []
    sites_seen = {}

    for r in active_rows:
        t = task_meta.get(r.parent)
        emp = emps.get(r.get(FIELD["mo_user"]))
        emp_name = emp.employee_name if emp else r.get(FIELD["mo_user"])
        emp_img = emp.image if emp else None

        lat = r.get(FIELD["mo_hb_lat"])
        lng = r.get(FIELD["mo_hb_lng"])

        site_lat = site_lng = None
        site_label = site_radius = None
        if t and hasattr(t, "__getitem__") or hasattr(t, "get"):
            try:
                raw = frappe.db.get_value("Mission", r.parent,
                    ["site_lat", "site_lng", "site_address", "geofence_radius_meters"], as_dict=True)
                if raw:
                    site_lat = raw.get("site_lat")
                    site_lng = raw.get("site_lng")
                    site_label = raw.get("site_address") or (t.get("site") if t else None)
                    site_radius = raw.get("geofence_radius_meters") or 100
            except Exception:
                pass

        # Compute distance from site if both GPS and site coords available
        distance_m = None
        if lat and lng and site_lat and site_lng:
            from math import sin, cos, sqrt, atan2, radians
            R = 6371000
            dlat = radians(float(site_lat) - float(lat))
            dlng = radians(float(site_lng) - float(lng))
            a = sin(dlat/2)**2 + cos(radians(float(lat))) * cos(radians(float(site_lat))) * sin(dlng/2)**2
            distance_m = round(R * 2 * atan2(sqrt(a), sqrt(1-a)), 1)

        in_zone = distance_m is not None and site_radius is not None and distance_m <= float(site_radius)

        # Heartbeat age in minutes
        hb_age_min = None
        hb_time = r.get(FIELD["mo_hb_time"])
        if hb_time:
            hb_age_min = round(time_diff_in_seconds(now_datetime(), get_datetime(hb_time)) / 60, 1)

        operators.append({
            "row_id": r.name,
            "mission": r.parent,
            "employee": r.get(FIELD["mo_user"]),
            "name": emp_name,
            "image": emp_img,
            "designation": emp.designation if emp else None,
            "check_in_time": str(r.get(FIELD["mo_checkin"])) if r.get(FIELD["mo_checkin"]) else None,
            "lat": float(lat) if lat else None,
            "lng": float(lng) if lng else None,
            "last_heartbeat": str(hb_time) if hb_time else None,
            "heartbeat_age_min": hb_age_min,
            "out_of_zone": bool(r.get(FIELD["mo_out_flag"])),
            "in_zone": in_zone,
            "distance_m": distance_m,
            "site_label": site_label or (t.get("site") if t else "Site inconnu"),
            "site_lat": float(site_lat) if site_lat else None,
            "site_lng": float(site_lng) if site_lng else None,
            "site_radius": float(site_radius) if site_radius else 100,
            "subject": t.get("subject") if t else r.parent,
        })

        # Collect unique sites for map markers
        if site_lat and site_lng and r.parent not in sites_seen:
            sites_seen[r.parent] = {
                "mission": r.parent,
                "label": site_label or "Site",
                "lat": float(site_lat),
                "lng": float(site_lng),
                "radius": float(site_radius) if site_radius else 100,
            }

    # Supervisors — just their profiles (not GPS tracked actively here)
    supervisors = []
    for emp in sup_rows:
        if emp.user_id:
            sup_roles = set(frappe.get_roles(emp.user_id))
            if ROLE_SUPERVISOR in sup_roles:
                supervisors.append({
                    "employee": emp.name,
                    "name": emp.employee_name,
                    "image": emp.image,
                    "designation": emp.designation,
                    "user_id": emp.user_id,
                })

    return {
        "operators": operators,
        "supervisors": supervisors,
        "sites": list(sites_seen.values()),
        "timestamp": now_datetime().isoformat(),
    }

