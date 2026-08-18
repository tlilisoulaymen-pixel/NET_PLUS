"""NetPlus Client API — endpoints du portail client mobile.

Le client est résolu CÔTÉ SERVEUR via la chaîne native ERPNext :
User (session) -> Contact (user) -> Dynamic Link -> Customer.
Un client ne voit que les missions des projets de SON Customer.

Les noms de champs custom sont centralisés dans FIELD — alignez-les avec
votre schéma réel (voir INTEGRATION.md §3).
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, getdate, now_datetime

ROLE_CLIENT = "NetPlus Client"

FIELD = {
    # Task
    "task_site": "site",
    # Quality Feedback (custom fields)
    "qf_task": "netplus_task",
    "qf_customer": "netplus_customer",
    "qf_overall": "netplus_overall",
    "qf_comment": "netplus_comment",
    "qf_nps": "netplus_nps",
}

FEEDBACK_TEMPLATE = "Prestation Nettoyage"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _require_client():
    if frappe.session.user == "Guest":
        frappe.throw(_("Connexion requise"), frappe.AuthenticationError)
    if not ({ROLE_CLIENT, "System Manager"} & set(frappe.get_roles())):
        frappe.throw(_("Réservé aux clients"), frappe.PermissionError)


def _customer():
    """User -> Contact -> Dynamic Link -> Customer (chaîne native)."""
    user = frappe.session.user
    contact = frappe.db.get_value("Contact", {"user": user},
                                  ["name", "first_name", "last_name"], as_dict=True)
    customer = None
    if contact:
        customer = frappe.db.get_value(
            "Dynamic Link",
            {"parenttype": "Contact", "parent": contact.name, "link_doctype": "Customer"},
            "link_name",
        )
    if not customer and "System Manager" in frappe.get_roles():
        customer = frappe.db.get_value("Customer", {}, "name")  # démo admin
    if not customer:
        frappe.throw(_("Aucun client n'est associé à votre compte. "
                       "Contactez NetPlus pour lier votre accès."))
    label = frappe.db.get_value("Customer", customer, "customer_name") or customer
    return frappe._dict(name=customer, label=label, contact=contact)


def _projects(customer):
    return frappe.get_all("Project", filters={"customer": customer},
                          pluck="name", limit_page_length=0)


def _site_labels(sites):
    sites = [s for s in set(sites) if s]
    if not sites:
        return {}
    return {
        l.name: (l.location_name or l.name) for l in frappe.get_all(
            "Location", filters={"name": ["in", sites]},
            fields=["name", "location_name"], limit_page_length=0,
        )
    }


def _tasks_of(customer, limit=200):
    missions = []
    if frappe.db.exists("DocType", "Mission"):
        for m in frappe.get_all(
            "Mission",
            filters={"customer": customer, "mission_status": ["not in", ["Annulée"]]},
            fields=["name", "customer", "site_address", "site_lat", "site_lng", "scheduled_start", "scheduled_end", "mission_status"],
            order_by="scheduled_start desc",
            limit_page_length=limit,
        ):
            missions.append(frappe._dict(
                name=m.name,
                subject=f"{m.customer} — {m.site_address or m.name}",
                status=m.mission_status,
                exp_start_date=m.scheduled_start,
                exp_end_date=m.scheduled_end,
                site=m.site_address or m.customer,
            ))
    projects = _projects(customer)
    if projects:
        for t in frappe.get_all(
            "Task",
            filters={"project": ["in", projects],
                     "status": ["not in", ["Cancelled", "Template"]]},
            fields=["name", "subject", "status", "exp_start_date", "exp_end_date",
                    "project", FIELD["task_site"]],
            order_by="exp_start_date desc", limit_page_length=limit,
        ):
            missions.append(t)
    return missions


def _feedback_by_task(customer):
    if not frappe.db.exists("DocType", "Quality Feedback"):
        return {}
    meta = {f.fieldname for f in frappe.get_meta("Quality Feedback").fields}
    if FIELD["qf_task"] not in meta:
        return {}
    filters = {FIELD["qf_task"]: ["is", "set"]}
    if FIELD["qf_customer"] in meta:
        filters[FIELD["qf_customer"]] = customer
    fields = ["name", FIELD["qf_task"], "creation"]
    for f in (FIELD["qf_overall"], FIELD["qf_comment"], FIELD["qf_nps"]):
        if f in meta:
            fields.append(f)
    return {
        r.get(FIELD["qf_task"]): r for r in frappe.get_all(
            "Quality Feedback", filters=filters, fields=fields,
            order_by="creation desc", limit_page_length=0,
        )
    }


def _mission_state(t):
    """planned / ongoing / done, à partir du statut Mission ou Task."""
    now = now_datetime()
    start_dt = get_datetime(t.exp_start_date) if t.get("exp_start_date") else None
    end_dt = get_datetime(t.exp_end_date) if t.get("exp_end_date") else None
    st = getattr(t, "status", "") or getattr(t, "mission_status", "")

    if st in ("Terminée", "Completed"):
        return "done"
    if st in ("En cours", "Working", "Pending Review"):
        if end_dt and end_dt < now:
            return "done"
        return "ongoing"
    if end_dt and end_dt < now:
        return "done"
    return "planned"


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------
@frappe.whitelist()
def bootstrap():
    _require_client()
    cust = _customer()
    tasks = _tasks_of(cust.name)
    sites = _site_labels([t.get(FIELD["task_site"]) for t in tasks])
    fb = _feedback_by_task(cust.name)

    now = now_datetime()
    interventions, to_rate, upcoming = [], [], []
    for t in tasks:
        state = _mission_state(t)
        item = {
            "task": t.name, "subject": t.subject, "state": state,
            "site": sites.get(t.get(FIELD["task_site"]), t.get(FIELD["task_site"])),
            "start": str(t.exp_start_date or ""), "end": str(t.exp_end_date or ""),
            "rated": t.name in fb,
        }
        interventions.append(item)
        if state == "done" and t.name not in fb:
            to_rate.append(item)
        if state == "planned" and t.exp_start_date \
                and get_datetime(t.exp_start_date) >= now:
            upcoming.append(item)
    upcoming.sort(key=lambda i: i["start"])

    # Satisfaction : distribution 3 barres (5★ / 4★ / ≤3★) + tendance
    ratings = [flt(r.get(FIELD["qf_overall"])) for r in fb.values()
               if r.get(FIELD["qf_overall"])]
    dist = {"high": 0, "mid": 0, "low": 0}
    for v in ratings:
        dist["high" if v >= 4.5 else "mid" if v >= 3.5 else "low"] += 1
    trend = [
        {"when": str(r.creation), "overall": flt(r.get(FIELD["qf_overall"]) or 0)}
        for r in sorted(fb.values(), key=lambda r: str(r.creation))
    ][-12:]

    contracts_count = 0
    if frappe.db.exists("DocType", "Service Contract"):
        meta = {f.fieldname for f in frappe.get_meta("Service Contract").fields}
        cf = "customer" if "customer" in meta else ("client" if "client" in meta else None)
        if cf:
            contracts_count = frappe.db.count("Service Contract", {cf: cust.name})

    contact = cust.contact
    first_name = (contact and contact.first_name) or \
        (frappe.db.get_value("User", frappe.session.user, "first_name")) or cust.label

    return {
        "profile": {
            "user": frappe.session.user,
            "first_name": first_name,
            "full_name": frappe.db.get_value("User", frappe.session.user, "full_name")
                or frappe.session.user,
            "customer": cust.name, "customer_label": cust.label,
        },
        "satisfaction": {
            "avg": round(sum(ratings) / len(ratings), 1) if ratings else None,
            "count": len(ratings), "dist": dist, "trend": trend,
        },
        "to_rate": to_rate[:10],
        "upcoming": upcoming[:10],
        "interventions_count": len(interventions),
        "contracts_count": contracts_count,
        "feedback_params": _template_params(),
    }


def _template_params():
    try:
        tpl = frappe.get_doc("Quality Feedback Template", FEEDBACK_TEMPLATE)
        return [p.parameter for p in (tpl.parameters or []) if p.parameter]
    except Exception:
        return ["Ponctualité", "Qualité du nettoyage", "Professionnalisme",
                "Communication", "Résultat global"]


# ---------------------------------------------------------------------------
# Interventions
# ---------------------------------------------------------------------------
@frappe.whitelist()
def interventions(scope="all"):
    _require_client()
    cust = _customer()
    tasks = _tasks_of(cust.name)
    sites = _site_labels([t.get(FIELD["task_site"]) for t in tasks])
    fb = _feedback_by_task(cust.name)

    out = []
    for t in tasks:
        state = _mission_state(t)
        if scope == "upcoming" and state == "done":
            continue
        if scope == "done" and state != "done":
            continue
        r = fb.get(t.name)
        out.append({
            "task": t.name, "subject": t.subject, "state": state,
            "site": sites.get(t.get(FIELD["task_site"]), t.get(FIELD["task_site"])),
            "start": str(t.exp_start_date or ""), "end": str(t.exp_end_date or ""),
            "rated": bool(r),
            "my_rating": r and flt(r.get(FIELD["qf_overall"]) or 0),
        })
    return out


# ---------------------------------------------------------------------------
# Feedback (< 30 s)
# ---------------------------------------------------------------------------
@frappe.whitelist()
def submit_feedback(task, overall, ratings=None, comment=None, nps=None):
    _require_client()
    cust = _customer()

    # la mission doit appartenir au client
    is_valid = False
    if frappe.db.exists("Mission", task):
        m_cust = frappe.db.get_value("Mission", task, "customer")
        if m_cust == cust.name:
            is_valid = True
    elif frappe.db.exists("Task", task):
        t = frappe.db.get_value("Task", task, ["name", "project", "subject"], as_dict=True)
        if t and t.project and frappe.db.get_value("Project", t.project, "customer") == cust.name:
            is_valid = True

    if not is_valid:
        frappe.throw(_("Cette intervention n'appartient pas à votre compte."),
                     frappe.PermissionError)

    overall = flt(overall)
    if not (1 <= overall <= 5):
        frappe.throw(_("La note globale doit être entre 1 et 5."))
    nps = cint(nps) if nps not in (None, "") else None
    if nps is not None and not (0 <= nps <= 10):
        frappe.throw(_("Le NPS doit être entre 0 et 10."))

    meta = {f.fieldname for f in frappe.get_meta("Quality Feedback").fields}
    if FIELD["qf_task"] in meta and frappe.db.exists(
            "Quality Feedback", {FIELD["qf_task"]: task}):
        frappe.throw(_("Vous avez déjà évalué cette intervention. Merci !"))

    doc = frappe.new_doc("Quality Feedback")
    if "template" in meta and frappe.db.exists(
            "Quality Feedback Template", FEEDBACK_TEMPLATE):
        doc.template = FEEDBACK_TEMPLATE
        try:
            doc.set_parameters()  # copie les paramètres du template si dispo
        except Exception:
            pass
    for f, v in ((FIELD["qf_task"], task), (FIELD["qf_customer"], cust.name),
                 (FIELD["qf_overall"], overall), (FIELD["qf_comment"], comment),
                 (FIELD["qf_nps"], nps)):
        if f in meta and v is not None:
            doc.set(f, v)

    # notes par paramètre (1..5) -> child table si présente
    ratings = json.loads(ratings) if isinstance(ratings, str) else (ratings or {})
    if ratings and doc.get("parameters"):
        for row in doc.parameters:
            v = flt(ratings.get(row.parameter))
            if v and hasattr(row, "rating"):
                row.rating = v / 5.0  # fieldtype Rating = fraction 0..1
    doc.insert(ignore_permissions=True)
    if doc.meta.is_submittable:
        try:
            doc.submit()  # déclenche on_submit -> scoring opérateur
        except Exception:
            frappe.log_error(frappe.get_traceback(), "client feedback submit failed")

    return {"ok": True, "name": doc.name}


@frappe.whitelist()
def my_feedback(limit=30):
    _require_client()
    cust = _customer()
    fb = _feedback_by_task(cust.name)
    tasks = {t.name: t for t in _tasks_of(cust.name)}
    sites = _site_labels([t.get(FIELD["task_site"]) for t in tasks.values()])
    out = []
    for task, r in fb.items():
        t = tasks.get(task)
        site_label = t.get("site") if t else None
        if not site_label and t:
            site_label = sites.get(t.get(FIELD["task_site"]))
        out.append({
            "name": r.name, "task": task,
            "subject": t and t.subject,
            "site": site_label,
            "overall": flt(r.get(FIELD["qf_overall"]) or 0),
            "comment": r.get(FIELD["qf_comment"]),
            "nps": r.get(FIELD["qf_nps"]),
            "when": str(r.creation),
        })
    out.sort(key=lambda x: x["when"], reverse=True)
    return out[:min(cint(limit) or 30, 50)]


# ---------------------------------------------------------------------------
# Contrats
# ---------------------------------------------------------------------------
@frappe.whitelist()
def contracts():
    _require_client()
    cust = _customer()
    if not frappe.db.exists("DocType", "Service Contract"):
        return []
    meta_fields = {f.fieldname for f in frappe.get_meta("Service Contract").fields}
    cf = "customer" if "customer" in meta_fields else \
         ("client" if "client" in meta_fields else None)
    if not cf:
        return []
    fields = ["name", "creation"] + [f for f in
              ("status", "effective_date", "expiry_date", "end_date",
               "rate_per_intervention", "qr_payload") if f in meta_fields]
    rows = frappe.get_all("Service Contract", filters={cf: cust.name},
                          fields=fields, order_by="creation desc",
                          limit_page_length=50)
    for r in rows:
        r["active"] = (r.get("status") or "").lower() in ("active", "actif")
    return rows
