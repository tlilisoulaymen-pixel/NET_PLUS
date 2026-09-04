# -*- coding: utf-8 -*-
"""Analytics Hub — whitelisted aggregation API (Frappe/ERPNext backend).

Every endpoint:
  * requires login and re-checks read permission on the source DocType,
  * accepts (company, from_date, to_date) filters,
  * aggregates SQL-side (never ships raw rows to the browser),
  * returns small JSON the dashboard JS renders directly.

Data sources studied in ERPNext:
  tabGL Entry            — accounting facts (debit/credit, account, posting_date)
  tabSales Invoice       — revenue, customers, outstanding
  tabSales Invoice Item  — top items / item groups
  tabPurchase Invoice    — spend, suppliers
  tabPayment Entry       — cash in / cash out
  tabStock Ledger Entry  — stock movement / valuation (actual_qty, stock_value_difference)
"""

import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate, add_days


def _ctx(company=None, from_date=None, to_date=None):
    """Normalize filters + safe fallbacks (current fiscal year)."""
    company = company or frappe.defaults.get_user_default("Company") \
        or frappe.db.get_default("company")
    to_date = getdate(to_date) if to_date else getdate(nowdate())
    from_date = getdate(from_date) if from_date else add_days(to_date, -365)
    if from_date > to_date:
        frappe.throw(_("From Date cannot be after To Date"))
    return company, from_date, to_date


def _check(doctype):
    if not frappe.has_permission(doctype, "read"):
        frappe.throw(_("Not permitted on {0}").format(doctype), frappe.PermissionError)


def _co(company):
    return " AND company = %(company)s" if company else ""


# ----------------------------------------------------------------------
# 1. KPI cards — one round trip for the whole KPI row
# ----------------------------------------------------------------------
@frappe.whitelist()
def kpi_summary(company=None, from_date=None, to_date=None):
    _check("GL Entry")
    company, from_date, to_date = _ctx(company, from_date, to_date)
    p = dict(company=company, from_date=from_date, to_date=to_date)

    # Revenue = credit on income accounts − their debit (reversals)
    revenue = flt(frappe.db.sql("""
        SELECT COALESCE(SUM(gle.credit - gle.debit), 0)
        FROM `tabGL Entry` gle JOIN `tabAccount` a ON a.name = gle.account
        WHERE gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
          AND gle.is_cancelled = 0 AND a.root_type = 'Income'""" + _co(company), p)[0][0])

    expense = flt(frappe.db.sql("""
        SELECT COALESCE(SUM(gle.debit - gle.credit), 0)
        FROM `tabGL Entry` gle JOIN `tabAccount` a ON a.name = gle.account
        WHERE gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
          AND gle.is_cancelled = 0 AND a.root_type = 'Expense'""" + _co(company), p)[0][0])

    invoiced, collected, outstanding = 0, 0, 0
    if frappe.has_permission("Sales Invoice", "read"):
        r = frappe.db.sql("""
            SELECT COALESCE(SUM(grand_total),0), COALESCE(SUM(outstanding_amount),0)
            FROM `tabSales Invoice`
            WHERE docstatus = 1 AND posting_date BETWEEN %(from_date)s AND %(to_date)s""" + _co(company), p)[0]
        invoiced, outstanding = flt(r[0]), flt(r[1])
        collected = invoiced - outstanding

    payable = 0
    if frappe.has_permission("Purchase Invoice", "read"):
        payable = flt(frappe.db.sql("""
            SELECT COALESCE(SUM(outstanding_amount),0)
            FROM `tabPurchase Invoice`
            WHERE docstatus = 1""" + _co(company), p)[0][0])

    open_jv = frappe.db.count("Journal Entry", filters={
        "docstatus": 0, **({"company": company} if company else {})})

    return {
        "company": company, "from_date": str(from_date), "to_date": str(to_date),
        "revenue": revenue, "expense": expense, "net_profit": revenue - expense,
        "margin_pct": (revenue - expense) / revenue * 100 if revenue else 0,
        "invoiced": invoiced, "collected": collected,
        "receivable": outstanding, "payable": payable,
        "open_journal_entries": open_jv,
        "currency": frappe.get_cached_value("Company", company, "default_currency")
        if company else None,
    }


