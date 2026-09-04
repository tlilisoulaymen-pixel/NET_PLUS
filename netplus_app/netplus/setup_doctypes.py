import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def setup_doctypes():
    # 1. Create Child Table DocType for Sites if not exists
    if not frappe.db.exists("DocType", "Service Contract Site"):
        doc = frappe.get_doc({
            "doctype": "DocType",
            "name": "Service Contract Site",
            "module": "NetPlus",
            "custom": 1,
            "istable": 1,
            "editable_grid": 1,
            "fields": [
                {"fieldname": "address", "label": "Address", "fieldtype": "Small Text"},
                {"fieldname": "lat", "label": "Latitude", "fieldtype": "Data"},
                {"fieldname": "lng", "label": "Longitude", "fieldtype": "Data"},
                {"fieldname": "rayon", "label": "Rayon (m)", "fieldtype": "Int", "default": "200"}
            ]
        })
        doc.insert(ignore_permissions=True)

    # 2. Add Custom Fields to Service Contract
    contract_fields = {
        "Service Contract": [
            {"fieldname": "superviseur", "label": "Superviseur", "fieldtype": "Link", "options": "Employee", "insert_after": "status"},
            {"fieldname": "type_de_service", "label": "Type de service", "fieldtype": "Data", "insert_after": "superviseur"},
            {"fieldname": "mode_d_equipe", "label": "Mode d'équipe", "fieldtype": "Data", "insert_after": "type_de_service"},
            {"fieldname": "chef_d_equipe_requis", "label": "Chef d'équipe requis", "fieldtype": "Check", "insert_after": "mode_d_equipe"},
            {"fieldname": "tarif_par_intervention", "label": "Tarif par intervention", "fieldtype": "Currency", "insert_after": "chef_d_equipe_requis"},
            {"fieldname": "devise", "label": "Devise", "fieldtype": "Link", "options": "Currency", "insert_after": "tarif_par_intervention"},
            {"fieldname": "cycle_de_facturation", "label": "Cycle de facturation", "fieldtype": "Select", "options": "Mensuel\nHebdomadaire\nAnnuel", "insert_after": "devise"},
            {"fieldname": "delai_de_paiement", "label": "Délai de paiement (jours)", "fieldtype": "Int", "insert_after": "cycle_de_facturation"},
            {"fieldname": "lois_applicables", "label": "Lois applicables", "fieldtype": "Small Text", "insert_after": "delai_de_paiement"},
            {"fieldname": "notes", "label": "Notes", "fieldtype": "Text", "insert_after": "lois_applicables"},
            {"fieldname": "sites_du_contrat", "label": "Sites du contrat", "fieldtype": "Table", "options": "Service Contract Site", "insert_after": "notes"}
        ]
    }
    create_custom_fields(contract_fields, ignore_validate=True)

    # 3. Create Child Table DocType for Assigned Operators if not exists
    if not frappe.db.exists("DocType", "Mission Assigned Operator"):
        doc = frappe.get_doc({
            "doctype": "DocType",
            "name": "Mission Assigned Operator",
            "module": "NetPlus",
            "custom": 1,
            "istable": 1,
            "editable_grid": 1,
            "fields": [
                {"fieldname": "operator", "label": "Operator", "fieldtype": "Link", "options": "User", "reqd": 1}
            ]
        })
        doc.insert(ignore_permissions=True)

    # 4. Create Child Table DocType for Excluded Dates
    if not frappe.db.exists("DocType", "Mission Excluded Date"):
        doc = frappe.get_doc({
            "doctype": "DocType",
            "name": "Mission Excluded Date",
            "module": "NetPlus",
            "custom": 1,
            "istable": 1,
            "editable_grid": 1,
            "fields": [
                {"fieldname": "date", "label": "Date", "fieldtype": "Date", "reqd": 1}
            ]
        })
        doc.insert(ignore_permissions=True)

    # 5. Add Custom Fields to Mission
    mission_fields = {
        "Mission": [
            {"fieldname": "contract", "label": "Contrat de service", "fieldtype": "Link", "options": "Service Contract", "insert_after": "status"},
            {"fieldname": "client", "label": "Client", "fieldtype": "Read Only", "fetch_from": "contract.party_name", "insert_after": "contract"},
            {"fieldname": "superviseur", "label": "Superviseur", "fieldtype": "Link", "options": "Employee", "insert_after": "client"},
            {"fieldname": "type", "label": "Type", "fieldtype": "Data", "insert_after": "superviseur"},
            {"fieldname": "mode_d_equipe", "label": "Mode d'équipe", "fieldtype": "Data", "insert_after": "type"},
            {"fieldname": "site_address", "label": "Adresse", "fieldtype": "Small Text", "insert_after": "mode_d_equipe"},
            {"fieldname": "lat", "label": "Latitude", "fieldtype": "Data", "insert_after": "site_address"},
            {"fieldname": "lng", "label": "Longitude", "fieldtype": "Data", "insert_after": "lat"},
            {"fieldname": "rayon", "label": "Rayon (m)", "fieldtype": "Int", "default": "200", "insert_after": "lng"},
            {"fieldname": "instructions", "label": "Instructions", "fieldtype": "Text", "insert_after": "rayon"},
            
            # Recurrence Model
            {"fieldname": "recurrence_model", "label": "Modèle de récurrence", "fieldtype": "Select", "options": "Ponctuelle\nRécurrente Hebdo\nPériode Continue", "insert_after": "instructions"},
            {"fieldname": "start_datetime", "label": "Début prévu", "fieldtype": "Datetime", "depends_on": "eval:doc.recurrence_model=='Ponctuelle'", "insert_after": "recurrence_model"},
            {"fieldname": "end_datetime", "label": "Fin prévue", "fieldtype": "Datetime", "depends_on": "eval:doc.recurrence_model=='Ponctuelle'", "insert_after": "start_datetime"},
            
            {"fieldname": "start_date", "label": "Date de début", "fieldtype": "Date", "depends_on": "eval:doc.recurrence_model!='Ponctuelle'", "insert_after": "end_datetime"},
            {"fieldname": "end_date", "label": "Date de fin", "fieldtype": "Date", "depends_on": "eval:doc.recurrence_model!='Ponctuelle'", "insert_after": "start_date"},
            {"fieldname": "start_time", "label": "Heure de début", "fieldtype": "Time", "depends_on": "eval:doc.recurrence_model!='Ponctuelle'", "insert_after": "end_date"},
            {"fieldname": "end_time", "label": "Heure de fin", "fieldtype": "Time", "depends_on": "eval:doc.recurrence_model!='Ponctuelle'", "insert_after": "start_time"},
            
            {"fieldname": "lun", "label": "Lun", "fieldtype": "Check", "depends_on": "eval:doc.recurrence_model=='Récurrente Hebdo'", "insert_after": "end_time"},
            {"fieldname": "mar", "label": "Mar", "fieldtype": "Check", "depends_on": "eval:doc.recurrence_model=='Récurrente Hebdo'", "insert_after": "lun"},
            {"fieldname": "mer", "label": "Mer", "fieldtype": "Check", "depends_on": "eval:doc.recurrence_model=='Récurrente Hebdo'", "insert_after": "mar"},
            {"fieldname": "jeu", "label": "Jeu", "fieldtype": "Check", "depends_on": "eval:doc.recurrence_model=='Récurrente Hebdo'", "insert_after": "mer"},
            {"fieldname": "ven", "label": "Ven", "fieldtype": "Check", "depends_on": "eval:doc.recurrence_model=='Récurrente Hebdo'", "insert_after": "jeu"},
            {"fieldname": "sam", "label": "Sam", "fieldtype": "Check", "depends_on": "eval:doc.recurrence_model=='Récurrente Hebdo'", "insert_after": "ven"},
            {"fieldname": "dim", "label": "Dim", "fieldtype": "Check", "depends_on": "eval:doc.recurrence_model=='Récurrente Hebdo'", "insert_after": "sam"},
            
            {"fieldname": "excluded_dates", "label": "Dates exclues", "fieldtype": "Table", "options": "Mission Excluded Date", "depends_on": "eval:doc.recurrence_model=='Récurrente Hebdo'", "insert_after": "dim"},
            
            {"fieldname": "assigned_operators", "label": "Opérateurs assignés", "fieldtype": "Table", "options": "Mission Assigned Operator", "insert_after": "excluded_dates"},
            {"fieldname": "notes_internes", "label": "Notes internes", "fieldtype": "Text", "insert_after": "assigned_operators"}
        ]
    }
    create_custom_fields(mission_fields, ignore_validate=True)
    
    frappe.db.commit()
