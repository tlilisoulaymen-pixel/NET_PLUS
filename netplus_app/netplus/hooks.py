app_name = "netplus"
app_title = "NetPlus"
app_publisher = "NetPlus Inc."
app_description = "Missions, GPS check-in/out, client feedback & operator scoring on ERPNext"
app_email = "dev@netplusinc.ca"
app_license = "MIT"

# ---------------------------------------------------------------------------
# Website / portal routing
# ---------------------------------------------------------------------------
# Supervisor / Client / Operator accounts are *Website Users*: Frappe itself
# blocks /app (Desk) for them — no redirect hacks needed. This hook decides
# where each of them lands right after login.
get_website_user_home_page = "netplus.auth.get_website_user_home_page"

# Fires at every login; overrides any stale User.home_page / defaults value
on_session_creation = "netplus.auth.set_homepage"

role_home_page = {
    # Admin users → ERPNext desk (modules dashboard)
    "System Manager": "app",
    "Administrator": "app",
    # NetPlus roles → their respective PWAs
    "NetPlus Operator": "netplus-pwa",
    "NetPlus Supervisor": "netplus-supervision",
    "NetPlus Client": "netplus-client",
}

# ---------------------------------------------------------------------------
# Document events
# ---------------------------------------------------------------------------
doc_events = {
    # ratings feed the scoring engine + instant alert on <=2 stars
    "Quality Feedback": {
        "on_submit": "netplus.utils.scoring.on_feedback_submit",
    },
    # geocode a site automatically when it has an address but no coordinates
    "Location": {
        "before_save": "netplus.utils.geo.geocode_location_if_needed",
    },
    # Mission events
    "Mission": {
        "on_submit": "netplus.mission_api.on_mission_submit",
        "validate": "netplus.mission_api.validate_mission",
    },
    "User": {
        "after_insert": "netplus.admin_api.ensure_employee_for_user",
        "on_update": "netplus.admin_api.ensure_employee_for_user",
    },
}

# ---------------------------------------------------------------------------
# Scheduler — replaces the executive report's cron jobs 1:1
# ---------------------------------------------------------------------------
scheduler_events = {
    "cron": {
        # every 5 minutes: lateness tiers + escalation + heartbeat watchdog
        "*/5 * * * *": [
            "netplus.tasks.alerts.scan_lateness",
            "netplus.tasks.alerts.heartbeat_watchdog",
        ],
    },
    "hourly": [
        "netplus.tasks.alerts.expire_feedback_tokens",
        "netplus.tasks.alerts.send_feedback_reminders",
    ],
    "daily": [
        "netplus.utils.scoring.recompute_all_scores",
        "netplus.tasks.alerts.purge_old_gps_data",   # Loi 25 retention
    ],
}

after_install = "netplus.install.after_install"

# ---------------------------------------------------------------------------
# Desk Custom Icons
# ---------------------------------------------------------------------------
app_include_icons = ["netplus/public/icons/netplus_icons.svg"]
app_include_js = [
    "/assets/netplus/js/netplus_icons.js",
    # Print Studio — WYSIWYG template designer (appended to all Desk pages)
    "/assets/netplus/print-studio/qr-reference.js",
    "/assets/netplus/print-studio/print-studio.js",
    # Analytics Hub — dashboard (loaded on analytics-hub page only via page bundle)
    "/assets/netplus/analytics-hub/analytics-dashboard.js",
    # Doc Flow Add-on
    "/assets/netplus/doc-flow/doc-flow.js",
    # Tracking Center Add-on
    "/assets/netplus/tracking-center/tracking-center.js",
]
app_include_css = [
    # Print Studio styles (namespaced .ps-* — no clash with Desk)
    "/assets/netplus/print-studio/print-studio.css",
    # Analytics Hub styles (namespaced .ah-*)
    "/assets/netplus/analytics-hub/analytics-dashboard.css",
    # Doc Flow Add-on
    "/assets/netplus/doc-flow/doc-flow.css",
    # Tracking Center Add-on
    "/assets/netplus/tracking-center/tracking-center.css",
]

after_migrate = ["netplus.setup.workspace_icons.apply"]

website_route_rules = [
    {"from_route": "/login", "to_route": "netplus-login"},
]
