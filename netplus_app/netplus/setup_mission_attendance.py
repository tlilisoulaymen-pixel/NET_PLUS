import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def setup():
    if not frappe.db.exists("DocType", "Mission Attendance"):
        doc = frappe.get_doc({
            "doctype": "DocType",
            "name": "Mission Attendance",
            "module": "NetPlus",
            "custom": 1,
            "fields": [
                {"fieldname": "mission", "label": "Mission", "fieldtype": "Link", "options": "Mission", "reqd": 1},
                {"fieldname": "operator", "label": "Operator", "fieldtype": "Link", "options": "User", "reqd": 1},
                
                {"fieldname": "column_break_1", "fieldtype": "Column Break"},
                
                {"fieldname": "check_in", "label": "Check In", "fieldtype": "Datetime"},
                {"fieldname": "check_in_lat", "label": "Check In Latitude", "fieldtype": "Data"},
                {"fieldname": "check_in_lng", "label": "Check In Longitude", "fieldtype": "Data"},
                
                {"fieldname": "section_break_1", "fieldtype": "Section Break"},
                
                {"fieldname": "check_out", "label": "Check Out", "fieldtype": "Datetime"},
                {"fieldname": "check_out_lat", "label": "Check Out Latitude", "fieldtype": "Data"},
                {"fieldname": "check_out_lng", "label": "Check Out Longitude", "fieldtype": "Data"},
                
                {"fieldname": "column_break_2", "fieldtype": "Column Break"},
                
                {"fieldname": "distance_au_site", "label": "Distance au site (m)", "fieldtype": "Float"},
                {"fieldname": "statut", "label": "Statut", "fieldtype": "Select", "options": "Validé\nHors zone\nRefusé", "default": "Validé"}
            ]
        })
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
