import json

import frappe
from frappe.model.document import Document


class ServiceContract(Document):
    def validate(self):
        if (self.expiration_date and self.effective_date
                and self.expiration_date <= self.effective_date):
            frappe.throw("La date d'expiration doit être après la date d'effet.")
        # The QR payload is exactly what the mobile scanner verifies via
        # netplus.api.portal_api.verify_contract: contract id + client id
        # + effective date.
        self.qr_payload = json.dumps({
            "contract_id": self.name,
            "client_id": self.customer,
            "effective_date": str(self.effective_date),
        })
