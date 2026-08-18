"""
NetPlus Routing Diagnostic
Tests login + redirect behavior for all 4 roles via HTTP (no browser).
"""

import requests
import sys

BASE = "http://172.20.0.8:8080"

USERS = [
    {
        "label": "Operator",
        "usr": "operator1@netplus.ca",
        "pwd": "Netplus123!",
        "expect_home": "/netplus-pwa",
        "own_page": "/netplus-pwa",
        "wrong_pages": ["/portal"],
    },
    {
        "label": "Supervisor",
        "usr": "supervisor1@netplus.ca",
        "pwd": "Netplus123!",
        "expect_home": "/portal",
        "own_page": "/portal",
        "wrong_pages": ["/netplus-pwa"],
    },
    {
        "label": "Client",
        "usr": "jdupont@gestionimmo.ca",
        "pwd": "Netplus123!",
        "expect_home": "/portal",
        "own_page": "/portal",
        "wrong_pages": ["/netplus-pwa"],
    },
    {
        "label": "Administrator",
        "usr": "Administrator",
        "pwd": "NetplusAdmin2024",
        "expect_home": "/desk",   # Frappe routes desk users to /desk (/app is an alias)
        "own_page": "/desk",
        "wrong_pages": [],
    },
]

OK   = "OK  "
FAIL = "FAIL"
all_results = []


def chk(cond, label):
    icon = OK if cond else FAIL
    print(f"   [{icon}] {label}")
    all_results.append(cond)
    return cond


def get_no_redirect(session, url):
    """GET url with this session but stop after the FIRST hop."""
    a = requests.adapters.HTTPAdapter(max_retries=0)
    tmp = requests.Session()
    tmp.cookies.update(session.cookies)
    tmp.mount("http://", a)
    return tmp.get(url, allow_redirects=False)


def run_user(u):
    print(f"\n{'='*60}")
    print(f"  ROLE: {u['label']}  ({u['usr']})")
    print(f"{'='*60}")

    # --- Login ---
    s = requests.Session()
    r = s.post(
        f"{BASE}/api/method/login",
        json={"usr": u["usr"], "pwd": u["pwd"]},
        allow_redirects=True,
    )
    login_ok = r.status_code == 200 and "sid" in s.cookies
    chk(login_ok, f"Login → HTTP {r.status_code}  sid={'yes' if 'sid' in s.cookies else 'NO'}")
    if not login_ok:
        print(f"     Body: {r.text[:200]}")
        return

    # --- Home redirect: GET /login as logged-in user ---
    r2 = get_no_redirect(s, f"{BASE}/login")
    loc = r2.headers.get("Location", "")
    is_redirect = r2.status_code in (301, 302, 303)
    # Frappe strips leading slash from role_home_page values — normalise both sides
    loc_norm = loc.lstrip("/")
    want_norm = u["expect_home"].lstrip("/")
    correct_dest = want_norm in loc_norm
    chk(
        is_redirect and correct_dest,
        f"GET /login → {r2.status_code}  Location={loc!r}  (want *{u['expect_home']}*)"
    )
    if is_redirect and not correct_dest:
        print(f"     ^ Wrong redirect target!")

    # --- Own page: must load 200, no 500, no 'Not Permitted' ---
    r3 = s.get(f"{BASE}{u['own_page']}", allow_redirects=True, timeout=10)
    no_500       = r3.status_code not in (500, 403, 404)
    no_perm_err  = "not permitted" not in r3.text.lower() and "frappe.throw" not in r3.text.lower()
    no_500_body  = "500" not in r3.text[:100]
    chk(
        no_500 and no_perm_err,
        f"GET {u['own_page']} → {r3.status_code}  "
        f"{'[PERMISSION ERROR IN BODY]' if not no_perm_err else ''}"
        f"{'[500 ERROR]' if not no_500 else ''}"
    )
    if not no_500:
        print(f"     Body snippet: {r3.text[:300]}")

    # --- Wrong pages: must redirect (not 403/500) ---
    for wp in u["wrong_pages"]:
        r4 = get_no_redirect(s, f"{BASE}{wp}")
        loc4 = r4.headers.get("Location", "")
        redirected = r4.status_code in (301, 302, 303)
        no_500 = r4.status_code != 500
        redirected = r4.status_code in (301, 302, 303)
        perm_err = "not permitted" in r4.text.lower() if r4.status_code == 200 else False
        chk(
            redirected and no_500,
            f"GET {wp} (wrong) → {r4.status_code}  Location={loc4!r}  "
            f"{'[REDIRECT OK]' if redirected else '[SHOULD REDIRECT — got 200]'}"
        )

    # --- Guest must be blocked on own page ---
    gs = requests.Session()
    rg = get_no_redirect(gs, f"{BASE}{u['own_page']}")
    loc_g = rg.headers.get("Location", "")
    redirected_to_login = rg.status_code in (301, 302, 303) and "login" in loc_g.lower()
    guest_blocked = redirected_to_login
    chk(
        guest_blocked,
        f"GUEST → {u['own_page']}: {rg.status_code}  Location={loc_g!r}  "
        f"{'[GUEST BLOCKED OK]' if guest_blocked else '[GUEST NOT BLOCKED — returns 200!]'}"
    )


for u in USERS:
    run_user(u)

total = len(all_results)
ok    = sum(1 for x in all_results if x)
print(f"\n{'='*60}")
print(f"  RESULT: {ok}/{total} checks passed")
if ok == total:
    print("  [ALL PASS] Routing is clean — no errors detected.")
else:
    print(f"  [FAILURES] {total - ok} check(s) FAILED — see above.")
print(f"{'='*60}\n")
sys.exit(0 if ok == total else 1)
