import frappe

def execute():
    # Set no_copy = 1 for tracking fields in Mission Operator
    fields_to_not_copy = [
        "checkin_time", "checkout_time",
        "checkin_lat", "checkin_lng", "checkin_accuracy",
        "checkout_lat", "checkout_lng", "checkout_accuracy",
        "checkout_out_of_zone",
        "last_heartbeat", "last_lat", "last_lng",
        "out_of_zone_since", "out_of_zone_alerted"
    ]
    
    frappe.db.sql("""
        UPDATE `tabDocField` 
        SET no_copy = 1 
        WHERE parent = 'Mission Operator' 
        AND fieldname IN %s
    """, (tuple(fields_to_not_copy),))
    
    # Also update property setter just in case
    for field in fields_to_not_copy:
        frappe.make_property_setter({
            "doctype": "Mission Operator",
            "doctype_or_field": "DocField",
            "fieldname": field,
            "property": "no_copy",
            "value": "1",
            "property_type": "Check"
        })
    
    # Fix the specific mission the user mentioned by clearing its checkin/out times
    # MSN-20260815-00002
    frappe.db.sql("""
        UPDATE `tabMission Operator`
        SET checkin_time = NULL, checkout_time = NULL
        WHERE parent = 'MSN-20260815-00002'
    """)
    
    frappe.clear_cache(doctype="Mission Operator")
    frappe.db.commit()
    print("Fixed no_copy and cleared mission MSN-20260815-00002 tracking fields.")
