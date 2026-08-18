#!/usr/bin/env python
# diag_netplus.py — layered diagnosis of the NetPlus app on site "frontend"
import os, sys, glob, json, importlib, importlib.util, traceback

BENCH, SITE, APP = "/home/frappe/frappe-bench", "frontend", "netplus"
os.chdir(BENCH)
sys.path.insert(0, f"{BENCH}/apps/frappe")
sys.path.insert(0, f"{BENCH}/apps/erpnext")
sys.path.insert(0, f"{BENCH}/apps/netplus")

problems, warnings = [], []

def section(t): print("\n" + "=" * 62 + "\n  " + t + "\n" + "=" * 62)
def ok(m):   print("  [ OK ] " + m)
def bad(m):  print("  [FAIL] " + m); problems.append(m)
def warn(m): print("  [WARN] " + m); warnings.append(m)
def info(m): print("         " + m)

# ------------- A. APP REGISTRATION (filesystem) -------------
section("A. App registration")
apps_txt = []
if os.path.exists("sites/apps.txt"):
    apps_txt = [l.strip() for l in open("sites/apps.txt") if l.strip()]
    info(f"sites/apps.txt = {apps_txt}")
    if APP in apps_txt:
        ok(f"'{APP}' listed in sites/apps.txt")
    else:
        bad(f"'{APP}' MISSING from sites/apps.txt -> install-app refuses, migrate skips the app")
else:
    bad("sites/apps.txt does not exist")

if os.path.isdir(f"apps/{APP}"):
    ok(f"apps/{APP} directory present")
else:
    bad(f"apps/{APP} directory MISSING")

spec = importlib.util.find_spec(APP)
if spec:
    ok(f"python package '{APP}' importable ({spec.origin})")
else:
    bad(f"'{APP}' NOT pip-installed in the bench env (volume-mounted only, never bench get-app-ed)")

# modules.txt vs "module" field inside every doctype JSON
declared = []
mt = f"apps/{APP}/{APP}/modules.txt"
if os.path.exists(mt):
    declared = [l.strip() for l in open(mt) if l.strip()]
    info(f"modules.txt = {declared}")
else:
    bad("modules.txt missing")

json_modules = {}
for p in glob.glob(f"apps/{APP}/{APP}/**/doctype/**/*.json", recursive=True):
    try:
        d = json.load(open(p, encoding="utf-8"))
        if d.get("doctype") == "DocType":
            json_modules.setdefault(d.get("module"), []).append(d.get("name"))
    except Exception:
        pass

for mod, dts in sorted(json_modules.items()):
    if mod in declared:
        ok(f"module '{mod}' declared -> doctypes {dts}")
    else:
        bad(f"module '{mod}' used by {dts} but NOT in modules.txt -> orphan-deleted on migrate")

# ------------- B. SITE DATABASE STATE -------------
section("B. Site database")
import frappe
frappe.init(site=SITE, sites_path="sites")
frappe.connect()

installed = frappe.get_installed_apps()
info(f"site installed_apps = {installed}")
if APP in installed:
    ok(f"site DB lists '{APP}' as installed")
else:
    bad(f"site DB does NOT list '{APP}' as installed")

for dt in ["Mission", "Service Contract", "Mission Alert",
           "Mission Operator", "Operator Score", "NetPlus Settings"]:
    if not frappe.db.exists("DocType", dt):
        bad(f"DocType '{dt}': missing from tabDocType (orphan-deleted, never resynced)")
        continue
    is_single = int(frappe.db.get_value("DocType", dt, "issingle") or 0)
    if is_single:
        n = frappe.db.sql("select count(*) from tabSingles where doctype=%s", dt)[0][0]
        ok(f"DocType '{dt}' exists (Single, {n} stored values)")
    elif frappe.db.table_exists(dt):
        ok(f"DocType '{dt}' exists, SQL table present ({frappe.db.count(dt)} rows)")
    else:
        bad(f"DocType '{dt}': meta row exists but SQL table tab{dt.replace(' ','')} is MISSING")

for mod in sorted(set(declared) | set(json_modules.keys())):
    app_name = frappe.db.get_value("Module Def", mod, "app_name")
    if app_name:
        ok(f"Module Def '{mod}' -> app '{app_name}'")
    else:
        bad(f"Module Def '{mod}' missing from DB")

