"""
Set clear, standard passwords for all 4 test users.
Run via: bench --site frontend execute netplus.set_passwords.run
"""
import frappe
from frappe.utils.password import update_password


def run():
    users_passwords = {
        "supervisor1@netplus.ca": "Netplus123!",
        "operator1@netplus.ca": "Netplus123!",
        "jdupont@gestionimmo.ca": "Netplus123!",
    }

    for email, pwd in users_passwords.items():
        if frappe.db.exists("User", email):
            update_password(email, pwd)
            frappe.db.set_value("User", email, "enabled", 1)
            print(f"✅ Set password for {email} -> {pwd}")
        else:
            print(f"⚠️ User {email} not found")

    frappe.db.commit()
    print("Done setting passwords.")
