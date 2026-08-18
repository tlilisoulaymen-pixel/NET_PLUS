# Copyright (c) 2026, NetPlus Inc.
from __future__ import annotations

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class Mission(Document):
    def validate(self):
        self._validate_schedule()
        self._geocode_address()

    def _validate_schedule(self):
        if self.scheduled_start and self.scheduled_end:
            from frappe.utils import get_datetime
            if get_datetime(self.scheduled_end) <= get_datetime(self.scheduled_start):
                frappe.throw("La fin prévue doit être postérieure au début prévu.")

    def _geocode_address(self):
        if not self.site_address:
            return
        # If coordinates are missing or address changed, auto-geocode via Google Geocoding API
        needs_geocoding = (not self.site_lat or not self.site_lng or self.has_value_changed("site_address"))
        if needs_geocoding:
            try:
                import urllib.parse
                import requests
                api_key = "AIzaSyDBVwEYtvHGnuKdmaKEfEo-OgaIC6RflnQ"
                encoded = urllib.parse.quote_plus(self.site_address)
                url = f"https://maps.googleapis.com/maps/api/geocode/json?address={encoded}&key={api_key}"
                resp = requests.get(url, timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("results"):
                        loc = data["results"][0]["geometry"]["location"]
                        self.site_lat = loc["lat"]
                        self.site_lng = loc["lng"]
            except Exception as e:
                frappe.log_error(f"Geocoding failed for {self.site_address}: {e}", "Mission Geocoding")
        if not self.geofence_radius_meters:
            self.geofence_radius_meters = 200



def after_insert(doc, method=None):
    """Notify assigned operators after mission creation."""
    from netplus.utils.notifications import notify_operator
    for op_row in doc.operators:
        if op_row.employee:
            notify_operator(
                op_row.employee,
                f"Nouvelle mission assignée — {doc.name}",
                f"Vous avez une nouvelle mission le {doc.scheduled_start} chez {doc.customer}.\n"
                f"Adresse : {doc.site_address}",
                data={"mission": doc.name},
            )


def on_update(doc, method=None):
    """On status change or operator reassignment, re-notify."""
    pass  # Extended logic handled by alert engine


def has_permission(doc, ptype, user):
    """Row-level: supervisors see only their missions; operators see their own."""
    if frappe.session.user == "Administrator":
        return True
    if frappe.db.exists("Has Role", {"parent": user, "role": "NetPlus Admin"}):
        return True

    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        return False

    if frappe.db.exists("Has Role", {"parent": user, "role": "NetPlus Supervisor"}):
        return doc.supervisor == employee

    if frappe.db.exists("Has Role", {"parent": user, "role": "NetPlus Operator"}):
        # Operator can only read their own missions
        assigned = frappe.get_all(
            "Mission Operator",
            filters={"parent": doc.name, "employee": employee},
            limit=1,
        )
        return bool(assigned)

    return None
