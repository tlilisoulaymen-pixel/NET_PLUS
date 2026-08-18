import frappe

def test():
    frappe.init(site="frontend", sites_path="/home/frappe/frappe-bench/sites")
    frappe.connect()
    
    users = [
        ("operator1@netplus.ca", "netplus.api.operator_api.bootstrap"),
        ("supervisor1@netplus.ca", "netplus.api.supervisor_api.bootstrap"),
        ("jdupont@gestionimmo.ca", "netplus.api.client_api.bootstrap"),
        ("Administrator", "netplus.api.operator_api.bootstrap"),
        ("Administrator", "netplus.api.supervisor_api.bootstrap"),
        ("Administrator", "netplus.api.client_api.bootstrap"),
    ]
    
    for user, method_path in users:
        frappe.set_user(user)
        try:
            mod_name, fn_name = method_path.rsplit(".", 1)
            import importlib
            mod = importlib.import_module(mod_name)
            fn = getattr(mod, fn_name)
            res = fn()
            print(f"✓ {user:<25} -> {method_path.split('.')[-2]}.{fn_name}(): SUCCESS")
        except Exception as e:
            print(f"✗ {user:<25} -> {method_path.split('.')[-2]}.{fn_name}(): ERROR: {e}")

if __name__ == "__main__":
    test()
