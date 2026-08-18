import frappe

def test():
    frappe.session.user = "jdupont@gestionimmo.ca"
    try:
        from netplus.api.client_api import bootstrap
        res = bootstrap()
        print("=== bootstrap() SUCCESS ===")
        print("Profile:", res.get("profile"))
        print("Satisfaction:", res.get("satisfaction"))
        print("To-rate count:", len(res.get("to_rate", [])))
        print("Upcoming count:", len(res.get("upcoming", [])))
        print("Contracts count:", len(res.get("contracts", [])))
    except Exception:
        print("ERROR:")
        print(frappe.get_traceback())
