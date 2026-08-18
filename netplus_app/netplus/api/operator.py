"""
NetPlus Operator API — Personal score and rank endpoints for PWA.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import nowdate


@frappe.whitelist()
def my_score() -> dict:
    """
    Return the current operator's score for the current period,
    plus their anonymized rank among all operators.
    """
    emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not emp:
        frappe.throw(_("Opérateur non trouvé."), frappe.PermissionError)

    period = nowdate()[:7]

    score = frappe.db.get_value(
        "Operator Score",
        {"employee": emp, "period": period},
        [
            "global_score",
            "quality_score",
            "punctuality_score",
            "completion_score",
            "total_missions",
            "missions_completed",
            "missions_late",
            "average_rating",
            "rank",
        ],
        as_dict=True,
    )

    # Compute anonymous rank if not yet set
    if score and not score.get("rank"):
        total_operators = frappe.db.count("Operator Score", {"period": period})
        if total_operators > 0:
            rank = frappe.db.sql(
                """
                SELECT COUNT(*) + 1 as rnk
                FROM `tabOperator Score`
                WHERE period = %s AND global_score > %s
                """,
                (period, score.global_score or 0),
                as_dict=True,
            )
            score["rank"] = rank[0]["rnk"] if rank else None
            score["total_operators"] = total_operators

    return score or {
        "global_score": None,
        "total_missions": 0,
        "period": period,
        "message": "Aucune mission complétée ce mois-ci.",
    }


@frappe.whitelist()
def score_history() -> list[dict]:
    """Return the last 6 months of operator scores."""
    emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not emp:
        frappe.throw(_("Opérateur non trouvé."), frappe.PermissionError)

    return frappe.get_all(
        "Operator Score",
        filters={"employee": emp},
        fields=[
            "period",
            "global_score",
            "quality_score",
            "punctuality_score",
            "completion_score",
            "average_rating",
            "total_missions",
        ],
        order_by="period desc",
        limit=6,
    )
