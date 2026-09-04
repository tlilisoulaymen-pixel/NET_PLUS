# -*- coding: utf-8 -*-
import frappe
from frappe import _
from frappe.utils import now_datetime, get_datetime, get_time
import math
import json

def get_distance(lat1, lon1, lat2, lon2):
    # Haversine formula
    R = 6371e3 # metres
    phi1 = math.radians(float(lat1))
    phi2 = math.radians(float(lat2))
    delta_phi = math.radians(float(lat2) - float(lat1))
    delta_lambda = math.radians(float(lon2) - float(lon1))

    a = math.sin(delta_phi/2.0) * math.sin(delta_phi/2.0) + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda/2.0) * math.sin(delta_lambda/2.0)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    return R * c

def is_mission_active(mission, at_datetime=None):
    if not at_datetime:
        at_datetime = now_datetime()
    
    if type(mission) == str:
        mission = frappe.get_doc("Mission", mission)
        
    if mission.status not in ["Planifiée", "En cours"]:
        return False
        
    if mission.recurrence_model == "Ponctuelle":
        start = get_datetime(mission.start_datetime)
        end = get_datetime(mission.end_datetime)
        return start <= at_datetime <= end
        
    elif mission.recurrence_model == "Récurrente Hebdo":
        # Check excluded dates
        for excl in mission.get("excluded_dates", []):
            if excl.date == at_datetime.date():
                return False
                
        # Check day of week
        weekday = at_datetime.weekday() # 0 = Monday
        days = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"]
        if not mission.get(days[weekday]):
            return False
            
        # Check time
        current_time = at_datetime.time()
        start_time = (get_datetime(mission.start_time)).time() if type(mission.start_time) == str else mission.start_time
        end_time = (get_datetime(mission.end_time)).time() if type(mission.end_time) == str else mission.end_time
        
        # Need to parse timedelta to time
        import datetime
        if isinstance(start_time, datetime.timedelta):
            start_time = (datetime.datetime.min + start_time).time()
        if isinstance(end_time, datetime.timedelta):
            end_time = (datetime.datetime.min + end_time).time()
            
        return start_time <= current_time <= end_time
        
    elif mission.recurrence_model == "Période Continue":
        start_date = mission.start_date
        end_date = mission.end_date
        
        if not (start_date <= at_datetime.date() <= end_date):
            return False
            
        # Check time
        current_time = at_datetime.time()
        start_time = (get_datetime(mission.start_time)).time() if type(mission.start_time) == str else mission.start_time
        end_time = (get_datetime(mission.end_time)).time() if type(mission.end_time) == str else mission.end_time
        
        import datetime
        if isinstance(start_time, datetime.timedelta):
            start_time = (datetime.datetime.min + start_time).time()
        if isinstance(end_time, datetime.timedelta):
            end_time = (datetime.datetime.min + end_time).time()
            
        return start_time <= current_time <= end_time
        
    return False

@frappe.whitelist()
def record_checkin(mission_id, lat, lng, action):
    user = frappe.session.user
    mission = frappe.get_doc("Mission", mission_id)
    
    # Check if assigned
    assigned = [o.operator for o in mission.get("assigned_operators", [])]
    if user not in assigned and user != mission.superviseur:
        frappe.throw(_("Vous n'êtes pas assigné à cette mission."), frappe.PermissionError)
        
    now = now_datetime()
    
    # Check if active
    if not is_mission_active(mission, now) and action == "check_in":
        frappe.throw(_("La fenêtre d'activité de cette mission est fermée."), frappe.ValidationError)
        
    # Calculate distance
    dist = get_distance(lat, lng, mission.lat, mission.lng)
    status = "Validé" if dist <= (mission.rayon or 200) else "Hors zone"
    
    # Get existing open attendance
    existing = frappe.get_all("Mission Attendance", filters={"mission": mission_id, "operator": user, "check_out": ("is", "not set")}, limit=1)
    
    if action == "check_in":
        if existing:
            frappe.throw(_("Vous êtes déjà enregistré sur cette mission."))
            
        doc = frappe.get_doc({
            "doctype": "Mission Attendance",
            "mission": mission_id,
            "operator": user,
            "check_in": now,
            "check_in_lat": lat,
            "check_in_lng": lng,
            "distance_au_site": dist,
            "statut": status
        })
        doc.insert(ignore_permissions=True)
        
        if mission.status == "Planifiée":
            frappe.db.set_value("Mission", mission.name, "status", "En cours")
            
    elif action == "check_out":
        if not existing:
            frappe.throw(_("Aucun pointage d'arrivée actif trouvé."))
            
        doc = frappe.get_doc("Mission Attendance", existing[0].name)
        doc.check_out = now
        doc.check_out_lat = lat
        doc.check_out_lng = lng
        if status == "Hors zone" and doc.statut == "Validé":
            doc.statut = "Hors zone" # Downgrade status if check out is outside
        doc.save(ignore_permissions=True)
        
    # Update Tracking Center Cache
    try:
        from netplus.tracking_center.api import report_location
        # Manually set frappe.form_dict for the API call
        frappe.form_dict.lat = lat
        frappe.form_dict.lng = lng
        report_location()
    except Exception as e:
        pass # Ignore tracking center cache errors
        
    return {"status": "success", "attendance_status": status, "distance": dist}

def validate_mission(doc, method):
    # Overlapping windows validation
    if doc.status in ["Brouillon", "Annulée", "Terminée"]:
        return
        
    assigned = [o.operator for o in doc.get("assigned_operators", [])]
    if not assigned:
        return
        
    # Simplified overlap check for this MVP
    # In reality, this requires complex intersection logic between the 3 models.
    pass

def on_mission_submit(doc, method):
    # Realtime notification
    assigned = [o.operator for o in doc.get("assigned_operators", [])]
    if doc.superviseur and doc.superviseur not in assigned:
        assigned.append(doc.superviseur)
        
    for user in assigned:
        frappe.publish_realtime("new_mission", {"mission": doc.name, "title": doc.type}, user=user)
        
        # Create Notification
        if not frappe.db.exists("Notification Log", {"document_type": "Mission", "document_name": doc.name, "for_user": user}):
            frappe.get_doc({
                "doctype": "Notification Log",
                "subject": f"Nouvelle mission assignée: {doc.name}",
                "document_type": "Mission",
                "document_name": doc.name,
                "for_user": user,
                "type": "Alert"
            }).insert(ignore_permissions=True)
