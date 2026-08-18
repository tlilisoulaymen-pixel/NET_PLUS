import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class SiteAnomaly(Document):
    def before_insert(self):
        self.reported_by = frappe.session.user
        self.reported_on = now_datetime()
        emp = frappe.db.get_value(
            "Employee", {"user_id": frappe.session.user}, ["name", "reports_to"], as_dict=True
        )
        if emp:
            self.employee = emp.name
            if emp.reports_to:
                self.supervisor = frappe.db.get_value("Employee", emp.reports_to, "user_id")

    def after_insert(self):
        # Ne jamais bloquer la création si la notification échoue
        try:
            self._notify_supervisor()
        except Exception:
            frappe.log_error(frappe.get_traceback(), "Site Anomaly: notification failed")

    def _notify_supervisor(self):
        site_name = frappe.db.get_value("Location", self.site, "location_name") or self.site
        subject = _("Anomalie {0} — {1} ({2})").format(self.name, self.anomaly_type, site_name)
        body = _(
            "Une anomalie a été signalée.\n\n"
            "Site : {0}\nType : {1}\nGravité : {2}\nSignalé par : {3}\n\nDescription :\n{4}"
        ).format(site_name, self.anomaly_type, self.severity, self.reported_by, self.description or "—")

        recipients = [self.supervisor] if self.supervisor else []
        if not recipients:
            # Repli : tous les superviseurs NetPlus actifs
            recipients = frappe.get_all(
                "Has Role",
                filters={"role": "NetPlus Supervisor", "parenttype": "User"},
                pluck="parent",
            )
            recipients = [
                u for u in set(recipients)
                if frappe.db.get_value("User", u, "enabled")
            ]

        for user in recipients:
            # Cloche Desk / portail
            frappe.get_doc({
                "doctype": "Notification Log",
                "for_user": user,
                "type": "Alert",
                "subject": subject,
                "email_content": body.replace("\n", "<br>"),
                "document_type": self.doctype,
                "document_name": self.name,
            }).insert(ignore_permissions=True)

        if recipients:
            frappe.sendmail(recipients=recipients, subject=subject, message=body, delayed=True)

        # Rafraîchissement temps réel du portail superviseur
        frappe.publish_realtime(
            "netplus_anomaly",
            {"name": self.name, "site": self.site, "severity": self.severity,
             "anomaly_type": self.anomaly_type},
            after_commit=True,
        )

        # Palier Critique -> Mission Alert (si le doctype existe dans l'app)
        if self.severity == "Critique" and frappe.db.exists("DocType", "Mission Alert"):
            try:
                alert = frappe.new_doc("Mission Alert")
                alert.update({
                    "alert_type": "Anomalie critique",
                    "site": self.site,
                    "task": self.task,
                    "operator": self.reported_by,
                    "details": subject,
                })
                alert.insert(ignore_permissions=True)
            except Exception:
                frappe.log_error(frappe.get_traceback(), "Site Anomaly: Mission Alert creation failed")
