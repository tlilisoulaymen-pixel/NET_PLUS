# -*- coding: utf-8 -*-
import frappe
from frappe import _
import json

def _require_superadmin():
    if "System Manager" not in frappe.get_roles(frappe.session.user) and frappe.session.user != "Administrator":
        frappe.throw(_("Access denied. System Manager role required."), frappe.PermissionError)

def _require_admin():
    roles = frappe.get_roles(frappe.session.user)
    if "NetPlus Admin" not in roles and "System Manager" not in roles and frappe.session.user != "Administrator":
        frappe.throw(_("Access denied. NetPlus Admin role required."), frappe.PermissionError)

@frappe.whitelist()
def get_admin_permissions():
    """Returns Custom DocPerms for NetPlus Admin role."""
    _require_superadmin()
    perms = frappe.get_all("Custom DocPerm", filters={"role": "NetPlus Admin"}, fields=["*"])
    return {"permissions": perms}

@frappe.whitelist()
def save_admin_permissions(permissions):
    """
    Saves the permission matrix for NetPlus Admin.
    `permissions` should be a JSON array of dicts with keys matching Custom DocPerm fields.
    """
    _require_superadmin()
    if isinstance(permissions, str):
        permissions = json.loads(permissions)

    frappe.db.delete("Custom DocPerm", {"role": "NetPlus Admin"})
    
    for p in permissions:
        doc = frappe.new_doc("Custom DocPerm")
        doc.role = "NetPlus Admin"
        for key, val in p.items():
            if key not in ["name", "creation", "modified", "modified_by", "owner", "idx"]:
                doc.set(key, val)
        doc.insert(ignore_permissions=True)

    frappe.clear_cache()
    return {"status": "success"}

@frappe.whitelist()
def create_client(customer_name, email=None, enable_portal=0,
                  first_name=None, last_name=None, phone=None,
                  customer_type="Individual", mobile_no=None):
    """Creates a Customer + optional portal User. Idempotent."""
    _require_admin()

    display_name = customer_name
    if frappe.db.exists("Customer", customer_name):
        customer = frappe.get_doc("Customer", customer_name)
    else:
        customer = frappe.get_doc({
            "doctype": "Customer",
            "customer_name": customer_name,
            "customer_group": "Commercial",
            "territory": "All Territories",
            "customer_type": customer_type or "Individual",
            "mobile_no": mobile_no or phone or "",
        })
        customer.insert(ignore_permissions=True)

    if email:
        if not frappe.db.exists("User", email):
            user = frappe.get_doc({
                "doctype": "User",
                "email": email,
                "first_name": first_name or customer_name,
                "last_name": last_name or "",
                "send_welcome_email": 0,
                "user_type": "Website User" if enable_portal else "System User",
                "mobile_no": mobile_no or phone or "",
            })
            user.insert(ignore_permissions=True)
            if enable_portal:
                user.add_roles("NetPlus Client")
        else:
            user = frappe.get_doc("User", email)
            if enable_portal and not user.has_website_permission("NetPlus Client"):
                user.add_roles("NetPlus Client")

        contact_name = frappe.db.get_value("Contact Email", {"email_id": email}, "parent")
        if not contact_name:
            contact = frappe.get_doc({
                "doctype": "Contact",
                "first_name": first_name or customer_name,
                "last_name": last_name or "",
                "is_primary_contact": 1,
                "links": [{"link_doctype": "Customer", "link_name": customer.name}],
                "email_ids": [{"email_id": email, "is_primary": 1}],
                "phone_nos": ([{"phone": phone or mobile_no, "is_primary_phone": 1}]
                               if (phone or mobile_no) else []),
            })
            contact.insert(ignore_permissions=True)
        else:
            has_link = frappe.db.exists("Dynamic Link", {
                "parent": contact_name, "link_doctype": "Customer", "link_name": customer.name})
            if not has_link:
                contact = frappe.get_doc("Contact", contact_name)
                contact.append("links", {"link_doctype": "Customer", "link_name": customer.name})
                contact.save(ignore_permissions=True)

    return {"customer": customer.name}

@frappe.whitelist()
def provisionstaff(email, first_name, last_name, role, reports_to=None,
                   gender=None, date_of_birth=None, date_of_joining=None,
                   designation=None, phone=None, mobile_no=None):
    """Creates a System User + Employee for Operator or Supervisor. Idempotent."""
    _require_admin()
    if role not in ["NetPlus Operator", "NetPlus Supervisor"]:
        frappe.throw(_("Invalid role for staff creation."))

    if frappe.db.exists("User", email):
        user = frappe.get_doc("User", email)
        if not user.has_website_permission(role):
            user.add_roles(role)
    else:
        user = frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": first_name,
            "last_name": last_name or "",
            "send_welcome_email": 0,
            "user_type": "System User",
            "mobile_no": mobile_no or phone or "",
        })
        user.insert(ignore_permissions=True)
        user.add_roles(role)

    # Auto-provision Employee (idempotent)
    emp_name = frappe.db.get_value("Employee", {"user_id": user.name}, "name")
    if emp_name:
        return {"user": user.name, "employee": emp_name}

    try:
        from frappe.utils import today, add_years
        company = (frappe.db.get_single_value("Global Defaults", "default_company")
                   or frappe.get_all("Company", limit=1)[0].name)
        employee = frappe.get_doc({
            "doctype": "Employee",
            "first_name": first_name,
            "last_name": last_name or "",
            "user_id": user.name,
            "status": "Active",
            "date_of_joining": date_of_joining or today(),
            "company": company,
            "gender": gender or "Male",
            "date_of_birth": date_of_birth or add_years(today(), -30),
            "designation": designation or "",
            "cell_number": mobile_no or phone or "",
            "reports_to": reports_to or "",
        })
        employee.insert(ignore_permissions=True)
    except Exception as e:
        frappe.db.rollback()
        frappe.throw(_("Failed to create Employee record: {0}").format(str(e)))

    return {"user": user.name, "employee": employee.name}

