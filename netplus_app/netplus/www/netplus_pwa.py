import frappe

no_cache = 1

ALLOWED_ROLES = {"NetPlus Operator", "NetPlus Admin", "NetPlus Supervisor", "System Manager", "Administrator"}


def _get_csrf():
    try:
        return frappe.sessions.get_csrf_token()
    except Exception:
        pass
    try:
        return getattr(frappe.local, "csrf_token", None) or frappe.local.session.data.csrf_token
    except Exception:
        return ""


def get_context(context):
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/netplus-login?redirect-to=/netplus-pwa"
        raise frappe.Redirect

    roles = set(frappe.get_roles())
    is_admin = bool({"System Manager", "Administrator", "NetPlus Admin"} & roles)

    if not is_admin and not (ALLOWED_ROLES & roles):
        try:
            from netplus.auth import get_home_for
            frappe.local.flags.redirect_location = get_home_for(list(roles))
        except Exception:
            frappe.local.flags.redirect_location = "/portal"
        raise frappe.Redirect

    context.no_cache = 1
    context.csrf_token = _get_csrf()
    context.user = frappe.session.user
    context.full_name = (
        frappe.db.get_value("User", frappe.session.user, "full_name")
        or frappe.session.user
    )
    context.maps_api_key = (
        frappe.db.get_single_value("NetPlus Settings", "google_maps_api_key") or "AIzaSyDBVwEYtvHGnuKdmaKEfEo-OgaIC6RflnQ"
    )
    return context
