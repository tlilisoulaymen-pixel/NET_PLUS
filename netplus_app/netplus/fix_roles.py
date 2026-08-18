import frappe

def run():
    # 1. Fix Supervisor Roles by applying Role Profile
    u = frappe.get_doc('User', 'supervisor1@netplus.ca')
    u.role_profile_name = 'NetPlus — Superviseur'
    u.save(ignore_permissions=True)
    
    # Also manually clean out the other roles just in case
    for role in ['Stock User', 'Item Manager', 'Stock Manager']:
        if frappe.db.exists('Has Role', {'parent': 'supervisor1@netplus.ca', 'role': role}):
            frappe.db.delete('Has Role', {'parent': 'supervisor1@netplus.ca', 'role': role})

    print('Applied Role Profile to Supervisor.')

    # 2. Fix Client 'Project' error by cleaning up Portal Settings
    ps = frappe.get_doc('Portal Settings', 'Portal Settings')
    new_items = []
    for item in ps.menu:
        # We only keep default user account/logout or items that don't need 'Project'
        if item.title in ('My Account', 'Mon Compte'):
            new_items.append(item)
    ps.menu = new_items
    ps.save(ignore_permissions=True)
    print('Cleaned up Portal Settings to fix Project permission error.')

    frappe.db.commit()
