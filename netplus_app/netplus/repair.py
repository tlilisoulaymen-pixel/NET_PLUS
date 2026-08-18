"""
NetPlus full repair script.
Run: bench --site frontend execute netplus.repair.run
"""
import frappe
import os
import json


def run():
    _ensure_module_def()
    _sync_doctypes()
    _import_workspaces()
    _fix_user_types()
    frappe.db.commit()
    print("\n✅ NetPlus repair complete.")


def _ensure_module_def():
    """Create the Netplus Core module def if missing."""
    if not frappe.db.exists("Module Def", "Netplus Core"):
        m = frappe.new_doc("Module Def")
        m.module_name = "Netplus Core"
        m.app_name = "netplus"
        m.flags.ignore_permissions = True
        m.insert()
        frappe.db.commit()
        print("✅ Created Module Def: Netplus Core")
    else:
        # Make sure it is linked to the correct app
        frappe.db.set_value("Module Def", "Netplus Core", "app_name", "netplus")
        print("ℹ️  Module Def 'Netplus Core' already exists")


def _sync_doctypes():
    """
    Re-sync all DocType JSON files.
    frappe.reload_doc(app, 'doctype', doctype_folder, force=True)
    uses the MODULE LABEL (e.g. 'Netplus Core') mapped via modules.txt.
    The correct call signature: reload_doc(module, dt, dn, force).
    """
    app_path = frappe.get_app_path("netplus")
    doctype_base = os.path.join(app_path, "netplus_core", "doctype")

    if not os.path.exists(doctype_base):
        print(f"❌ DocType path not found: {doctype_base}")
        return

    synced = 0
    errors = []
    for dt_folder in sorted(os.listdir(doctype_base)):
        dt_path = os.path.join(doctype_base, dt_folder)
        json_file = os.path.join(dt_path, f"{dt_folder}.json")
        if not os.path.isfile(json_file):
            continue
        try:
            # Correct: reload_doc(module_label, 'doctype', folder_name)
            frappe.reload_doc("Netplus Core", "doctype", dt_folder, force=True)
            print(f"  ✅ {dt_folder}")
            synced += 1
        except Exception as e:
            errors.append(f"{dt_folder}: {e}")

    frappe.db.commit()
    print(f"\nSynced: {synced}  Errors: {len(errors)}")
    for err in errors:
        print(f"  ⚠️  {err}")


def _import_workspaces():
    """Import workspace fixtures, skipping link validation for now."""
    app_path = frappe.get_app_path("netplus")
    ws_path = os.path.join(app_path, "fixtures", "workspace", "netplus_workspaces.json")

    if not os.path.exists(ws_path):
        print(f"⚠️  Workspace fixture not found: {ws_path}")
        return

    with open(ws_path, "r", encoding="utf-8") as f:
        workspaces = json.load(f)

    imported = 0
    for ws_data in workspaces:
        if not isinstance(ws_data, dict):
            continue
        name = ws_data.get("name")
        if not name:
            continue
        try:
            if frappe.db.exists("Workspace", name):
                ws = frappe.get_doc("Workspace", name)
                # Only update safe fields, not links that may reference missing doctypes
                for field in ("label", "module", "icon", "is_default",
                              "is_hidden", "public", "sequence_id"):
                    if field in ws_data:
                        ws.set(field, ws_data[field])
            else:
                ws = frappe.new_doc("Workspace")
                ws.update({k: v for k, v in ws_data.items()
                           if k not in ("shortcuts", "links", "roles")})
            ws.flags.ignore_permissions = True
            ws.flags.ignore_validate = True
            ws.flags.ignore_mandatory = True
            ws.save()
            imported += 1
            print(f"  ✅ Workspace: {name}")
        except Exception as e:
            print(f"  ⚠️  Workspace {name}: {e}")

    frappe.db.commit()
    print(f"Imported {imported} workspaces")


def _fix_user_types():
    """Convert non-admin users to Website Users."""
    from netplus.setup_users import convert_to_website_users
    convert_to_website_users()
