"""
Score Engine — daily scheduler job.

Recomputes Operator Score for every active operator for the current period,
then updates the `rank` field for all operators based on global_score.
"""

from __future__ import annotations

import frappe
from frappe.utils import nowdate


def recompute_all_scores():
    """
    Daily job: recompute scores for all active operators.
    Runs after midnight via scheduler_events['daily'].
    """
    period = nowdate()[:7]  # YYYY-MM

    active_operators = frappe.get_all(
        "Employee",
        filters={"netplus_role": "Operator", "status": "Active"},
        pluck="name",
    )

    from netplus.utils.scoring import recompute_operator_score

    results = []
    for emp in active_operators:
        try:
            result = recompute_operator_score(emp, period)
            if result:
                results.append(result)
        except Exception as e:
            frappe.log_error(str(e), f"Score recompute failed for {emp}")

    # Update rankings
    _update_rankings(period)

    frappe.logger().info(
        f"NetPlus Score Engine: recomputed {len(results)} operator scores for {period}."
    )


def _update_rankings(period: str):
    """
    Update the `rank` field on all Operator Score documents for the given period,
    sorted by global_score DESC.
    """
    scores = frappe.get_all(
        "Operator Score",
        filters={"period": period},
        fields=["name", "global_score"],
        order_by="global_score desc",
    )

    for rank, score in enumerate(scores, start=1):
        frappe.db.set_value(
            "Operator Score",
            score.name,
            "rank",
            rank,
            update_modified=False,
        )

    if scores:
        frappe.db.commit()
