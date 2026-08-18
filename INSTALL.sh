# NetPlus — Installation & Deployment Guide
# =========================================
# Run these commands INSIDE the frappe-bench container or on the bench server.
# All commands assume you are in the /home/frappe/frappe-bench directory.

# ─────────────────────────────────────────────
# STEP 1 — Development Setup (Docker volume mount)
# ─────────────────────────────────────────────

# The netplus_app directory is already mounted as a volume via compose.netplus.yaml.
# Start the stack:
#
#   cd frappe_docker
#   cp .env.netplus .env
#   docker compose -f compose.yaml -f compose.netplus.yaml up -d
#
# Once running, open a shell in the backend container:
#
#   docker exec -it <backend_container_id> bash

# ─────────────────────────────────────────────
# STEP 2 — Install the app on the bench
# ─────────────────────────────────────────────
#
# From inside the container (/home/frappe/frappe-bench):

bench get-app /home/frappe/frappe-bench/apps/netplus --skip-assets
# OR if already cloned:
bench install-app netplus

# ─────────────────────────────────────────────
# STEP 3 — Install on your site
# ─────────────────────────────────────────────

bench --site erp.netplusinc.ca install-app netplus

# ─────────────────────────────────────────────
# STEP 4 — Run migrations & fixtures
# ─────────────────────────────────────────────

bench --site erp.netplusinc.ca migrate
bench --site erp.netplusinc.ca import-fixtures

# ─────────────────────────────────────────────
# STEP 5 — Build assets (for PWA)
# ─────────────────────────────────────────────

bench build --app netplus

# ─────────────────────────────────────────────
# STEP 6 — Verify installation
# ─────────────────────────────────────────────
#
# In a Frappe console:
#   bench --site erp.netplusinc.ca console
#
#   >>> import frappe
#   >>> frappe.get_doc("NetPlus Settings")      # should return the Settings doc
#   >>> frappe.get_all("Mission")               # should return empty list
#   >>> from netplus.utils.geo import haversine_distance
#   >>> haversine_distance(45.4988, -73.5781, 45.4988, -73.5781)  # → 0.0

# ─────────────────────────────────────────────
# STEP 7 — Create initial data
# ─────────────────────────────────────────────
#
# Via the ERPNext Desk:
# 1. Go to NetPlus Settings → configure thresholds, weights, API keys
# 2. Create Employees with netplus_role = "Supervisor"
# 3. Create Employees with netplus_role = "Operator" + assign supervisor
# 4. Create Customers + assign_supervisor
# 5. Create a Service Contract → submit → QR code + Project + Missions auto-generated
# 6. Operator logs into /netplus-pwa → checks in via GPS

# ─────────────────────────────────────────────
# DAILY SCHEDULER VERIFICATION
# ─────────────────────────────────────────────
#
# Manually trigger scheduler jobs for testing:
#
#   bench --site erp.netplusinc.ca execute netplus.tasks.alert_engine.run_alert_scan
#   bench --site erp.netplusinc.ca execute netplus.tasks.mission_generator.generate_missions_from_contracts
#   bench --site erp.netplusinc.ca execute netplus.tasks.score_engine.recompute_all_scores

# ─────────────────────────────────────────────
# UNIT TESTS (outside bench — pure Python)
# ─────────────────────────────────────────────
#
# From c:\Users\tlili\OneDrive\Bureau\netplus:
#   python -m pytest netplus_app/netplus/tests/test_core.py -v
#
# Expected: 15 passed in < 0.1s