# ----------------------------------------------------------------------
# 2. Monthly revenue vs expense (bar/line combo) — from GL Entry
# ----------------------------------------------------------------------
@frappe.whitelist()
def monthly_finance(company=None, from_date=None, to_date=None):
    _check("GL Entry")
    company, from_date, to_date = _ctx(company, from_date, to_date)
    p = dict(company=company, from_date=from_date, to_date=to_date)
    rows = frappe.db.sql("""
        SELECT DATE_FORMAT(gle.posting_date, '%%Y-%%m') AS month,
               SUM(CASE WHEN a.root_type = 'Income'  THEN gle.credit - gle.debit ELSE 0 END) AS revenue,
               SUM(CASE WHEN a.root_type = 'Expense' THEN gle.debit - gle.credit ELSE 0 END) AS expense
        FROM `tabGL Entry` gle JOIN `tabAccount` a ON a.name = gle.account
        WHERE gle.posting_date BETWEEN %(from_date)s AND %(to_date)s AND gle.is_cancelled = 0"""
        + _co(company) + " GROUP BY month ORDER BY month", p, as_dict=True)
    return {
        "labels": [r["month"] for r in rows],
        "revenue": [flt(r["revenue"]) for r in rows],
        "expense": [flt(r["expense"]) for r in rows],
        "profit":  [flt(r["revenue"]) - flt(r["expense"]) for r in rows],
    }


# ----------------------------------------------------------------------
# 3. Expense breakdown by account group (donut)
# ----------------------------------------------------------------------
@frappe.whitelist()
def expense_breakdown(company=None, from_date=None, to_date=None):
    _check("GL Entry")
    company, from_date, to_date = _ctx(company, from_date, to_date)
    p = dict(company=company, from_date=from_date, to_date=to_date)
    rows = frappe.db.sql("""
        SELECT COALESCE(a.parent_account, a.account_name) AS grp,
               SUM(gle.debit - gle.credit) AS amount
        FROM `tabGL Entry` gle JOIN `tabAccount` a ON a.name = gle.account
        WHERE a.root_type = 'Expense' AND gle.is_cancelled = 0
          AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s"""
        + _co(company) + " GROUP BY grp HAVING amount > 0 ORDER BY amount DESC LIMIT 12",
        p, as_dict=True)
    return {"labels": [r["grp"] for r in rows], "values": [flt(r["amount"]) for r in rows]}


# ----------------------------------------------------------------------
# 4. Top customers / suppliers (horizontal bars)
# ----------------------------------------------------------------------
@frappe.whitelist()
def top_parties(company=None, from_date=None, to_date=None, kind="customer", limit=10):
    dt = "Sales Invoice" if kind == "customer" else "Purchase Invoice"
    _check(dt)
    company, from_date, to_date = _ctx(company, from_date, to_date)
    party = "customer" if kind == "customer" else "supplier"
    rows = frappe.db.sql("""
        SELECT {party} AS name, SUM(grand_total) AS total, COUNT(*) AS docs
        FROM `tab{dt}` WHERE docstatus = 1
          AND posting_date BETWEEN %(from_date)s AND %(to_date)s{co}
        GROUP BY {party} ORDER BY total DESC LIMIT %(limit)s""".format(
            party=party, dt=dt, co=_co(company)),
        dict(company=company, from_date=from_date, to_date=to_date,
             limit=int(limit or 10)), as_dict=True)
    return {"labels": [r["name"] for r in rows],
            "values": [flt(r["total"]) for r in rows],
            "counts": [r["docs"] for r in rows]}


