"""Notification utilities — email, push (FCM), SMS (Twilio)."""

from __future__ import annotations

import frappe
from frappe.utils import now_datetime


def get_settings():
    return frappe.get_single("NetPlus Settings")


# ─────────────────────────────────────────────
# Email
# ─────────────────────────────────────────────

def send_email(recipients: list[str], subject: str, message: str, reference_doctype: str = None, reference_name: str = None):
    """Send an email via Frappe's built-in email system."""
    if not recipients:
        return
    frappe.sendmail(
        recipients=recipients,
        subject=subject,
        message=message,
        reference_doctype=reference_doctype,
        reference_name=reference_name,
        now=True,
    )


# ─────────────────────────────────────────────
# FCM Push Notifications
# ─────────────────────────────────────────────

def send_fcm_push(fcm_token: str, title: str, body: str, data: dict = None):
    """Send FCM push notification to an operator's device."""
    try:
        import requests

        settings = get_settings()
        server_key = settings.fcm_server_key
        if not server_key or not fcm_token:
            return

        payload = {
            "to": fcm_token,
            "notification": {"title": title, "body": body, "sound": "default"},
            "data": data or {},
            "priority": "high",
        }
        headers = {
            "Authorization": f"key={server_key}",
            "Content-Type": "application/json",
        }
        resp = requests.post(
            "https://fcm.googleapis.com/fcm/send",
            json=payload,
            headers=headers,
            timeout=10,
        )
        if resp.status_code != 200:
            frappe.log_error(f"FCM error {resp.status_code}: {resp.text}", "FCM Push")
    except Exception as e:
        frappe.log_error(str(e), "FCM Push Error")


def notify_operator(employee_id: str, title: str, body: str, data: dict = None):
    """Notify an operator by email + push."""
    employee = frappe.get_doc("Employee", employee_id)
    user_email = employee.user_id

    if user_email:
        send_email([user_email], title, body)

    # FCM token stored on Employee (custom field added in install)
    fcm_token = getattr(employee, "fcm_token", None)
    if fcm_token:
        send_fcm_push(fcm_token, title, body, data)


# ─────────────────────────────────────────────
# Supervisor Alerts
# ─────────────────────────────────────────────

def notify_supervisor(supervisor_id: str, title: str, body: str, reference_doctype: str = None, reference_name: str = None):
    """Notify a supervisor by email."""
    if not supervisor_id:
        return
    supervisor = frappe.get_doc("Employee", supervisor_id)
    user_email = supervisor.user_id
    if user_email:
        send_email([user_email], title, body, reference_doctype, reference_name)


def notify_admins(title: str, body: str):
    """Notify all NetPlus Admins."""
    admins = frappe.get_all(
        "Has Role",
        filters={"role": "NetPlus Admin", "parenttype": "User"},
        pluck="parent",
    )
    if admins:
        send_email(admins, title, body)


# ─────────────────────────────────────────────
# Mission Alert Helpers
# ─────────────────────────────────────────────

def create_mission_alert(mission_name: str, alert_level: str, alert_type: str, message: str):
    """Create a Mission Alert document."""
    try:
        alert = frappe.new_doc("Mission Alert")
        alert.mission = mission_name
        alert.alert_level = alert_level
        alert.alert_type = alert_type
        alert.message = message
        alert.status = "Ouvert"
        alert.insert(ignore_permissions=True)
        frappe.db.commit()
        return alert.name
    except Exception as e:
        frappe.log_error(str(e), "Mission Alert Creation")


def send_feedback_link(customer_email: str, mission_name: str, feedback_token: str):
    """Send feedback request email to client."""
    site_url = frappe.utils.get_url()
    feedback_url = f"{site_url}/feedback?token={feedback_token}"

    subject = "NetPlus — Évaluez votre service"
    message = f"""
    <p>Bonjour,</p>
    <p>Votre intervention (Mission <strong>{mission_name}</strong>) est maintenant terminée.</p>
    <p>Nous vous invitons à évaluer la qualité du service en cliquant sur le lien ci-dessous :</p>
    <p><a href="{feedback_url}" style="background:#2563eb;color:white;padding:10px 20px;
       border-radius:5px;text-decoration:none;">Évaluer le service</a></p>
    <p>Ce lien est valide pendant 72 heures.</p>
    <p>Merci de votre confiance,<br>L'équipe NetPlus</p>
    """
    send_email([customer_email], subject, message)
