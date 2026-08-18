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
app_include_js = ["/assets/netplus/js/netplus_icons.js"]

after_migrate = ["netplus.setup.workspace_icons.apply"]

website_route_rules = [
    {"from_route": "/login", "to_route": "netplus-login"},
]
