"""Whitelisted API consumed by the portal (/portal), the operator PWA
(/netplus-pwa) and the guest feedback page (/feedback).

Security model:
  - every method derives identity from frappe.session.user (never from a
    role string sent by the client);
  - geofencing is ALWAYS recomputed server-side (utils/geo.py);
  - guest endpoints exist only for the tokenized feedback flow and the
    contract QR verification, and validate their token server-side.
"""

import json
import secrets

import frappe
from frappe.utils import (add_to_date, get_datetime, get_url, now_datetime,
                          time_diff_in_seconds)

from netplus.utils.geo import haversine_m, validate_geofence


# =========================================================== session / role
@frappe.whitelist()
def get_session_info():
    """Called by the frontends on mount to decide which dashboard to show."""
    user = frappe.session.user
    roles = set(frappe.get_roles(user))
    employee = frappe.db.get_value(
        "Employee", {"user_id": user}, ["name", "employee_name", "reports_to"],
        as_dict=True)
    customer = _customer_for_user(user)
    role = ("admin" if "System Manager" in roles else
            "supervisor" if "NetPlus Supervisor" in roles else
            "operator" if "NetPlus Operator" in roles else
            "client" if "NetPlus Client" in roles else "none")
    return {"user": user, "role": role,
            "full_name": frappe.db.get_value("User", user, "full_name"),
            "employee": employee, "customer": customer}


def _customer_for_user(user):
    contact = frappe.db.get_value("Contact", {"user": user}, "name")
    if not contact:
        return None
    return frappe.db.get_value(
        "Dynamic Link",
        {"parenttype": "Contact", "parent": contact, "link_doctype": "Customer"},
        "link_name")


def _my_employee(required=True):
    emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not emp and required:
        frappe.throw("Aucune fiche Employé liée à cet utilisateur.")
    return emp


def _team_of(supervisor_employee):
    """Supervisor->operator relation = native Employee.reports_to."""
    return frappe.get_all(
        "Employee",
        filters={"reports_to": supervisor_employee, "status": "Active"},
        pluck="name")


# ========================================================== dashboard reads
@frappe.whitelist()
def get_dashboard_data():
    """Single endpoint, role-filtered server-side."""
    info = get_session_info()
    if info["role"] == "supervisor":
        return _supervisor_dashboard(info)
    if info["role"] == "client":
        return _client_dashboard(info)
    if info["role"] == "operator":
        return _operator_dashboard(info)
    if info["role"] == "admin":
        return _admin_dashboard(info)
    frappe.throw("Accès refusé.", frappe.PermissionError)


def _supervisor_dashboard(info):
    team = _team_of(info["employee"]["name"]) if info["employee"] else []
    missions = _missions_for_operators(team)
    return {
        "team": frappe.get_all(
            "Employee", filters={"name": ["in", team or [""]]},
            fields=["name", "employee_name", "cell_number"]),
        "missions": missions,
        "alerts": frappe.get_all(
            "Mission Alert",
            filters={"operator": ["in", team or [""]],
                     "status": ["in", ["Ouverte", "Escaladée"]]},
            fields=["name", "task", "operator", "level", "status",
                    "delay_minutes", "message", "creation"],
            order_by="creation desc"),
        "scores": frappe.get_all(
            "Operator Score", filters={"employee": ["in", team or [""]]},
            fields=["employee", "avg_stars", "quality_score",
                    "punctuality_score", "completion_score", "penalties",
                    "global_score", "rank", "missions_count"],
            order_by="global_score desc"),
        "contracts": frappe.get_all(
            "Service Contract",
            filters={"supervisor": info["employee"]["name"]},
            fields=["name", "customer", "status", "effective_date",
                    "expiration_date", "frequency", "rate_per_intervention"]),
    }


def _client_dashboard(info):
    customer = info["customer"]
    if not customer:
        frappe.throw("Aucun client lié à cet utilisateur.")
    missions = frappe.get_all(
        "Task", filters={"customer": customer},
        fields=["name", "subject", "mission_status", "scheduled_start",
                "site", "feedback_status", "feedback_token"],
        order_by="scheduled_start desc", limit_page_length=50)
    feedbacks = frappe.get_all(
        "Quality Feedback",
        filters={"task": ["in", [m.name for m in missions] or [""]],
                 "docstatus": 1},
        fields=["task", "overall_rating", "np_comment", "np_categories",
                "recommend", "creation", "editable_until"])
    # 6-month satisfaction trend (report §4.3)
    trend = frappe.db.sql("""
        SELECT DATE_FORMAT(qf.creation, '%%Y-%%m') AS month,
               AVG(qf.overall_rating) AS avg_rating, COUNT(*) AS n
        FROM `tabQuality Feedback` qf
        JOIN `tabTask` t ON t.name = qf.task
        WHERE t.customer = %s AND qf.docstatus = 1
          AND qf.creation >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
        GROUP BY month ORDER BY month
    """, (customer,), as_dict=True)
    return {"customer": customer, "missions": missions,
            "feedbacks": feedbacks, "trend": trend,
            "contracts": frappe.get_all(
                "Service Contract", filters={"customer": customer},
                fields=["name", "status", "effective_date", "expiration_date",
                        "frequency", "service_type"])}


