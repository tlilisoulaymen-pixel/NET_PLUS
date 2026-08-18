import frappe

def run():
    frappe.init(site="frontend")
    frappe.connect()
    frappe.set_user("operator1@netplus.ca")
    
    m = frappe.get_doc("Mission", "MSN-20260815-00002")
    print("=== Mission MSN-20260815-00002 ===")
    print("Status:", m.mission_status)
    print("Start:", m.scheduled_start)
    print("End:", m.scheduled_end)
    for op in m.operators:
        print(f"Operator: {op.employee} / {op.user} | In: {op.checkin_time} | Out: {op.checkout_time}")
    
    from netplus.api import operator_api
    b = operator_api.bootstrap()
    print("=== Operator Bootstrap ===")
    print("Missions in bootstrap:", len(b.get("missions", [])))
    for bm in b.get("missions", []):
        print(" ->", bm.get("task"), bm.get("subject"), "checked_in:", bm.get("checked_in"), "checked_out:", bm.get("checked_out"))
    print("Active:", b.get("active"))
    
    h = operator_api.my_history()
    print("=== Operator History ===")
    print("History items:", len(h.get("items", [])))
    for hi in h.get("items", []):
        print(" ->", hi.get("task"), hi.get("site"), hi.get("check_in"), hi.get("check_out"))

if __name__ == "__main__":
    run()
