"""Check module_app mapping."""
import frappe


def run():
    print("module_app netplus_core:", frappe.local.module_app.get("netplus_core"))
    print("module_app keys with netplus:", [k for k in frappe.local.module_app if "netplus" in k])
    print("app_modules netplus:", frappe.local.app_modules.get("netplus"))
