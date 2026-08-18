# Copyright (c) 2026, NetPlus Inc.
from __future__ import annotations

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, getdate, now_datetime, today


class ServiceContract(Document):
    def validate(self):
        self._validate_dates()
        self._validate_contract_days()
        self._validate_contract_sites()

    def _validate_dates(self):
        if self.effective_date and self.expiration_date:
            if getdate(self.expiration_date) <= getdate(self.effective_date):
                frappe.throw("La date d'expiration doit être postérieure à la date d'entrée en vigueur.")

    def _validate_contract_days(self):
        if not self.contract_days:
            frappe.throw("Ajoutez au moins un jour d'intervention dans 'Fréquence Personnalisée'.")

    def _validate_contract_sites(self):
        if not self.contract_sites:
            frappe.throw("Ajoutez au moins un site au contrat.")


def on_submit(doc, method=None):
    """On contract submit: create Project, generate initial missions, generate QR code."""
    doc.status = "Actif"

    # 1. Create linked project
    project = _create_contract_project(doc)
    frappe.db.set_value("Service Contract", doc.name, "project", project.name)

    # 2. Generate missions for next 30 days
    from netplus.tasks.mission_generator import generate_for_contract
    generate_for_contract(doc.name, days_ahead=30)

    # 3. Generate QR code
    from netplus.utils.qr_code import save_qr_to_file
    qr_url = save_qr_to_file(doc)
    if qr_url:
        frappe.db.set_value("Service Contract", doc.name, "qr_code_image", qr_url)

    frappe.db.commit()


def on_cancel(doc, method=None):
    """On cancel: mark contract as Annulé, cancel pending missions."""
    frappe.db.set_value("Service Contract", doc.name, "status", "Annulé")

    pending_missions = frappe.get_all(
        "Mission",
        filters={"service_contract": doc.name, "mission_status": "Planifiée"},
        pluck="name",
    )
    for mission_name in pending_missions:
        frappe.db.set_value("Mission", mission_name, "mission_status", "Annulée")

    frappe.db.commit()


def has_permission(doc, ptype, user):
    """Row-level permission: supervisors only see their own contracts."""
    if frappe.session.user == "Administrator":
        return True
    if frappe.db.exists("Has Role", {"parent": user, "role": "NetPlus Admin"}):
        return True
    if frappe.db.exists("Has Role", {"parent": user, "role": "NetPlus Supervisor"}):
        employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
        if doc.supervisor == employee:
            return True
        return False
    return None  # Fall through to standard permissions


def _create_contract_project(doc) -> "Document":
    """Create a Frappe Project linked to this contract."""
    project = frappe.new_doc("Project")
    project.project_name = f"Contrat {doc.name} — {doc.customer}"
    project.status = "Open"
    project.expected_start_date = doc.effective_date
    project.expected_end_date = doc.expiration_date
    project.customer = doc.customer
    project.notes = f"Projet généré automatiquement depuis le contrat {doc.name}"
    project.insert(ignore_permissions=True)
    return project
