/* ============================================================
 * PS_QR — QR code generation with document reference data
 * ------------------------------------------------------------
 * The QR encodes a JSON payload built from the CURRENT document:
 *   { doctype, name, company, posting_date, totals, currency,
 *     modified, verify_url }
 * so scanning it identifies the exact document and lets anyone
 * open its verification URL.
 *
 * A ZATCA-style TLV (tag-length-value, base64) encoder is also
 * included for e-invoicing compliance when you need it.
 *
 * Rendering: uses the "qrcodejs" library (loaded lazily from CDN).
 * Offline fallback: place qrcode.min.js next to this file — see
 * INTEGRATION.md §4.
 * ========================================================== */
(function () {
  "use strict";

  const CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
  let libPromise = null;

  function loadLib() {
    if (window.QRCode) return Promise.resolve();
    if (libPromise) return libPromise;
    libPromise = new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      // Local copy first (offline installs), CDN as fallback.
      s.src = window.PS_QR_LOCAL_URL || "qrcode.min.js";
      s.onload = function () { resolve(); };
      s.onerror = function () {
        const cdn = document.createElement("script");
        cdn.src = CDN_URL;
        cdn.onload = function () { resolve(); };
        cdn.onerror = function () { reject(new Error("QRCode library unavailable")); };
        document.head.appendChild(cdn);
      };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  /** Fields that make a document uniquely identifiable/verifiable. */
  const REFERENCE_FIELDS = [
    "doctype", "name", "naming_series", "company",
    "posting_date", "transaction_date", "bill_date",
    "grand_total", "total_debit", "total_credit",
    "currency", "owner", "modified",
  ];

  function buildPayload(doc) {
    const payload = {};
    REFERENCE_FIELDS.forEach(function (f) {
      if (doc[f] !== undefined && doc[f] !== null && doc[f] !== "") payload[f] = doc[f];
    });
    // Verification URL — scanning the QR opens the exact document.
    try {
      const slug = String(doc.doctype || "").toLowerCase().replace(/ /g, "-");
      if (doc.name) {
        payload.verify_url = window.location.origin + "/app/" + slug + "/" + encodeURIComponent(doc.name);
      }
    } catch (e) { /* non-browser context */ }
    return payload;
  }

  // --- ZATCA-style TLV (tag-length-value) → base64 ----------------
  function tlvEncode(tags) {
    // tags: array of [tagNumber:int, value:string]
    const bytes = [];
    tags.forEach(function ([tag, value]) {
      const v = unescape(encodeURIComponent(String(value))); // UTF-8 bytes
      bytes.push(tag & 0xff, v.length & 0xff);
      for (let i = 0; i < v.length; i++) bytes.push(v.charCodeAt(i));
    });
    let bin = "";
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  function buildTlvPayload(doc, companyVat) {
    // ZATCA tag layout: 1 seller, 2 VAT no, 3 timestamp, 4 total, 5 VAT total
    return tlvEncode([
      [1, doc.company || ""],
      [2, companyVat || ""],
      [3, doc.posting_date || doc.modified || new Date().toISOString()],
      [4, doc.grand_total || doc.total_debit || 0],
      [5, doc.tax_total || 0],
    ]);
  }

  function render(holder, doc, opts) {
    opts = opts || {};
    const payload = opts.mode === "tlv"
      ? buildTlvPayload(doc, opts.companyVat)
      : JSON.stringify(buildPayload(doc));
    loadLib().then(function () {
      holder.innerHTML = "";
      // eslint-disable-next-line no-undef
      new QRCode(holder, {
        text: payload,
        width: opts.size || 96,
        height: opts.size || 96,
        correctLevel: QRCode.CorrectLevel.M,
      });
      holder.title = "Reference QR — " + (doc.doctype || "") + " " + (doc.name || "");
    }).catch(function () {
      holder.textContent = "[QR library unavailable — see INTEGRATION.md §4]";
    });
  }

  window.PS_QR = {
    render: render,
    buildPayload: buildPayload,
    buildTlvPayload: buildTlvPayload,
    tlvEncode: tlvEncode,
  };
})();
