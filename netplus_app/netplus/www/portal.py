import frappe
from netplus.auth import get_home_for

# Module-level: prevents a cached guest render from being served to a logged-in user
no_cache = 1


def get_context(context):
    # 1. Guest → login with redirect-back
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login?redirect-to=/portal"
        raise frappe.Redirect

    roles = frappe.get_roles()

    # 2. Operator landed here by mistake → send them to their own page
    # 3. Any user with no NetPlus portal role → send to their canonical home
    if not ({"NetPlus Supervisor", "NetPlus Client", "System Manager", "Administrator"} & set(roles)):
        frappe.local.flags.redirect_location = get_home_for(roles)
        raise frappe.Redirect

    context.no_cache = 1
    context.csrf_token = frappe.sessions.get_csrf_token()
    context.role = (
        "supervisor" if "NetPlus Supervisor" in roles
        else "client" if "NetPlus Client" in roles
        else "admin" if "System Manager" in roles or "Administrator" in roles
        else None
    )
    # role is always set here because of the check above, but guard anyway
    if not context.role:
        frappe.local.flags.redirect_location = get_home_for(roles)
        raise frappe.Redirect

    context.full_name = frappe.db.get_value("User", frappe.session.user, "full_name")
    return context
