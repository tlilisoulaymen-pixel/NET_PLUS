"""
NetPlus Demo Data Seeder v3 — correct Link field references
Run via: bench --site frontend execute netplus.seed_demo.run
"""
import frappe
from frappe.utils import add_days, getdate
from datetime import datetime


def run():
    frappe.set_user("Administrator")
    print("🌱 Seeding NetPlus demo data v3...")

    _fix_all_user_permissions()
    _seed_customers()
    sup_emp = _ensure_supervisor_employee()
    op_emp  = _ensure_operator_employee()
    _seed_service_contracts(sup_emp)
    _seed_missions(sup_emp)
    _seed_operator_scores(op_emp)
    _seed_quality_feedbacks()

    frappe.db.commit()
    print("✅ Demo data seeding complete!")


def _fix_all_user_permissions():
    users = {
        "supervisor1@netplus.ca": ["NetPlus Supervisor", "HR User"],
        "operator1@netplus.ca":   ["NetPlus Operator"],
        "jdupont@gestionimmo.ca": ["NetPlus Client", "Customer"],
    }
    for email, roles in users.items():
        if not frappe.db.exists("User", email):
            continue
        frappe.db.set_value("User", email, "user_type", "System User")
        user = frappe.get_doc("User", email)
        existing = [r.role for r in user.roles]
        for role in roles:
            if role not in existing:
                if not frappe.db.exists("Role", role):
                    r = frappe.new_doc("Role")
                    r.role_name = role
                    r.desk_access = 1
                    r.insert(ignore_permissions=True)
                user.append("roles", {"role": role})
        user.save(ignore_permissions=True)
        print(f"  ✅ Fixed user: {email}")


def _seed_customers():
    for cname in ["Immeubles du Plateau SENC", "Logistique Pro Laval Inc."]:
        if not frappe.db.exists("Customer", cname):
            c = frappe.new_doc("Customer")
            c.customer_name = cname
            c.customer_type = "Company"
            c.insert(ignore_permissions=True)
            print(f"  ✅ Created customer: {cname}")
        else:
            print(f"  ⏭ Customer exists: {cname}")


def _ensure_supervisor_employee():
    """Return the Employee ID linked to supervisor1@netplus.ca."""
    emp = frappe.db.get_value("Employee", {"user_id": "supervisor1@netplus.ca"}, "name")
    if emp:
        print(f"  ⏭ Supervisor employee exists: {emp}")
        return emp
    e = frappe.new_doc("Employee")
    e.employee_name = "Michel Tremblay"
    e.user_id = "supervisor1@netplus.ca"
    e.status = "Active"
    e.gender = "Male"
    e.date_of_joining = add_days(getdate(), -365)
    e.insert(ignore_permissions=True)
    print(f"  ✅ Created supervisor employee: {e.name}")
    return e.name


def _ensure_operator_employee():
    """Return the Employee ID linked to operator1@netplus.ca."""
    emp = frappe.db.get_value("Employee", {"user_id": "operator1@netplus.ca"}, "name")
    if emp:
        print(f"  ⏭ Operator employee exists: {emp}")
        return emp
    e = frappe.new_doc("Employee")
    e.first_name = "Ali"
    e.employee_name = "Ali Hassan"
    e.user_id = "operator1@netplus.ca"
    e.status = "Active"
    e.gender = "Male"
    e.date_of_birth = add_days(getdate(), -365 * 30)
    e.date_of_joining = add_days(getdate(), -200)
    e.insert(ignore_permissions=True)
    print(f"  ✅ Created operator employee: {e.name}")
    return e.name


