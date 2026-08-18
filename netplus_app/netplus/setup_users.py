import frappe

PORTAL_ROLES = ("NetPlus Supervisor", "NetPlus Operator", "NetPlus Client")


def convert_to_website_users():
    """bench --site X execute netplus.setup_users.convert_to_website_users

    Website Users cannot open /app at all — this is the reliable fix for
    'portal users see the ERPNext Desk'. Run after assigning NetPlus roles.
    """
    users = frappe.get_all(
        "Has Role",
        filters={"role": ["in", PORTAL_ROLES], "parenttype": "User"},
        pluck="parent",
    )
    changed = []
    for user in set(users):
        if user in ("Administrator", "Guest"):
            continue
        if frappe.db.get_value("User", user, "user_type") != "Website User":
            frappe.db.set_value("User", user, "user_type", "Website User")
            changed.append(user)
    frappe.db.commit()
    print(f"Converted {len(changed)} user(s): {changed}")

