"""
Mission Generator — daily scheduler job (04:00).

Reads all active Service Contracts, calculates upcoming intervention
dates from Contract Day rows, and creates Mission documents for
the next N days (default 7) if they don't already exist.

Day-of-week mapping (French → Python weekday):
    Lundi=0, Mardi=1, Mercredi=2, Jeudi=3,
    Vendredi=4, Samedi=5, Dimanche=6
"""

from __future__ import annotations

import frappe
from frappe.utils import add_days, get_datetime, getdate, now_datetime, nowdate


DAY_OF_WEEK_MAP = {
    "Lundi": 0,
    "Mardi": 1,
    "Mercredi": 2,
    "Jeudi": 3,
    "Vendredi": 4,
    "Samedi": 5,
    "Dimanche": 6,
}


def generate_missions_from_contracts(days_ahead: int = 7):
    """
    Daily job: generate missions for all active contracts.
    Runs at 04:00 AM via scheduler_events['daily'].
    """
    active_contracts = frappe.get_all(
        "Service Contract",
        filters={"status": "Actif", "docstatus": 1},
        pluck="name",
    )

    total_created = 0
    for contract_name in active_contracts:
        created = generate_for_contract(contract_name, days_ahead=days_ahead)
        total_created += created

    frappe.logger().info(f"NetPlus Mission Generator: {total_created} missions created.")
    return total_created


def generate_for_contract(contract_name: str, days_ahead: int = 30) -> int:
    """
    Generate missions for a single contract for the next `days_ahead` days.
    Returns number of missions created.
    """
    contract = frappe.get_doc("Service Contract", contract_name)

    if contract.status != "Actif":
        return 0

    if not contract.contract_days:
        return 0

    today = getdate(nowdate())
    expiry = getdate(contract.expiration_date)
    count = 0

    for day_offset in range(days_ahead):
        target_date = add_days(today, day_offset)
        target_date_obj = getdate(target_date)

        # Skip if past expiry
        if target_date_obj > expiry:
            break

        # Skip if before effective date
        effective = getdate(contract.effective_date)
        if target_date_obj < effective:
            continue

        # Python weekday for this date
        weekday = target_date_obj.weekday()

        for day_row in contract.contract_days:
            if DAY_OF_WEEK_MAP.get(day_row.day_of_week) != weekday:
                continue

            # Build scheduled datetime
            start_time = day_row.start_time  # already a timedelta or time
            if isinstance(start_time, str):
                from datetime import datetime, time
                parts = start_time.split(":")
                t = time(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
            else:
                t = start_time

            from datetime import datetime, timedelta
            if isinstance(t, timedelta):
                total_seconds = int(t.total_seconds())
                h, rem = divmod(total_seconds, 3600)
                m, s = divmod(rem, 60)
                from datetime import time as dtime
                t = dtime(h, m, s)

            scheduled_start = datetime.combine(target_date_obj, t)
            duration_hours = day_row.estimated_duration or 2.0
            scheduled_end = scheduled_start + timedelta(hours=duration_hours)

            # Check if mission already exists for this contract + date
            existing = frappe.db.exists(
                "Mission",
                {
                    "service_contract": contract.name,
                    "scheduled_start": scheduled_start,
                },
            )
            if existing:
                continue

            # Use first site as default
            site = contract.contract_sites[0] if contract.contract_sites else None

            mission = frappe.new_doc("Mission")
            mission.service_contract = contract.name
            mission.customer = contract.customer
            mission.supervisor = contract.supervisor
            mission.mission_status = "Planifiée"
            mission.mission_type = contract.service_type
            mission.team_mode = contract.team_mode
            mission.scheduled_start = scheduled_start
            mission.scheduled_end = scheduled_end

            if site:
                mission.site_address = site.site_address
                mission.site_lat = site.site_lat
                mission.site_lng = site.site_lng
                mission.geofence_radius_meters = site.geofence_radius_meters or 200
                mission.site_instructions = site.site_instructions

            mission.insert(ignore_permissions=True)
            count += 1

    if count > 0:
        frappe.db.commit()

    return count
