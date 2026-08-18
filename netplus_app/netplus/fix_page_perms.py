"""
Fix netplus-dashboard page permissions — add Customer and NetPlus Client roles
Run via: bench --site frontend execute netplus.fix_page_perms.run
"""
import frappe


def run():
    frappe.set_user("Administrator")

    # --- Fix page roles ---
    page = frappe.get_doc("Page", "netplus-dashboard")
    existing = [r.role for r in page.roles]
    roles_to_add = ["NetPlus Client", "Customer", "NetPlus Operator"]
    changed = False
    for role in roles_to_add:
        if role not in existing:
            # Ensure role exists
            if not frappe.db.exists("Role", role):
                r = frappe.new_doc("Role")
                r.role_name = role
                r.desk_access = 1
                r.insert(ignore_permissions=True)
                print(f"  ✅ Created role: {role}")
            page.append("roles", {"role": role})
            changed = True
            print(f"  ✅ Added role to page: {role}")

    if changed:
        page.save(ignore_permissions=True)
        frappe.db.commit()

    print("Current page roles:", [r.role for r in page.roles])

    # --- Fix all users: ensure System User + desk_access ---
    users_roles = {
        "supervisor1@netplus.ca": ["NetPlus Supervisor", "HR User"],
        "operator1@netplus.ca":   ["NetPlus Operator"],
        "jdupont@gestionimmo.ca": ["NetPlus Client", "Customer"],
    }
    for email, roles in users_roles.items():
        if not frappe.db.exists("User", email):
            continue
        # Force System User
        frappe.db.set_value("User", email, "user_type", "System User")
        user = frappe.get_doc("User", email)
        existing_roles = [r.role for r in user.roles]
        for role in roles:
            if role not in existing_roles:
                if not frappe.db.exists("Role", role):
                    r = frappe.new_doc("Role")
                    r.role_name = role
                    r.desk_access = 1
                    r.insert(ignore_permissions=True)
                user.append("roles", {"role": role})
        user.save(ignore_permissions=True)
        print(f"  ✅ Fixed user {email}: roles = {[r.role for r in user.roles]}")

    frappe.db.commit()

    # --- Clear permission cache ---
    frappe.clear_cache()
    print("✅ Page permissions fixed and cache cleared.")