def _seed_service_contracts(sup_emp):
    contracts = [
        {
            "name": "CNT-2026-00482",
            "customer": "Gestion Immobilière Commerciale Inc.",
            "supervisor": sup_emp,
            "status": "Actif",
            "service_type": "Nettoyage commercial",
            "team_mode": "Équipe",
            "requires_team_lead": 1,
            "rate_per_intervention": 350.00,
            "currency": "CAD",
            "billing_cycle": "Mensuel",
            "payment_terms_days": 30,
            "effective_date": add_days(getdate(), -90),
            "expiration_date": add_days(getdate(), 275),
            "version": "1.0",
            "days": [("Friday", "18:00:00", "22:00:00")],
            "sites": [("SITE-9901", "1234 Rue Sherbrooke Ouest, Montréal, QC H3G 1H6", 45.4988, -73.5781, 200)],
        },
        {
            "name": "CNT-2026-00491",
            "customer": "Immeubles du Plateau SENC",
            "supervisor": sup_emp,
            "status": "Actif",
            "service_type": "Nettoyage commercial",
            "team_mode": "Solo",
            "requires_team_lead": 0,
            "rate_per_intervention": 275.00,
            "currency": "CAD",
            "billing_cycle": "Mensuel",
            "payment_terms_days": 30,
            "effective_date": add_days(getdate(), -60),
            "expiration_date": add_days(getdate(), 305),
            "version": "1.0",
            "days": [("Wednesday", "14:00:00", "17:00:00")],
            "sites": [("SITE-9902", "2700 Boul. Laurier, Québec, QC G1V 2L8", 46.7789, -71.2815, 150)],
        },
        {
            "name": "CNT-2026-00503",
            "customer": "Logistique Pro Laval Inc.",
            "supervisor": sup_emp,
            "status": "Actif",
            "service_type": "Nettoyage industriel",
            "team_mode": "Équipe",
            "requires_team_lead": 1,
            "rate_per_intervention": 820.00,
            "currency": "CAD",
            "billing_cycle": "Mensuel",
            "payment_terms_days": 30,
            "effective_date": add_days(getdate(), -30),
            "expiration_date": add_days(getdate(), 335),
            "version": "1.0",
            "days": [("Tuesday", "08:00:00", "12:00:00")],
            "sites": [("SITE-9903", "3800 Autoroute 440, Laval, QC H7L 5W5", 45.5622, -73.7012, 300)],
        },
    ]
    for data in contracts:
        cname = data.pop("name")
        days = data.pop("days", [])
        sites = data.pop("sites", [])
        if frappe.db.exists("Service Contract", cname):
            print(f"  ⏭ Contract {cname} already exists")
            continue
        try:
            doc = frappe.new_doc("Service Contract")
            for k, v in data.items():
                if hasattr(doc, k):
                    setattr(doc, k, v)
            for (workday, start, end) in days:
                doc.append("contract_days", {
                    "workday": workday,
                    "start_time": start,
                    "end_time": end,
                })
            for (site_id, addr, lat, lng, radius) in sites:
                doc.append("contract_sites", {
                    "site_id": site_id,
                    "site_address": addr,
                    "site_lat": lat,
                    "site_lng": lng,
                    "geofence_radius_meters": radius,
                })
            doc.flags.ignore_mandatory = True
            doc.flags.ignore_links = True
            doc.insert(ignore_permissions=True, set_name=cname)
            print(f"  ✅ Created contract: {cname}")
        except Exception as e:
            print(f"  ❌ Contract {cname}: {e}")



