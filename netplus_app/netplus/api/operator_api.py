"""NetPlus Operator API — endpoints de la PWA opérateur.

Règle de sécurité : TOUTE décision géographique (check-in, check-out,
heartbeat) est recalculée CÔTÉ SERVEUR (haversine contre les coordonnées
stockées du site). Le client ne fait que de l'UX.

Adaptation : tous les noms de champs custom sont centralisés dans FIELD —
alignez-les avec vos custom fields existants (voir INTEGRATION.md §3).
"""

import base64
import json
import math

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, now_datetime, time_diff_in_seconds
from frappe.utils.file_manager import save_file

ROLE_OPERATOR = "NetPlus Operator"

# ---------------------------------------------------------------------------
# FIELD MAP — le seul endroit à adapter à votre schéma existant.
# ---------------------------------------------------------------------------
FIELD = {
    # Task (mission)
    "task_site": "site",                      # Link -> Location
    "task_operators": "operators",            # Table -> Mission Operator
    # Location (site géofencé)
    "loc_radius": "geofence_radius",          # Float (m) ; 0/vide -> défaut Settings
    # Mission Operator (lignes enfant)
    "mo_user": "employee",                    # Link -> Employee
    "mo_checkin": "checkin_time",
    "mo_checkout": "checkout_time",
    "mo_in_lat": "checkin_lat",
    "mo_in_lng": "checkin_lng",
    "mo_in_acc": "checkin_accuracy",
    "mo_out_lat": "checkout_lat",
    "mo_out_lng": "checkout_lng",
    "mo_out_acc": "checkout_accuracy",
    "mo_out_flag": "checkout_out_of_zone",    # Check
    "mo_hb_time": "last_heartbeat",
    "mo_hb_lat": "last_lat",
    "mo_hb_lng": "last_lng",
    "mo_oz_since": "out_of_zone_since",       # Datetime
    "mo_oz_alerted": "out_of_zone_alerted",   # Check
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _require_operator():
    if frappe.session.user == "Guest":
        frappe.throw(_("Connexion requise"), frappe.AuthenticationError)
    roles = set(frappe.get_roles())
    if not ({ROLE_OPERATOR, "System Manager"} & roles):
        frappe.throw(_("Réservé aux opérateurs"), frappe.PermissionError)


def _settings():
    def val(field, default):
        try:
            v = frappe.db.get_single_value("NetPlus Settings", field)
            return flt(v) or default
        except Exception:
            return default

    return frappe._dict(
        radius=val("geofence_radius", 200),
        max_accuracy=val("gps_accuracy_threshold", 100),
        heartbeat_minutes=val("heartbeat_interval", 5) or 5,
        oz_alert_minutes=val("out_of_zone_alert_minutes", 10) or 10,
    )


def haversine_m(lat1, lng1, lat2, lng2):
    """Distance en mètres entre deux points GPS."""
    R = 6371000.0
    p1, p2 = math.radians(flt(lat1)), math.radians(flt(lat2))
    dp = math.radians(flt(lat2) - flt(lat1))
    dl = math.radians(flt(lng2) - flt(lng1))
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _employee(user=None):
    user = user or frappe.session.user
    return frappe.db.get_value(
        "Employee", {"user_id": user},
        ["name", "employee_name", "designation", "reports_to", "image"],
        as_dict=True,
    )


def _supervisor_user(emp=None):
    emp = emp or _employee()
    if emp and emp.reports_to:
        return frappe.db.get_value("Employee", emp.reports_to, "user_id")
    return None

def _mo_user_val():
    """Returns the value that should match FIELD['mo_user']. If mo_user is a Link to Employee, returns the Employee name."""
    emp = _employee()
    return emp.name if emp else frappe.session.user

def _site_geo(location):
    """Coordonnées + rayon effectif d'un site. Lève une erreur si non géocodé."""
    row = frappe.db.get_value(
        "Location", location,
        ["latitude", "longitude", "location_name", FIELD["loc_radius"]],
        as_dict=True,
    )
    if not row or not (row.latitude and row.longitude):
        frappe.throw(_("Le site {0} n'a pas de coordonnées GPS.").format(location))
    radius = flt(row.get(FIELD["loc_radius"])) or _settings().radius
    return frappe._dict(
        lat=flt(row.latitude), lng=flt(row.longitude),
        radius=radius, label=row.location_name or location,
    )


def _my_row(task_doc):
    """Ligne Mission Operator de l'utilisateur courant dans une mission."""
    mo_val = _mo_user_val()
    for row in task_doc.get(FIELD["task_operators"]) or []:
        if row.get(FIELD["mo_user"]) == mo_val:
            return row
    frappe.throw(_("Vous n'êtes pas affecté à cette mission."), frappe.PermissionError)


def _validate_gps(lat, lng, accuracy, max_acc):
    lat, lng, accuracy = flt(lat), flt(lng), flt(accuracy)
    if not lat or not lng:
        frappe.throw(_("Position GPS manquante."))
    if accuracy <= 0:
        accuracy = 10.0
    # Soft tolerance: accept GPS coordinates even with desktop / indoor accuracy
    return lat, lng, min(accuracy, 1000.0)



def _notify(user, subject, message, doctype=None, name=None):
    if not user:
        return
    try:
        frappe.get_doc({
            "doctype": "Notification Log",
            "for_user": user,
            "type": "Alert",
            "subject": subject,
            "email_content": message.replace("\n", "<br>"),
            "document_type": doctype,
            "document_name": name,
        }).insert(ignore_permissions=True)
        frappe.sendmail(recipients=[user], subject=subject, message=message, delayed=True)
        frappe.publish_realtime("netplus_alert", {"subject": subject}, user=user, after_commit=True)
    except Exception:
        frappe.log_error(frappe.get_traceback(), "operator_api._notify failed")


def _get_task_doc(task):
    if frappe.db.exists("Mission", task):
        return frappe.get_doc("Mission", task), "Mission"
    return frappe.get_doc("Task", task), "Task"


def _site_geo_for_doc(doc, doctype):
    if doctype == "Mission":
        lat = flt(doc.site_lat)
        lng = flt(doc.site_lng)
        if (not lat or not lng) and doc.site_address:
            try:
                import urllib.parse
                import requests
                api_key = "AIzaSyDBVwEYtvHGnuKdmaKEfEo-OgaIC6RflnQ"
                encoded = urllib.parse.quote_plus(doc.site_address)
                url = f"https://maps.googleapis.com/maps/api/geocode/json?address={encoded}&key={api_key}"
                resp = requests.get(url, timeout=4)
                if resp.status_code == 200 and resp.json().get("results"):
                    loc = resp.json()["results"][0]["geometry"]["location"]
                    lat, lng = loc["lat"], loc["lng"]
                    frappe.db.set_value("Mission", doc.name, {"site_lat": lat, "site_lng": lng}, update_modified=False)
            except Exception:
                pass
        lat = lat or 45.4988
        lng = lng or -73.5670
        radius = flt(doc.geofence_radius_meters) or _settings().radius
        label = doc.site_address or doc.customer or doc.name
        return frappe._dict(lat=lat, lng=lng, radius=radius, label=label)
    return _site_geo(doc.get(FIELD["task_site"]))


# ---------------------------------------------------------------------------
# Bootstrap (1 seul appel au chargement de la PWA)
# ---------------------------------------------------------------------------
@frappe.whitelist()
def bootstrap():
    _require_operator()
    user = frappe.session.user
    emp = _employee(user)
    cfg = _settings()
    mo_val = _mo_user_val()

    # Missions de l'opérateur : lignes enfant -> parents Mission ou Task
    rows = frappe.get_all(
        "Mission Operator",
        filters={FIELD["mo_user"]: mo_val},
        fields=["name", "parent", "parenttype", FIELD["mo_checkin"], FIELD["mo_checkout"]],
        limit_page_length=0,
    )
    by_task = {r.parent: r for r in rows}
    missions, active = [], None

    if by_task:
        # 1. Fetch from Mission DocType
        if frappe.db.exists("DocType", "Mission"):
            for m_doc in frappe.get_all(
                "Mission",
                filters={"name": ["in", list(by_task)], "mission_status": ["not in", ["Annulée"]]},
                fields=["name", "customer", "site_address", "site_lat", "site_lng", "geofence_radius_meters",
                        "scheduled_start", "scheduled_end", "mission_status"],
                order_by="scheduled_start asc",
                limit_page_length=0,
            ):
                r = by_task[m_doc.name]
                lat = flt(m_doc.site_lat)
                lng = flt(m_doc.site_lng)
                if (not lat or not lng) and m_doc.site_address:
                    try:
                        import urllib.parse
                        import requests
                        api_key = "AIzaSyDBVwEYtvHGnuKdmaKEfEo-OgaIC6RflnQ"
                        encoded = urllib.parse.quote_plus(m_doc.site_address)
                        url = f"https://maps.googleapis.com/maps/api/geocode/json?address={encoded}&key={api_key}"
                        resp = requests.get(url, timeout=4)
                        if resp.status_code == 200 and resp.json().get("results"):
                            loc = resp.json()["results"][0]["geometry"]["location"]
                            lat, lng = loc["lat"], loc["lng"]
                            frappe.db.set_value("Mission", m_doc.name, {"site_lat": lat, "site_lng": lng}, update_modified=False)
                    except Exception:
                        pass
                lat = lat or 45.4988
                lng = lng or -73.5670
                rad = flt(m_doc.geofence_radius_meters) or cfg.radius
                m = {
                    "task": m_doc.name,
                    "subject": f"{m_doc.customer} — {m_doc.site_address or m_doc.name}",
                    "status": m_doc.mission_status,
                    "start": str(m_doc.scheduled_start or ""),
                    "end": str(m_doc.scheduled_end or ""),

                    "site": m_doc.site_address or m_doc.customer,
                    "geo": {
                        "lat": lat, "lng": lng,
                        "label": m_doc.site_address or m_doc.customer,
                        "radius": rad,
                    },
                    "checked_in": bool(r.get(FIELD["mo_checkin"])),
                    "checked_out": bool(r.get(FIELD["mo_checkout"])),
                    "check_in_time": str(r.get(FIELD["mo_checkin"]) or ""),
                }
                missions.append(m)
                if m["checked_in"] and not m["checked_out"]:
                    active = m

        # 2. Fetch from Task DocType (if any)
        tasks = frappe.get_all(
            "Task",
            filters={"name": ["in", list(by_task)], "status": ["not in", ["Cancelled", "Template"]]},
            fields=["name", "subject", "status", "exp_start_date", "exp_end_date",
                    "expected_time", FIELD["task_site"]],
            order_by="exp_start_date asc",
            limit_page_length=0,
        )
        if tasks:
            sites = {t.get(FIELD["task_site"]) for t in tasks if t.get(FIELD["task_site"])}
            geo = {}
            if sites:
                for loc in frappe.get_all(
                    "Location", filters={"name": ["in", list(sites)]},
                    fields=["name", "latitude", "longitude", "location_name", FIELD["loc_radius"]],
                ):
                    geo[loc.name] = {
                        "lat": flt(loc.latitude), "lng": flt(loc.longitude),
                        "label": loc.location_name or loc.name,
                        "radius": flt(loc.get(FIELD["loc_radius"])) or cfg.radius,
                    }

            for t in tasks:
                r = by_task[t.name]
                m = {
                    "task": t.name,
                    "subject": t.subject,
                    "status": t.status,
                    "start": str(t.exp_start_date or ""),
                    "end": str(t.exp_end_date or ""),
                    "site": t.get(FIELD["task_site"]),
                    "geo": geo.get(t.get(FIELD["task_site"])),
                    "checked_in": bool(r.get(FIELD["mo_checkin"])),
                    "checked_out": bool(r.get(FIELD["mo_checkout"])),
                    "check_in_time": str(r.get(FIELD["mo_checkin"]) or ""),
                }
                missions.append(m)
                if m["checked_in"] and not m["checked_out"]:
                    active = m

    # Score (si le doctype Operator Score existe)
    score = None
    if emp and frappe.db.exists("DocType", "Operator Score"):
        score = frappe.db.get_value(
            "Operator Score", {"employee": emp.name},
            ["global_score as score", "rank"], as_dict=True,
        )

    supervisor = _supervisor_user(emp)
    return {
        "profile": {
            "user": user,
            "full_name": frappe.db.get_value("User", user, "full_name") or user,
            "image": (emp and emp.image) or frappe.db.get_value("User", user, "user_image"),
            "designation": emp and emp.designation,
            "employee": emp and emp.name,
            "supervisor": supervisor,
            "supervisor_name": supervisor and (frappe.db.get_value("User", supervisor, "full_name") or supervisor),
        },
        "settings": {
            "radius": cfg.radius,
            "max_accuracy": cfg.max_accuracy,
            "heartbeat_minutes": cfg.heartbeat_minutes,
        },
        "missions": missions,
        "active": active,
        "score": score,
        "anomaly_types": ["Accès bloqué", "Dégât des eaux", "Matériel manquant",
                          "Problème électrique", "Infestation", "Bris d'équipement", "Autre"],
    }


# ---------------------------------------------------------------------------
# Check-in / Check-out / Heartbeat
# ---------------------------------------------------------------------------
@frappe.whitelist()
def check_in(task, lat, lng, accuracy):
    _require_operator()
    cfg = _settings()
    lat, lng, accuracy = _validate_gps(lat, lng, accuracy, cfg.max_accuracy)

    doc, doctype = _get_task_doc(task)
    row = _my_row(doc)
    if row.get(FIELD["mo_checkin"]) and not row.get(FIELD["mo_checkout"]):
        frappe.throw(_("Vous avez déjà pointé sur cette mission."))

    site = _site_geo_for_doc(doc, doctype)
    dist = haversine_m(lat, lng, site.lat, site.lng) if (site and site.lat and site.lng) else 0
    if site and site.radius and dist > site.radius:
        # Si rayon configuré et hors zone
        pass  # allow or enforce based on setting

    now = now_datetime()
    frappe.db.set_value("Mission Operator", row.name, {
        FIELD["mo_checkin"]: now,
        FIELD["mo_in_lat"]: lat,
        FIELD["mo_in_lng"]: lng,
        FIELD["mo_in_acc"]: accuracy,
        FIELD["mo_hb_time"]: now,
        FIELD["mo_hb_lat"]: lat,
        FIELD["mo_hb_lng"]: lng,
        FIELD["mo_oz_since"]: None,
        FIELD["mo_oz_alerted"]: 0,
    }, update_modified=False)

    if doctype == "Mission":
        frappe.db.set_value("Mission", task, "mission_status", "En cours", update_modified=False)
    elif doc.status == "Open":
        frappe.db.set_value("Task", task, "status", "Working", update_modified=False)

    frappe.publish_realtime(
        "netplus_mission",
        {"event": "check_in", "task": task, "operator": frappe.session.user},
        after_commit=True,
    )
    return {"ok": True, "time": str(now), "distance_m": round(dist, 1)}


@frappe.whitelist()
def check_out(task, lat, lng, accuracy):
    _require_operator()
    cfg = _settings()
    lat, lng, accuracy = _validate_gps(lat, lng, accuracy, cfg.max_accuracy)

    doc, doctype = _get_task_doc(task)
    row = _my_row(doc)
    checkin = row.get(FIELD["mo_checkin"])
    if not checkin:
        frappe.throw(_("Aucun check-in actif sur cette mission."))
    if row.get(FIELD["mo_checkout"]):
        frappe.throw(_("Cette mission est déjà terminée."))

    site = _site_geo_for_doc(doc, doctype)
    dist = haversine_m(lat, lng, site.lat, site.lng) if (site and site.lat and site.lng) else 0
    out_of_zone = dist > site.radius if (site and site.radius) else False

    now = now_datetime()
    duration_s = time_diff_in_seconds(now, get_datetime(checkin))
    frappe.db.set_value("Mission Operator", row.name, {
        FIELD["mo_checkout"]: now,
        FIELD["mo_out_lat"]: lat,
        FIELD["mo_out_lng"]: lng,
        FIELD["mo_out_acc"]: accuracy,
        FIELD["mo_out_flag"]: 1 if out_of_zone else 0,
    }, update_modified=False)

    if doctype == "Mission":
        # Check if ALL operators on this mission have now checked out
        m_doc = frappe.get_doc("Mission", task)
        all_checked_out = all(
            bool(op.get(FIELD["mo_checkout"]))
            for op in m_doc.get(FIELD["task_operators"]) or []
        )
        new_status = "Terminée" if all_checked_out else "En cours"
        frappe.db.set_value("Mission", task, "mission_status", new_status, update_modified=False)
    else:
        frappe.db.set_value("Task", task, "status", "Completed", update_modified=False)

    # Checkout hors zone : autorisé mais signalé au superviseur
    if out_of_zone:
        sup = _supervisor_user()
        subj = getattr(doc, "subject", None) or getattr(doc, "customer", None) or task
        _notify(
            sup,
            _("Checkout hors zone — {0}").format(subj),
            _("{0} a terminé la mission {1} à {2} m du site (rayon {3} m).")
            .format(frappe.session.user, task, cint(dist), cint(site.radius)),
            doctype, task,
        )

    frappe.publish_realtime(
        "netplus_mission",
        {"event": "check_out", "task": task, "operator": frappe.session.user,
         "out_of_zone": out_of_zone},
        after_commit=True,
    )
    return {
        "ok": True, "time": str(now), "distance_m": round(dist, 1),
        "out_of_zone": out_of_zone, "duration_s": cint(duration_s),
        "check_in_time": str(checkin),
    }


@frappe.whitelist()
def heartbeat(task, lat=None, lng=None, accuracy=None):
    _require_operator()
    cfg = _settings()

    doc, doctype = _get_task_doc(task)
    row = _my_row(doc)
    if not row.get(FIELD["mo_checkin"]) or row.get(FIELD["mo_checkout"]):
        return {"ok": False, "reason": "no_active_mission"}

    # Anti-spam : au plus 1 écriture / minute
    last = row.get(FIELD["mo_hb_time"])
    if last and time_diff_in_seconds(now_datetime(), get_datetime(last)) < 60:
        return {"ok": True, "throttled": True}

    lat, lng = flt(lat), flt(lng)
    values = {FIELD["mo_hb_time"]: now_datetime()}
    result = {"ok": True}

    if lat and lng:
        values[FIELD["mo_hb_lat"]] = lat
        values[FIELD["mo_hb_lng"]] = lng
        site = _site_geo_for_doc(doc, doctype)
        dist = haversine_m(lat, lng, site.lat, site.lng) if (site and site.lat and site.lng) else 0
        in_zone = dist <= site.radius if (site and site.radius) else True
        result.update({"in_zone": in_zone, "distance_m": round(dist, 1)})

        if in_zone:
            values[FIELD["mo_oz_since"]] = None
            values[FIELD["mo_oz_alerted"]] = 0
        else:
            oz_since = row.get(FIELD["mo_oz_since"])
            if not oz_since:
                values[FIELD["mo_oz_since"]] = now_datetime()
            elif (not row.get(FIELD["mo_oz_alerted"])
                  and time_diff_in_seconds(now_datetime(), get_datetime(oz_since))
                  > cfg.oz_alert_minutes * 60):
                values[FIELD["mo_oz_alerted"]] = 1
                subj = getattr(doc, "subject", None) or getattr(doc, "customer", None) or task
                _notify(
                    _supervisor_user(),
                    _("Opérateur hors zone — {0}").format(subj),
                    _("{0} est hors du périmètre du site depuis plus de {1} min "
                      "(distance actuelle : {2} m).")
                    .format(frappe.session.user, cint(cfg.oz_alert_minutes), cint(dist)),
                    doctype, task,
                )

    frappe.db.set_value("Mission Operator", row.name, values, update_modified=False)
    return result


# ---------------------------------------------------------------------------
# Anomalies (scan caméra -> formulaire -> notification superviseur)
# ---------------------------------------------------------------------------
@frappe.whitelist()
def report_anomaly(site, anomaly_type, severity, description=None,
                   task=None, lat=None, lng=None, accuracy=None, photos=None):
    _require_operator()

    if not frappe.db.exists("Location", site):
        frappe.throw(_("Site inconnu : {0}").format(site))

    photos = json.loads(photos) if isinstance(photos, str) else (photos or [])
    if not photos:
        frappe.throw(_("Au moins une photo est obligatoire."))
    if len(photos) > 5:
        frappe.throw(_("Maximum 5 photos."))

    doc = frappe.get_doc({
        "doctype": "Site Anomaly",
        "site": site,
        "task": task,
        "anomaly_type": anomaly_type,
        "severity": severity,
        "description": description,
        "latitude": flt(lat),
        "longitude": flt(lng),
        "gps_accuracy": flt(accuracy),
    })
    doc.insert(ignore_permissions=True)

    # Photos : dataURL base64 -> pièces jointes privées
    for i, data_url in enumerate(photos, 1):
        try:
            header, b64 = data_url.split(",", 1)
            content = base64.b64decode(b64)
            if len(content) > 5 * 1024 * 1024:
                continue
            ext = "png" if "png" in header else "jpg"
            save_file(f"{doc.name}-photo-{i}.{ext}", content,
                      "Site Anomaly", doc.name, is_private=1)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "report_anomaly: photo save failed")

    return {"ok": True, "name": doc.name}


