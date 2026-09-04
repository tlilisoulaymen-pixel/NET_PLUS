# -*- coding: utf-8 -*-
"""Doc Flow — whitelisted persistence API (Frappe/ERPNext backend).

One endpoint set drives the generic flow for every module:
  list_documents / get_document / save_document
  get_parties / get_items / get_accounts / get_warehouses

Every endpoint re-checks read/write permission on the target DocType,
keeps docstatus discipline (draft = 0, submit = 1), and reuses the
module registry below — the exact mirror of the JS MODULES table.
"""

import json
import frappe
from frappe import _
from frappe.utils import flt, getdate

# Mirror of the JS registry (doctype, party, refs, filters, kind).
MODULES = {
    "quotation":            dict(doctype="Quotation", party="party_name",
                                 party_dt="Customer", items=True),
    "sales_order":          dict(doctype="Sales Order", party="customer",
                                 party_dt="Customer", items=True, ref="po_no"),
    "delivery_note":        dict(doctype="Delivery Note", party="customer",
                                 party_dt="Customer", items=True),
    "sales_invoice":        dict(doctype="Sales Invoice", party="customer",
                                 party_dt="Customer", items=True),
    "sales_credit_note":    dict(doctype="Sales Invoice", party="customer",
                                 party_dt="Customer", items=True,
                                 ref="return_against", filters={"is_return": 1}),
    "purchase_order":       dict(doctype="Purchase Order", party="supplier",
                                 party_dt="Supplier", items=True),
    "purchase_receipt":     dict(doctype="Purchase Receipt", party="supplier",
                                 party_dt="Supplier", items=True),
    "purchase_invoice":     dict(doctype="Purchase Invoice", party="supplier",
                                 party_dt="Supplier", items=True, ref="bill_no"),
    "purchase_debit_note":  dict(doctype="Purchase Invoice", party="supplier",
                                 party_dt="Supplier", items=True,
                                 ref="return_against", filters={"is_return": 1}),
    "supplier_return":      dict(doctype="Purchase Receipt", party="supplier",
                                 party_dt="Supplier", items=True,
                                 ref="return_against", filters={"is_return": 1}),
    "payment_in":           dict(doctype="Payment Entry", party="party",
                                 party_dt="Customer", payment_type="Receive"),
    "payment_out":          dict(doctype="Payment Entry", party="party",
                                 party_dt="Supplier", payment_type="Pay"),
    "journal_entry":        dict(doctype="Journal Entry", journal=True),
    "withholding":          dict(doctype="Journal Entry", journal=True,
                                 filters={"voucher_type": "Withholding"}),
    "stock_entry":          dict(doctype="Stock Entry", items=True, stock=True),
}


def _cfg(module):
    if module not in MODULES:
        frappe.throw(_("Unknown module: {0}").format(module))
    return MODULES[module]


def _check(doctype, ptype="read"):
    if not frappe.has_permission(doctype, ptype):
        frappe.throw(_("Not permitted on {0}").format(doctype), frappe.PermissionError)


# ----------------------------------------------------------------------
# Lists / lookups
# ----------------------------------------------------------------------
@frappe.whitelist()
def list_documents(module, party=None, from_date=None, to_date=None,
                   status=None, start=0, page_length=20):
    cfg = _cfg(module)
    _check(cfg["doctype"])

    filters = dict(cfg.get("filters") or {})
    if cfg.get("party") and party:
        filters[cfg["party"]] = ["like", "%{0}%".format(party)]
    if from_date:
        filters["posting_date"] = [">=", getdate(from_date)]
    if to_date:
        # merge date filters safely (single posting_date condition)
        if "posting_date" in filters:
            filters["posting_date"] = ["between", [getdate(from_date), getdate(to_date)]]
        else:
            filters["posting_date"] = ["<=", getdate(to_date)]
    if status not in (None, ""):
        filters["docstatus"] = int(status)

    amount_field = (
        "grand_total" if cfg.get("items") else
        "paid_amount" if cfg.get("payment_type") else
        "total_debit" if cfg.get("journal") else
        "total_amount"
    )
    fields = ["name", "docstatus", "posting_date", amount_field]
    if cfg.get("party"):
        fields.append(cfg["party"])
    try:
        fields.index("currency")
    except ValueError:
        fields.append("currency")

    rows = frappe.get_all(
        cfg["doctype"], filters=filters, fields=fields,
        order_by="posting_date desc, name desc",
        limit_start=int(start or 0), limit_page_length=int(page_length or 20),
    )
    out = []
    for r in rows:
        out.append({
            "name": r.get("name"),
            "docstatus": r.get("docstatus"),
            "party": r.get(cfg["party"]) if cfg.get("party") else None,
            "amount": flt(r.get(amount_field)),
            "currency": r.get("currency") or _default_currency(),
        })
    total = frappe.db.count(cfg["doctype"], filters=filters)
    return {"rows": out, "total": total}


