import frappe

no_cache = 1

def get_context(context):
    context.no_cache = 1
    context.redirect_to = frappe.form_dict.get("redirect-to") or ""
    return context
