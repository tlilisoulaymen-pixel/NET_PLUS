import frappe
def run_test():
    import frappe.handler as h
    method = h.get_attr("netplus.analytics.api.list_companies")
    print("method:", method)
    print("is_whitelisted attr:", getattr(method, "is_whitelisted", False))
    print("in frappe.whitelisted:", method in frappe.whitelisted)