def _operator_dashboard(info):
    emp = info["employee"]["name"]
    return {"missions": _missions_for_operators([emp], today_only=True),
            "score": frappe.db.get_value(
                "Operator Score", {"employee": emp},
                ["avg_stars", "quality_score", "punctuality_score",
                 "completion_score", "penalties", "global_score", "rank",
                 "missions_count"], as_dict=True)}


def _admin_dashboard(info):
    return {
        "missions": frappe.get_all(
            "Task", filters={"mission_status": ["!=", ""]},
            fields=["name", "subject", "mission_status", "customer",
                    "scheduled_start"],
            order_by="scheduled_start desc", limit_page_length=100),
        "alerts": frappe.get_all(
            "Mission Alert", filters={"status": ["in", ["Ouverte", "Escaladée"]]},
            fields=["name", "task", "operator", "level", "delay_minutes",
                    "message", "creation"]),
        "scores": frappe.get_all(
            "Operator Score", fields=["employee", "global_score", "rank",
                                      "avg_stars", "missions_count"],
            order_by="global_score desc"),
        "nps": _company_nps(),
    }


def _missions_for_operators(employees, today_only=False):
    if not employees:
        return []
    filters = [["Mission Operator", "employee", "in", employees]]
    if today_only:
        filters.append(["Task", "scheduled_start", "between",
                        [frappe.utils.nowdate(),
                         add_to_date(frappe.utils.nowdate(), days=1)]])
    tasks = frappe.get_all(
        "Task", filters=filters,
        fields=["name", "subject", "mission_status", "customer", "site",
                "scheduled_start", "scheduled_end", "mission_type", "team_mode"],
        order_by="scheduled_start asc")
    for t in tasks:
        if t.site:
            t.update(frappe.db.get_value(
                "Location", t.site,
                ["latitude", "longitude", "geofence_radius", "site_address",
                 "site_instructions"], as_dict=True) or {})
        t["operators"] = frappe.get_all(
            "Mission Operator", filters={"parent": t.name},
            fields=["employee", "employee_name", "is_lead", "check_in",
                    "check_out", "last_heartbeat", "punctuality"])
    return tasks


def _company_nps():
    row = frappe.db.sql("""
        SELECT SUM(recommend = 1) AS promoters, COUNT(*) AS total
        FROM `tabQuality Feedback` WHERE docstatus = 1
    """, as_dict=True)[0]
    if not row.total:
        return 0
    return round((row.promoters / row.total) * 100 - ((row.total - row.promoters) / row.total) * 100)


# ====================================================== pointage (operator)
@frappe.whitelist()
def check_in(task, lat, lng, accuracy, device_info=None):
    """Geofenced check-in. Algorithm (report §3.1 steps 2-4):
    1. caller must be an operator assigned to this mission;
    2. server recomputes accuracy + haversine vs the site (NEVER trusts the
       client's 'inside geofence' claim);
    3. writes timestamp + coords on the Mission Operator row;
    4. derives the punctuality flag from scheduled_start;
    5. mission goes 'En cours'.
    """
    emp = _my_employee()
    row = _operator_row(task, emp)
    if row.check_in:
        frappe.throw("Check-in déjà effectué pour cette mission.")

    site = frappe.db.get_value("Task", task, "site")
    distance = validate_geofence(site, lat, lng, accuracy)

    now = now_datetime()
    scheduled = get_datetime(frappe.db.get_value("Task", task, "scheduled_start"))
    delay_min = max(0, (now - scheduled).total_seconds() / 60)
    punctuality = ("À l'heure" if delay_min <= 5 else
                   "Retard 5-15" if delay_min <= 15 else
                   "Retard 15-30" if delay_min <= 30 else "Retard >30")

    frappe.db.set_value("Mission Operator", row.name, {
        "check_in": now, "checkin_lat": lat, "checkin_lng": lng,
        "checkin_accuracy": accuracy, "checkin_distance_m": round(distance),
        "device_info": (device_info or "")[:140],
        "last_heartbeat": now, "punctuality": punctuality})
    frappe.db.set_value("Task", task, "mission_status", "En cours")
    _resolve_open_alerts(task, emp)
    return {"ok": True, "distance_m": round(distance),
            "punctuality": punctuality, "time": str(now)}


