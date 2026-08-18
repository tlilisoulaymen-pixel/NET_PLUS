Before the script, three corrections to what your copilot concluded — they matter, because two of its "findings" were false negatives:

tabHasRole doesn't exist — wrong table name. Frappe's table is ` tabHas Role  (with a space). The role data was probably fine; the query was broken. Don't act on that result.
rolehomepage returning netplus-pwa without a leading slash is normal — Frappe stores route names, not paths, and prefixes / itself. Not a bug, don't "fix" it.
"bench migrate only updates existing doctypes" is wrong — migrate does recreate missing doctypes from the app's JSON files, but only for apps it processes. Since netplus is missing from sites/apps.txt, migrate likely never synced it at all. That's the real reason the doctypes never came back.

So the probable causal chain is: app was volume-mounted but never registered (apps.txt + pip install missing) → migrate never synced netplus → the modules.txt mismatch got its doctypes orphan-deleted → every page that reads NetPlus Settings throws 500 → the 500 fires before your redirect logic runs → browser shows "Not Permitted"/error after the login redirect. The URL-changing behavior is downstream, not a separate bug.

The script below verifies every link of that chain instead of guessing.

The diagnostic script

Save this on Windows as diagnetplus.py:

`python
#!/usr/bin/env python
diagnetplus.py — layered diagnosis of the NetPlus app on site "frontend"
import os, sys, glob, json, importlib, importlib.util, traceback

BENCH, SITE, APP = "/home/frappe/frappe-bench", "frontend", "netplus"
os.chdir(BENCH)
problems, warnings = [], []

def section(t): print("\n" + "="  62 + "\n  " + t + "\n" + "="  62)
def ok(m):   print("  [ OK ] " + m)
def bad(m):  print("  [FAIL] " + m); problems.append(m)
def warn(m): print("  [WARN] " + m); warnings.append(m)
def info(m): print("         " + m)

------------- A. APP REGISTRATION (filesystem) -------------
section("A. App registration")
appstxt = []
if os.path.exists("sites/apps.txt"):
    appstxt = [l.strip() for l in open("sites/apps.txt") if l.strip()]
    info(f"sites/apps.txt = {appstxt}")
    (ok if APP in appstxt else bad)(
        f"'{APP}' listed in sites/apps.txt" if APP in appstxt
        else f"'{APP}' MISSING from sites/apps.txt -> install-app refuses, migrate may skip the app")
else:
    bad("sites/apps.txt does not exist")

(ok if os.path.isdir(f"apps/{APP}") else bad)(f"apps/{APP} directory present"
    if os.path.isdir(f"apps/{APP}") else f"apps/{APP} directory MISSING")

spec = importlib.util.findspec(APP)
if spec:
    ok(f"python package '{APP}' importable ({spec.origin})")
else:
    bad(f"'{APP}' NOT pip-installed in the bench env -> app was only volume-mounted, never bench get-app-ed")

modules.txt vs the "module" field inside every doctype JSON
declared = []
mt = f"apps/{APP}/{APP}/modules.txt"
if os.path.exists(mt):
    declared = [l.strip() for l in open(mt) if l.strip()]
    info(f"modules.txt = {declared}")
else:
    bad("modules.txt missing")

jsonmodules = {}
for p in glob.glob(f"apps/{APP}/{APP}/*/doctype//.json", recursive=True):
    try:
        d = json.load(open(p, encoding="utf-8"))
        if d.get("doctype") == "DocType":
            jsonmodules.setdefault(d.get("module"), []).append(d.get("name"))
    except Exception:
        pass
for mod, dts in sorted(jsonmodules.items()):
    if mod in declared:
        ok(f"module '{mod}' declared -> doctypes {dts}")
    else:
        bad(f"module '{mod}' used by {dts} but NOT in modules.txt -> orphan-deleted on migrate")

------------- B. SITE DATABASE STATE -------------
section("B. Site database")
import frappe
frappe.init(site=SITE, sitespath="sites")
frappe.connect()

installed = frappe.getinstalledapps()
info(f"site installedapps = {installed}")
(ok if APP in installed else bad)(f"site DB lists '{APP}' as installed"
    if APP in installed else f"site DB does NOT list '{APP}' as installed")

