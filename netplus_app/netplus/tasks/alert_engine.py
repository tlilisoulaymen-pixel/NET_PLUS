"""
Alert Engine — scheduled every 5 minutes.

Scans:
1. Missions that should have started but have no check-ins → tiered alerts
2. In-progress missions with missing heartbeats → supervisor alert

Alert tiers (for late check-in):
  H+5  → Avertissement  (notify operator)
  H+15 → Alerte         (notify operator + supervisor)
  H+30 → Critique       (notify all + update mission status)
"""

from __future__ import annotations

import frappe
from frappe.utils import get_datetime, now_datetime, time_diff_in_seconds


def run_alert_scan():
    """
    Scan for missions that should have started but have no check-in.
    Creates tiered Mission Alert documents and notifies accordingly.
    """
    settings = frappe.get_single("NetPlus Settings")
    warn_min = settings.warning_threshold_minutes or 5
    alert_min = settings.alert_threshold_minutes or 15
    critical_min = settings.critical_threshold_minutes or 30

    now = now_datetime()

    # Find 'Planifiée' missions whose scheduled_start has passed
    missions = frappe.get_all(
        "Mission",
        filters={
            "mission_status": "Planifiée",
            "scheduled_start": ["<", now],
        },
        fields=["name", "scheduled_start", "supervisor", "customer", "operators"],
    )

    for mission in missions:
        mission_doc = frappe.get_doc("Mission", mission.name)
        scheduled = get_datetime(mission_doc.scheduled_start)
        delay_seconds = (now - scheduled).total_seconds()
        delay_minutes = delay_seconds / 60

        if delay_minutes < warn_min:
            continue  # Not yet late enough

        # Determine tier
        if delay_minutes >= critical_min:
            tier = "Critique"
        elif delay_minutes >= alert_min:
            tier = "Alerte"
        else:
            tier = "Avertissement"

        # Check if an alert of this level already exists (avoid duplicates)
        existing = frappe.db.exists(
            "Mission Alert",
            {
                "mission": mission.name,
                "alert_level": tier,
                "alert_type": "Retard",
                "status": ["in", ["Ouvert", "Acquitté"]],
            },
        )
        if existing:
            continue

        # Find operators without check-in
        late_operators = [
            op.employee
            for op in mission_doc.operators
            if not op.checkin_time
        ]

        if not late_operators:
            continue  # All checked in

        message = (
            f"Mission {mission.name} ({mission_doc.customer}) : "
            f"{len(late_operators)} opérateur(s) non pointé(s) "
            f"({delay_minutes:.0f} min de retard)."
        )

        # Create alert
        _create_alert(mission.name, tier, "Retard", message)

        # Notify based on tier
        _notify_for_tier(
            tier=tier,
            mission=mission_doc,
            late_operators=late_operators,
            message=message,
        )

        # If critical → update mission status
        if tier == "Critique":
            frappe.db.set_value(
                "Mission",
                mission.name,
                "mission_status",
                "En retard critique",
            )

    frappe.db.commit()


def run_heartbeat_watchdog():
    """
    Scan in-progress missions for operators whose heartbeat has gone silent.
    Threshold: heartbeat_timeout_minutes (default 15).
    """
    settings = frappe.get_single("NetPlus Settings")
    timeout_min = settings.heartbeat_timeout_minutes or 15

    now = now_datetime()

    missions = frappe.get_all(
        "Mission",
        filters={"mission_status": "En cours"},
        fields=["name", "supervisor"],
    )

    for mission in missions:
        mission_doc = frappe.get_doc("Mission", mission.name)

        for op in mission_doc.operators:
            if not op.checkin_time:
                continue  # Not yet checked in
            if op.checkout_time:
                continue  # Already checked out

            # Check heartbeat
            last_hb = op.last_heartbeat or op.checkin_time
            if not last_hb:
                continue

            silence_seconds = (now - get_datetime(last_hb)).total_seconds()
            silence_minutes = silence_seconds / 60

            if silence_minutes < timeout_min:
                continue

            # Alert if not already raised
            existing = frappe.db.exists(
                "Mission Alert",
                {
                    "mission": mission.name,
                    "alert_type": "Heartbeat manquant",
                    "status": ["in", ["Ouvert", "Acquitté"]],
                },
            )
            if existing:
                continue

            message = (
                f"Heartbeat manquant pour {op.employee} "
                f"sur mission {mission.name} "
                f"({silence_minutes:.0f} min sans signal)."
            )

            _create_alert(mission.name, "Alerte", "Heartbeat manquant", message)

            if mission_doc.supervisor:
                from netplus.utils.notifications import notify_supervisor
                notify_supervisor(
                    mission_doc.supervisor,
                    f"⚠️ Heartbeat manquant — {op.employee}",
                    message,
                    reference_doctype="Mission",
                    reference_name=mission.name,
                )

    frappe.db.commit()


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _create_alert(mission_name: str, level: str, alert_type: str, message: str):
    """Insert a Mission Alert document."""
    try:
        alert = frappe.new_doc("Mission Alert")
        alert.mission = mission_name
        alert.alert_level = level
        alert.alert_type = alert_type
        alert.message = message
        alert.status = "Ouvert"
        alert.insert(ignore_permissions=True)
    except Exception as e:
        frappe.log_error(str(e), "Alert Engine Error")


def _notify_for_tier(tier: str, mission, late_operators: list[str], message: str):
    """Send notifications based on alert tier."""
    from netplus.utils.notifications import notify_operator, notify_supervisor, notify_admins

    # Always notify late operators
    for emp in late_operators:
        notify_operator(emp, f"⏰ Retard signalé — {mission.name}", message, {"mission": mission.name})

    if tier in ("Alerte", "Critique") and mission.supervisor:
        notify_supervisor(
            mission.supervisor,
            f"🚨 {tier} — Mission {mission.name}",
            message,
            reference_doctype="Mission",
            reference_name=mission.name,
        )

    if tier == "Critique":
        notify_admins(f"🔴 CRITIQUE — Mission {mission.name}", message)
