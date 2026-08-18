"""Geo helpers — the ONLY authoritative geofence check is the server-side one.

The PWA also computes the distance client-side, but only to enable/disable
the button (UX). A spoofed client can send anything: check_in()/check_out()
always recompute the haversine distance here against the Location's stored
coordinates before accepting a pointage.
"""

import math

import frappe


def haversine_m(lat1, lng1, lat2, lng2):
    """Great-circle distance in meters between two WGS84 points."""
    r = 6371000.0
    p1, p2 = math.radians(float(lat1)), math.radians(float(lat2))
    dp = math.radians(float(lat2) - float(lat1))
    dl = math.radians(float(lng2) - float(lng1))
    a = (math.sin(dp / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def validate_geofence(site_name, lat, lng, accuracy):
    """Raises frappe.ValidationError if the point is not acceptable.

    Rules (executive report §3.1):
      - GPS accuracy must be <= threshold (default 100 m)
      - haversine(point, site) must be <= site radius (default 200 m)
    Returns the computed distance in meters.
    """
    settings = frappe.get_cached_doc("NetPlus Settings")
    acc_limit = settings.gps_accuracy_threshold_meters or 100

    if accuracy is None or float(accuracy) > acc_limit:
        frappe.throw(
            f"Précision GPS insuffisante ({accuracy} m > {acc_limit} m). "
            "Rapprochez-vous d'une zone dégagée et réessayez.",
            title="GPS imprécis",
        )

    site = frappe.db.get_value(
        "Location", site_name,
        ["latitude", "longitude", "geofence_radius"], as_dict=True)
    if not site or site.latitude is None or site.longitude is None:
        frappe.throw(f"Le site {site_name} n'a pas de coordonnées GPS.")

    radius = site.geofence_radius or settings.geofence_radius_meters or 200
    distance = haversine_m(lat, lng, site.latitude, site.longitude)

    if distance > radius:
        frappe.throw(
            f"Hors périmètre: vous êtes à {round(distance)} m du site "
            f"(rayon autorisé {radius} m).",
            title="Hors zone",
        )
    return distance


def geocode_location_if_needed(doc, method=None):
    """Location.before_save hook — Google Geocoding API, server-side.

    When a site has an address but no coordinates, resolve them once at
    creation time (report §6.1 'Système calcule les coordonnées GPS du
    site'). Fails silently: coordinates can always be typed manually.
    """
    if (doc.latitude and doc.longitude) or not getattr(doc, "site_address", None):
        return
    api_key = frappe.db.get_single_value("NetPlus Settings", "google_maps_api_key")
    if not api_key:
        return
    try:
        import requests
        resp = requests.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": doc.site_address, "key": api_key},
            timeout=10,
        ).json()
        if resp.get("status") == "OK":
            loc = resp["results"][0]["geometry"]["location"]
            doc.latitude, doc.longitude = loc["lat"], loc["lng"]
    except Exception:
        frappe.log_error(frappe.get_traceback(), "NetPlus geocoding failed")

