import frappe

no_cache = 1

ALLOWED_ROLES = {"NetPlus Operator", "System Manager"}


def get_context(context):
    # Guest -> login avec retour
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login?redirect-to=/netplus-pwa"
        raise frappe.Redirect

    # Mauvais rôle -> redirection vers SA page (jamais d'erreur "Not Permitted")
    roles = set(frappe.get_roles())
    if not (ALLOWED_ROLES & roles):
        try:
            from netplus.auth import get_home_for
            frappe.local.flags.redirect_location = get_home_for(list(roles))
        except Exception:
            frappe.local.flags.redirect_location = "/portal"
        raise frappe.Redirect

    context.no_cache = 1
    context.csrf_token = frappe.sessions.get_csrf_token()
    context.user = frappe.session.user
    context.full_name = (
        frappe.db.get_value("User", frappe.session.user, "full_name")
        or frappe.session.user
    )
    return context
