import frappe
from frappe.utils.password import update_password

def run():
    frappe.init(site="frontend", sites_path="/home/frappe/frappe-bench/sites")
    frappe.connect()

    users = ["Administrator", "jdupont@gestionimmo.ca", "operator1@netplus.ca", "supervisor1@netplus.ca"]
    for u in users:
        if frappe.db.exists("User", u):
            update_password(u, "admin")
            print(f"Set password for {u}")
    
    frappe.db.commit()

if __name__ == "__main__":
    run()
