// journal_entry_print_studio.js
// Example client script — attaches the Print Studio subsection under the
// standard Journal Entry form WITHOUT touching any standard field.
// Copy this pattern for every DocType that has reporting / document
// extraction (Sales Invoice, Purchase Invoice, Payment Entry, reports…).

frappe.ui.form.on("Journal Entry", {
  refresh(frm) {
    // Guard: only when the doc is loaded (never on the list view).
    if (!frm.doc || frm.is_new()) return;
    PrintStudio.attach(frm);
  },
});

// ---------------------------------------------------------------------------
// For a custom report / page (no frm object), mount standalone instead:
//
//   PrintStudio.mount("#template-section", {
//     doctype: "Journal Entry",
//     sampleDoc: report.get_current_row_doc(),   // any object with field values
//   });
//
// The designer then previews against `sampleDoc`, and saved templates are
// still shared per-DocType with the Desk forms.
// ---------------------------------------------------------------------------

// Register this file for the DocType from your app:
//   hooks.py → doctype_js = {"Journal Entry": "public/js/journal_entry_print_studio.js"}
// (or: Desk → Customize → Client Script, DocType = Journal Entry, paste the
//  frappe.ui.form.on block above).
