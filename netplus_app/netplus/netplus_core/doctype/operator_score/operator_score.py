# Copyright (c) 2026, NetPlus Inc.
import frappe
from frappe.model.document import Document


class OperatorScore(Document):
    pass


def has_permission(doc, ptype, user):
    """Operators can only see their own score."""
    if frappe.session.user == "Administrator":
        return True
    if frappe.db.exists("Has Role", {"parent": user, "role": "NetPlus Admin"}):
        return True
    if frappe.db.exists("Has Role", {"parent": user, "role": "NetPlus Supervisor"}):
        # Supervisor sees their team's scores
        supervisor_emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
        if supervisor_emp:
            op_emp = frappe.db.get_value("Employee", doc.employee, "supervisor")
            return op_emp == supervisor_emp
        return False
    if frappe.db.exists("Has Role", {"parent": user, "role": "NetPlus Operator"}):
        emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
        return doc.employee == emp
    return None
