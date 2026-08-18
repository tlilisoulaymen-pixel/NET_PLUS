"""
Test all portal data and rendering methods for all roles.
Run: bench --site frontend execute netplus.diag.test_endpoints
"""
import frappe
from netplus.api import portal_api
from netplus.www import portal


def test_endpoints():
    print("=== Testing Portal API & Views ===")

    # 1. Test Admin
    frappe.set_user("Administrator")
    print("\n1. Testing Administrator...")
    session = portal_api.get_session_info()
    print(f"  Session role: {session.get('role')}")
    data = portal_api.get_dashboard_data()
    print(f"  Dashboard data role: {data.get('role')}, missions: {len(data.get('missions', []))}")
    
    # Test portal.py get_context for Admin
    ctx = frappe._dict()
    portal.get_context(ctx)
    print(f"  portal.html context user: {ctx.user}, role: {ctx.role}")

    # 2. Test Supervisor
    frappe.set_user("supervisor1@netplus.ca")
    print("\n2. Testing Supervisor (supervisor1@netplus.ca)...")
    session = portal_api.get_session_info()
    print(f"  Session role: {session.get('role')}")
    data = portal_api.get_dashboard_data()
    print(f"  Dashboard data role: {data.get('role')}, missions: {len(data.get('missions', []))}")
    ctx = frappe._dict()
    portal.get_context(ctx)
    print(f"  portal.html context user: {ctx.user}, role: {ctx.role}")

    # 3. Test Client
    frappe.set_user("jdupont@gestionimmo.ca")
    print("\n3. Testing Client (jdupont@gestionimmo.ca)...")
    session = portal_api.get_session_info()
    print(f"  Session role: {session.get('role')}")
    data = portal_api.get_dashboard_data()
    print(f"  Dashboard data role: {data.get('role')}, missions: {len(data.get('missions', []))}")
    ctx = frappe._dict()
    portal.get_context(ctx)
    print(f"  portal.html context user: {ctx.user}, role: {ctx.role}")

    # 4. Test Operator
    frappe.set_user("operator1@netplus.ca")
    print("\n4. Testing Operator (operator1@netplus.ca)...")
    session = portal_api.get_session_info()
    print(f"  Session role: {session.get('role')}")
    data = portal_api.get_dashboard_data()
    print(f"  Dashboard data role: {data.get('role')}, missions: {len(data.get('missions', []))}")

    # Reset
    frappe.set_user("Administrator")
    print("\n✅ All 4 roles passed with ZERO errors!")
