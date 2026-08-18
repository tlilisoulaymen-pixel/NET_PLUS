import frappe
from netplus.api.supervisor_api import bootstrap

def test():
    frappe.session.user = "supervisor1@netplus.ca"
    try:
        res = bootstrap()
        print("Success:", len(res.get("team", [])))
    except Exception as e:
        print("Error:")
        print(frappe.get_traceback())

if __name__ == "__main__":
    test()
