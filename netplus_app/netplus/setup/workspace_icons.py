"""Icônes + visibilité des Workspaces du Desk — idempotent.

Appelé :
- manuellement : bench --site frontend execute netplus.setup.workspace_icons.apply
- automatiquement après chaque migrate via le hook after_migrate (hooks.py),
  ce qui neutralise la resynchronisation des workspaces standards ERPNext
  qui écraserait sinon les icônes posées en base.

Les noms d'icônes (np-*) référencent les symboles du sprite
netplus/public/icons/netplus_icons.svg généré par build_icon_sprite.py.
"""

import frappe

# Workspace name -> symbole du sprite. Adaptez si un workspace n'existe pas
# dans votre bench (le script ignore silencieusement les absents).
ICONS = {
    # ERPNext
    "Accounting": "np-accounting",
    "Payables": "np-accounting",
    "Receivables": "np-accounting",
    "Financial Reports": "np-accounting",
    "Assets": "np-assets",
    "Buying": "np-buying",
    "CRM": "np-crm",
    "Support": "np-support",
    "Manufacturing": "np-manufacturing",
    "Projects": "np-projects",
    "Quality": "np-quality",
    "Selling": "np-selling",
    "Stock": "np-stock",
    "Subcontracting": "np-organization",
    "ERPNext Settings": "np-settings",
    "ERPNext Integrations": "np-settings",
    # Frappe / Framework
    "Users": "np-hr",
    "HR": "np-hr",
    "Integrations": "np-settings",
    "Build": "np-settings",
    "Tools": "np-organization",
}

# Icône unique pour tous les workspaces NetPlus
NETPLUS_MODULES = ("NetPlus", "Netplus Core")
NETPLUS_ICON = "np-netplus"

# Champ Workspace.app (v15+) : la sidebar est filtrée par l'app sélectionnée.
# "erpnext" = les workspaces NetPlus apparaissent dans la sidebar ERPNext
# (sidebar unifiée). Mettez None pour ne pas toucher au champ.
TARGET_APP = "erpnext"


def apply():
    ws_meta = frappe.get_meta("Workspace")
    has_app = ws_meta.has_field("app")
    touched = 0

    for name, icon in ICONS.items():
        if not frappe.db.exists("Workspace", name):
            continue
        frappe.db.set_value(
            "Workspace", name,
            {"icon": icon, "public": 1, "is_hidden": 0},
            update_modified=False,
        )
        touched += 1

    netplus_ws = frappe.get_all(
        "Workspace", filters={"module": ["in", list(NETPLUS_MODULES)]},
        pluck="name",
    )
    for name in netplus_ws:
        values = {"icon": NETPLUS_ICON, "public": 1, "is_hidden": 0}
        if has_app and TARGET_APP:
            values["app"] = TARGET_APP
        frappe.db.set_value("Workspace", name, values, update_modified=False)
        touched += 1

    frappe.db.commit()
    frappe.clear_cache()
    print(f"workspace_icons.apply: {touched} workspaces mis à jour "
          f"({len(netplus_ws)} NetPlus), cache vidé.")
    return touched