for dt in ["Mission", "Service Contract", "Mission Alert",
           "Mission Operator", "Operator Score", "NetPlus Settings"]:
    if not frappe.db.exists("DocType", dt):
        bad(f"DocType '{dt}': row missing from tabDocType (orphan-deleted, never resynced)")
        continue
    issingle = int(frappe.db.getvalue("DocType", dt, "issingle") or 0)
    if issingle:
        n = frappe.db.sql("select count() from tabSingles where doctype=%s", dt)[0][0]
        ok(f"DocType '{dt}' exists (Single, {n} stored values)")
    elif frappe.db.tableexists(dt):
        ok(f"DocType '{dt}' exists, SQL table present ({frappe.db.count(dt)} rows)")
    else:
        bad(f"DocType '{dt}': meta row exists but SQL table tab{dt} is MISSING")

for mod in sorted(set(declared) | set(jsonmodules)):
    appname = frappe.db.getvalue("Module Def", mod, "appname")
    (ok if appname else bad)(f"Module Def '{mod}' -> app '{appname}'"
        if appname else f"Module Def '{mod}' missing from DB")

for target in ["Task", "Location", "Quality Feedback"]:
    cf = frappe.getall("Custom Field", filters={"dt": target}, pluck="fieldname")
    (ok if cf else warn)(f"Custom Fields on {target}: {cf or 'NONE (wiped or never created)'}")

for role in ["NetPlus Supervisor", "NetPlus Operator", "NetPlus Client"]:
    r = frappe.db.getvalue("Role", role, ["deskaccess"], asdict=True)
    if r is None:
        bad(f"Role '{role}' does not exist")
    else:
        (ok if not r.deskaccess else warn)(f"Role '{role}': deskaccess={r.deskaccess}")

info("(note: the role table is tabHas Role — with a space; the earlier SQL used the wrong name)")
for u in ["operator1@netplus.ca", "supervisor1@netplus.ca", "jdupont@gestionimmo.ca"]:
    if not frappe.db.exists("User", u):
        bad(f"User {u} does not exist"); continue
    utype = frappe.db.getvalue("User", u, "usertype")
    nroles = [r for r in frappe.getroles(u) if r.startswith("NetPlus")]
    dflt = frappe.defaults.getuserdefault("homepage", u)
    line = f"{u}: usertype={utype}, roles={nroles}, user-default homepage={dflt!r}"
    ok(line) if (utype == "Website User" and nroles) else bad(line)

wshome = frappe.db.getsinglevalue("Website Settings", "homepage")
info(f"Website Settings homepage = {wshome!r}")
try:
    pshome = frappe.db.getsinglevalue("Portal Settings", "defaultportalhome")
    info(f"Portal Settings defaultportalhome = {pshome!r}")
except Exception:
    pass

------------- C. HOOKS <-> CODE CONSISTENCY -------------
section("C. Hooks resolve to real functions")
hooks = frappe.gethooks()
info(f"rolehomepage = {dict(hooks.get('rolehomepage') or {})}")
for hk in ["onsessioncreation", "getwebsiteuserhomepage"]:
    for path in (hooks.get(hk) or []):
        modpath, fn = path.rsplit(".", 1)
        try:
            m = importlib.importmodule(modpath)
            (ok if hasattr(m, fn) else bad)(f"{hk} -> {path}"
                if hasattr(m, fn) else f"{hk} -> {path}: module imports, but function '{fn}' NOT FOUND")
        except Exception as e:
            bad(f"{hk} -> {path}: import failed: {e}")

------------- D. SIMULATED RENDER = the real 500 -------------
section("D. getcontext() per user (captures the actual traceback)")
def loadcontroller(page):
    path = f"apps/{APP}/{APP}/www/{page}.py"
    if not os.path.exists(path):
        return None, f"{path} not found"
    s = importlib.util.specfromfilelocation("www" + page.replace("-", ""), path)
    m = importlib.util.modulefromspec(s)
    s.loader.execmodule(m)
    return m, None

