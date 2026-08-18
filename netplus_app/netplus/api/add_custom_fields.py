import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def add_fields():
    custom_fields = {
        "Mission Operator": [
            {
                "fieldname": "checkin_accuracy",
                "fieldtype": "Float",
                "label": "Check-in Accuracy",
                "insert_after": "checkin_lng"
            },
            {
                "fieldname": "checkout_accuracy",
                "fieldtype": "Float",
                "label": "Check-out Accuracy",
                "insert_after": "checkout_lng"
            },
            {
                "fieldname": "checkout_out_of_zone",
                "fieldtype": "Check",
                "label": "Checkout Out of Zone",
                "insert_after": "checkout_accuracy"
            },
            {
                "fieldname": "last_lat",
                "fieldtype": "Float",
                "label": "Last Heartbeat Lat",
                "insert_after": "last_heartbeat"
            },
            {
                "fieldname": "last_lng",
                "fieldtype": "Float",
                "label": "Last Heartbeat Lng",
                "insert_after": "last_lat"
            },
            {
                "fieldname": "out_of_zone_since",
                "fieldtype": "Datetime",
                "label": "Out of Zone Since",
                "insert_after": "last_lng"
            },
            {
                "fieldname": "out_of_zone_alerted",
                "fieldtype": "Check",
                "label": "Out of Zone Alerted",
                "insert_after": "out_of_zone_since"
            }
        ]
    }
    
    frappe.flags.in_install = True
    create_custom_fields(custom_fields)
    frappe.db.commit()
    print("Custom fields added successfully.")
    frappe.destroy()

if __name__ == "__main__":
    add_fields()
