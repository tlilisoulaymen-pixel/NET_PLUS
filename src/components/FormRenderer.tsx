"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { frappe, type DocTypeMeta, type MetaField, FrappeError } from "@/lib/frappe/client";
import { cn } from "@/lib/utils";

const SKIP_TYPES = new Set(["Section Break", "Column Break", "Tab Break", "HTML", "Heading", "Button", "Fold"]);

interface FormProps {
  meta: DocTypeMeta;
  initial?: Record<string, unknown>;
  onSaved?: (doc: Record<string, unknown>) => void;
}

/** Dynamic form driven entirely by Frappe DocType metadata — works for ANY DocType. */
export function FormRenderer({ meta, initial, onSaved }: FormProps) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>(initial ?? {});
  const [serverError, setServerError] = useState<string | null>(null);
  const isNew = !initial?.name;

  useEffect(() => setValues(initial ?? {}), [initial]);

  const fields = useMemo(
    () =>
      (meta.fields ?? []).filter(
        (f) =>
          !f.hidden &&
          !SKIP_TYPES.has(f.fieldtype) &&
          f.fieldname &&
          // Hide read-only fields on new docs — they're server-populated and have no value yet
          !(isNew && f.read_only === 1),
      ),
    [meta.fields, isNew],
  );

  const SYSTEM_KEYS = new Set(["name", "idx", "parent", "parentfield", "parenttype", "doctype"]);

  /** Removes child-table rows that have no user-filled data (e.g. an empty row left over from clicking + Add row). */
  function stripEmptyChildRows(val: unknown): unknown {
    if (!Array.isArray(val)) return val;
    return val.filter((row) => {
      if (typeof row !== "object" || row === null) return false;
      return Object.entries(row as Record<string, unknown>).some(
        ([k, v]) => !SYSTEM_KEYS.has(k) && v !== undefined && v !== null && v !== "" && v !== 0 && v !== false
      );
    });
  }

  /** Fields the server owns (read_only=1) — excluded from save payload. */
  const readOnlyFieldnames = useMemo(
    () => new Set((meta.fields ?? []).filter((f) => f.read_only === 1).map((f) => f.fieldname)),
    [meta.fields],
  );

  const save = useMutation({
    mutationFn: async () => {
      setServerError(null);
      // 1. Strip server-managed (read_only) fields — Frappe returns 400 if included
      // 2. Strip empty child-table rows — Frappe rejects rows with no data
      const payload = Object.fromEntries(
        Object.entries(values)
          .filter(([k]) => !readOnlyFieldnames.has(k))
          .map(([k, v]) => [k, stripEmptyChildRows(v)])
      );
      const doc = { ...payload, doctype: meta.name };
      return isNew ? frappe.create(meta.name, doc) : frappe.update(meta.name, String(initial!.name), doc);
    },
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ["list", meta.name] });
      qc.invalidateQueries({ queryKey: ["doc", meta.name, doc.name] });
      onSaved?.(doc);
    },
    onError: (e) => setServerError(e instanceof FrappeError ? e.message : "Save failed"),
  });

  const submit = useMutation({
    mutationFn: () => frappe.setDocstatus(meta.name, String(initial!.name), 1),
    onSuccess: () => qc.invalidateQueries(),
  });

  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <form
      id="frappe-doc-form"
      className="space-y-6"
      onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
    >
      {serverError && (
        <div role="alert" className="rounded-control border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {serverError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.fieldname} field={f} value={values[f.fieldname]} onChange={(v) => set(f.fieldname, v)} />
        ))}
      </div>

    </form>
  );
}