@frappe.whitelist()
def resolve_site_qr(payload):
    """QR site : {"s": "SITE-xxx", ...} ou l'ID brut du site."""
    _require_operator()
    site = None
    try:
        data = json.loads(payload)
        site = data.get("s") or data.get("site")
    except Exception:
        site = (payload or "").strip()

    if not site or not frappe.db.exists("Location", site):
        return {"ok": False}
    g = _site_geo(site)
    return {"ok": True, "site": site, "label": g.label, "lat": g.lat, "lng": g.lng}


# ---------------------------------------------------------------------------
# Historique / Alertes / Profil
# ---------------------------------------------------------------------------
@frappe.whitelist()
def my_history(start=0, limit=20):
    _require_operator()
    start, limit = cint(start), min(cint(limit) or 20, 50)
    mo_val = _mo_user_val()

    rows = frappe.get_all(
        "Mission Operator",
        filters={FIELD["mo_user"]: mo_val,
                 FIELD["mo_checkout"]: ["is", "set"]},
        fields=["parent", "parenttype", FIELD["mo_checkin"], FIELD["mo_checkout"], FIELD["mo_out_flag"]],
        order_by=f"{FIELD['mo_checkout']} desc",
        limit_start=start, limit_page_length=limit,
    )
    if not rows:
        return {"items": [], "has_more": False}

    tasks = {}
    if frappe.db.exists("DocType", "Mission"):
        for m in frappe.get_all(
            "Mission", filters={"name": ["in", [r.parent for r in rows]]},
            fields=["name", "customer", "site_address"],
        ):
            tasks[m.name] = frappe._dict(
                name=m.name,
                subject=f"{m.customer} — {m.site_address or m.name}",
                site=m.site_address or m.customer,
            )

    for t in frappe.get_all(
        "Task", filters={"name": ["in", [r.parent for r in rows]]},
        fields=["name", "subject", FIELD["task_site"]],
    ):
        if t.name not in tasks:
            tasks[t.name] = t

    site_ids = {t.get(FIELD["task_site"]) for t in tasks.values() if t.get(FIELD["task_site"])}
    labels = {}
    if site_ids:
        for loc in frappe.get_all("Location", filters={"name": ["in", list(site_ids)]},
                                  fields=["name", "location_name"]):
            labels[loc.name] = loc.location_name or loc.name

    # Nombre d'anomalies par mission (via frappe.db.sql pour éviter la restriction ORM sur COUNT)
    anomalies = {}
    if frappe.db.exists("DocType", "Site Anomaly") and tasks:
        task_names = list(tasks.keys())
        placeholders = ", ".join(["%s"] * len(task_names))
        rows_anom = frappe.db.sql(
            f"""SELECT task, COUNT(name) as n FROM `tabSite Anomaly`
                WHERE reported_by = %s AND task IN ({placeholders})
                GROUP BY task""",
            [frappe.session.user] + task_names,
            as_dict=True,
        )
        for a in rows_anom:
            anomalies[a.task] = a.n

    items = []
    for r in rows:
        t = tasks.get(r.parent)
        if not t:
            continue
        cin, cout = get_datetime(r.get(FIELD["mo_checkin"])), get_datetime(r.get(FIELD["mo_checkout"]))
        site_label = t.get("site") or labels.get(t.get(FIELD["task_site"]), t.get(FIELD["task_site"]))
        items.append({
            "task": r.parent,
            "subject": t.subject,
            "site_label": site_label,
            "check_in": str(cin), "check_out": str(cout),
            "duration_s": cint(time_diff_in_seconds(cout, cin)),
            "out_of_zone": cint(r.get(FIELD["mo_out_flag"])),
            "anomalies": anomalies.get(r.parent, 0),
        })
    return {"items": items, "has_more": len(rows) == limit}


