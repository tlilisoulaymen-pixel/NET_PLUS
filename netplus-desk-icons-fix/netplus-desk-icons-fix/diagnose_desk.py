#!/usr/bin/env python
"""Diagnostic Desk : état réel des Workspaces + preuves des causes racines.

Usage (dans le conteneur backend) :
    docker cp diagnose_desk.py frappe_docker-backend-1:/tmp/diagnose_desk.py
    docker exec frappe_docker-backend-1 bash -c \
      "cd /home/frappe/frappe-bench && ./env/bin/python /tmp/diagnose_desk.py"
"""

import os

os.chdir("/home/frappe/frappe-bench")

import frappe  # noqa: E402

SITE = "frontend"
frappe.init(site=SITE, sites_path="sites")
frappe.connect()


def section(t):
    print("\n" + "=" * 66 + "\n  " + t + "\n" + "=" * 66)


# ---------------- A. Preuves des causes racines ----------------
section("A. Causes racines")
print("Doctype 'Desktop Icon' existe :",
      bool(frappe.db.exists("DocType", "Desktop Icon")),
      "  <- False = les scripts 'Desktop Icon' etaient des no-ops")

sprite = "apps/netplus/netplus/public/icons/netplus_icons.svg"
print("Sprite genere :", os.path.exists(sprite),
      f"({os.path.getsize(sprite)//1024} KB)" if os.path.exists(sprite) else "")

asset_link = "sites/assets/netplus"
print("Assets netplus servis :", os.path.exists(asset_link),
      "-> /assets/netplus/icons/netplus_icons.svg")

hooks = frappe.get_hooks()
print("hook app_include_icons :", hooks.get("app_include_icons"))
print("hook after_migrate     :", hooks.get("after_migrate"))

# ---------------- B. Etat des Workspaces ----------------
section("B. Workspaces (ce que la sidebar lit VRAIMENT)")
meta = frappe.get_meta("Workspace")
has_app = meta.has_field("app")
fields = ["name", "title", "module", "public", "is_hidden", "parent_page",
          "icon", "sequence_id"]
if has_app:
    fields.append("app")

rows = frappe.get_all("Workspace", fields=fields,
                      order_by="sequence_id asc, name asc",
                      limit_page_length=0)
hdr = f"{'name':<28} {'module':<16} {'pub':<4} {'hid':<4} {'app':<9} {'icon':<18} parent"
print(hdr)
print("-" * len(hdr))
for r in rows:
    print(f"{(r.name or '')[:27]:<28} {(r.module or '')[:15]:<16} "
          f"{r.public or 0:<4} {r.is_hidden or 0:<4} "
          f"{(r.get('app') or '-')[:8]:<9} {(r.icon or '-')[:17]:<18} "
          f"{r.parent_page or '-'}")

# icônes np-* posées vs sprite
np_icons = [r.icon for r in rows if (r.icon or "").startswith("np-")]
print(f"\nWorkspaces avec icone np-* : {len(np_icons)}",
      "<- 0 = lancez netplus.setup.workspace_icons.apply")

# ---------------- C. Masquages par utilisateur ----------------
section("C. Workspace Settings (masquage PAR UTILISATEUR)")
try:
    for ws in frappe.get_all("Workspace Settings",
                             fields=["name", "user"], limit_page_length=20):
        print("Workspace Settings:", ws.name, "user:", ws.get("user"))
    else:
        print("(rien = aucun masquage par utilisateur)")
except Exception:
    # selon la version, c'est un Single par user dans __UserSettings
    print("(doctype non requetable dans cette version — verifiez via "
          "'Edit Sidebar' dans le Desk pour l'utilisateur concerne)")

frappe.destroy()
print("\nRappel : verifier sur http://localhost:8080/app (Ctrl+F5) — PAS /desk.")
