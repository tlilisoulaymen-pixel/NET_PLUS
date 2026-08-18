"""QR Code generation utilities for NetPlus contracts."""

from __future__ import annotations

import base64
import io
import json


def generate_qr_payload(contract_id: str, client_id: int | str, effective_date: str) -> str:
    """Encode contract verification data as a base64 JSON payload."""
    payload = {"c": contract_id, "cl": str(client_id), "d": effective_date}
    return base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()


def decode_qr_payload(token: str) -> dict:
    """Decode a base64 QR payload back to dict."""
    try:
        data = base64.urlsafe_b64decode(token + "==")  # padding-safe
        return json.loads(data)
    except Exception as e:
        raise ValueError(f"Invalid QR token: {e}")


def generate_qr_base64(payload: str, box_size: int = 10, border: int = 4) -> str:
    """
    Generate a QR code PNG as a base64 data URI.
    Used in Jinja templates for PDF reports.

    Returns: "data:image/png;base64,<b64>"
    """
    try:
        import qrcode
        from PIL import Image

        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=box_size,
            border=border,
        )
        qr.add_data(payload)
        qr.make(fit=True)

        img: Image.Image = qr.make_image(fill_color="black", back_color="white")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        b64 = base64.b64encode(buffer.read()).decode()
        return f"data:image/png;base64,{b64}"
    except ImportError:
        # Fallback: return empty string if qrcode not installed
        return ""


def generate_contract_qr(contract_doc) -> str:
    """
    Generate QR code for a Service Contract document.
    Returns base64 data URI.
    """
    payload = generate_qr_payload(
        contract_id=contract_doc.name,
        client_id=contract_doc.customer,
        effective_date=str(contract_doc.effective_date),
    )
    return generate_qr_base64(payload)


def save_qr_to_file(contract_doc) -> str:
    """
    Generate and save the QR code as a Frappe file attachment.
    Returns the file URL.
    """
    import frappe

    qr_b64 = generate_contract_qr(contract_doc)
    if not qr_b64:
        return ""

    # Strip data URI prefix
    b64_data = qr_b64.split(",", 1)[-1]
    file_content = base64.b64decode(b64_data)

    file_doc = frappe.get_doc(
        {
            "doctype": "File",
            "file_name": f"qr_{contract_doc.name}.png",
            "attached_to_doctype": "Service Contract",
            "attached_to_name": contract_doc.name,
            "is_private": 0,
            "content": file_content,
        }
    )
    file_doc.insert(ignore_permissions=True)
    return file_doc.file_url
