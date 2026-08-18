from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
import frappe

def add_fields():
    custom_fields = {
        "NetPlus Settings": [
            {
                "fieldname": "geofence_radius",
                "fieldtype": "Float",
                "label": "Geofence Radius (m)",
                "default": "200"
            },
            {
                "fieldname": "gps_accuracy_threshold",
                "fieldtype": "Float",
                "label": "GPS Accuracy Threshold (m)",
                "default": "100"
            },
            {
                "fieldname": "heartbeat_interval",
                "fieldtype": "Int",
                "label": "Heartbeat Interval (min)",
                "default": "5"
            },
            {
                "fieldname": "out_of_zone_alert_minutes",
                "fieldtype": "Int",
                "label": "Out of Zone Alert (min)",
                "default": "10"
            }
        ],
        "Location": [
            {
                "fieldname": "geofence_radius",
                "fieldtype": "Int",
                "label": "Geofence Radius (m)",
                "description": "Leave blank to use default from NetPlus Settings"
            }
        ]
    }
    frappe.flags.in_install = True
    create_custom_fields(custom_fields)
    frappe.db.commit()
    print("NetPlus Settings custom fields added successfully.")
