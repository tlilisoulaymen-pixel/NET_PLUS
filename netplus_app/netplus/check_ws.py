"""
Print all workspaces in DB and check visibility for Administrator.
"""
import frappe


def run():
    frappe.set_user("Administrator")
    workspaces = frappe.get_all("Workspace", fields=["name", "label", "module", "public", "is_hidden"], order_by="sequence_id asc")
    print(f"=== Found {len(workspaces)} Workspaces in DB ===")
    netplus_ws = [w for w in workspaces if w.get("module") == "Netplus Core" or "NetPlus" in (w.get("label") or "")]
    for w in netplus_ws:
        print(f"  ⭐ {w.name} (label: {w.label}, public: {w.public}, is_hidden: {w.is_hidden})")
    
    print(f"\nOther major workspaces:")
    for w in workspaces[:10]:
        if w not in netplus_ws:
            print(f"  - {w.name} (label: {w.label})")
