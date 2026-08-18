import frappe
from netplus.api.operator_api import bootstrap

def test():
    frappe.session.user = "operator1@netplus.ca"
    try:
        res = bootstrap()
        print("Success:", res)
    except Exception as e:
        print("Error:")
        print(frappe.get_traceback())

if __name__ == "__main__":
    test()