function Field({ field, value, onChange }: { field: MetaField; value: unknown; onChange: (v: unknown) => void }) {
  const wide = field.fieldtype === "Text" || field.fieldtype === "Small Text" || field.fieldtype === "Long Text" || field.fieldtype === "Text Editor";
  return (
    <div className={cn(wide && "md:col-span-2")}>
      <label className="mb-1.5 block text-[13px] font-medium text-[#344054]" htmlFor={field.fieldname}>
        {field.label}
        {field.reqd === 1 && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      </label>
      <FieldInput field={field} value={value} onChange={onChange} />
      {field.description && <p className="mt-1 text-xs text-ink-muted">{field.description}</p>}
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: MetaField; value: unknown; onChange: (v: unknown) => void }) {
  const base =
    "h-[42px] w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink-primary transition-colors focus:border-primary-400 focus:ring-4 focus:ring-primary-300/15 disabled:bg-surface-muted";
  const ro = field.read_only === 1;
  const v = value == null ? "" : String(value);

  switch (field.fieldtype) {
    case "Select":
      return (
        <select className={base} id={field.fieldname} value={v} disabled={ro} required={field.reqd === 1} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(field.options ?? "").split("\n").filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case "Link":
    case "Dynamic Link":
      return <LinkInput field={field} value={v} onChange={onChange} className={base} />;
    case "Check":
      return (
        <label className="flex h-[42px] items-center gap-2 text-sm text-ink-primary">
          <input type="checkbox" checked={v === "1" || v === "true" || v === "1"} onChange={(e) => onChange(e.target.checked ? 1 : 0)} className="size-4 rounded accent-primary-500" />
          Enabled
        </label>
      );
    case "Date":
    case "Datetime":
      return <input type={field.fieldtype === "Date" ? "date" : "datetime-local"} className={cn(base, "num")} id={field.fieldname} value={v.slice(0, 16)} disabled={ro} onChange={(e) => onChange(e.target.value)} />;
    case "Int":
    case "Float":
    case "Currency":
    case "Percent":
      return <input type="number" step="any" className={cn(base, "num text-right")} id={field.fieldname} value={v} disabled={ro} required={field.reqd === 1} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
    case "Text":
    case "Small Text":
    case "Long Text":
    case "Text Editor":
    case "Code":
      return <textarea rows={4} className={cn(base, "h-auto py-2.5")} id={field.fieldname} value={v} disabled={ro} onChange={(e) => onChange(e.target.value)} />;
    case "Password":
      return <input type="password" className={base} id={field.fieldname} value={v} disabled={ro} onChange={(e) => onChange(e.target.value)} />;
    case "Attach":
    case "Attach Image":
      return <AttachInput field={field} value={v} onChange={onChange} className={base} />;
    case "Table":
    case "Table MultiSelect":
      return <ChildTable field={field} rows={Array.isArray(value) ? (value as Record<string, unknown>[]) : []} onChange={onChange} />;
    default:
      return <input type="text" className={base} id={field.fieldname} value={v} disabled={ro} required={field.reqd === 1} onChange={(e) => onChange(e.target.value)} />;
  }
}

function LinkInput({ field, value, onChange, className }: { field: MetaField; value: string; onChange: (v: unknown) => void; className: string }) {
  const [options, setOptions] = useState<{ value: string; description?: string }[]>([]);
  const [open, setOpen] = useState(false);

  async function search(txt: string) {
    onChange(txt);
    if (!field.options || txt.length < 1) { setOptions([]); return; }
    try {
      setOptions(await frappe.searchLink(field.options, txt));
      setOpen(true);
    } catch { /* ignore */ }
  }

  return (
    <div className="relative">
      <input
        type="text"
        className={className}
        id={field.fieldname}
        value={value}
        autoComplete="off"
        placeholder={`Search ${field.options ?? ""}…`}
        onChange={(e) => search(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && options.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-control border border-line bg-surface py-1 shadow-popover">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-hover"
                onMouseDown={() => { onChange(o.value); setOpen(false); }}
              >
                <span className="font-medium text-ink-primary">{o.value}</span>
                {o.description && <span className="ml-2 text-xs text-ink-muted">{o.description}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AttachInput({ field, value, onChange, className }: { field: MetaField; value: string; onChange: (v: unknown) => void; className: string }) {
  async function upload(file: File) {
    const fd = new FormData();
    fd.append("file", file, file.name);
    fd.append("is_private", "0");
    const res = await fetch("/api/method/upload_file", { method: "POST", credentials: "include", body: fd });
    const json = await res.json();
    onChange(json?.message?.file_url ?? "");
  }
  return (
    <div className="flex items-center gap-2">
      <input type="file" className="text-sm" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {value && <a className="text-xs text-primary-500 underline" href={value} target="_blank" rel="noreferrer">Current file</a>}
    </div>
  );
}

function ChildTable({ field, rows, onChange }: { field: MetaField; rows: Record<string, unknown>[]; onChange: (v: unknown) => void }) {
  const cols = useMemo(() => {
    // Use in_list_view columns from existing rows, excluding system fields and read-only fields.
    const keys = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => {
      if (!["name", "idx", "parent", "parentfield", "parenttype", "doctype"].includes(k)) keys.add(k);
    }));
    return [...keys].slice(0, 6);
  }, [rows]);

  /** Strip read_only child fields from each row before saving. */
  function cleanRow(row: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(row).filter(([k]) =>
        !["checkin_time", "checkout_time", "punctuality_status", "checkin_lat", "checkin_lng",
          "checkout_lat", "checkout_lng", "last_heartbeat"].includes(k)
      )
    );
  }

  function updateRow(i: number, key: string, val: unknown) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r));
    onChange(next.map(cleanRow));
  }
  function addRow() {
    onChange([...rows.map(cleanRow), { doctype: field.options }]);
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="md:col-span-2 overflow-x-auto rounded-control border border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-app/60 text-xs font-semibold text-ink-secondary">
            <th className="w-10 px-2 py-2">#</th>
            {cols.map((c) => <th key={c} className="px-2 py-2 text-left">{c.replace(/_/g, " ")}</th>)}
            <th className="w-16" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={String(row.name ?? i)} className="border-b border-line/50 last:border-0">
              <td className="px-2 py-1.5 text-xs text-ink-muted">{i + 1}</td>
              {cols.map((c) => (
                <td key={c} className="px-1 py-1">
                  <input
                    className="h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm hover:border-line focus:border-primary-400 focus:bg-surface"
                    value={row[c] == null ? "" : String(row[c])}
                    onChange={(e) => updateRow(i, c, e.target.value)}
                  />
                </td>
              ))}
              <td className="px-2 text-right">
                <button type="button" onClick={() => removeRow(i)} className="text-xs text-danger hover:underline">Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={addRow} className="m-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary-500 hover:bg-primary-50">
        + Add row
      </button>
    </div>
  );
}
