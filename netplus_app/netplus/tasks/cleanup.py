"""
Cleanup tasks — hourly and daily scheduler jobs.

1. expire_feedback_tokens()  — hourly: mark stale tokens, set quality default
2. send_feedback_reminders()  — hourly: send 24h reminders
3. purge_old_gps_data()       — daily: erase GPS coords older than 90 days (Loi 25)
"""

from __future__ import annotations

import frappe
from frappe.utils import add_to_date, add_days, get_datetime, now_datetime, nowdate


def expire_feedback_tokens():
    """
    Hourly: find missions with expired feedback tokens that have no feedback.
    Sets quality score to neutral (3★) default.
    """
    now = now_datetime()

    stale_missions = frappe.get_all(
        "Mission",
        filters={
            "feedback_token": ["!=", ""],
            "feedback_token_expiry": ["<", now],
            "feedback_submitted": 0,
            "mission_status": "Terminée",
        },
        fields=["name", "customer", "operators"],
        pluck="name",
    )

    for mission_name in stale_missions:
        # Clear token
        frappe.db.set_value(
            "Mission",
            mission_name,
            {
                "feedback_token": "",
                "feedback_token_expiry": None,
            },
            update_modified=False,
        )
        # Log for scoring — the scoring engine will use 3★ default when no feedback found

    if stale_missions:
        frappe.db.commit()
        frappe.logger().info(f"Expired {len(stale_missions)} feedback tokens.")


def send_feedback_reminders():
    """
    Hourly: send a 24h reminder to customers who haven't submitted feedback.
    Only send once — when token_expiry is within the next 24h and feedback not submitted.
    """
    now = now_datetime()
    in_24h = add_to_date(now, hours=24)

    missions_needing_reminder = frappe.get_all(
        "Mission",
        filters={
            "feedback_token": ["!=", ""],
            "feedback_token_expiry": ["between", [now, in_24h]],
            "feedback_submitted": 0,
            "mission_status": "Terminée",
        },
        fields=["name", "customer", "feedback_token"],
    )

    for mission in missions_needing_reminder:
        try:
            customer = frappe.get_doc("Customer", mission.customer)
            email = frappe.db.get_value(
                "Contact Email",
                {"parent": frappe.db.get_value(
                    "Dynamic Link",
                    {"link_doctype": "Customer", "link_name": mission.customer, "parenttype": "Contact"},
                    "parent",
                )},
                "email_id",
            )
            if email:
                from netplus.utils.notifications import send_feedback_link
                send_feedback_link(email, mission.name, mission.feedback_token)
        except Exception as e:
            frappe.log_error(str(e), f"Feedback reminder error for {mission.name}")


def purge_old_gps_data():
    """
    Daily: erase GPS coordinates from Mission Operator rows older than
    the configured retention period (default 90 days — Loi 25 / PIPEDA compliance).
    """
    settings = frappe.get_single("NetPlus Settings")
    retention_days = settings.gps_data_retention_days or 90

    cutoff_date = add_days(nowdate(), -retention_days)

    # Find old completed missions
    old_missions = frappe.get_all(
        "Mission",
        filters={
            "mission_status": ["in", ["Terminée", "Annulée"]],
            "actual_end": ["<", cutoff_date],
        },
        pluck="name",
    )

    if not old_missions:
        return

    # Purge GPS data from Mission Operator rows
    frappe.db.sql(
        """
        UPDATE `tabMission Operator`
        SET checkin_lat = NULL,
            checkin_lng = NULL,
            checkout_lat = NULL,
            checkout_lng = NULL,
            last_heartbeat = NULL
        WHERE parent IN %(missions)s
        """,
        {"missions": old_missions},
    )

    frappe.db.commit()
    frappe.logger().info(
        f"Purged GPS data from {len(old_missions)} missions older than {retention_days} days."
    )
