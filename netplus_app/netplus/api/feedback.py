"""
NetPlus Feedback API — tokenized public endpoints for customer feedback.
No login required (guest access via token).
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import get_datetime, now_datetime


@frappe.whitelist(allow_guest=True)
def resolve(token: str) -> dict:
    """
    Resolve a feedback token to mission metadata.
    Called when customer clicks the feedback link from email.
    """
    mission = _get_mission_by_token(token)

    if not mission:
        frappe.throw(_("Lien de feedback invalide ou expiré."), frappe.ValidationError)

    # Check if already submitted
    existing = frappe.db.exists("Quality Feedback", {"mission": mission.name, "docstatus": 1})

    return {
        "mission": mission.name,
        "customer": mission.customer,
        "site_address": mission.site_address,
        "scheduled_start": str(mission.scheduled_start),
        "feedback_submitted": bool(existing),
        "editable": not bool(existing),
    }


@frappe.whitelist(allow_guest=True)
def submit(
    token: str,
    overall_rating: int,
    recommend: int = 0,
    comment: str = "",
    team_mode: str = "Égal",
) -> dict:
    """
    Submit customer feedback via tokenized link.
    Enforces: token valid, not expired, one feedback per mission.
    """
    mission = _get_mission_by_token(token)
    if not mission:
        frappe.throw(_("Lien de feedback invalide ou expiré."), frappe.ValidationError)

    overall_rating = int(overall_rating)
    if overall_rating < 1 or overall_rating > 5:
        frappe.throw(_("La note doit être entre 1 et 5."))

    # Enforce uniqueness
    existing = frappe.db.exists(
        "Quality Feedback",
        {"mission": mission.name, "docstatus": ["in", [0, 1]]},
    )
    if existing:
        frappe.throw(_("Un feedback a déjà été soumis pour cette mission."))

    # Truncate comment
    if comment and len(comment) > 1000:
        comment = comment[:1000]

    fb = frappe.new_doc("Quality Feedback")
    fb.mission = mission.name
    fb.customer = mission.customer
    fb.overall_rating = overall_rating
    fb.recommend = int(recommend)
    fb.comment = comment
    fb.team_mode = team_mode

    from frappe.utils import add_hours
    fb.editable_until = add_hours(now_datetime(), 24)
    fb.insert(ignore_permissions=True)
    fb.submit()

    frappe.db.set_value("Mission", mission.name, "feedback_submitted", 1)
    frappe.db.commit()

    return {"success": True, "feedback": fb.name}


def _get_mission_by_token(token: str):
    """Fetch Mission matching the feedback token and validate expiry."""
    mission_name = frappe.db.get_value(
        "Mission",
        {"feedback_token": token},
        "name",
    )
    if not mission_name:
        return None

    mission = frappe.get_doc("Mission", mission_name)

    # Check token expiry
    if mission.feedback_token_expiry:
        if get_datetime(now_datetime()) > get_datetime(mission.feedback_token_expiry):
            return None

    return mission