@frappe.whitelist()
def heartbeat(task, lat=None, lng=None):
    """Every 5 min from the PWA — presence proof during the mission."""
    emp = _my_employee()
    row = _operator_row(task, emp)
    frappe.db.set_value("Mission Operator", row.name,
                        "last_heartbeat", now_datetime())
    return {"ok": True}


@frappe.whitelist()
def check_out(task, lat, lng, accuracy, notes=None):
    """Geofenced check-out; when the LAST team member checks out the mission
    becomes 'Terminée' and the 72h feedback magic-link is generated and
    emailed to the client (report §4.2)."""
    emp = _my_employee()
    row = _operator_row(task, emp)
    if not row.check_in:
        frappe.throw("Check-in manquant.")
    if row.check_out:
        frappe.throw("Check-out déjà effectué.")

    site = frappe.db.get_value("Task", task, "site")
    distance = validate_geofence(site, lat, lng, accuracy)
    now = now_datetime()
    frappe.db.set_value("Mission Operator", row.name, {
        "check_out": now, "checkout_lat": lat, "checkout_lng": lng,
        "checkout_accuracy": accuracy, "checkout_distance_m": round(distance)})

    remaining = frappe.db.count("Mission Operator", {
        "parent": task, "check_out": ["is", "not set"]})
    if remaining == 0:
        frappe.db.set_value("Task", task, "mission_status", "Terminée")
        _issue_feedback_token(task)
    duration_s = time_diff_in_seconds(now, row.check_in)
    return {"ok": True, "duration_minutes": round(duration_s / 60),
            "mission_done": remaining == 0}


def _operator_row(task, employee):
    name = frappe.db.get_value(
        "Mission Operator", {"parent": task, "employee": employee},
        ["name", "check_in", "check_out"], as_dict=True)
    if not name:
        frappe.throw("Vous n'êtes pas assigné à cette mission.",
                     frappe.PermissionError)
    return name


def _resolve_open_alerts(task, employee):
    for a in frappe.get_all("Mission Alert",
                            {"task": task, "operator": employee,
                             "status": ["in", ["Ouverte", "Escaladée"]]},
                            pluck="name"):
        frappe.db.set_value("Mission Alert", a, "status", "Résolue")


def _issue_feedback_token(task):
    settings = frappe.get_cached_doc("NetPlus Settings")
    token = secrets.token_urlsafe(32)
    expiry = add_to_date(now_datetime(),
                         hours=settings.feedback_token_ttl_hours or 72)
    frappe.db.set_value("Task", task, {
        "feedback_token": token, "feedback_token_expiry": expiry,
        "feedback_status": "En attente"})
    customer = frappe.db.get_value("Task", task, "customer")
    email = customer and frappe.db.get_value("Customer", customer, "email_id")
    if email:
        url = get_url(f"/feedback?token={token}")
        frappe.sendmail(
            recipients=[email],
            subject="Votre avis sur l'intervention NetPlus",
            message=(f"L'intervention est terminée. Évaluez-la ici "
                     f"(lien valable 72h): <a href='{url}'>{url}</a>"))


# ============================================================ feedback flow
@frappe.whitelist(allow_guest=True)
def resolve_feedback_token(token):
    """Guest endpoint: magic-link -> mission context for the feedback form."""
    task = _task_for_token(token)
    t = frappe.db.get_value(
        "Task", task, ["name", "subject", "scheduled_start", "customer"],
        as_dict=True)
    t["categories"] = ["Propreté générale", "Détail des surfaces",
                       "Ponctualité", "Professionnalisme",
                       "Respect des consignes", "Autre"]
    return t


@frappe.whitelist(allow_guest=True)
def submit_feedback(token, rating, comment=None, categories=None,
                    recommend=0):
    """Creates the Quality Feedback. Server-side moderation + uniqueness.
    Note: also callable by a logged-in NetPlus Client from the portal."""
    task = _task_for_token(token)
    rating = int(rating)
    if not 1 <= rating <= 5:
        frappe.throw("Note invalide (1-5).")
    if frappe.db.exists("Quality Feedback", {"task": task}):
        frappe.throw("Un feedback existe déjà pour cette mission.")

    comment = (comment or "")[:1000]
    banned = (frappe.db.get_single_value("NetPlus Settings", "banned_words")
              or "").splitlines()
    for w in banned:
        if w.strip() and w.strip().lower() in comment.lower():
            frappe.throw("Le commentaire contient un terme non autorisé.")

    settings = frappe.get_cached_doc("NetPlus Settings")
    template = frappe.db.get_value(
        "Quality Feedback Template", {"template": "Prestation Nettoyage"})
    doc = frappe.get_doc({
        "doctype": "Quality Feedback",
        "template": template,
        "document_type": "User",
        "document_name": frappe.session.user,
        "task": task,
        "overall_rating": rating,
        "np_comment": comment,
        "np_categories": json.dumps(categories or []),
        "recommend": int(recommend),
        "editable_until": add_to_date(
            now_datetime(), hours=settings.feedback_edit_window_hours or 24),
        "parameters": [{"parameter": p, "rating": rating}
                       for p in resolve_feedback_token.__wrapped__(token)["categories"][:5]]
        if False else [],
    })
    doc.flags.ignore_permissions = True
    doc.insert()
    doc.submit()
    frappe.db.set_value("Task", task, "feedback_status", "Soumis")
    return {"ok": True, "message": "Merci pour votre retour !"
            if rating >= 4 else "Merci — désolés de ne pas avoir été à la hauteur."}


