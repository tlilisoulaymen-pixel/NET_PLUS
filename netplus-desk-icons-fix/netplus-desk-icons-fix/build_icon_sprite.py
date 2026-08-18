#!/usr/bin/env python3
"""PNG -> sprite SVG pour le Desk Frappe.

Usage (dans le conteneur backend) :
    python3 /tmp/build_icon_sprite.py /tmp/modules_icons

Lit les 14 PNG, les embarque en base64 dans des <symbol id="icon-np-*">
et écrit apps/netplus/netplus/public/icons/netplus_icons.svg.
Aucune dépendance (stdlib uniquement).
"""

import base64
import os
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/modules_icons"
OUT = "/home/frappe/frappe-bench/apps/netplus/netplus/public/icons/netplus_icons.svg"

# nom de fichier PNG (exact, tel que dans votre dossier) -> nom de symbole
MAP = {
    "accounting.png": "np-accounting",
    "asset.png": "np-assets",
    "buy-button.png": "np-buying",
    "crm.png": "np-crm",
    "customer-service.png": "np-support",
    "hr and payoll.png": "np-hr",
    "manifacturing.png": "np-manufacturing",
    "map.png": "np-netplus",
    "organisation.png": "np-organization",
    "projects.png": "np-projects",
    "quality.png": "np-quality",
    "selling.png": "np-selling",
    "setting.png": "np-settings",
    "stock and inventroy.png": "np-stock",
}


def main():
    if not os.path.isdir(SRC):
        print(f"ERREUR: dossier introuvable: {SRC}")
        print("Usage: python3 build_icon_sprite.py <dossier des PNG>")
        sys.exit(1)

    available = os.listdir(SRC)
    symbols, missing = [], []
    for fname, icon in MAP.items():
        path = os.path.join(SRC, fname)
        if not os.path.exists(path):
            # tolérance : recherche insensible à la casse
            match = next((f for f in available if f.lower() == fname.lower()), None)
            if match:
                path = os.path.join(SRC, match)
            else:
                missing.append(fname)
                continue
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        symbols.append(
            f'<symbol id="icon-{icon}" viewBox="0 0 128 128">'
            f'<image href="data:image/png;base64,{b64}" '
            f'xlink:href="data:image/png;base64,{b64}" '
            f'width="128" height="128"/></symbol>'
        )

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        f.write(
            '<svg xmlns="http://www.w3.org/2000/svg" '
            'xmlns:xlink="http://www.w3.org/1999/xlink" '
            'style="display:none">' + "".join(symbols) + "</svg>"
        )

    size_kb = os.path.getsize(OUT) // 1024
    print(f"OK: {OUT} ({size_kb} KB, {len(symbols)} symboles)")
    if missing:
        print("MANQUANTS (non bloquant, symboles absents du sprite):")
        for m in missing:
            print("  -", m)
    print("Fichiers vus dans le dossier source:", available)


if __name__ == "__main__":
    main()
