"""
NetPlus Contract API — QR code verification endpoint.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import get_datetime, now_datetime


@frappe.whitelist(allow_guest=True)
def verify(token: str) -> dict:
    """
    Decode and verify a contract QR token.
    Called by PWA when operator scans the QR code.

    Returns contract metadata if valid: client, site, geofence, schedule, operators.
    """
    from netplus.utils.qr_code import decode_qr_payload

    try:
        payload = decode_qr_payload(token)
    except ValueError:
        frappe.throw(_("QR Code invalide."), frappe.ValidationError)

    contract_id = payload.get("c")
    client_id = payload.get("cl")

    if not contract_id:
        frappe.throw(_("Token QR invalide : contrat manquant."))

    # Fetch contract
    if not frappe.db.exists("Service Contract", contract_id):
        frappe.throw(_("Contrat introuvable."), frappe.DoesNotExistError)

    contract = frappe.get_doc("Service Contract", contract_id)

    if contract.status != "Actif":
        frappe.throw(_(f"Ce contrat n'est pas actif (statut: {contract.status})."))

    # Build response
    sites = [
        {
            "site_id": s.site_id,
            "site_address": s.site_address,
            "site_lat": s.site_lat,
            "site_lng": s.site_lng,
            "geofence_radius_meters": s.geofence_radius_meters,
        }
        for s in contract.contract_sites
    ]

    schedule = [
        {
            "day_of_week": d.day_of_week,
            "start_time": str(d.start_time),
            "estimated_duration": d.estimated_duration,
        }
        for d in contract.contract_days
    ]

    return {
        "valid": True,
        "contract_id": contract.name,
        "customer": contract.customer,
        "supervisor": contract.supervisor,
        "service_type": contract.service_type,
        "effective_date": str(contract.effective_date),
        "expiration_date": str(contract.expiration_date),
        "sites": sites,
        "schedule": schedule,
    }
