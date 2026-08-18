import frappe

no_cache = 1

ALLOWED_ROLES = {"System Manager", "Administrator", "NetPlus Supervisor"}


def get_context(context):
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/netplus-login?redirect-to=/netplus-monitoring"
        raise frappe.Redirect

    roles = set(frappe.get_roles())

    if not (ALLOWED_ROLES & roles):
        frappe.local.flags.redirect_location = "/netplus-login"
        raise frappe.Redirect

    context.no_cache = 1
    context.csrf_token = frappe.sessions.get_csrf_token()
    context.user = frappe.session.user
    context.full_name = (
        frappe.db.get_value("User", frappe.session.user, "full_name")
        or frappe.session.user
    )
    return context
