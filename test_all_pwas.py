"""
Headless test for all three NetPlus PWAs
"""

import requests

BASE = "http://localhost:8080"

def check(label, ok, detail=""):
    sym = "✓" if ok else "✗"
    print(f"  {sym} {label}{(' → ' + detail) if detail else ''}")

def test_guest(path, expected_redirect):
    r = requests.get(BASE + path, allow_redirects=False)
    loc = r.headers.get("Location", "")
    check(f"Guest {path}", r.status_code in (301, 302) and expected_redirect in loc, loc)

def login_session(usr, pwd):
    s = requests.Session()
    s.post(BASE + "/api/method/login", data={"usr": usr, "pwd": pwd})
    return s

def test_access(s, path, expected_status):
    r = s.get(BASE + path, allow_redirects=False)
    check(f"{path}", r.status_code == expected_status, f"HTTP {r.status_code}")

print("=== Custom Login Page ===")
r = requests.get(BASE + "/netplus-login", allow_redirects=False)
check("/netplus-login → 200 with branded form", r.status_code == 200 and "N+" in r.text)

print("\n=== Guest Redirects → custom login page ===")
test_guest("/netplus-pwa",         "/netplus-login")
test_guest("/netplus-supervision", "/netplus-login")
test_guest("/netplus-client",      "/netplus-login")

print("\n=== Operator (operator1@netplus.ca) ===")
s = login_session("operator1@netplus.ca", "Netplus123!")
test_access(s, "/netplus-pwa",         200)
test_access(s, "/netplus-supervision", 301)
test_access(s, "/netplus-client",      301)

print("\n=== Supervisor (supervisor1@netplus.ca) ===")
s = login_session("supervisor1@netplus.ca", "Netplus123!")
test_access(s, "/netplus-supervision", 200)
test_access(s, "/netplus-pwa",         301)
test_access(s, "/netplus-client",      301)