for target in ["Task", "Location", "Quality Feedback"]:
    cf = frappe.get_all("Custom Field", filters={"dt": target}, pluck="fieldname")
    if cf:
        ok(f"Custom Fields on {target}: {cf}")
    else:
        warn(f"Custom Fields on {target}: NONE (wiped or never created)")

for role in ["NetPlus Supervisor", "NetPlus Operator", "NetPlus Client"]:
    r = frappe.db.get_value("Role", role, ["desk_access"], as_dict=True)
    if r is None:
        bad(f"Role '{role}' does not exist")
    else:
        if not r.desk_access:
            ok(f"Role '{role}': desk_access={r.desk_access}")
        else:
            warn(f"Role '{role}': desk_access={r.desk_access} (should be 0)")

info("(note: correct table is 'tabHas Role' with space — earlier SQL used wrong name)")
for u in ["operator1@netplus.ca", "supervisor1@netplus.ca", "jdupont@gestionimmo.ca"]:
    if not frappe.db.exists("User", u):
        bad(f"User {u} does not exist"); continue
    utype = frappe.db.get_value("User", u, "user_type")
    n_roles = [r for r in frappe.get_roles(u) if r.startswith("NetPlus")]
    dflt = frappe.defaults.get_user_default("homepage", u)
    line = f"{u}: user_type={utype}, roles={n_roles}, user-default homepage={dflt!r}"
    if utype == "Website User" and n_roles:
        ok(line)
    else:
        bad(line)

ws_home = frappe.db.get_single_value("Website Settings", "home_page")
info(f"Website Settings home_page = {ws_home!r}")
try:
    ps_home = frappe.db.get_single_value("Portal Settings", "default_portal_home")
    info(f"Portal Settings default_portal_home = {ps_home!r}")
except Exception:
    pass

# ------------- C. HOOKS <-> CODE CONSISTENCY -------------
section("C. Hooks resolve to real functions")
hooks = frappe.get_hooks()
info(f"role_home_page = {dict(hooks.get('role_home_page') or {})}")
for hk in ["on_session_creation", "get_website_user_home_page"]:
    for path in (hooks.get(hk) or []):
        mod_path, fn = path.rsplit(".", 1)
        try:
            m = importlib.import_module(mod_path)
            if hasattr(m, fn):
                ok(f"{hk} -> {path}")
            else:
                bad(f"{hk} -> {path}: module imports but function '{fn}' NOT FOUND")
        except Exception as e:
            bad(f"{hk} -> {path}: import failed: {e}")

# ------------- D. SIMULATED RENDER (captures actual 500 traceback) -------------
section("D. get_context() per user (captures the actual traceback)")

def load_controller(page):
    path = f"apps/{APP}/{APP}/www/{page}.py"
    if not os.path.exists(path):
        return None, f"{path} not found"
    spec = importlib.util.spec_from_file_location("www_" + page.replace("-", "_"), path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m, None

for page, users in {
    "portal": ["supervisor1@netplus.ca", "jdupont@gestionimmo.ca", "operator1@netplus.ca", "Guest"],
    "netplus-pwa": ["operator1@netplus.ca", "supervisor1@netplus.ca", "Guest"],
}.items():
    m, err = load_controller(page)
    if err:
        bad(f"/{page}: {err}"); continue
    if not hasattr(m, "get_context"):
        warn(f"/{page}: no get_context()"); continue
    for u in users:
        frappe.set_user(u)
        frappe.local.flags.redirect_location = None
        try:
            m.get_context(frappe._dict())
            ok(f"/{page} as {u}: renders OK")
        except frappe.Redirect:
            ok(f"/{page} as {u}: redirect -> {frappe.local.flags.redirect_location}")
        except Exception as e:
            bad(f"/{page} as {u}: {type(e).__name__}: {e}")
            for ln in traceback.format_exc(limit=5).splitlines():
                info("    " + ln)
    frappe.set_user("Administrator")

# ------------- E. RECENT SERVER ERRORS -------------
section("E. Last entries in Error Log")
try:
    for row in frappe.get_all("Error Log", fields=["creation", "method"],
                              order_by="creation desc", limit=8):
        info(f"{row.creation} — {row.method}")
except Exception as e:
    warn(f"cannot read Error Log: {e}")

# ------------- SUMMARY -------------
section("SUMMARY")
if not problems:
    print("  No blocking problems detected.")
for p in problems: print("  [FAIL] " + p)
for w in warnings: print("  [WARN] " + w)

frappe.destroy()
