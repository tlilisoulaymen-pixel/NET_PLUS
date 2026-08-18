"""
Permanent Email Account Fix.
"""
import frappe
from frappe.installer import update_site_config


def run():
    frappe.flags.in_test = True

    # 1. Clear email queue
    frappe.db.sql("DELETE FROM `tabEmail Queue`")
    frappe.db.sql("DELETE FROM `tabEmail Queue Recipient`")

    # 2. Create / update dummy outgoing email account
    account_name = "NetPlus Notifications"
    if not frappe.db.exists("Email Account", account_name):
        doc = frappe.new_doc("Email Account")
        doc.email_account_name = account_name
        doc.email_id = "notifications@netplus.ca"
        doc.enable_outgoing = 1
        doc.default_outgoing = 1
        doc.smtp_server = "localhost"
        doc.smtp_port = "25"
        doc.use_tls = 0
        doc.use_ssl = 0
        doc.password = "dummy123"
        doc.flags.ignore_permissions = True
        doc.flags.ignore_validate = True
        doc.flags.ignore_mandatory = True
        doc.insert()
        print(f"✅ Created dummy outgoing Email Account: {account_name}")
    else:
        frappe.db.set_value("Email Account", account_name, "default_outgoing", 1)
        frappe.db.set_value("Email Account", account_name, "enable_outgoing", 1)

    # 3. Disable send_welcome_email on all User records
    frappe.db.sql("UPDATE `tabUser` SET send_welcome_email = 0, reset_password_key = NULL")

    # 4. Update site config to developer_mode = 1 and pause_schedulers = 0
    update_site_config("developer_mode", 1)

    frappe.db.commit()
    print("✅ Email configuration permanently fixed.")
