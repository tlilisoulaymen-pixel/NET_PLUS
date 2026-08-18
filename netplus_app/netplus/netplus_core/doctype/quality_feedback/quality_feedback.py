# Copyright (c) 2026, NetPlus Inc.
from __future__ import annotations

import frappe
from frappe.model.document import Document
from frappe.utils import add_to_date, now_datetime


class QualityFeedback(Document):
    pass


def validate(doc, method=None):
    """Validate feedback constraints."""
    # Enforce 1-5 rating
    if doc.overall_rating < 1 or doc.overall_rating > 5:
        frappe.throw("La note doit être comprise entre 1 et 5.")

    # Enforce comment length
    if doc.comment and len(doc.comment) > 1000:
        frappe.throw("Le commentaire ne peut pas dépasser 1000 caractères.")

    # Set editable_until = now + 24h on first submission
    if not doc.editable_until:
        doc.editable_until = add_to_date(now_datetime(), hours=24)

    # Enforce edit window
    if doc.docstatus == 1 and doc.editable_until:
        from frappe.utils import get_datetime
        if get_datetime(now_datetime()) > get_datetime(doc.editable_until):
            frappe.throw("Le délai de modification de 24h est dépassé. Ce feedback ne peut plus être modifié.")


def on_submit(doc, method=None):
    """On submit: trigger scoring + alert if rating ≤ 2."""
    from netplus.utils.notifications import create_mission_alert, notify_admins, notify_supervisor

    # Enqueue score recomputation (non-blocking)
    _enqueue_score_recompute(doc)

    # Alert if low rating
    if doc.overall_rating and doc.overall_rating <= 2:
        mission = frappe.get_doc("Mission", doc.mission)
        msg = (
            f"⚠️ Feedback négatif reçu ({doc.overall_rating}★) pour la mission {doc.mission} "
            f"(client: {doc.customer}). Commentaire: {doc.comment or 'Aucun'}"
        )

        # Notify supervisor
        if mission.supervisor:
            notify_supervisor(
                mission.supervisor,
                f"🚨 Feedback négatif — {doc.mission}",
                msg,
                reference_doctype="Quality Feedback",
                reference_name=doc.name,
            )

        # Notify all NetPlus Admins
        notify_admins(f"🚨 Feedback négatif ({doc.overall_rating}★) — {doc.mission}", msg)

        # Create a mission alert
        create_mission_alert(
            mission_name=doc.mission,
            alert_level="Alerte",
            alert_type="Retard",  # Reusing type; ideally add "Feedback négatif" option
            message=msg,
        )


def _enqueue_score_recompute(doc):
    """Enqueue background score recomputation for all operators on this mission."""
    from frappe.utils import nowdate
    period = nowdate()[:7]  # YYYY-MM

    mission_operators = frappe.get_all(
        "Mission Operator",
        filters={"parent": doc.mission},
        pluck="employee",
    )
    for emp in mission_operators:
        frappe.enqueue(
            "netplus.utils.scoring.recompute_operator_score",
            queue="long",
            employee_id=emp,
            period=period,
        )
