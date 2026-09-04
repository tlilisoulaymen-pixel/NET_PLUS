import frappe

def check_users():
    users = frappe.get_all(
        'User',
        fields=['name', 'full_name', 'user_type', 'enabled'],
        filters=[['name', 'not in', ['Guest', 'Administrator']]],
        limit=20
    )
    for u in users:
        print(u)
