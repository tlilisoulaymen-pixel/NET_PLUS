import frappe
def run():
    frappe.set_user("Administrator")
    if not frappe.db.exists("Gender", "Male"):
        frappe.get_doc({"doctype": "Gender", "gender": "Male"}).insert(ignore_permissions=True)
        frappe.db.commit()
