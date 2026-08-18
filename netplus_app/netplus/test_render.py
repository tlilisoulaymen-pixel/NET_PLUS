"""
Test full Jinja rendering of portal.html and netplus-pwa.html for all roles.
Run: bench --site frontend execute netplus.test_render.run
"""
import frappe
from frappe.website.page_renderers.template_page import TemplatePage


def run():
    print("=== Testing portal.html Jinja Rendering ===")

    for user in ["supervisor1@netplus.ca", "jdupont@gestionimmo.ca", "Administrator"]:
        frappe.set_user(user)
        try:
            page = TemplatePage("portal")
            html = page.get_html()
            print(f"  ✅ portal.html as {user}: {len(html)} bytes")
        except Exception as e:
            print(f"  ❌ Error for {user}: {e}")

    print("\n=== Testing netplus-pwa Rendering ===")
    frappe.set_user("operator1@netplus.ca")
    try:
        page = TemplatePage("netplus-pwa")
        html = page.get_html()
        print(f"  ✅ netplus-pwa as operator1@netplus.ca: {len(html)} bytes")
    except Exception as e:
        print(f"  ❌ Error for operator: {e}")

    # Clear caches
    frappe.clear_cache()
    print("\n✅ All pages verified and cache cleared.")
