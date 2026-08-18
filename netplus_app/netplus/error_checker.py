"""Print latest errors from tabError Log."""
import frappe


def print_errors():
    logs = frappe.get_all("Error Log", fields=["name", "method", "error", "creation"], order_by="creation desc", limit=5)
    print(f"=== Found {len(logs)} Error Logs ===")
    for l in logs:
        print(f"\n--- [{l.creation}] {l.method} ({l.name}) ---")
        print(l.error)
