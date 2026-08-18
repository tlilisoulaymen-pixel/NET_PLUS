"""Everything the app needs is created here so `bench install-app netplus`
leaves you with a working system: roles, custom fields on core doctypes,
the Quality Feedback Template and default settings."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

ROLES = ["NetPlus Supervisor", "NetPlus Operator", "NetPlus Client"]

FEEDBACK_PARAMETERS = [
    "Propreté générale",
    "Détail des surfaces",
    "Ponctualité",
    "Professionnalisme",
    "Respect des consignes",
]

CUSTOM_FIELDS = {
    # ------------------------------------------------------------------ Task
    # Task == Mission. Native `status` is left untouched (core logic depends
    # on it); the mission lifecycle lives in `mission_status`.
    "Task": [
        dict(fieldname="netplus_section", label="Mission NetPlus",
             fieldtype="Section Break", insert_after="subject"),
        dict(fieldname="mission_status", label="Statut Mission", fieldtype="Select",
             options="\nPlanifiée\nEn cours\nTerminée\nEn retard critique\nAnnulée",
             default="Planifiée", in_list_view=1, in_standard_filter=1,
             insert_after="netplus_section"),
        dict(fieldname="customer", label="Client", fieldtype="Link",
             options="Customer", insert_after="mission_status"),
        dict(fieldname="site", label="Site (géofencé)", fieldtype="Link",
             options="Location", insert_after="customer"),
        dict(fieldname="service_contract", label="Contrat", fieldtype="Link",
             options="Service Contract", insert_after="site"),
        dict(fieldname="scheduled_start", label="Début prévu", fieldtype="Datetime",
             insert_after="service_contract"),
        dict(fieldname="scheduled_end", label="Fin prévue", fieldtype="Datetime",
             insert_after="scheduled_start"),
        dict(fieldname="mission_type", label="Type", fieldtype="Select",
             options="\nBureaux\nRésidentiel\nCommercial\nIndustriel\nAutre",
             insert_after="scheduled_end"),
        dict(fieldname="team_mode", label="Mode équipe", fieldtype="Select",
             options="Solo\nÉquipe", default="Solo", insert_after="mission_type"),
        dict(fieldname="operators", label="Opérateurs", fieldtype="Table",
             options="Mission Operator", insert_after="team_mode"),
        dict(fieldname="feedback_token", fieldtype="Data", hidden=1,
             no_copy=1, insert_after="operators"),
        dict(fieldname="feedback_token_expiry", fieldtype="Datetime", hidden=1,
             no_copy=1, insert_after="feedback_token"),
        dict(fieldname="feedback_status", label="Feedback", fieldtype="Select",
             options="\nEn attente\nSoumis\nExpiré", insert_after="feedback_token_expiry"),
    ],
    # -------------------------------------------------------------- Location
    # Location == geofenced site. latitude/longitude are native fields.
    "Location": [
        dict(fieldname="netplus_section", label="Site NetPlus",
             fieldtype="Section Break", insert_after="location_name"),
        dict(fieldname="customer", label="Client", fieldtype="Link",
             options="Customer", insert_after="netplus_section"),
        dict(fieldname="site_address", label="Adresse", fieldtype="Small Text",
             insert_after="customer"),
        dict(fieldname="geofence_radius", label="Rayon géofence (m)",
             fieldtype="Int", default="200", insert_after="site_address"),
        dict(fieldname="site_instructions", label="Consignes du site",
             fieldtype="Text", insert_after="geofence_radius"),
    ],
    # ------------------------------------------------------ Quality Feedback
    "Quality Feedback": [
        dict(fieldname="netplus_section", label="Feedback NetPlus",
             fieldtype="Section Break", insert_after="template"),
        dict(fieldname="task", label="Mission", fieldtype="Link", options="Task",
             unique=1, insert_after="netplus_section"),
        dict(fieldname="overall_rating", label="Note globale (1-5)",
             fieldtype="Int", insert_after="task"),
        dict(fieldname="np_comment", label="Commentaire", fieldtype="Small Text",
             length=1000, insert_after="overall_rating"),
        dict(fieldname="np_categories", label="Catégories", fieldtype="Data",
             insert_after="np_comment"),
        dict(fieldname="recommend", label="Recommanderait NetPlus (NPS)",
             fieldtype="Check", insert_after="np_categories"),
        dict(fieldname="editable_until", fieldtype="Datetime", hidden=1,
             insert_after="recommend"),
    ],
}


def after_install():
    make_roles()
    create_custom_fields(CUSTOM_FIELDS, ignore_validate=True)
    make_feedback_template()
    make_default_settings()
    frappe.db.commit()


def make_roles():
    for role in ROLES:
        if not frappe.db.exists("Role", role):
            frappe.get_doc({
                "doctype": "Role",
                "role_name": role,
                "desk_access": 0,        # portal roles never open Desk
            }).insert(ignore_permissions=True)


def make_feedback_template():
    name = "Prestation Nettoyage"
    if frappe.db.exists("Quality Feedback Template", {"template": name}):
        return
    doc = frappe.get_doc({
        "doctype": "Quality Feedback Template",
        "template": name,
        "parameters": [{"parameter": p} for p in FEEDBACK_PARAMETERS],
    })
    doc.insert(ignore_permissions=True)


def make_default_settings():
    settings = frappe.get_single("NetPlus Settings")
    if settings.geofence_radius_meters:
        return
    settings.update({
        "geofence_radius_meters": 200,
        "gps_accuracy_threshold_meters": 100,
        "warning_threshold_minutes": 5,
        "alert_threshold_minutes": 15,
        "critical_threshold_minutes": 30,
        "heartbeat_interval_minutes": 5,
        "heartbeat_timeout_minutes": 15,
        "feedback_token_ttl_hours": 72,
        "feedback_edit_window_hours": 24,
        "gps_data_retention_days": 90,
        "banned_words": "idiot\nstupide\nmerde",
    })
    settings.save(ignore_permissions=True)
