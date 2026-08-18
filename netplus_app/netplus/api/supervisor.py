"""
NetPlus Supervisor API — Desk and PWA endpoints for supervisors.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import today, nowdate


def _get_supervisor_employee() -> str:
    emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not emp:
        frappe.throw(_("Superviseur non trouvé."), frappe.PermissionError)
    return emp


@frappe.whitelist()
def team() -> list[dict]:
    """Return the supervisor's operator team with score summaries."""
    supervisor = _get_supervisor_employee()

    operators = frappe.get_all(
        "Employee",
        filters={"supervisor": supervisor, "netplus_role": "Operator", "status": "Active"},
        fields=["name", "employee_name", "designation", "image"],
    )

    period = nowdate()[:7]
    for op in operators:
        score = frappe.db.get_value(
            "Operator Score",
            {"employee": op.name, "period": period},
            ["global_score", "total_missions", "average_rating"],
            as_dict=True,
        )
        op.update(score or {"global_score": None, "total_missions": 0, "average_rating": None})

    return operators


@frappe.whitelist()
def contracts() -> list[dict]:
    """Return all active contracts managed by this supervisor."""
    supervisor = _get_supervisor_employee()

    return frappe.get_all(
        "Service Contract",
        filters={"supervisor": supervisor, "status": "Actif"},
        fields=[
            "name",
            "customer",
            "effective_date",
            "expiration_date",
            "service_type",
            "team_mode",
            "rate_per_intervention",
            "currency",
        ],
        order_by="effective_date desc",
    )


@frappe.whitelist()
def alerts() -> list[dict]:
    """Return open alerts for this supervisor's missions."""
    supervisor = _get_supervisor_employee()

    # Find missions belonging to this supervisor
    mission_names = frappe.get_all(
        "Mission",
        filters={"supervisor": supervisor},
        pluck="name",
    )

    if not mission_names:
        return []

    return frappe.get_all(
        "Mission Alert",
        filters={"mission": ["in", mission_names], "status": "Ouvert"},
        fields=["name", "mission", "alert_level", "alert_type", "message", "creation"],
        order_by="creation desc",
        limit=50,
    )


@frappe.whitelist()
def today_dashboard() -> dict:
    """Return supervisor dashboard data: missions today, team status."""
    supervisor = _get_supervisor_employee()
    today_str = today()

    missions_today = frappe.get_all(
        "Mission",
        filters={
            "supervisor": supervisor,
            "scheduled_start": ["like", f"{today_str}%"],
            "mission_status": ["not in", ["Annulée"]],
        },
        fields=["name", "customer", "mission_status", "scheduled_start", "team_mode"],
    )

    status_counts = {}
    for m in missions_today:
        status_counts[m.mission_status] = status_counts.get(m.mission_status, 0) + 1

    open_alerts = frappe.db.count(
        "Mission Alert",
        {"mission": ["in", [m.name for m in missions_today] or [""]], "status": "Ouvert"},
    )

    return {
        "missions_today": len(missions_today),
        "status_breakdown": status_counts,
        "open_alerts": open_alerts,
        "missions": missions_today,
    }
