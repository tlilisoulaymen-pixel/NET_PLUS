import frappe
from frappe.utils import today, add_years

def execute():
    """
    Patch: Auto-provisions Employee records for existing NetPlus Operators and Supervisors
    who do not have one yet.
    """
    users = frappe.get_all(
        "User",
        filters={"enabled": 1, "name": ["not in", ["Administrator", "Guest"]]},
        fields=["name", "first_name", "last_name", "enabled"]
    )

    company = frappe.db.get_single_value("Global Defaults", "default_company")
    if not company:
        companies = frappe.get_all("Company", limit=1)
        if companies:
            company = companies[0].name

    for user in users:
        # Check roles
        roles = frappe.get_all("Has Role", filters={"parent": user.name, "parenttype": "User"}, fields=["role"])
        role_names = [r.role for r in roles]
        
        if "NetPlus Operator" not in role_names and "NetPlus Supervisor" not in role_names:
            continue

        # Check if employee exists
        emp_name = frappe.db.get_value("Employee", {"user_id": user.name}, "name")
        if not emp_name:
            try:
                employee = frappe.get_doc({
                    "doctype": "Employee",
                    "first_name": user.first_name,
                    "last_name": user.last_name or "",
                    "user_id": user.name,
                    "status": "Active",
                    "date_of_joining": today(),
                    "company": company,
                    "gender": "Male",
                    "date_of_birth": add_years(today(), -30),  # default: 30 years ago
                })
                employee.insert(ignore_permissions=True)
                frappe.db.commit()
                print(f"Created Employee {employee.name} for User {user.name}")
            except Exception as e:
                frappe.db.rollback()
                print(f"Failed to create Employee for {user.name}: {e}")

