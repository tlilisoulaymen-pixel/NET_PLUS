# -*- coding: utf-8 -*-
"""Print Studio — server-side API (Frappe).

Drop the whole `print_studio/` package into one of your apps
(e.g. <your_app>/print_studio/) and register it in hooks.py —
see INTEGRATION.md §5.

Creates/updates real ERPNext **Print Format** documents so the
designed templates also work from Desk → Print, PDF, email, and
the standard print pipeline. Templates are stored as *custom*
HTML/Jinja formats and are intentionally NOT editable with the
visual "Print Format Builder" (which would strip the custom HTML
— known ERPNext pitfall, issue #7133).
"""

import frappe
from frappe import _

TEMPLATE_PREFIX = "PS "  # namespaced so users don't mix them with builder formats


def _pf_name(doctype: str, template_name: str) -> str:
    return "{0}{1} - {2}".format(TEMPLATE_PREFIX, template_name, doctype)


@frappe.whitelist()
def save_template(doctype: str, template_name: str, html: str):
    """Create or update a Print Format for `doctype` with Jinja `html`."""
    if not frappe.has_permission(doctype, "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    # Sanity: blocklist anything that is obviously not a template.
    if "<script" in (html or "").lower():
        frappe.throw(_("Scripts are not allowed in print templates."))

    name = _pf_name(doctype, template_name)
    if frappe.db.exists("Print Format", name):
        pf = frappe.get_doc("Print Format", name)
    else:
        pf = frappe.new_doc("Print Format")
        pf.name = name
        pf.doc_type = doctype
        pf.standard = "No"
        pf.custom_format = 1          # custom HTML — NOT the builder
        pf.print_format_type = "Jinja"

    pf.html = html
    pf.disabled = 0
    pf.save(ignore_permissions=False)
    return {"name": pf.name, "updated": True}


@frappe.whitelist()
def set_default_template(doctype: str, template_name: str):
    """Make this template the default print format for the DocType."""
    name = _pf_name(doctype, template_name)
    if not frappe.db.exists("Print Format", name):
        frappe.throw(_("Template not found: {0}").format(name))

    # DocType-level default (used when no user/letter-head default exists).
    frappe.db.set_value("DocType", doctype, "default_print_format", name)

    # Per-user default takes precedence in Frappe — set it too so the
    # "use this current template" intent is honoured immediately.
    frappe.defaults.set_user_default("default_print_format_" + doctype, name)
    return {"default": name}


@frappe.whitelist()
def list_templates(doctype: str):
    """All Print Studio templates for a DocType (for the Load dropdown)."""
    return frappe.get_all(
        "Print Format",
        filters={"doc_type": doctype, "custom_format": 1, "disabled": 0},
        fields=["name", "modified"],
        order_by="modified desc",
    )


@frappe.whitelist()
def delete_template(doctype: str, template_name: str):
    name = _pf_name(doctype, template_name)
    if frappe.db.exists("Print Format", name):
        frappe.delete_doc("Print Format", name, ignore_permissions=False)
    return {"deleted": name}
