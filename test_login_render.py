import frappe
from frappe.app import application
from werkzeug.test import Client
from werkzeug.wrappers import Response

def test():
    client = Client(application, Response)
    routes = [
        "/netplus-login",
        "/netplus-login?redirect-to=/netplus-supervision",
        "/netplus-supervision",
        "/netplus-pwa",
        "/netplus-client",
        "/netplus-monitoring",
    ]
    for r in routes:
        resp = client.get(r, headers={"Host": "frontend"})
        # 200 or 302/301 (redirect to login for unauthenticated) are valid
        print(f"Route {r:<45} -> Status {resp.status_code}")

if __name__ == "__main__":
    test()












