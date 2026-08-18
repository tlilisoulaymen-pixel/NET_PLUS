import frappe


def get_context(context):
    # Guest page — the token IS the credential (72h magic link).
    context.no_cache = 1
    context.token = frappe.form_dict.get("token") or ""
    return context

