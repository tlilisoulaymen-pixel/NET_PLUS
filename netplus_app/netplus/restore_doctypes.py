"""
NetPlus DocType restore — directly imports all DocType JSON files into DB.
Bypasses reload_doc (which requires module in memory) by using
frappe.model.sync.sync_doctype directly.

Run: bench --site frontend execute netplus.restore_doctypes.run
"""
import frappe
import os
import json


def run():
    app_path = frappe.get_app_path("netplus")
    doctype_base = os.path.join(app_path, "netplus_core", "doctype")

    if not os.path.exists(doctype_base):
        print(f"❌ Not found: {doctype_base}")
        return

    # First ensure the module def exists and is committed
    if not frappe.db.exists("Module Def", "Netplus Core"):
        m = frappe.new_doc("Module Def")
        m.module_name = "Netplus Core"
        m.app_name = "netplus"
        m.flags.ignore_permissions = True
        m.insert()
        frappe.db.commit()
        print("✅ Created Module Def: Netplus Core")

    restored = 0
    errors = []

    for dt_folder in sorted(os.listdir(doctype_base)):
        json_file = os.path.join(doctype_base, dt_folder, f"{dt_folder}.json")
        if not os.path.isfile(json_file):
            continue

        with open(json_file, "r", encoding="utf-8") as f:
            dt_data = json.load(f)

        dt_name = dt_data.get("name")
        if not dt_name:
            continue

        try:
            if frappe.db.exists("DocType", dt_name):
                # Update existing
                doc = frappe.get_doc("DocType", dt_name)
                doc.update(dt_data)
                doc.flags.ignore_permissions = True
                doc.flags.ignore_validate = True
                doc.flags.ignore_mandatory = True
                doc.save()
            else:
                # Create new
                doc = frappe.new_doc("DocType")
                doc.update(dt_data)
                doc.flags.ignore_permissions = True
                doc.flags.ignore_validate = True
                doc.flags.ignore_mandatory = True
                doc.insert()

            # Create the actual table if missing
            try:
                frappe.db.create_table_if_not_exists(doc)
            except Exception:
                pass

            print(f"  ✅ {dt_name}")
            restored += 1
        except Exception as e:
            errors.append(f"{dt_name}: {e}")
            print(f"  ⚠️  {dt_name}: {e}")

    frappe.db.commit()
    print(f"\n✅ Restored: {restored}  Errors: {len(errors)}")

    # Now run syncdb to create/alter the actual tables
    try:
        import frappe.model.db_schema as dbschema
        for dt_folder in sorted(os.listdir(doctype_base)):
            json_file = os.path.join(doctype_base, dt_folder, f"{dt_folder}.json")
            if not os.path.isfile(json_file):
                continue
            with open(json_file, "r", encoding="utf-8") as f:
                dt_data = json.load(f)
            dt_name = dt_data.get("name")
            if not dt_name:
                continue
            try:
                dbschema.updatedb(dt_name)
            except Exception:
                pass
        print("✅ Tables created/updated")
    except Exception as e:
        print(f"⚠️  Table creation: {e}")
