import frappe
from frappe.website.page_renderers.template_page import TemplatePage

def _get_csrf():
    try:
        return frappe.sessions.get_csrf_token()
    except Exception:
        pass
    try:
        return getattr(frappe.local, "csrf_token", None) or frappe.local.session.data.csrf_token
    except Exception:
        return ""

def main():
    frappe.init(site="frontend", sites_path="/home/frappe/frappe-bench/sites")
    frappe.connect()
    try:
        frappe.set_user("Administrator")
        token = _get_csrf()
        print("Safely retrieved csrf token:", token)
        
        # Test rendering netplus-pwa
        context = frappe._dict(
            no_cache=1,
            csrf_token=token,
            user=frappe.session.user,
            full_name="Administrator",
            maps_api_key="AIzaSyDBVwEYtvHGnuKdmaKEfEo-OgaIC6RflnQ"
        )
        rendered = frappe.render_template("www/netplus-pwa.html", context)
        print("Rendered template length:", len(rendered))
        print("Success!")
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