for page, users in {
    "portal": ["supervisor1@netplus.ca", "jdupont@gestionimmo.ca", "operator1@netplus.ca", "Guest"],
    "netplus-pwa": ["operator1@netplus.ca", "supervisor1@netplus.ca", "Guest"],
}.items():
    m, err = loadcontroller(page)
    if err:
        bad(f"/{page}: {err}"); continue
    if not hasattr(m, "getcontext"):
        warn(f"/{page}: no getcontext()"); continue
    for u in users:
        frappe.setuser(u)
        frappe.local.flags.redirectlocation = None
        try:
            m.getcontext(frappe.dict())
            ok(f"/{page} as {u}: renders")
        except frappe.Redirect:
            ok(f"/{page} as {u}: redirect -> {frappe.local.flags.redirectlocation}")
        except Exception as e:
            bad(f"/{page} as {u}: {type(e).name}: {e}")
            for ln in traceback.formatexc(limit=4).splitlines():
                info("    " + ln)
    frappe.setuser("Administrator")

------------- E. RECENT SERVER ERRORS -------------
section("E. Last entries in Error Log")
try:
    for row in frappe.getall("Error Log", fields=["creation", "method"],
                              orderby="creation desc", limit=8):
        info(f"{row.creation} — {row.method}")
except Exception as e:
    warn(f"cannot read Error Log: {e}")

------------- SUMMARY -------------
section("SUMMARY")
if not problems:
    print("  No blocking problems detected.")
for p in problems: print("  [FAIL] " + p)
for w in warnings: print("  [WARN] " + w)
frappe.destroy()
`

Run it (no PowerShell quoting issues — the code lives in a file):

`powershell
docker cp diagnetplus.py frappedocker-backend-1:/tmp/diagnetplus.py
docker exec frappedocker-backend-1 bash -c "cd /home/frappe/frappe-bench && ./env/bin/python /tmp/diagnetplus.py"
`

Section D is the important one: it reproduces the 500 inside the framework with the real traceback per user per page — no HTTP, no nginx, no cookie noise. Whatever exception it prints for /portal and /netplus-pwa is the exact thing the browser is hiding behind "Not Permitted".

The fix, mapped to the expected findings

Step 1 — register the app properly (fixes A-failures; this is the blocker for everything else):

`bash
docker exec frappedocker-backend-1 bash -c "cd /home/frappe/frappe-bench && ./env/bin/pip install -e apps/netplus"
docker exec frappedocker-backend-1 bash -c "cd /home/frappe/frappe-bench && grep -qx netplus sites/apps.txt || echo netplus >> sites/apps.txt"
`

Step 2 — resync the schema (fixes B-failures). Make sure modules.txt matches the module values the script printed in section A exactly (case-sensitive), then:

`bash
docker exec frappedocker-backend-1 bash -c "cd /home/frappe/frappe-bench && bench --site frontend migrate"
`

If any doctype is still missing after migrate (possible since the site DB already marks netplus "installed"), force a reinstall — this also reruns afterinstall, recreating roles, custom fields, the feedback template and Settings defaults:

`bash
docker exec frappedocker-backend-1 bash -c "cd /home/frappe/frappe-bench && bench --site frontend install-app netplus --force"
`

Step 3 — clear and restart:

`bash
docker exec frappedocker-backend-1 bash -c "bench --site frontend clear-cache && bench --site frontend clear-website-cache"
docker compose restart backend frontend websocket
`

Step 4 — admin password (the copilot noted admin fails):

`bash
docker exec frappedocker-backend-1 bash -c "bench --site frontend set-admin-password Netplus123!"
`

Then re-run the diagnostic script — target is zero FAILs — and only then retest in a fresh incognito window per role.

The actual "permanent" part

One thing makes this non-permanent in frappedocker, and it's worth deciding now: sites/ is a volume (survives container recreation), but the bench virtualenv env/ is inside the image. So the pip install -e from Step 1 dies the next time the container is recreated — while apps.txt (in the volume) keeps saying netplus exists. That mismatch makes every bench command crash with ModuleNotFoundError, which is worse than today.

The permanent fix is the standard frappedocker path: build a custom image with netplus baked in via apps.json (base64-encoded, passed as APPSJSONBASE64 to the frappedocker build), point your docker-compose at that image, and drop the volume mount of the app entirely. Until you do that, treat Step 1 as a repair you must re-apply after any docker compose up --force-recreate` or image update.