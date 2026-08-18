"""
Frappe Desk configuration for NetPlus.
Defines the custom Workspaces visible to each role.

Role → Workspace mapping:
  - NetPlus Admin      → "Opérations NetPlus" (full ops dashboard)
  - NetPlus Supervisor → "Mon Équipe"          (team dashboard)
  - NetPlus Operator   → "Espace Opérateur"    (redirect to PWA)
"""

from __future__ import annotations

import frappe


def get_data():
    return [
        # ── NetPlus Admin Workspace ─────────────────────────────
        {
            "module_name": "Opérations NetPlus",
            "category": "Modules",
            "label": "Opérations NetPlus",
            "color": "#3b82f6",
            "icon": "octicon octicon-briefcase",
            "type": "module",
            "description": "Vue consolidée des opérations NetPlus",
            "onboard_present": 1,
            "for_role": "NetPlus Admin",
            "shortcuts": [
                {"label": "Missions du jour", "link_to": "Mission", "type": "DocType"},
                {"label": "Contrats actifs", "link_to": "Service Contract", "type": "DocType"},
                {"label": "Alertes en cours", "link_to": "Mission Alert", "type": "DocType"},
                {"label": "Feedback qualité", "link_to": "Quality Feedback", "type": "DocType"},
                {"label": "Scores Opérateurs", "link_to": "Operator Score", "type": "DocType"},
                {"label": "Équipes superviseurs", "link_to": "Supervisor Team", "type": "DocType"},
                {"label": "Clients", "link_to": "Customer", "type": "DocType"},
                {"label": "Paramètres NetPlus", "link_to": "NetPlus Settings", "type": "DocType"},
            ],
        },
        # ── Supervisor Workspace ───────────────────────────────
        {
            "module_name": "Mon Équipe",
            "category": "Modules",
            "label": "Mon Équipe",
            "color": "#22c55e",
            "icon": "octicon octicon-organization",
            "type": "module",
            "description": "Tableau de bord superviseur — gérez vos opérateurs et missions",
            "onboard_present": 1,
            "for_role": "NetPlus Supervisor",
            "shortcuts": [
                {"label": "Mes Missions du jour", "link_to": "Mission", "type": "DocType"},
                {"label": "Mes Contrats", "link_to": "Service Contract", "type": "DocType"},
                {"label": "Mon Équipe (Opérateurs)", "link_to": "Employee", "type": "DocType"},
                {"label": "Alertes en cours", "link_to": "Mission Alert", "type": "DocType"},
                {"label": "Feedback reçus", "link_to": "Quality Feedback", "type": "DocType"},
                {"label": "Scores de mon équipe", "link_to": "Operator Score", "type": "DocType"},
                {"label": "Nouveau Contrat", "link_to": "Service Contract", "type": "DocType"},
            ],
        },
        # ── Operator Workspace ─────────────────────────────────
        {
            "module_name": "Espace Opérateur",
            "category": "Modules",
            "label": "Espace Opérateur",
            "color": "#f59e0b",
            "icon": "octicon octicon-location",
            "type": "module",
            "description": "Application mobile opérateur — check-in / check-out de missions",
            "onboard_present": 1,
            "for_role": "NetPlus Operator",
            "shortcuts": [
                {
                    "label": "📱 Ouvrir l'application",
                    "url": "/netplus-pwa",
                    "type": "URL",
                },
                {"label": "Mes Missions", "link_to": "Mission", "type": "DocType"},
                {"label": "Mon Score", "link_to": "Operator Score", "type": "DocType"},
            ],
        },
    ]

