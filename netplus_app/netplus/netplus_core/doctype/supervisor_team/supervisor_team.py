# Copyright (c) 2026, NetPlus Inc.
import frappe
from frappe.model.document import Document


class SupervisorTeam(Document):
    pass


def on_update(doc, method=None):
    """
    Hook: When a Supervisor Team row is updated on an Employee,
    sync the `supervisor` custom field on each operator's Employee record.
    """
    supervisor_employee = doc.parent  # parent is the supervisor's Employee record

    for row in doc.supervisor_team:
        if row.operator and _is_assignment_active(row):
            _set_operator_supervisor(row.operator, supervisor_employee)


def on_trash(doc, method=None):
    """When a Supervisor Team row is deleted, clear the operator's supervisor field."""
    for row in doc.supervisor_team:
        if row.operator:
            _set_operator_supervisor(row.operator, None)


def _is_assignment_active(row) -> bool:
    """Check if an assignment row is currently active."""
    from frappe.utils import today, getdate
    today_date = getdate(today())
    if row.assigned_to and getdate(row.assigned_to) < today_date:
        return False
    return True


def _set_operator_supervisor(operator_employee_id: str, supervisor_employee_id: str | None):
    """Set the supervisor field on an Operator's Employee record."""
    try:
        frappe.db.set_value(
            "Employee",
            operator_employee_id,
            "supervisor",
            supervisor_employee_id,
            update_modified=False,
        )
    except Exception as e:
        frappe.log_error(str(e), "SupervisorTeam sync error")
