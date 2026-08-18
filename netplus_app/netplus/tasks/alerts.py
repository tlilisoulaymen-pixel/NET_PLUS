"""Alert engine — executive report §3.2, runs from the Frappe scheduler.

Tiers (delay = now - scheduled_start, no check-in yet):
    5-15 min   AVERTISSEMENT  -> operator only
    15-30 min  ALERTE         -> operator + supervisor
    >30 min    CRITIQUE       -> operator + supervisor + admins,
                                 mission_status = 'En retard critique'
Escalation: an alert not acknowledged within N minutes (default 10) is
escalated one level up. Heartbeat watchdog: an in-progress operator silent
for more than the grace period triggers a supervisor alert.
"""

import json
import secrets

import frappe
from frappe.utils import add_days, add_to_date, get_datetime, now_datetime

LEVELS = ["Avertissement", "Alerte", "Critique"]


def scan_lateness():
    s = frappe.get_cached_doc("NetPlus Settings")
    now = now_datetime()

    missions = frappe.get_all(
        "Task",
        filters={"mission_status": ["in", ["Planifiée", "En retard critique"]],
                 "scheduled_start": ["<", now]},
        fields=["name", "subject", "scheduled_start", "mission_status"])

    for m in missions:
        delay_min = (now - get_datetime(m.scheduled_start)).total_seconds() / 60
        for op in frappe.get_all(
                "Mission Operator", {"parent": m.name, "check_in": ["is", "not set"]},
                fields=["employee"]):
            level = _tier(delay_min, s)
            if not level:
                continue
            _raise_alert(m, op.employee, level, int(delay_min), s)
        if delay_min > (s.critical_threshold_minutes or 30) and m.mission_status != "En retard critique":
            frappe.db.set_value("Task", m.name, "mission_status", "En retard critique")

    _escalate_stale_alerts(s)
    frappe.db.commit()


def _tier(delay_min, s):
    if delay_min > (s.critical_threshold_minutes or 30):
        return "Critique"
    if delay_min > (s.alert_threshold_minutes or 15):
        return "Alerte"
    if delay_min > (s.warning_threshold_minutes or 5):
        return "Avertissement"
    return None


def _raise_alert(mission, employee, level, delay_min, settings):
    # idempotent: one open alert per (task, operator, level)
    if frappe.db.exists("Mission Alert", {
            "task": mission.name, "operator": employee,
            "level": level, "status": ["in", ["Ouverte", "Escaladée"]]}):
        return
    alert = frappe.get_doc({
        "doctype": "Mission Alert",
        "task": mission.name,
        "operator": employee,
        "level": level,
        "status": "Ouverte",
        "delay_minutes": delay_min,
        "message": f"Retard de {delay_min} min sur « {mission.subject} »",
    }).insert(ignore_permissions=True)
    _notify(alert, mission)


def _notify(alert, mission):
    """Recipients per tier (report matrix). Email is native; push (FCM) and
    SMS hook points are marked for the Google-stack integration."""
    recipients = []
    op_user = frappe.db.get_value("Employee", alert.operator, "user_id")
    if op_user:
        recipients.append(op_user)                       # all tiers
    if alert.level in ("Alerte", "Critique"):
        sup = frappe.db.get_value("Employee", alert.operator, "reports_to")
        sup_user = sup and frappe.db.get_value("Employee", sup, "user_id")
        if sup_user:
            recipients.append(sup_user)
    if alert.level == "Critique":
        from netplus.utils.scoring import _admin_emails
        recipients += _admin_emails()
        # TODO integration: send SMS here (Twilio / SMS Settings gateway)

    if recipients:
        frappe.sendmail(
            recipients=list(set(recipients)),
            subject=f"[{alert.level.upper()}] {alert.message}",
            message=alert.message)
    # TODO integration: FCM push — see INTEGRATION.md §4
    frappe.publish_realtime("netplus_alert", alert.as_dict())


def _escalate_stale_alerts(settings):
    limit = add_to_date(now_datetime(),
                        minutes=-(getattr(settings, 'escalation_threshold_minutes', None) or 10))
    stale = frappe.get_all(
        "Mission Alert",
        filters={"status": "Ouverte", "creation": ["<", limit]},
        fields=["name", "level", "task", "operator", "message"])
    for a in stale:
        idx = LEVELS.index(a.level)
        if idx < len(LEVELS) - 1:
            frappe.db.set_value("Mission Alert", a.name, {
                "level": LEVELS[idx + 1], "status": "Escaladée"})


def heartbeat_watchdog():
    """In-progress mission + operator silent > grace period -> supervisor alert."""
    s = frappe.get_cached_doc("NetPlus Settings")
    limit = add_to_date(now_datetime(),
                        minutes=-(s.heartbeat_timeout_minutes or 15))
    rows = frappe.db.sql("""
        SELECT mo.parent AS task, mo.employee, t.subject
        FROM `tabMission Operator` mo
        JOIN `tabTask` t ON t.name = mo.parent
        WHERE t.mission_status = 'En cours'
          AND mo.check_in IS NOT NULL AND mo.check_out IS NULL
          AND (mo.last_heartbeat IS NULL OR mo.last_heartbeat < %s)
    """, (limit,), as_dict=True)
    for r in rows:
        _raise_alert(frappe._dict(name=r.task, subject=r.subject),
                     r.employee, "Alerte", 0, s)
    frappe.db.commit()


# ------------------------------------------------------------- feedback jobs
def expire_feedback_tokens():
    frappe.db.sql("""
        UPDATE `tabTask`
        SET feedback_status = 'Expiré', feedback_token = NULL
        WHERE feedback_token IS NOT NULL
          AND feedback_token_expiry < NOW()
          AND feedback_status = 'En attente'
    """)
    frappe.db.commit()


def send_feedback_reminders():
    """24h after check-out with no feedback -> one reminder to the client."""
    rows = frappe.get_all(
        "Task",
        filters={"feedback_status": "En attente",
                 "feedback_token": ["is", "set"]},
        fields=["name", "subject", "customer", "feedback_token",
                "feedback_token_expiry", "modified"])
    for t in rows:
        hours_left = (get_datetime(t.feedback_token_expiry)
                      - now_datetime()).total_seconds() / 3600
        if not (40 <= hours_left <= 50):      # ~24h after send (72h TTL)
            continue
        email = frappe.db.get_value(
            "Customer", t.customer, "email_id") if t.customer else None
        if email:
            url = frappe.utils.get_url(f"/feedback?token={t.feedback_token}")
            frappe.sendmail(
                recipients=[email],
                subject=f"Rappel — votre avis sur « {t.subject} »",
                message=f"Votre lien d'évaluation expire bientôt: <a href='{url}'>{url}</a>")


def purge_old_gps_data():
    """Loi 25 / PIPEDA: strip GPS coordinates older than the retention window."""
    days = frappe.db.get_single_value("NetPlus Settings", "gps_data_retention_days") or 90
    cutoff = add_days(now_datetime(), -days)
    frappe.db.sql("""
        UPDATE `tabMission Operator` mo
        JOIN `tabTask` t ON t.name = mo.parent
        SET mo.checkin_lat = NULL, mo.checkin_lng = NULL,
            mo.checkout_lat = NULL, mo.checkout_lng = NULL
        WHERE t.scheduled_start < %s
    """, (cutoff,))
    frappe.db.commit()
