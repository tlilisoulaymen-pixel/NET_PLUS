"""
NetPlus Mission API — Whitelisted endpoints for Operator PWA.

All endpoints require authentication unless noted.
Operators are identified via frappe.session.user → Employee lookup.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import now_datetime, add_hours, get_datetime


def _get_current_employee() -> str:
    """Resolve the current logged-in user to their Employee record name."""
    emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not emp:
        frappe.throw(_("Aucun employé associé à cet utilisateur."), frappe.PermissionError)
    return emp


@frappe.whitelist()
def today_missions() -> list[dict]:
    """
    Return today's missions assigned to the current operator.
    Used by PWA 'Aujourd'hui' screen.
    """
    employee = _get_current_employee()
    from frappe.utils import today, get_datetime

    today_str = today()

    # Find missions where this operator is in Mission Operator table
    # and scheduled_start is today
    mission_names = frappe.get_all(
        "Mission Operator",
        filters={"employee": employee},
        pluck="parent",
    )

    if not mission_names:
        return []

    missions = frappe.get_all(
        "Mission",
        filters={
            "name": ["in", mission_names],
            "scheduled_start": ["like", f"{today_str}%"],
            "mission_status": ["not in", ["Annulée"]],
        },
        fields=[
            "name",
            "customer",
            "site_address",
            "site_lat",
            "site_lng",
            "geofence_radius_meters",
            "scheduled_start",
            "scheduled_end",
            "mission_status",
            "mission_type",
            "team_mode",
            "site_instructions",
        ],
        order_by="scheduled_start asc",
    )

    # Attach my check-in status for each mission
    for m in missions:
        op_row = frappe.db.get_value(
            "Mission Operator",
            {"parent": m.name, "employee": employee},
            ["checkin_time", "checkout_time", "is_lead", "punctuality_status"],
            as_dict=True,
        )
        m.update(op_row or {})

    return missions


@frappe.whitelist()
def checkin(mission: str, lat: float, lng: float, accuracy: float = 0) -> dict:
    """
    GPS-gated check-in for an operator.

    Validates:
    - Mission exists and is in 'Planifiée' status
    - Operator is assigned to this mission
    - GPS accuracy ≤ configured threshold
    - Distance to site ≤ geofence radius

    On success:
    - Records check-in time, GPS coords, punctuality status
    - Updates mission status to 'En cours' (first check-in)
    """
    employee = _get_current_employee()
    lat, lng, accuracy = float(lat), float(lng), float(accuracy)

    mission_doc = frappe.get_doc("Mission", mission)

    # --- Authorization ---
    op_rows = [r for r in mission_doc.operators if r.employee == employee]
    if not op_rows:
        frappe.throw(_("Vous n'êtes pas assigné à cette mission."), frappe.PermissionError)
    op_row = op_rows[0]

    if op_row.checkin_time:
        frappe.throw(_("Vous avez déjà effectué votre check-in pour cette mission."))

    if mission_doc.mission_status not in ("Planifiée", "En cours"):
        frappe.throw(_(f"Impossible de faire un check-in : statut {mission_doc.mission_status}."))

    # --- GPS Validation ---
    settings = frappe.get_single("NetPlus Settings")
    gps_threshold = settings.gps_accuracy_threshold_meters or 100

    if accuracy > gps_threshold:
        frappe.throw(_(f"Précision GPS insuffisante ({accuracy}m). Réessayez en extérieur."))

    from netplus.utils.geo import is_within_geofence
    radius = mission_doc.geofence_radius_meters or settings.geofence_radius_meters or 200
    inside, distance = is_within_geofence(lat, lng, mission_doc.site_lat, mission_doc.site_lng, radius, accuracy)

    if not inside:
        frappe.throw(_(f"Vous êtes trop loin du site ({distance:.0f}m). Rayon autorisé : {radius}m."))

    # --- Record check-in ---
    now = now_datetime()
    op_row.checkin_time = now
    op_row.checkin_lat = lat
    op_row.checkin_lng = lng

    # Compute punctuality
    from frappe.utils import get_datetime, time_diff_in_seconds
    scheduled_dt = get_datetime(mission_doc.scheduled_start)
    delay_minutes = (now - scheduled_dt).total_seconds() / 60

    if delay_minutes <= 0:
        op_row.punctuality_status = "À l'heure"
    elif delay_minutes <= (settings.warning_threshold_minutes or 5):
        op_row.punctuality_status = "À l'heure"
    elif delay_minutes <= (settings.alert_threshold_minutes or 15):
        op_row.punctuality_status = "Retard léger"
    elif delay_minutes <= (settings.critical_threshold_minutes or 30):
        op_row.punctuality_status = "Retard modéré"
    else:
        op_row.punctuality_status = "Retard important"

    # Update mission status on first check-in
    if mission_doc.mission_status == "Planifiée":
        mission_doc.mission_status = "En cours"
        mission_doc.actual_start = now

    mission_doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        "success": True,
        "checkin_time": str(now),
        "punctuality_status": op_row.punctuality_status,
        "distance_meters": round(distance, 1),
    }


@frappe.whitelist()
def checkout(mission: str, lat: float, lng: float, accuracy: float = 0) -> dict:
    """
    GPS-gated check-out for an operator.

    On success:
    - Records checkout time, GPS
    - If last operator to check out → mission 'Terminée', generates feedback token
    - Sends feedback email to customer
    """
    employee = _get_current_employee()
    lat, lng, accuracy = float(lat), float(lng), float(accuracy)

    mission_doc = frappe.get_doc("Mission", mission)

    op_rows = [r for r in mission_doc.operators if r.employee == employee]
    if not op_rows:
        frappe.throw(_("Vous n'êtes pas assigné à cette mission."), frappe.PermissionError)
    op_row = op_rows[0]

    if not op_row.checkin_time:
        frappe.throw(_("Vous devez d'abord faire votre check-in."))

    if op_row.checkout_time:
        frappe.throw(_("Vous avez déjà effectué votre check-out."))

    if mission_doc.mission_status != "En cours":
        frappe.throw(_(f"Impossible de faire un check-out : statut {mission_doc.mission_status}."))

    # GPS validation
    settings = frappe.get_single("NetPlus Settings")
    gps_threshold = settings.gps_accuracy_threshold_meters or 100

    if accuracy > gps_threshold:
        frappe.throw(_(f"Précision GPS insuffisante ({accuracy}m)."))

    from netplus.utils.geo import is_within_geofence
    radius = mission_doc.geofence_radius_meters or settings.geofence_radius_meters or 200
    inside, distance = is_within_geofence(lat, lng, mission_doc.site_lat, mission_doc.site_lng, radius, accuracy)

    if not inside:
        frappe.throw(_(f"Vous êtes trop loin du site ({distance:.0f}m) pour faire un check-out."))

    # Record check-out
    now = now_datetime()
    op_row.checkout_time = now
    op_row.checkout_lat = lat
    op_row.checkout_lng = lng

    # Check if ALL operators have checked out
    all_checked_out = all(
        r.checkout_time or r.employee == employee
        for r in mission_doc.operators
    )

    if all_checked_out:
        mission_doc.mission_status = "Terminée"
        mission_doc.actual_end = now

        # Generate feedback token
        import secrets
        token = secrets.token_urlsafe(32)
        ttl_hours = settings.feedback_token_ttl_hours or 72
        mission_doc.feedback_token = token
        mission_doc.feedback_token_expiry = add_hours(now, ttl_hours)

        # Send feedback email to customer
        _send_feedback_email(mission_doc)

    mission_doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        "success": True,
        "checkout_time": str(now),
        "mission_completed": all_checked_out,
    }


@frappe.whitelist()
def heartbeat(mission: str, lat: float, lng: float) -> dict:
    """
    PWA heartbeat — called every 5 minutes while operator is on mission.
    Updates last_heartbeat timestamp and logs GPS position.
    """
    employee = _get_current_employee()
    lat, lng = float(lat), float(lng)

    # Update last_heartbeat directly in DB for performance
    frappe.db.sql(
        """
        UPDATE `tabMission Operator`
        SET last_heartbeat = %s
        WHERE parent = %s AND employee = %s
        """,
        (now_datetime(), mission, employee),
    )
    frappe.db.commit()
    return {"success": True, "timestamp": str(now_datetime())}


def _send_feedback_email(mission_doc):
    """Send feedback request to customer after mission completion."""
    try:
        customer = frappe.get_doc("Customer", mission_doc.customer)
        # Get customer email from Contact
        email = frappe.db.get_value(
            "Contact Email",
            {"parent": frappe.db.get_value("Dynamic Link", {
                "link_doctype": "Customer",
                "link_name": mission_doc.customer,
                "parenttype": "Contact",
            }, "parent")},
            "email_id",
        )
        if email and mission_doc.feedback_token:
            from netplus.utils.notifications import send_feedback_link
            send_feedback_link(email, mission_doc.name, mission_doc.feedback_token)
    except Exception as e:
        frappe.log_error(str(e), "Feedback email send error")
