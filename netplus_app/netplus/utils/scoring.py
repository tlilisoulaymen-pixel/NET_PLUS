"""Operator scoring engine — exact formula from the executive report §5.1:

    Score = (moyenne_étoiles/5 × 50) + (ratio_ponctualité × 30)
          + (ratio_complétion × 20) − pénalités_retard

Penalties: -10 pts per 15-30 min lateness, -20 pts per >30 min lateness.
Team missions (§5.2): one feedback for the whole team; with a designated
lead the stars weigh 60% for the lead and 40% shared among the others;
punctuality stays individual (each operator has their own check-in).
"""

import frappe
from frappe.utils import add_days, now_datetime, nowdate

SCORE_PERIOD_DAYS = 90  # rolling window


def on_feedback_submit(doc, method=None):
    """Quality Feedback on_submit: instant alert on <=2 stars + async recompute."""
    if (doc.overall_rating or 0) <= 2 and doc.task:
        _notify_low_rating(doc)
    frappe.enqueue(recompute_all_scores, queue="short")


def _notify_low_rating(feedback):
    task = frappe.db.get_value(
        "Task", feedback.task, ["subject", "customer"], as_dict=True)
    recipients = _supervisor_emails_for_task(feedback.task) + _admin_emails()
    if recipients:
        frappe.sendmail(
            recipients=list(set(recipients)),
            subject=f"⚠ Feedback {feedback.overall_rating}★ — {task.subject}",
            message=(f"Le client a laissé {feedback.overall_rating}★ sur la "
                     f"mission <b>{task.subject}</b>.<br>"
                     f"Commentaire: {feedback.np_comment or '—'}"),
        )


def recompute_all_scores():
    """Nightly job (and post-feedback): recompute every operator's score."""
    since = add_days(nowdate(), -SCORE_PERIOD_DAYS)
    operators = frappe.get_all(
        "Employee", filters={"status": "Active"}, pluck="name")

    rows = []
    for emp in operators:
        rows.append(compute_operator_score(emp, since))

    # rank by global score, persist one Operator Score doc per employee
    rows.sort(key=lambda r: r["global_score"], reverse=True)
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
        _upsert_score(row)
    frappe.db.commit()


def compute_operator_score(employee, since):
    # ---- pull this operator's mission rows in the window -----------------
    mission_rows = frappe.db.sql("""
        SELECT mo.parent AS task, mo.is_lead, mo.check_in, mo.punctuality,
               t.mission_status, t.scheduled_start, t.team_mode
        FROM `tabMission Operator` mo
        JOIN `tabTask` t ON t.name = mo.parent
        WHERE mo.employee = %s AND t.scheduled_start >= %s
          AND t.mission_status != 'Annulée'
    """, (employee, since), as_dict=True)

    assigned = len(mission_rows)
    done = [r for r in mission_rows if r.mission_status == "Terminée"]

    # ---- axis 1: quality (50%) — weighted stars ---------------------------
    weighted_stars, weight_sum = 0.0, 0.0
    for r in done:
        stars = frappe.db.get_value(
            "Quality Feedback", {"task": r.task, "docstatus": 1},
            "overall_rating")
        if not stars:
            continue
        w = _feedback_weight(r)
        weighted_stars += stars * w
        weight_sum += w
    avg_stars = (weighted_stars / weight_sum) if weight_sum else 0.0
    quality = (avg_stars / 5.0) * 50.0

    # ---- axis 2: punctuality (30%) + penalties ----------------------------
    on_time = sum(1 for r in mission_rows if r.punctuality == "À l'heure")
    with_checkin = [r for r in mission_rows if r.check_in]
    punctuality = (on_time / len(with_checkin) * 30.0) if with_checkin else 0.0
    penalties = sum(
        10 if r.punctuality == "Retard 15-30" else
        20 if r.punctuality == "Retard >30" else 0
        for r in mission_rows)

    # ---- axis 3: completion (20%) -----------------------------------------
    completion = (len(done) / assigned * 20.0) if assigned else 0.0

    global_score = max(0.0, quality + punctuality + completion - penalties)
    return dict(employee=employee, avg_stars=round(avg_stars, 2),
                quality_score=round(quality, 1),
                punctuality_score=round(punctuality, 1),
                completion_score=round(completion, 1),
                penalties=penalties, missions_count=assigned,
                global_score=round(global_score, 1))


def _feedback_weight(row):
    """§5.2 team weighting for the stars of a shared feedback."""
    if row.team_mode != "Équipe":
        return 1.0
    members = frappe.db.count("Mission Operator", {"parent": row.task})
    has_lead = frappe.db.exists(
        "Mission Operator", {"parent": row.task, "is_lead": 1})
    if not has_lead or members <= 1:
        return 1.0                    # equal split
    return 0.6 if row.is_lead else 0.4 / (members - 1)


def _upsert_score(row):
    name = frappe.db.get_value("Operator Score", {"employee": row["employee"]})
    doc = (frappe.get_doc("Operator Score", name) if name
           else frappe.new_doc("Operator Score"))
    doc.update(row)
    doc.computed_at = now_datetime()
    doc.save(ignore_permissions=True)


# ---------------------------------------------------------------- helpers
def _supervisor_emails_for_task(task):
    emails = []
    for emp in frappe.get_all("Mission Operator", {"parent": task},
                              pluck="employee"):
        sup = frappe.db.get_value("Employee", emp, "reports_to")
        if sup:
            email = frappe.db.get_value("Employee", sup, "user_id")
            if email:
                emails.append(email)
    return emails


def _admin_emails():
    return frappe.get_all(
        "Has Role",
        filters={"role": "System Manager", "parenttype": "User"},
        pluck="parent")

