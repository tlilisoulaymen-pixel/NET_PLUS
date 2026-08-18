"""
Update site_config and set all 4 user passwords cleanly.
"""
import frappe
from frappe.installer import update_site_config
from frappe.utils.password import update_password


def run():
    # 1. Permanently mute emails in site_config to prevent OutgoingEmailError
    update_site_config("mute_emails", 1)
    update_site_config("developer_mode", 1)

    # 2. Clear stuck email queues
    frappe.db.sql("DELETE FROM `tabEmail Queue`")
    frappe.db.sql("DELETE FROM `tabEmail Queue Recipient`")

    # 3. Set all 4 passwords to known values
    users_passwords = {
        "Administrator": "Netplus123!",
        "supervisor1@netplus.ca": "Netplus123!",
        "operator1@netplus.ca": "Netplus123!",
        "jdupont@gestionimmo.ca": "Netplus123!",
    }

    for email, pwd in users_passwords.items():
        if frappe.db.exists("User", email):
            update_password(email, pwd)
            frappe.db.set_value("User", email, {
                "enabled": 1,
                "send_welcome_email": 0,
                "reset_password_key": None
            })
            print(f"✅ User {email} enabled with password -> {pwd}")

    frappe.db.commit()
    print("✅ Configuration applied successfully.")