def ensure_employee_for_user(doc, method):
    """
    doc_events hook for User after_insert / on_update.
    Guarantees every NetPlus Operator/Supervisor has an Employee record.
    """
    if doc.name in ["Guest", "Administrator"]:
        return

    # Check roles (this works even before DB commit on on_update if roles are fetched from DB)
    roles = frappe.get_all("Has Role", filters={"parent": doc.name, "parenttype": "User"}, fields=["role"])
    role_names = [r.role for r in roles]
    if "NetPlus Operator" not in role_names and "NetPlus Supervisor" not in role_names:
        return

    emp_name = frappe.db.get_value("Employee", {"user_id": doc.name}, "name")

    if not doc.enabled:
        # If disabled, ensure employee is inactive/left
        if emp_name:
            frappe.db.set_value("Employee", emp_name, "status", "Left")
        return

    # If enabled and no employee, create one
    if not emp_name:
        try:
            from frappe.utils import today, add_years
            company = frappe.db.get_single_value("Global Defaults", "default_company")
            if not company:
                companies = frappe.get_all("Company", limit=1)
                if companies: company = companies[0].name
            
            employee = frappe.get_doc({
                "doctype": "Employee",
                "first_name": doc.first_name,
                "last_name": doc.last_name or "",
                "user_id": doc.name,
                "status": "Active",
                "date_of_joining": today(),
                "company": company,
                "gender": "Male",
                "date_of_birth": add_years(today(), -30),
            })
            employee.insert(ignore_permissions=True)
        except Exception:
            # Let it fail silently or log it, so it doesn't block User save
            frappe.log_error("Auto-provisioning Employee failed for User " + doc.name)
    else:
        # Reactivate if previously left
        current_status = frappe.db.get_value("Employee", emp_name, "status")
        if current_status != "Active":
            frappe.db.set_value("Employee", emp_name, "status", "Active")


@frappe.whitelist()
def list_users(search=None, role_filter=None, limit=100, start=0):
    """
    Returns all non-system users with their roles.
    Accessible to NetPlus Admin and System Manager.
    """
    _require_admin()
    filters = [
        ["name", "not in", ["Guest", "Administrator"]],
        ["email", "!=", "administrator@netplus.ca"],
        ["name", "!=", "administrator@netplus.ca"]
    ]
    if search:
        filters.append(["full_name", "like", f"%{search}%"])

    users = frappe.get_all(
        "User",
        filters=filters,
        fields=["name", "full_name", "user_type", "enabled", "user_image",
                "last_login", "creation", "email", "netplus_pwd"],
        order_by="full_name asc",
        limit_page_length=int(limit),
        limit_start=int(start),
        ignore_permissions=True,
    )

    # Attach roles to each user
    for u in users:
        roles = frappe.get_all(
            "Has Role",
            filters={"parent": u["name"], "parenttype": "User"},
            fields=["role"],
            ignore_permissions=True,
        )
        u["roles"] = [r["role"] for r in roles if r["role"] not in ["All", "Guest"]]
        
        # Attach Employee ID if exists
        emp = frappe.get_value("Employee", {"user_id": u["name"]}, ["name", "first_name", "last_name"], as_dict=True)
        if emp:
            u["employee_id"] = emp.name
            # Build a clean display name from the employee record
            emp_display = " ".join(filter(None, [emp.first_name, emp.last_name])).strip()
            if emp_display:
                u["full_name"] = emp_display
            
        # Attach Customer ID if exists
        # Strategy 1: via Contact Email → Dynamic Link
        customer_id = None
        contact = frappe.get_all("Contact Email", filters={"email_id": u["name"]}, fields=["parent"])
        if contact:
            cust = frappe.get_all("Dynamic Link", filters={"parent": contact[0].parent, "link_doctype": "Customer"}, fields=["link_name"])
            if cust:
                customer_id = cust[0].link_name
        
        # Strategy 2: direct Customer name match (full_name or customer_name)
        if not customer_id:
            full_name = u.get("full_name", "")
            if full_name:
                cust = frappe.db.get_value("Customer", {"customer_name": full_name}, "name")
                if cust:
                    customer_id = cust
        
        if customer_id:
            u["customer_id"] = customer_id

    # Filter by role if requested
    if role_filter:
        users = [u for u in users if role_filter in u["roles"]]

    return users



@frappe.whitelist()
def toggle_user(user_email, enabled):
    """Enable or disable a User. Admin only."""
    _require_admin()
    frappe.db.set_value("User", user_email, "enabled", int(enabled), update_modified=False)
    frappe.clear_cache(user=user_email)
    return {"ok": True, "enabled": int(enabled)}


@frappe.whitelist()
def delete_user(user_email):
    frappe.db.set_value("User", user_email, "enabled", 0, update_modified=False)
    frappe.clear_cache(user=user_email)
    return {"ok": True}

@frappe.whitelist()
def update_netplus_password(user_email, new_password):
    _require_admin()
    import frappe.utils.password
    frappe.utils.password.update_password(
        user=user_email, 
        pwd=new_password, 
        logout_all_sessions=True
    )
    frappe.db.set_value("User", user_email, "netplus_pwd", new_password, update_modified=False)
    return {"ok": True}