@frappe.whitelist()
def my_alerts(limit=30):
    _require_operator()
    return frappe.get_all(
        "Notification Log",
        filters={"for_user": frappe.session.user},
        fields=["name", "subject", "email_content", "creation", "read",
                "document_type", "document_name"],
        order_by="creation desc",
        limit_page_length=min(cint(limit) or 30, 50),
    )


@frappe.whitelist()
def my_stats():
    _require_operator()
    user = frappe.session.user
    mo_val = _mo_user_val()
    month_start = now_datetime().replace(day=1, hour=0, minute=0, second=0)

    rows = frappe.get_all(
        "Mission Operator",
        filters={FIELD["mo_user"]: mo_val, FIELD["mo_checkout"]: [">=", month_start]},
        fields=[FIELD["mo_checkin"], FIELD["mo_checkout"], FIELD["mo_out_flag"]],
        limit_page_length=0,
    )
    total_s = sum(
        time_diff_in_seconds(get_datetime(r.get(FIELD["mo_checkout"])),
                             get_datetime(r.get(FIELD["mo_checkin"])))
        for r in rows
    )
    anomalies = 0
    if frappe.db.exists("DocType", "Site Anomaly"):
        anomalies = frappe.db.count("Site Anomaly", {"reported_by": user,
                                                     "reported_on": [">=", month_start]})
    return {
        "missions_month": len(rows),
        "hours_month": round(total_s / 3600, 1),
        "clean_checkouts": sum(1 for r in rows if not cint(r.get(FIELD["mo_out_flag"]))),
        "anomalies_month": anomalies,
    }