@frappe.whitelist()
def get_document(module, name):
    cfg = _cfg(module)
    _check(cfg["doctype"])
    doc = frappe.get_doc(cfg["doctype"], name)
    out = {
        "name": doc.name, "posting_date": str(getattr(doc, "posting_date", "") or ""),
        "docstatus": doc.docstatus,
        "currency": getattr(doc, "currency", None) or _default_currency(),
        "grand_total": flt(getattr(doc, "grand_total", 0)),
        "net_total": flt(getattr(doc, "net_total", 0)),
        "total_taxes_and_charges": flt(getattr(doc, "total_taxes_and_charges", 0)),
        "discount_amount": flt(getattr(doc, "discount_amount", 0)),
        "amount": flt(getattr(doc, "paid_amount", 0) or getattr(doc, "total_debit", 0)
                      or getattr(doc, "total_amount", 0)),
        "remarks": getattr(doc, "remarks", "") or getattr(doc, "remark", "") or "",
        "terms": getattr(doc, "terms", "") or "",
    }
    if cfg.get("party"):
        out["party"] = getattr(doc, cfg["party"], None)
    if cfg.get("ref"):
        out["ref_no"] = getattr(doc, cfg["ref"], None)
    if cfg.get("items") and hasattr(doc, "items"):
        out["items"] = [
            {"item_code": it.item_code, "item_name": it.item_name,
             "qty": flt(it.qty), "rate": flt(it.rate)}
            for it in doc.items
        ]
    if cfg.get("journal") and hasattr(doc, "accounts"):
        out["accounts"] = [
            {"account": a.account, "debit": flt(a.debit), "credit": flt(a.credit)}
            for a in doc.accounts
        ]
    return out


@frappe.whitelist()
def get_parties(module):
    cfg = _cfg(module)
    dt = cfg.get("party_dt")
    if not dt:
        return []
    _check(dt)
    return [d["name"] for d in frappe.get_all(dt, fields=["name"],
                                              order_by="name", limit_page_length=500)]


@frappe.whitelist()
def get_items(module=None):
    _check("Item")
    return frappe.get_all(
        "Item", filters={"disabled": 0},
        fields=["item_code", "item_name", "standard_rate as rate",
                "last_purchase_rate"],
        order_by="item_name", limit_page_length=1000,
    )


@frappe.whitelist()
def get_accounts():
    _check("Account")
    return [a["name"] for a in frappe.get_all(
        "Account", filters={"is_group": 0, "disabled": 0},
        fields=["name"], order_by="name", limit_page_length=1000)]


@frappe.whitelist()
def get_warehouses():
    _check("Warehouse")
    return [w["name"] for w in frappe.get_all(
        "Warehouse", filters={"is_group": 0, "disabled": 0},
        fields=["name"], order_by="name", limit_page_length=500)]


def _default_currency():
    company = frappe.defaults.get_user_default("Company") \
        or frappe.db.get_default("company")
    return frappe.get_cached_value("Company", company, "default_currency") \
        if company else None


# ----------------------------------------------------------------------
# Save (draft or submit)
# ----------------------------------------------------------------------
@frappe.whitelist()
def save_document(payload, submit=0):
    f = json.loads(payload or "{}")
    module = f.get("module")
    cfg = _cfg(module)
    _check(cfg["doctype"], "write")

    doc = frappe.new_doc(cfg["doctype"])
    # Static module filters (credit/debit notes, payment types, withholding)
    for k, v in (cfg.get("filters") or {}).items():
        doc.set(k, v)
    if cfg.get("payment_type"):
        doc.payment_type = cfg["payment_type"]
        doc.party_type = cfg["party_dt"]
        doc.party = f.get("party")
        doc.paid_amount = flt(f.get("total_ttc"))
        doc.received_amount = flt(f.get("total_ttc"))
        doc.reference_no = f.get("ref_no")
        doc.reference_date = f.get("posting_date")

    if cfg.get("party"):
        doc.set(cfg["party"], f.get("party"))
    if cfg.get("ref"):
        doc.set(cfg["ref"], f.get("ref_no"))
    doc.posting_date = f.get("posting_date")

    if cfg.get("items"):
        if cfg.get("stock"):
            doc.stock_entry_type = f.get("stock_type") or "Material Issue"
            for r in f.get("items") or []:
                if not r.get("item_name"):
                    continue
                row = doc.append("items", {
                    "item_code": r.get("item_code") or r.get("item_name"),
                    "qty": flt(r.get("qty")),
                })
        else:
            for r in f.get("items") or []:
                if not r.get("item_name"):
                    continue
                doc.append("items", {
                    "item_code": r.get("item_code") or r.get("item_name"),
                    "qty": flt(r.get("qty")),
                    "rate": flt(r.get("rate")),
                })

    if cfg.get("journal"):
        if module == "withholding":
            doc.voucher_type = "Withholding"
        for r in f.get("journal") or []:
            if not r.get("account"):
                continue
            doc.append("accounts", {
                "account": r["account"],
                "debit_in_account_currency": flt(r.get("debit")),
                "credit_in_account_currency": flt(r.get("credit")),
            })

    if f.get("discount") and hasattr(doc, "discount_amount"):
        doc.discount_amount = flt(f["discount"])
    if f.get("notes"):
        doc.remarks = f["notes"]
    if f.get("terms") and hasattr(doc, "terms"):
        doc.terms = f["terms"]

    doc.insert(ignore_permissions=False)
    if int(submit or 0) == 1:
        doc.submit()
    return {"name": doc.name, "docstatus": doc.docstatus}
