import frappe

def create_roles():
    roles = ["NetPlus Admin", "NetPlus Operator", "NetPlus Supervisor", "NetPlus Client"]
    for role_name in roles:
        if not frappe.db.exists("Role", role_name):
            doc = frappe.new_doc("Role")
            doc.role_name = role_name
            if role_name == "NetPlus Admin":
                doc.desk_access = 1
            else:
                doc.desk_access = 0
            doc.insert(ignore_permissions=True)
            print(f"Created Role: {role_name}")
        else:
            print(f"Role already exists: {role_name}")
    frappe.db.commit()
