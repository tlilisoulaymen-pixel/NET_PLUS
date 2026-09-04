"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { frappe } from "@/lib/frappe/client";
import { toast } from "@/lib/toast";

interface LinkFieldProps {
  label: string;
  value: string;
  doctype: string;
  roleFilter?: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}

export function LinkField({ label, value, doctype, roleFilter, onChange, readOnly = false }: LinkFieldProps) {
  // `displayLabel` = what's shown in the input (human name)
  // `value` (from parent) = the actual stored ID (e.g. HR-EMP-00004)
  const [displayLabel, setDisplayLabel] = useState(value || "");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<any>(null);

  // When the parent resets or changes the value externally, reset the display label too
  useEffect(() => {
    // Only reset to the raw ID if value is being cleared
    if (!value) {
      setDisplayLabel("");
    }
    // If value is set but display is still the raw id (no selection happened yet in this session),
    // leave it as the raw id – a future enhancement could resolve it to a name via API
  }, [value]);

  const fetchResults = useCallback(async (q: string) => {
    setLoading(true);
    try {
      if (roleFilter) {
        const rawUsers = await frappe.call<any>("netplus.admin_api.list_users", {
          search: q,
          role_filter: roleFilter
        });
        const users = Array.isArray(rawUsers) ? rawUsers : (rawUsers?.message || []);

        const mapped = users.map((u: any) => {
          let id = u.name;
          if (doctype === "Employee") id = u.employee_id;
          if (doctype === "Customer") id = u.customer_id;

          const humanName = u.full_name || u.name;

          if (!id) {
            if (doctype === "Employee") {
              return {
                label: humanName,
                sublabel: "Aucune fiche Employé liée — cliquer pour créer",
                value: "",
                isMissingEmployee: true,
                userEmail: u.name,
                userFullName: humanName,
                userRole: roleFilter
              };
            }
            if (doctype === "Customer") {
              return {
                label: humanName,
                sublabel: "Aucune fiche Client liée — cliquer pour créer",
                value: "",
                isMissingCustomer: true,
                userEmail: u.name,
                userFullName: humanName,
                userRole: roleFilter
              };
            }
            return { label: humanName, value: "" };
          }
          return { label: humanName, sublabel: id, value: id };
        });
        setResults(mapped);
      } else {
        const res = await frappe.searchLink(doctype, q);
        setResults(res.map((r: any) => ({ label: r.value || r, sublabel: "", value: r.value || r })));
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [doctype, roleFilter]);

  const handleFocus = () => {
    setOpen(true);
    fetchResults(displayLabel);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDisplayLabel(val);
    // Clear the parent value when the user is typing again
    if (!val) onChange("");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetchResults(val);
      setOpen(true);
    }, 300);
  };

  const handleSelect = (selectedValue: string, selectedLabel: string) => {
    setDisplayLabel(selectedLabel); // Show the human name in the input
    onChange(selectedValue);        // Pass the actual ID to the parent
    setOpen(false);
  };

  if (readOnly) {
    return (
      <div>
        {label && <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">{label}</label>}
        <div className="w-full rounded-lg border border-line bg-gray-50 px-3 py-2 text-sm text-ink-secondary">{displayLabel || value || "—"}</div>
      </div>
    );
  }

  return (
    <div className="relative">
      {label && <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">{label}</label>}
      <input
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        value={displayLabel}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onFocus={handleFocus}
        placeholder={`Rechercher ou sélectionner ${label.toLowerCase()}...`}
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-xl shadow-xl border border-line max-h-52 overflow-auto">
          {loading && results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-ink-secondary text-center">Loading...</div>
          ) : results.length > 0 ? (
            results.map((r, i) => {
              if (r.isMissingEmployee || r.isMissingCustomer) {
                return (
                  <button
                    key={`missing-${i}`}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 text-red-600 cursor-pointer transition-colors"
                    onMouseDown={async (e) => {
                      e.preventDefault();
                      setLoading(true);
                      try {
                        let createdId = "";
                        let createdLabel = r.label;
                        if (r.isMissingEmployee) {
                          const res = await frappe.call<any>("netplus.admin_api.provisionstaff", {
                            email: r.userEmail,
                            first_name: r.userFullName,
                            last_name: "",
                            role: r.userRole
                          });
                          if (res.message && res.message.employee) createdId = res.message.employee;
                        } else if (r.isMissingCustomer) {
                          const res = await frappe.call<any>("netplus.admin_api.create_client", {
                            customer_name: r.userFullName,
                            email: r.userEmail,
                            enable_portal: 1
                          });
                          if (res.message && res.message.customer) createdId = res.message.customer;
                        }

                        if (createdId) {
                          toast.success(`Fiche ${r.isMissingEmployee ? "Employé" : "Client"} créée avec succès !`);
                          handleSelect(createdId, createdLabel);
                          fetchResults("");
                        }
                      } catch (err: any) {
                        toast.error(err.message || "Erreur lors de la création de la fiche");
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <div className="font-medium">{r.label}</div>
                    <div className="text-xs text-red-400 flex items-center gap-1 mt-0.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400"></span>
                      {r.sublabel}
                    </div>
                  </button>
                );
              }
              return (
                <button
                  key={`${r.value}-${i}`}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-brand-50 text-ink-primary cursor-pointer transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(r.value, r.label);
                  }}
                >
                  <div className="font-medium">{r.label}</div>
                  {r.sublabel && <div className="text-xs text-ink-muted mt-0.5">{r.sublabel}</div>}
                </button>
              );
            })
          ) : (
            <div className="px-4 py-3 text-sm text-ink-secondary text-center">No results found</div>
          )}
        </div>
      )}
    </div>
  );
}