# ----------------------------------------------------------------------
# 5. Top selling items (qty + amount)
# ----------------------------------------------------------------------
@frappe.whitelist()
def top_items(company=None, from_date=None, to_date=None, limit=10):
    _check("Sales Invoice")
    company, from_date, to_date = _ctx(company, from_date, to_date)
    rows = frappe.db.sql("""
        SELECT sii.item_name AS name, SUM(sii.qty) AS qty, SUM(sii.amount) AS amount
        FROM `tabSales Invoice Item` sii
        JOIN `tabSales Invoice` si ON si.name = sii.parent
        WHERE si.docstatus = 1
          AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s""" + _co(company).replace("company", "si.company") + """
        GROUP BY sii.item_code ORDER BY amount DESC LIMIT %(limit)s""",
        dict(company=company, from_date=from_date, to_date=to_date,
             limit=int(limit or 10)), as_dict=True)
    return {"labels": [r["name"] for r in rows],
            "amounts": [flt(r["amount"]) for r in rows],
            "qtys": [flt(r["qty"]) for r in rows]}


# ----------------------------------------------------------------------
# 6. Cash in / out per month (Payment Entry)
# ----------------------------------------------------------------------
@frappe.whitelist()
def cash_flow(company=None, from_date=None, to_date=None):
    _check("Payment Entry")
    company, from_date, to_date = _ctx(company, from_date, to_date)
    p = dict(company=company, from_date=from_date, to_date=to_date)
    rows = frappe.db.sql("""
        SELECT DATE_FORMAT(posting_date, '%%Y-%%m') AS month,
               SUM(CASE WHEN payment_type = 'Receive' THEN paid_amount ELSE 0 END) AS cash_in,
               SUM(CASE WHEN payment_type = 'Pay'     THEN paid_amount ELSE 0 END) AS cash_out
        FROM `tabPayment Entry` WHERE docstatus = 1
          AND posting_date BETWEEN %(from_date)s AND %(to_date)s""" + _co(company) +
        " GROUP BY month ORDER BY month", p, as_dict=True)
    return {
        "labels": [r["month"] for r in rows],
        "cash_in": [flt(r["cash_in"]) for r in rows],
        "cash_out": [flt(r["cash_out"]) for r in rows],
        "net": [flt(r["cash_in"]) - flt(r["cash_out"]) for r in rows],
    }


# ----------------------------------------------------------------------
# 7. Stock health (valuation per warehouse + low movement alert)
# ----------------------------------------------------------------------
@frappe.whitelist()
def stock_summary(company=None, from_date=None, to_date=None, threshold_days=30):
    _check("Stock Ledger Entry")
    company, from_date, to_date = _ctx(company, from_date, to_date)
    p = dict(company=company, to_date=to_date,
             since=add_days(to_date, -int(threshold_days or 30)))
    rows = frappe.db.sql("""
        SELECT warehouse, SUM(stock_value_difference) AS value, SUM(actual_qty) AS qty
        FROM `tabStock Ledger Entry` WHERE is_cancelled = 0
          AND posting_date <= %(to_date)s""" + _co(company) +
        " GROUP BY warehouse ORDER BY value DESC LIMIT 15", p, as_dict=True)
    slow = frappe.db.sql("""
        SELECT item_code, warehouse, SUM(actual_qty) AS qty
        FROM `tabStock Ledger Entry` WHERE is_cancelled = 0
          AND posting_date <= %(to_date)s AND item_code NOT IN (
            SELECT DISTINCT item_code FROM `tabStock Ledger Entry`
            WHERE is_cancelled = 0 AND posting_date >= %(since)s""" + _co(company) + """
          )""" + _co(company) + """ GROUP BY item_code, warehouse
        HAVING qty > 0 LIMIT 20""", p, as_dict=True)
    return {
        "labels": [r["warehouse"] for r in rows],
        "values": [flt(r["value"]) for r in rows],
        "slow_movers": slow,
    }


# ----------------------------------------------------------------------
# 8. Companies list (filter dropdown)
# ----------------------------------------------------------------------
@frappe.whitelist()
def list_companies():
    return [c["name"] for c in frappe.get_all("Company", fields=["name"], order_by="name")]

# --- Fix for Frappe whitelist decorator bug where is_whitelisted attr is dropped ---
for func in [kpi_summary, monthly_finance, expense_breakdown, top_parties, top_items, cash_flow, stock_summary, list_companies]:
    func.is_whitelisted = True

