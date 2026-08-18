import frappe

def fix():
    # Find contact
    contact_name = frappe.db.get_value("Contact", {"user": "jdupont@gestionimmo.ca"}, "name")
    if not contact_name:
        print("ERROR: Contact not found for jdupont@gestionimmo.ca")
        return

    # Best matching customer based on email domain
    customer = "Gestion Immobilière Commerciale Inc."
    if not frappe.db.exists("Customer", customer):
        print(f"ERROR: Customer '{customer}' does not exist")
        # Fall back to first customer
        customer = frappe.db.get_value("Customer", {}, "name")
        print(f"Using fallback: {customer}")

    # Check if link already exists
    existing = frappe.db.get_value(
        "Dynamic Link",
        {"parenttype": "Contact", "parent": contact_name, "link_doctype": "Customer"},
        "link_name"
    )
    if existing:
        print(f"Dynamic Link already exists: {contact_name} -> {existing}")
        return

    # Add the link
    contact = frappe.get_doc("Contact", contact_name)
    contact.append("links", {
        "link_doctype": "Customer",
        "link_name": customer
    })
    contact.save(ignore_permissions=True)
    frappe.db.commit()
    print(f"SUCCESS: Linked Contact '{contact_name}' to Customer '{customer}'")