def _seed_missions(sup_emp):
    today = getdate()
    missions = [
        {
            "name": "MSN-2026-0001",
            "service_contract": "CNT-2026-00482",
            "customer": "Gestion Immobilière Commerciale Inc.",
            "supervisor": sup_emp,
            "mission_status": "En cours",
            "workflow_state": "En cours",
            "mission_type": "Nettoyage commercial",
            "team_mode": "Équipe",
            "site_address": "1234 Rue Sherbrooke Ouest, Montréal, QC H3G 1H6",
            "site_lat": 45.4988,
            "site_lng": -73.5781,
            "geofence_radius_meters": 200,
            "scheduled_start": datetime.combine(today, datetime.strptime("18:00", "%H:%M").time()),
            "scheduled_end": datetime.combine(today, datetime.strptime("22:00", "%H:%M").time()),
            "actual_start": datetime.combine(today, datetime.strptime("18:05", "%H:%M").time()),
        },
        {
            "name": "MSN-2026-0002",
            "service_contract": "CNT-2026-00482",
            "customer": "Gestion Immobilière Commerciale Inc.",
            "supervisor": sup_emp,
            "mission_status": "Terminée",
            "workflow_state": "Terminée",
            "mission_type": "Nettoyage commercial",
            "team_mode": "Équipe",
            "site_address": "1234 Rue Sherbrooke Ouest, Montréal, QC H3G 1H6",
            "site_lat": 45.4988,
            "site_lng": -73.5781,
            "geofence_radius_meters": 200,
            "scheduled_start": datetime.combine(add_days(today, -7), datetime.strptime("18:00", "%H:%M").time()),
            "scheduled_end": datetime.combine(add_days(today, -7), datetime.strptime("22:00", "%H:%M").time()),
            "actual_start": datetime.combine(add_days(today, -7), datetime.strptime("18:02", "%H:%M").time()),
            "actual_end": datetime.combine(add_days(today, -7), datetime.strptime("21:55", "%H:%M").time()),
            "feedback_submitted": 1,
        },
        {
            "name": "MSN-2026-0003",
            "service_contract": "CNT-2026-00503",
            "customer": "Logistique Pro Laval Inc.",
            "supervisor": sup_emp,
            "mission_status": "Planifiée",
            "workflow_state": "Planifiée",
            "mission_type": "Nettoyage industriel",
            "team_mode": "Équipe",
            "site_address": "3800 Autoroute 440, Laval, QC H7L 5W5",
            "site_lat": 45.5622,
            "site_lng": -73.7012,
            "geofence_radius_meters": 300,
            "scheduled_start": datetime.combine(add_days(today, 3), datetime.strptime("08:00", "%H:%M").time()),
            "scheduled_end": datetime.combine(add_days(today, 3), datetime.strptime("12:00", "%H:%M").time()),
        },
        {
            "name": "MSN-2026-0004",
            "service_contract": "CNT-2026-00491",
            "customer": "Immeubles du Plateau SENC",
            "supervisor": sup_emp,
            "mission_status": "Terminée",
            "workflow_state": "Terminée",
            "mission_type": "Nettoyage commercial",
            "team_mode": "Solo",
            "site_address": "2700 Boul. Laurier, Québec, QC G1V 2L8",
            "site_lat": 46.7789,
            "site_lng": -71.2815,
            "geofence_radius_meters": 150,
            "scheduled_start": datetime.combine(add_days(today, -3), datetime.strptime("14:00", "%H:%M").time()),
            "scheduled_end": datetime.combine(add_days(today, -3), datetime.strptime("17:00", "%H:%M").time()),
            "actual_start": datetime.combine(add_days(today, -3), datetime.strptime("14:10", "%H:%M").time()),
            "actual_end": datetime.combine(add_days(today, -3), datetime.strptime("16:50", "%H:%M").time()),
            "feedback_submitted": 1,
        },
    ]
    for data in missions:
        mname = data.pop("name")
        wf = data.get("workflow_state", "Planifiée")
        st = data.get("mission_status", "Planifiée")
        if frappe.db.exists("Mission", mname):
            print(f"  ⏭ Mission {mname} already exists")
            continue
        try:
            doc = frappe.new_doc("Mission")
            for k, v in data.items():
                if hasattr(doc, k):
                    setattr(doc, k, v)
            doc.flags.ignore_mandatory = True
            doc.flags.ignore_links = True
            doc.flags.ignore_validate = True
            doc.mission_status = "Planifiée"
            doc.workflow_state = "Planifiée"
            doc.insert(ignore_permissions=True, set_name=mname)
            # Force override status directly in DB (bypasses workflow transitions)
            frappe.db.sql(
                "UPDATE tabMission SET workflow_state=%s, mission_status=%s WHERE name=%s",
                (wf, st, mname)
            )
            frappe.db.set_value("Mission", mname, {"workflow_state": wf, "mission_status": st})
            print(f"  ✅ Created mission: {mname}")
        except Exception as e:
            print(f"  ❌ Mission {mname}: {e}")


def _seed_operator_scores(op_emp):
    sname = "OPS-2026-0001"
    if frappe.db.exists("Operator Score", sname):
        print(f"  ⏭ Score {sname} already exists")
        return
    try:
        doc = frappe.new_doc("Operator Score")
        doc.employee = op_emp
        doc.period = "2026-08"
        doc.global_score = 89.0
        doc.quality_score = 43.5
        doc.punctuality_score = 27.0
        doc.completion_score = 18.5
        doc.total_missions = 4
        doc.missions_completed = 4
        doc.missions_late = 0
        doc.average_rating = 4.9
        doc.rank = 1
        doc.insert(ignore_permissions=True, set_name=sname)
        print(f"  ✅ Created score: {sname}")
    except Exception as e:
        print(f"  ❌ Score {sname}: {e}")


def _seed_quality_feedbacks():
    feedbacks = [
        {
            "name": "QFB-2026-0001",
            "mission": "MSN-2026-0002",
            "customer": "Gestion Immobilière Commerciale Inc.",
            "overall_rating": 5,
            "recommend": 1,
            "team_mode": "Égal",
            "comment": "Service impeccable ! L'équipe était ponctuelle et professionnelle.",
        },
        {
            "name": "QFB-2026-0002",
            "mission": "MSN-2026-0004",
            "customer": "Immeubles du Plateau SENC",
            "overall_rating": 5,
            "recommend": 1,
            "team_mode": "Égal",
            "comment": "Très bon travail, résultats conformes au contrat.",
        },
    ]
    for data in feedbacks:
        fname = data.pop("name")
        if frappe.db.exists("Quality Feedback", fname):
            print(f"  ⏭ Feedback {fname} already exists")
            continue
        try:
            doc = frappe.new_doc("Quality Feedback")
            for k, v in data.items():
                if hasattr(doc, k):
                    setattr(doc, k, v)
            doc.flags.ignore_mandatory = True
            doc.flags.ignore_links = True
            doc.insert(ignore_permissions=True, set_name=fname)
            print(f"  ✅ Created feedback: {fname}")
        except Exception as e:
            print(f"  ❌ Feedback {fname}: {e}")
