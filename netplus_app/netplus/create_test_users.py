import frappe
from frappe.utils.password import update_password

def run():
    frappe.set_user("Administrator")
    
    users = [
        {"email": "supervisor1@netplus.ca", "first_name": "Supervisor", "role": "NetPlus Supervisor"},
        {"email": "operator1@netplus.ca", "first_name": "Operator", "role": "NetPlus Operator"},
        {"email": "jdupont@gestionimmo.ca", "first_name": "Jean", "last_name": "Dupont", "role": "NetPlus Client"},
    ]

    for u in users:
        email = u["email"]
        if not frappe.db.exists("User", email):
            user = frappe.new_doc("User")
            user.email = email
            user.first_name = u["first_name"]
            user.last_name = u.get("last_name", "")
            user.send_welcome_email = 0
            user.insert(ignore_permissions=True)
            print(f"Created user: {email}")
        else:
            user = frappe.get_doc("User", email)
            print(f"User already exists: {email}")

        # Ensure role
        user.add_roles(u["role"])
        
        # Set password
        update_password(email, "admin")
        print(f"Set password to 'admin' and assigned role '{u['role']}' for {email}")

    frappe.db.commit()
    print("Done creating users and setting passwords.")