def _task_for_token(token):
    if not token:
        frappe.throw("Token manquant.")
    task = frappe.db.get_value("Task", {"feedback_token": token}, "name")
    if not task:
        frappe.throw("Lien invalide ou expiré.")
    expiry = frappe.db.get_value("Task", task, "feedback_token_expiry")
    if expiry and get_datetime(expiry) < now_datetime():
        frappe.throw("Ce lien d'évaluation a expiré (72h).")
    return task


# ========================================================== alerts / scores
@frappe.whitelist()
def acknowledge_alert(alert, justification=None):
    """Supervisor acknowledges (snooze with justification, report §3.2)."""
    doc = frappe.get_doc("Mission Alert", alert)
    sup = _my_employee()
    operator_sup = frappe.db.get_value("Employee", doc.operator, "reports_to")
    if operator_sup != sup and "System Manager" not in frappe.get_roles():
        frappe.throw("Cette alerte ne concerne pas votre équipe.",
                     frappe.PermissionError)
    doc.status = "Acquittée"
    doc.justification = justification
    doc.acknowledged_by = frappe.session.user
    doc.acknowledged_at = now_datetime()
    doc.flags.ignore_permissions = True
    doc.save()
    return {"ok": True}


# ================================================= contracts (supervisor)
@frappe.whitelist()
def generate_missions_from_contract(contract, from_date, to_date,
                                    days_of_week=None):
    """Expands a Service Contract into Task missions over a date range.
    days_of_week: JSON list like ["Monday","Friday"] — overrides the
    contract's own schedule (the 'personalised' generation the supervisor
    fills on the contract page)."""
    doc = frappe.get_doc("Service Contract", contract)
    sup = _my_employee(required=False)
    if doc.supervisor != sup and "System Manager" not in frappe.get_roles():
        frappe.throw("Ce contrat n'est pas le vôtre.", frappe.PermissionError)

    days = json.loads(days_of_week) if days_of_week else (
        (doc.days_of_week or "").split(",") if doc.days_of_week else [])
    days = [d.strip() for d in days if d.strip()]

    created = []
    d = get_datetime(from_date).date()
    end = get_datetime(to_date).date()
    while d <= end:
        if not days or d.strftime("%A") in days:
            start = f"{d} {doc.scheduled_start_time or '09:00:00'}"
            task = frappe.get_doc({
                "doctype": "Task", "subject":
                    f"{doc.service_type or 'Nettoyage'} — {doc.customer} — {d}",
                "mission_status": "Planifiée",
                "customer": doc.customer, "site": doc.site,
                "service_contract": doc.name,
                "scheduled_start": start,
                "scheduled_end": add_to_date(
                    get_datetime(start),
                    hours=doc.estimated_duration_hours or 4),
                "team_mode": doc.team_mode or "Solo",
            })
            task.flags.ignore_permissions = True
            task.insert()
            created.append(task.name)
        d = add_to_date(d, days=1)
    return {"ok": True, "created": created, "count": len(created)}


@frappe.whitelist(allow_guest=True)
def verify_contract(payload):
    """QR verification: payload is the JSON embedded in the contract QR
    ({contract_id, client_id, effective_date}). Returns validity + status."""
    try:
        data = json.loads(payload)
    except Exception:
        return {"valid": False, "reason": "QR illisible"}
    doc_name = data.get("contract_id")
    if not doc_name or not frappe.db.exists("Service Contract", doc_name):
        return {"valid": False, "reason": "Contrat inconnu"}
    doc = frappe.db.get_value(
        "Service Contract", doc_name,
        ["customer", "status", "effective_date", "expiration_date"],
        as_dict=True)
    matches = (str(data.get("client_id")) == str(doc.customer)
               and str(data.get("effective_date")) == str(doc.effective_date))
    return {"valid": bool(matches and doc.status == "Active"),
            "status": doc.status, "customer": doc.customer,
            "effective_date": str(doc.effective_date),
            "expiration_date": str(doc.expiration_date)}
