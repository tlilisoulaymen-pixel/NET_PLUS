import frappe


def execute():
    """
    Patch: Create Customer records for NetPlus Client users who don't have one yet.
    Links them via Contact -> Dynamic Link.
    """
    users = frappe.db.sql("""
        SELECT u.name, u.full_name, u.first_name, u.last_name
        FROM `tabUser` u
        JOIN `tabHas Role` r ON r.parent = u.name
        WHERE r.role = 'NetPlus Client'
        AND u.name NOT IN ('Administrator', 'Guest')
        GROUP BY u.name
    """, as_dict=True)

    print(f"Found {len(users)} NetPlus Client users")

    for user in users:
        email = user['name']
        full_name = (user['full_name'] or
                     " ".join(filter(None, [user['first_name'], user['last_name']])).strip() or
                     email)

        # Strategy 1: Find via Contact Email -> Customer Dynamic Link
        customer_id = None
        contact_rows = frappe.get_all(
            "Contact Email", filters={"email_id": email}, fields=["parent"])
        if contact_rows:
            cust_rows = frappe.get_all(
                "Dynamic Link",
                filters={"parent": contact_rows[0].parent, "link_doctype": "Customer"},
                fields=["link_name"])
            if cust_rows:
                customer_id = cust_rows[0].link_name

        # Strategy 2: Direct Customer name match
        if not customer_id:
            customer_id = frappe.db.get_value(
                "Customer", {"customer_name": full_name}, "name")

        if customer_id:
            print(f"  User {email} already has Customer: {customer_id}")
            continue

        # Create the Customer
        try:
            customer = frappe.get_doc({
                "doctype": "Customer",
                "customer_name": full_name,
                "customer_group": "Commercial",
                "territory": "All Territories",
                "customer_type": "Individual"
            })
            customer.insert(ignore_permissions=True)

            # Link via Contact if contact exists
            if contact_rows:
                contact_doc = frappe.get_doc("Contact", contact_rows[0].parent)
                has_link = any(
                    lnk.link_doctype == "Customer" and lnk.link_name == customer.name
                    for lnk in contact_doc.links
                )
                if not has_link:
                    contact_doc.append(
                        "links", {"link_doctype": "Customer", "link_name": customer.name})
                    contact_doc.save(ignore_permissions=True)
            else:
                # Create Contact too
                contact_doc = frappe.get_doc({
                    "doctype": "Contact",
                    "first_name": user['first_name'] or full_name,
                    "last_name": user['last_name'] or "",
                    "is_primary_contact": 1,
                    "links": [{"link_doctype": "Customer", "link_name": customer.name}],
                    "email_ids": [{"email_id": email, "is_primary": 1}]
                })
                contact_doc.insert(ignore_permissions=True)

            frappe.db.commit()
            print(f"  Created Customer {customer.name} for {email}")
        except Exception as e:
            frappe.db.rollback()
            print(f"  Failed for {email}: {e}")
