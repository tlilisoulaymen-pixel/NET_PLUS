import frappe

def run():
    frappe.init(site="frontend", sites_path="/home/frappe/frappe-bench/sites")
    frappe.connect()
    
    missions = frappe.get_all("Mission", fields=["name", "customer", "site_address", "site_lat", "site_lng", "geofence_radius_meters", "mission_status"])
    for m in missions:
        print(f"Mission: {m.name} | Status: {m.mission_status} | Addr: {m.site_address} | Lat: {m.site_lat} | Lng: {m.site_lng} | Radius: {m.geofence_radius_meters}")

if __name__ == "__main__":
    run()
