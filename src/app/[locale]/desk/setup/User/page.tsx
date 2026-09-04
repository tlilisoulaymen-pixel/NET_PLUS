"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { frappe } from "@/lib/frappe/client";
import { toast } from "@/lib/toast";
import { Plus, ChevronRight, RefreshCw, AlertCircle, Key, Trash2, ShieldCheck, EyeOff, Eye, Loader2, Play, IdCard, Copy, Check } from "lucide-react";
import Link from "next/link";
import { DataTable, Column } from "@/components/DataTable";

export default function UserListPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blurredUsers, setBlurredUsers] = useState<Set<string>>(new Set());

  // Password Modal State
  const [passwordModalUser, setPasswordModalUser] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  // Credentials Modal State
  const [credentialsModalUser, setCredentialsModalUser] = useState<any | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await frappe.call<any>("netplus.admin_api.list_users", {
        limit: 100,
        start: 0,
      });
      const raw = Array.isArray(res) ? res : (res.message || []);
      
      const formatted = raw.map((u: any) => ({
        ...u,
        status: u.enabled ? "Active" : "Disabled",
      }));
      setUsers(formatted);
    } catch (e: any) {
      setError(e.message || "Impossible de charger les utilisateurs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleToggleUser = async (email: string, currentState: string) => {
    const isEnabling = currentState !== "Active";
    const actionText = isEnabling ? "réactiver" : "archiver/désactiver";
    if (!confirm(`Voulez-vous vraiment ${actionText} cet utilisateur ?`)) return;
    
    try {
      await frappe.call("netplus.admin_api.toggle_user", {
        user_email: email,
        enabled: isEnabling ? 1 : 0
      });
      toast.success(`Utilisateur ${isEnabling ? "réactivé" : "désactivé"} avec succès.`);
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'action.");
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas.");
      return;
    }
    if (!passwordModalUser) return;
    
    setSavingPass(true);
    try {
      await frappe.call("netplus.admin_api.update_netplus_password", {
        user_email: passwordModalUser,
        new_password: newPassword,
      });
      toast.success("Mot de passe mis à jour avec succès.");
      setPasswordModalUser(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors du changement de mot de passe.");
    } finally {
      setSavingPass(false);
    }
  };

  const generateAndSetPassword = async (userEmail: string) => {
    // Generate secure random password
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let pass = "";
    for (let i = 0; i < 12; i++) pass += chars[Math.floor(Math.random() * chars.length)];
    
    setSavingPass(true);
    try {
      await frappe.call("netplus.admin_api.update_netplus_password", {
        user_email: userEmail,
        new_password: pass,
      });
      setGeneratedPassword(pass);
      toast.success("Mot de passe temporaire généré.");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la génération.");
    } finally {
      setSavingPass(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleBlur = (name: string) => {
    setBlurredUsers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const columns: Column[] = [
    { key: "full_name", label: "Nom Complet" },
    { key: "name", label: "Email / ID" },
    { 
      key: "roles", 
      label: "Rôles",
      renderCell: (row) => (
        <div className="flex flex-wrap gap-1.5">
          {Array.isArray(row.roles) ? row.roles.map((r: string) => (
            <span key={r} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
              {r}
            </span>
          )) : "—"}
        </div>
      )
    },
    { key: "status", label: "Statut" },
    { key: "last_login", label: "Dernière Connexion", fieldtype: "Date" },
    { 
      key: "actions", 
      label: "Actions",
      renderCell: (row) => {
        const isBlurred = blurredUsers.has(String(row.name));
        return (
          <div className="flex items-center gap-2 justify-end relative z-10">
            <button
              onClick={() => toggleBlur(String(row.name))}
              className={`p-1.5 rounded transition-colors ${isBlurred ? 'text-blue-500 hover:bg-blue-50' : 'text-ink-muted hover:text-ink-primary hover:bg-bg-muted'}`}
              title={isBlurred ? "Afficher" : "Masquer de la vue (Flouter)"}
            >
              {isBlurred ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </button>

          <button
            onClick={() => {
              setCredentialsModalUser(row);
              setGeneratedPassword(null);
            }}
            className="p-1.5 text-ink-muted hover:text-ink-primary hover:bg-bg-muted rounded transition-colors"
            title="Afficher les identifiants"
          >
            <IdCard className="size-4" />
          </button>

          <button
            onClick={() => setPasswordModalUser(String(row.name))}
            className="p-1.5 text-ink-muted hover:text-ink-primary hover:bg-bg-muted rounded transition-colors"
            title="Changer le mot de passe manuellement"
          >
            <Key className="size-4" />
          </button>
          
          <button
            onClick={() => handleToggleUser(String(row.name), String(row.status))}
            className={`p-1.5 rounded transition-colors ${row.status === "Active" ? "text-red-400 hover:text-red-600 hover:bg-red-50" : "text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50"}`}
            title={row.status === "Active" ? "Désactiver / Archiver" : "Réactiver"}
          >
            {row.status === "Active" ? <Trash2 className="size-4" /> : <Play className="size-4" />}
          </button>
        </div>
      );
    }
  }];

  return (
    <AppShell>
      <nav className="flex items-center gap-1.5 text-[13px] text-ink-muted" aria-label="Breadcrumb">
        <Link href="/desk" className="hover:text-ink-primary">Desk</Link>
        <ChevronRight className="size-3.5" />
        <Link href="/desk/setup" className="hover:text-ink-primary">Settings</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-ink-primary">Utilisateurs</span>
      </nav>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-primary tracking-tight">Utilisateurs</h1>
          <p className="mt-1 text-sm text-ink-secondary">Gérez les accès, rôles et mots de passe.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsers}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border transition-all hover:bg-[var(--bg-muted)]"
            style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--line)", color: "var(--ink-secondary)" }}
            title="Rafraîchir"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          
          <Link
            href="/desk/setup/User/new"
            className="flex h-9 items-center gap-2 rounded-[10px] px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
            style={{ backgroundColor: "var(--accent)" }}
          >
            <Plus className="size-4" /> Ajouter
          </Link>
        </div>
      </div>

      <div className="mt-6">
        {error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-card border border-dashed border-red-200 bg-red-50/50">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-sm text-red-500 font-medium">{error}</p>
            <button onClick={fetchUsers} className="text-sm text-brand-600 hover:underline">Réessayer</button>
          </div>
        ) : (
          <DataTable
            rows={users}
            columns={columns}
            moduleSlug="setup"
            doctype="User"
            loading={loading}
            rowClassName={(row) => blurredUsers.has(String(row.name)) ? 'opacity-40 blur-[2px]' : ''}
          />
        )}
      </div>

      {/* Credentials Modal */}
      {credentialsModalUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-surface rounded-2xl shadow-xl border border-line p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <IdCard className="size-5" />
              </div>
              <div>
                <h3 className="font-bold text-ink-primary">Identifiants de connexion</h3>
                <p className="text-xs text-ink-muted">Donnez ces accès à l'utilisateur.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-ink-muted uppercase">Email / Identifiant</label>
                <div className="mt-1 flex items-center justify-between p-3 rounded-lg bg-bg-muted border border-line-strong text-sm">
                  <span className="font-medium text-ink-primary">{credentialsModalUser.name}</span>
                  <button onClick={() => copyToClipboard(credentialsModalUser.name)} className="text-ink-muted hover:text-ink-primary" title="Copier">
                    <Copy className="size-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-ink-muted uppercase flex items-center justify-between">
                  Mot de passe
                  {copied && <span className="text-emerald-500 flex items-center gap-1"><Check className="size-3" /> Copié</span>}
                </label>
                {generatedPassword || credentialsModalUser.netplus_pwd ? (
                  <div className="mt-1 flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm">
                    <span className="font-mono font-medium text-emerald-800 tracking-wider">{generatedPassword || credentialsModalUser.netplus_pwd}</span>
                    <button onClick={() => copyToClipboard(generatedPassword || credentialsModalUser.netplus_pwd)} className="text-emerald-600 hover:text-emerald-800" title="Copier le mot de passe">
                      <Copy className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 p-4 rounded-lg bg-bg-muted border border-line-strong text-sm text-center">
                    <p className="text-ink-secondary mb-1">********</p>
                    <p className="text-[11px] text-ink-muted mb-3 italic">Le mot de passe initial n'a pas été enregistré.</p>
                    <button
                      onClick={() => generateAndSetPassword(credentialsModalUser.name)}
                      disabled={savingPass}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 text-xs"
                    >
                      {savingPass ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                      Générer et afficher un nouveau mot de passe
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6 border-t border-line/60 pt-4">
              {credentialsModalUser.netplus_pwd && !generatedPassword && (
                 <button
                   onClick={() => generateAndSetPassword(credentialsModalUser.name)}
                   disabled={savingPass}
                   className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors disabled:opacity-50 flex items-center gap-2"
                 >
                   {savingPass ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                   Régénérer
                 </button>
              )}
              <button
                onClick={() => {
                  setCredentialsModalUser(null);
                  setGeneratedPassword(null);
                }}
                className="px-4 py-2 text-sm font-medium border border-line-strong rounded-lg hover:bg-bg-muted transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm bg-surface rounded-2xl shadow-xl border border-line p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <h3 className="font-bold text-ink-primary">Changer le mot de passe</h3>
                <p className="text-xs text-ink-muted truncate max-w-[200px]">{passwordModalUser}</p>
              </div>
            </div>

            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-secondary">Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="w-full rounded-lg pl-3 pr-10 py-2.5 text-sm outline-none border border-line-strong focus:border-[var(--accent)] bg-bg-muted"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-muted hover:text-ink-primary">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-secondary">Confirmer</label>
                <input
                  type={showPass ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none border bg-bg-muted focus:border-[var(--accent)] ${
                    confirmPassword && newPassword !== confirmPassword ? "border-red-400" : "border-line-strong"
                  }`}
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-line mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordModalUser(null);
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium border border-line-strong rounded-lg hover:bg-bg-muted transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingPass || !newPassword || newPassword !== confirmPassword}
                  className="flex-1 flex justify-center items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {savingPass ? <Loader2 className="size-4 animate-spin" /> : "Appliquer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
