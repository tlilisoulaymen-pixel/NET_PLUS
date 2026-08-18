import frappe


# ---------------------------------------------------------------------------
# Shared routing logic — single source of truth for all redirect decisions.
# Used by: the get_website_user_home_page hook, on_session_creation hook,
#          and every www page controller.
# ---------------------------------------------------------------------------

def get_home_for(roles):
    """
    Return the canonical home URL for a user given their role set.

    Call as:  get_home_for(frappe.get_roles())
              get_home_for(frappe.get_roles(user))
    """
    roles = set(roles)
    if "System Manager" in roles or "Administrator" in roles:
        return "/app"
    if "NetPlus Operator" in roles:
        return "/netplus-pwa"
    if "NetPlus Supervisor" in roles:
        return "/netplus-supervision"
    if "NetPlus Client" in roles:
        return "/netplus-client"
    # logged-in but no NetPlus role — send to Frappe profile page
    return "/me"


# ---------------------------------------------------------------------------
# Hook: get_website_user_home_page
# Called by Frappe's website router for Website Users (desk_access=0).
# Receives the username string, returns the path string.
# ---------------------------------------------------------------------------

def get_website_user_home_page(user):
    """Official Frappe hook: landing page for Website Users after login."""
    return get_home_for(frappe.get_roles(user))


# ---------------------------------------------------------------------------
# Hook: on_session_creation
# Called immediately after any successful login, before the response is sent.
# Setting frappe.local.response["home_page"] here overrides any stale default
# stored on the User doc or in frappe.defaults — this is the "override stale
# session" fix described in the architecture review.
# ---------------------------------------------------------------------------

def set_homepage(login_manager):
    """
    Force the post-login redirect to the role's canonical page.
    Prevents a stale User.home_page or frappe.defaults value from winning.
    """
    roles = frappe.get_roles(login_manager.user)
    home = get_home_for(roles)
    frappe.local.response["home_page"] = home
