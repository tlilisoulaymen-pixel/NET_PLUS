"use client";

import { useEffect, useState } from "react";
import { frappe } from "@/lib/frappe/client";
import { Loader2, Save } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { toast } from "@/lib/toast";

interface DocPerm {
  parent: string;
  read: number;
  write: number;
  create: number;
  delete: number;
  submit: number;
  cancel: number;
  amend: number;
  report: number;
  export: number;
  import: number;
  share: number;
  print: number;
  [key: string]: any;
}

const DOCTYPES = [
  "Service Contract",
  "Mission",
  "Mission Attendance",
  "Customer",
  "Location",
  "Task",
  "Project",
  "Quality Feedback",
  "User",
  "Employee",
];

const PERM_TYPES = [
  "read", "write", "create", "delete", "submit", "cancel", "amend", 
  "report", "export", "import", "share", "print"
];

export default function AdminPermissionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, DocPerm>>({});

  useEffect(() => {
    fetchPermissions();
  }, []);

  async function fetchPermissions() {
    try {
      const res = await frappe.call<{ permissions: DocPerm[] }>("netplus.admin_api.get_admin_permissions");
      const permMap: Record<string, DocPerm> = {};
      
      // Initialize default matrix
      DOCTYPES.forEach(dt => {
        permMap[dt] = { parent: dt, read: 0, write: 0, create: 0, delete: 0, submit: 0, cancel: 0, amend: 0, report: 0, export: 0, import: 0, share: 0, print: 0 };
      });

      res.message?.permissions?.forEach(p => {
        if (permMap[p.parent]) {
          permMap[p.parent] = { ...permMap[p.parent], ...p };
        }
      });

      setPermissions(permMap);
    } catch (err: any) {
      toast.error(err.message || "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  }

  function togglePermission(dt: string, pt: string) {
    setPermissions(prev => ({
      ...prev,
      [dt]: {
        ...prev[dt],
        [pt]: prev[dt][pt] ? 0 : 1
      }
    }));
  }

  async function savePermissions() {
    setSaving(true);
    try {
      const perms = Object.values(permissions).filter(p => 
        PERM_TYPES.some(pt => p[pt] === 1)
      );
      
      await frappe.call("netplus.admin_api.save_admin_permissions", {
        permissions: JSON.stringify(perms)
      });
      toast.success("Permissions saved successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <AppShell>
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-brand-500 w-8 h-8" />
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-primary">Admin Permissions Matrix</h1>
          <p className="text-sm text-ink-secondary mt-1">Configure role permissions for the NetPlus Admin group.</p>
        </div>
        <button
          onClick={savePermissions}
          disabled={saving}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-medium transition"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="bg-white rounded-xl border border-line shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-surface/50 border-b border-line">
                <th className="p-4 font-semibold text-ink-primary whitespace-nowrap min-w-[180px] sticky left-0 bg-surface/50 z-10 border-r border-line">DocType</th>
                {PERM_TYPES.map(pt => (
                  <th key={pt} className="p-4 font-semibold text-ink-secondary text-center capitalize">{pt}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DOCTYPES.map(dt => (
                <tr key={dt} className="border-b border-line last:border-0 hover:bg-surface/30 transition">
                  <td className="p-4 font-medium text-ink-primary whitespace-nowrap sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-r border-line">{dt}</td>
                  {PERM_TYPES.map(pt => (
                    <td key={pt} className="p-4 text-center">
                      <input
                        type="checkbox"
                        checked={!!permissions[dt]?.[pt]}
                        onChange={() => togglePermission(dt, pt)}
                        className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 cursor-pointer"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
