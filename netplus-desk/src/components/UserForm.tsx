"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { frappe } from "@/lib/frappe/client";
import { toast } from "@/lib/toast";
import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Save, ShieldCheck, User, Briefcase, UserCheck, Crown,
  AlertCircle, Eye, EyeOff, Loader2, Check, X,
  Clock, Lock, Key, MonitorSmartphone, ChevronRight,
  Phone, Calendar, Users, Settings
} from "lucide-react";

// ─── Account Types ────────────────────────────────────────────────────────────
const ACCOUNT_TYPES = [
  {
    id: "operator",
    label: "Opérateur",
    description: "Effectue les missions sur le terrain",
    role: "NetPlus Operator",
    icon: Briefcase,
    color: "blue",
    createsEmployee: true,
    userType: "System User",
  },
  {
    id: "supervisor",
    label: "Superviseur",
    description: "Supervise les opérateurs et missions",
    role: "NetPlus Supervisor",
    icon: UserCheck,
    color: "violet",
    createsEmployee: true,
    userType: "System User",
  },
  {
    id: "client",
    label: "Client",
    description: "Accès portail client et suivi de contrat",
    role: "NetPlus Client",
    icon: User,
    color: "emerald",
    createsEmployee: false,
    userType: "Website User",
  },
  {
    id: "admin",
    label: "Admin",
    description: "Gestion complète de la plateforme",
    role: "NetPlus Admin",
    icon: ShieldCheck,
    color: "amber",
    createsEmployee: false,
    userType: "System User",
  },
  {
    id: "superadmin",
    label: "Super Admin",
    description: "Accès total système et configuration",
    role: "System Manager",
    icon: Crown,
    color: "red",
    createsEmployee: false,
    userType: "System User",
  },
] as const;

type AccountTypeId = (typeof ACCOUNT_TYPES)[number]["id"];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; check: string }> = {
  blue:   { bg: "bg-blue-50",   border: "border-blue-500",   text: "text-blue-600",   check: "bg-blue-500" },
  violet: { bg: "bg-violet-50", border: "border-violet-500", text: "text-violet-600", check: "bg-violet-500" },
  emerald:{ bg: "bg-emerald-50",border: "border-emerald-500",text: "text-emerald-600",check: "bg-emerald-500" },
  amber:  { bg: "bg-amber-50",  border: "border-amber-500",  text: "text-amber-600",  check: "bg-amber-500" },
  red:    { bg: "bg-red-50",    border: "border-red-500",    text: "text-red-600",    check: "bg-red-500" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Field({
  label, required = false, children, error, hint,
}: { label: string; required?: boolean; children: React.ReactNode; error?: string | null; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ink-secondary">
        {label}{required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-muted">{hint}</p>}
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}

const inputCls = (error?: string | null) =>
  `w-full rounded-lg px-4 py-2.5 text-sm outline-none border transition-colors bg-bg-muted focus:border-[var(--accent)] ${
    error ? "border-red-400" : "border-line-strong"
  }`;

// ─── Main Component ───────────────────────────────────────────────────────────
export function UserForm({ mode, name }: { mode: "create" | "edit"; name?: string }) {
  const router = useRouter();
  const locale = useLocale();
  const isEdit = mode === "edit" && !!name;

  // ── Data loading (edit mode) ─────────────────────────────────────────────
  const { data: doc, isLoading: docLoading, refetch } = useQuery({
    queryKey: ["User", name],
    queryFn: () => frappe.get<any>("User", name!),
    enabled: isEdit,
  });

  const { data: currentUserDoc } = useQuery({
    queryKey: ["current_user"],
    queryFn: async () => {
      const u = await frappe.getLoggedUser();
      return frappe.get<any>("User", u);
    },
  });
  const isSystemManager = currentUserDoc?.roles?.some((r: any) => r.role === "System Manager") ?? false;

  // ── Account type selection ────────────────────────────────────────────────
  const [accountTypeId, setAccountTypeId] = useState<AccountTypeId>("operator");
  const accountType = ACCOUNT_TYPES.find(t => t.id === accountTypeId)!;

  // ── Identity fields ───────────────────────────────────────────────────────
  const [usernamePrefix, setUsernamePrefix] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [phone, setPhone]         = useState("");
  const [language, setLanguage]   = useState("fr");

  // Staff-only fields (Employee mandatory)
  const [gender, setGender]               = useState("Male");
  const [dateOfBirth, setDateOfBirth]     = useState("");
  const [dateOfJoining, setDateOfJoining] = useState(() => new Date().toISOString().split("T")[0]);
  const [designation, setDesignation]     = useState("");
  const [reportsTo, setReportsTo]         = useState("");

  // Client-only fields
  const [customerType, setCustomerType] = useState("Individual");

  // Admin/Edit fields
  const [enabled, setEnabled] = useState(true);

  // ── Password (create) ─────────────────────────────────────────────────────
  const [password, setPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass]         = useState(false);

  // ── Security actions (edit) ───────────────────────────────────────────────
  const [secLoading, setSecLoading]     = useState(false);
  const [secError, setSecError]         = useState<string | null>(null);
  const [secSuccess, setSecSuccess]     = useState<string | null>(null);
  const [keysModal, setKeysModal]       = useState<{ key: string; secret: string } | null>(null);
  const [logoutAll, setLogoutAll]       = useState(true);

  // ── Validation ────────────────────────────────────────────────────────────
  const [emailError, setEmailError]     = useState<string | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const [globalError, setGlobalError]   = useState<string | null>(null);
  const [isSaving, setIsSaving]         = useState(false);

  const derivedEmail = usernamePrefix
    ? `${usernamePrefix.trim().toLowerCase()}@netplus.ca`
    : "";

  // Populate on edit
  useEffect(() => {
    if (isEdit && doc) {
      setFirstName(doc.first_name || "");
      setLastName(doc.last_name || "");
      setPhone(doc.mobile_no || "");
      setLanguage(doc.language || "fr");
      setEnabled(doc.enabled === 1);
      if (doc.email?.endsWith("@netplus.ca")) {
        setUsernamePrefix(doc.email.split("@")[0]);
      }
      // Detect account type from roles
      const roles: string[] = (doc.roles || []).map((r: any) => r.role);
      if (roles.includes("System Manager")) setAccountTypeId("superadmin");
      else if (roles.includes("NetPlus Admin")) setAccountTypeId("admin");
      else if (roles.includes("NetPlus Supervisor")) setAccountTypeId("supervisor");
      else if (roles.includes("NetPlus Client")) setAccountTypeId("client");
      else setAccountTypeId("operator");
    }
  }, [doc, isEdit]);

  // Email availability check
  useEffect(() => {
    if (mode !== "create" || !derivedEmail) { setEmailError(null); return; }
    const t = setTimeout(async () => {
      setEmailChecking(true);
      try {
        const count = await frappe.count("User", [["email", "=", derivedEmail]]);
        setEmailError(count > 0 ? "Cet email est déjà utilisé." : null);
      } catch { /* ignore */ } finally { setEmailChecking(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [derivedEmail, mode]);

  // ── Password strength ─────────────────────────────────────────────────────
  const requirements = [
    { regex: /.{8,}/, text: "Au moins 8 caractères" },
    { regex: /[0-9]/,  text: "Au moins 1 chiffre" },
    { regex: /[a-z]/, text: "Au moins 1 minuscule" },
    { regex: /[A-Z]/, text: "Au moins 1 majuscule" },
  ];
  const strength = requirements.map(r => ({ met: r.regex.test(password), text: r.text }));
  const strengthScore = strength.filter(r => r.met).length;
  const strengthColor = ["bg-gray-200", "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500"][strengthScore];

  // ── Derived validations ───────────────────────────────────────────────────
  const staffFieldsRequired = accountType.createsEmployee;

  const canSave = useMemo(() => {
    if (!firstName || !derivedEmail || !!emailError) return false;
    if (staffFieldsRequired && (!gender || !dateOfBirth || !dateOfJoining)) return false;
    if (mode === "create" && password && (password !== confirmPassword || strengthScore < 4)) return false;
    return true;
  }, [firstName, derivedEmail, emailError, staffFieldsRequired, gender, dateOfBirth, dateOfJoining, mode, password, confirmPassword, strengthScore]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!canSave) {
      setGlobalError("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    setIsSaving(true);
    setGlobalError(null);

    try {
      if (mode === "create") {
        if (accountType.id === "operator" || accountType.id === "supervisor") {
          // Route through provisionstaff → creates User + Employee atomically
          const res = await frappe.call<any>("netplus.admin_api.provisionstaff", {
            email: derivedEmail,
            first_name: firstName,
            last_name: lastName,
            role: accountType.role,
            gender,
            date_of_birth: dateOfBirth,
            date_of_joining: dateOfJoining,
            designation,
            phone,
            reports_to: reportsTo,
          });
          const created = res?.message || res;
          if (password && strengthScore >= 4) {
            await frappe.call("netplus.admin_api.update_netplus_password", {
              user_email: created.user,
              new_password: password,
            });
          }
          toast.success(`${accountType.label} créé avec succès !`);
          router.push(`/${locale}/desk/setup/User`);

        } else if (accountType.id === "client") {
          // Route through create_client → creates Customer + User
          const customerName = `${firstName} ${lastName}`.trim();
          const res = await frappe.call<any>("netplus.admin_api.create_client", {
            customer_name: customerName,
            email: derivedEmail,
            enable_portal: 1,
            first_name: firstName,
            last_name: lastName,
            phone,
            customer_type: customerType,
          });
          const created = res?.message || res;
          if (password && strengthScore >= 4) {
            await frappe.call("netplus.admin_api.update_netplus_password", {
              user_email: derivedEmail,
              new_password: password,
            });
          }
          toast.success("Client créé avec succès !");
          router.push(`/${locale}/desk/setup/User`);

        } else {
          // Admin / SuperAdmin → direct creation
          const extraRoles =
            accountType.id === "superadmin"
              ? ["System Manager", "NetPlus Admin"]
              : ["NetPlus Admin"];

          const res = await frappe.create("User", {
            email: derivedEmail,
            username: usernamePrefix.toLowerCase(),
            first_name: firstName,
            last_name: lastName,
            send_welcome_email: 0,
            user_type: "System User",
            language,
            mobile_no: phone,
            roles: extraRoles.map(r => ({ role: r })),
          });
          if (password && strengthScore >= 4) {
            await frappe.call("netplus.admin_api.update_netplus_password", {
              user_email: res.name,
              new_password: password,
            });
          }
          toast.success(`${accountType.label} créé avec succès !`);
          router.push(`/${locale}/desk/setup/User`);
        }

      } else {
        // Edit mode — direct update
        await frappe.update("User", name!, {
          first_name: firstName,
          last_name: lastName,
          language,
          mobile_no: phone,
          enabled: enabled ? 1 : 0,
        });
        refetch();
        toast.success("Modifications enregistrées.");
      }
    } catch (err: any) {
      const msg = err?.payload?.message || err?.message || "Erreur lors de la sauvegarde.";
      setGlobalError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { setSecError("Les mots de passe ne correspondent pas."); return; }
    setSecLoading(true); setSecError(null); setSecSuccess(null);
    try {
      await frappe.call("frappe.core.doctype.user.user.update_password", {
        user: name, new_password: password, logout_all_sessions: logoutAll ? 1 : 0,
      });
      setSecSuccess("Mot de passe mis à jour."); setPassword(""); setConfirmPassword("");
    } catch (err: any) { setSecError(err?.payload?.message || err?.message || "Erreur."); }
    finally { setSecLoading(false); }
  };

  const handleGenerateKeys = async () => {
    if (!confirm("Générer de nouvelles clés API ? Les anciennes deviendront invalides.")) return;
    setSecLoading(true);
    try {
      const res = await frappe.call<any>("frappe.core.doctype.user.user.generate_keys", { user: name });
      if (res?.api_secret) setKeysModal({ key: res.api_key, secret: res.api_secret });
    } catch (err: any) { setSecError(err?.payload?.message || "Erreur."); }
    finally { setSecLoading(false); }
  };

  if (isEdit && docLoading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="size-6 animate-spin text-ink-muted" /></div>;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-10 -mx-4 -mt-4 px-4 py-4 bg-background/95 backdrop-blur border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">
            {isEdit ? (doc?.full_name || name) : `Nouveau ${accountType.label}`}
          </h1>
          {isEdit && doc && (
            <StatusBadge label={doc.enabled ? "Actif" : "Désactivé"} tone={doc.enabled ? "success" : "critical"} />
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || (mode === "create" && !canSave)}
          className="flex h-9 items-center gap-2 rounded-lg px-5 text-sm font-medium text-white hover:opacity-90 shadow-sm disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {isEdit ? "Enregistrer" : `Créer ${accountType.label}`}
        </button>
      </div>

      {globalError && (
        <div className="p-4 rounded-xl flex items-start gap-3 bg-red-500/10 text-red-600 border border-red-500/20">
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{globalError}</p>
        </div>
      )}

      {/* ── Step 1: Account Type (create only) ── */}
      {!isEdit && (
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <Users className="size-5 text-ink-primary" />
            <h3 className="font-semibold text-base text-ink-primary">Type de compte</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {ACCOUNT_TYPES.map(type => {
              const active = accountTypeId === type.id;
              const colors = COLOR_MAP[type.color];
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => setAccountTypeId(type.id)}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all ${
                    active
                      ? `${colors.bg} ${colors.border} ${colors.text}`
                      : "border-line bg-bg-muted hover:border-line-strong text-ink-secondary hover:text-ink-primary"
                  }`}
                >
                  {active && (
                    <span className={`absolute top-1.5 right-1.5 size-4 rounded-full ${colors.check} flex items-center justify-center`}>
                      <Check className="size-2.5 text-white" />
                    </span>
                  )}
                  <Icon className="size-6" />
                  <span className="text-sm font-semibold">{type.label}</span>
                  <span className="text-[11px] leading-tight opacity-70">{type.description}</span>
                </button>
              );
            })}
          </div>
          {accountType.createsEmployee && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-start gap-2">
              <Briefcase className="size-4 shrink-0 mt-0.5" />
              <span>Une fiche <strong>Employé</strong> sera automatiquement créée et liée. Les champs marqués * sont obligatoires pour le système RH.</span>
            </div>
          )}
          {accountTypeId === "client" && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-start gap-2">
              <User className="size-4 shrink-0 mt-0.5" />
              <span>Une fiche <strong>Client</strong> (Customer) sera automatiquement créée et liée au portail.</span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Left: Identity + Conditional Fields ── */}
        <div className="xl:col-span-2 space-y-6">

          {/* Identity Card */}
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <User className="size-5 text-ink-primary" />
              <h3 className="font-semibold text-base text-ink-primary">Identité &amp; Accès</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Email */}
              <div className="col-span-full">
                <Field label="Email / Identifiant" required error={emailError}>
                  <div className="flex relative">
                    <input
                      type="text"
                      value={usernamePrefix}
                      onChange={e => setUsernamePrefix(e.target.value.replace(/\s/g, "").toLowerCase())}
                      disabled={isEdit}
                      placeholder="ex: jean.dupont"
                      className={`w-full rounded-l-lg px-4 py-2.5 text-sm outline-none border transition-colors bg-bg-muted focus:border-[var(--accent)] ${
                        emailError ? "border-red-400" : "border-line-strong"
                      }`}
                    />
                    <div className="flex items-center justify-center px-4 rounded-r-lg border border-l-0 border-line-strong bg-line/30 text-sm font-medium text-ink-secondary shrink-0">
                      @netplus.ca
                    </div>
                    {emailChecking && <Loader2 className="size-4 animate-spin absolute right-[105px] top-3 text-ink-muted" />}
                  </div>
                  {derivedEmail && !emailError && (
                    <p className="text-xs text-ink-muted mt-1">→ {derivedEmail}</p>
                  )}
                </Field>
              </div>

              {/* First Name */}
              <Field label="Prénom" required>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  className={inputCls()}
                  placeholder="Jean"
                />
              </Field>

              {/* Last Name */}
              <Field label="Nom de famille">
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  className={inputCls()}
                  placeholder="Dupont"
                />
              </Field>

              {/* Phone */}
              <Field label="Téléphone / Mobile">
                <div className="flex items-center">
                  <Phone className="size-4 text-ink-muted absolute ml-3 pointer-events-none" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className={`${inputCls()} pl-9`}
                    placeholder="+1 514 000 0000"
                  />
                </div>
              </Field>

              {/* Language */}
              <Field label="Langue">
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  className={inputCls()}
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </select>
              </Field>
            </div>

            {isEdit && (
              <div className="mt-5 pt-5 border-t border-line flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}
                    className="rounded size-4" style={{ accentColor: "var(--accent)" }} />
                  <span className="text-sm font-medium">Compte activé (accès autorisé)</span>
                </label>
              </div>
            )}
          </div>

          {/* ── Staff Fields (Operator / Supervisor) ── */}
          {(!isEdit && accountType.createsEmployee) && (
            <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-5">
                <Briefcase className="size-5 text-blue-600" />
                <h3 className="font-semibold text-base text-blue-800">Fiche Employé (obligatoire)</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                <Field label="Genre" required>
                  <select
                    value={gender}
                    onChange={e => setGender(e.target.value)}
                    className={inputCls()}
                  >
                    <option value="Male">Masculin</option>
                    <option value="Female">Féminin</option>
                    <option value="Other">Autre / Non précisé</option>
                  </select>
                </Field>

                <Field label="Date de naissance" required>
                  <div className="relative">
                    <Calendar className="size-4 text-ink-muted absolute ml-3 top-3 pointer-events-none" />
                    <input
                      type="date"
                      value={dateOfBirth}
                      onChange={e => setDateOfBirth(e.target.value)}
                      max={new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().split("T")[0]}
                      className={`${inputCls(!dateOfBirth ? "required" : null)} pl-9`}
                    />
                  </div>
                </Field>

                <Field label="Date d'entrée en service" required hint="Date à laquelle l'employé rejoint l'organisation">
                  <div className="relative">
                    <Calendar className="size-4 text-ink-muted absolute ml-3 top-3 pointer-events-none" />
                    <input
                      type="date"
                      value={dateOfJoining}
                      onChange={e => setDateOfJoining(e.target.value)}
                      className={`${inputCls(!dateOfJoining ? "required" : null)} pl-9`}
                    />
                  </div>
                </Field>

                <Field label="Désignation / Poste">
                  <input
                    type="text"
                    value={designation}
                    onChange={e => setDesignation(e.target.value)}
                    placeholder="ex: Agent de nettoyage"
                    className={inputCls()}
                  />
                </Field>

                {accountTypeId === "operator" && (
                  <Field label="Superviseur rattaché" hint="Laissez vide si non assigné">
                    <input
                      type="text"
                      value={reportsTo}
                      onChange={e => setReportsTo(e.target.value)}
                      placeholder="HR-EMP-00004"
                      className={inputCls()}
                    />
                  </Field>
                )}

              </div>
            </div>
          )}

          {/* ── Client-specific Fields ── */}
          {(!isEdit && accountTypeId === "client") && (
            <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-5">
                <User className="size-5 text-emerald-600" />
                <h3 className="font-semibold text-base text-emerald-800">Fiche Client</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label="Type de client" hint="Particulier ou Entreprise">
                  <select
                    value={customerType}
                    onChange={e => setCustomerType(e.target.value)}
                    className={inputCls()}
                  >
                    <option value="Individual">Particulier</option>
                    <option value="Company">Entreprise</option>
                  </select>
                </Field>
              </div>
            </div>
          )}

          {/* ── Password at creation ── */}
          {!isEdit && (
            <details className="rounded-2xl border border-line shadow-sm bg-surface group">
              <summary className="p-6 font-semibold text-base text-ink-primary cursor-pointer list-none flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="size-5 text-ink-muted" />
                  Définir un mot de passe (optionnel)
                </div>
                <ChevronRight className="size-5 text-ink-muted transition-transform group-open:rotate-90" />
              </summary>
              <div className="p-6 pt-0 border-t border-line space-y-4 mt-0">
                <p className="text-sm text-ink-muted pt-4">Si non défini, l'utilisateur devra réinitialiser son mot de passe à la première connexion.</p>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mot de passe"
                    className="w-full rounded-lg pl-3 pr-10 py-2.5 text-sm outline-none border border-line-strong bg-bg-muted focus:border-[var(--accent)]"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-muted hover:text-ink-primary">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {password && (
                  <>
                    <input
                      type={showPass ? "text" : "password"}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Confirmer le mot de passe"
                      className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none border bg-bg-muted focus:border-[var(--accent)] ${
                        confirmPassword && password !== confirmPassword ? "border-red-400" : "border-line-strong"
                      }`}
                    />
                    <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                      <div className={`h-full transition-all ${strengthColor}`} style={{ width: `${(strengthScore / 4) * 100}%` }} />
                    </div>
                    <ul className="space-y-1">
                      {strength.map((r, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-xs">
                          {r.met ? <Check size={12} className="text-emerald-500" /> : <X size={12} className="text-ink-muted" />}
                          <span className={r.met ? "text-emerald-600 font-medium" : "text-ink-muted"}>{r.text}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </details>
          )}
        </div>

        {/* ── Right: Security Actions (edit only) ── */}
        <div>
          <div className="rounded-2xl border border-line p-6 shadow-sm bg-surface sticky top-24">
            <div className="flex items-center gap-2 mb-5">
              <Lock className="size-5 text-accent" />
              <h3 className="font-semibold text-base text-ink-primary">Actions Sécurité</h3>
            </div>

            {!isEdit ? (
              <div className="text-sm text-ink-muted italic p-4 bg-bg-muted rounded-lg border border-line">
                Enregistrez d'abord l'utilisateur pour accéder aux actions de sécurité.
              </div>
            ) : !isSystemManager ? (
              <div className="p-4 bg-yellow-500/10 text-yellow-700 rounded-lg border border-yellow-200 text-sm">
                Seuls les System Managers peuvent utiliser ces actions.
              </div>
            ) : (
              <>
                {secError && (
                  <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-600 border border-red-200 text-sm flex items-start gap-2">
                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                    <span>{secError}</span>
                  </div>
                )}
                {secSuccess && (
                  <div className="mb-4 p-3 rounded-lg bg-green-500/10 text-green-600 border border-green-200 text-sm flex items-center gap-2">
                    <Check className="size-4 shrink-0" />
                    <span>{secSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleSetPassword} className="space-y-4 pb-6 border-b border-line">
                  <label className="block text-sm font-medium text-ink-secondary">Nouveau mot de passe</label>
                  <div className="relative">
                    <input type={showPass ? "text" : "password"} value={password}
                      onChange={e => setPassword(e.target.value)} required placeholder="Mot de passe"
                      className="w-full rounded-lg pl-3 pr-9 py-2 text-sm outline-none border border-line-strong bg-bg-muted focus:border-[var(--accent)]" />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-muted">
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <input type={showPass ? "text" : "password"} value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)} required placeholder="Confirmer"
                    className={`w-full rounded-lg px-3 py-2 text-sm outline-none border bg-bg-muted ${
                      confirmPassword && password !== confirmPassword ? "border-red-400" : "border-line-strong"
                    }`} />
                  <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div className={`h-full transition-all ${strengthColor}`} style={{ width: `${(strengthScore / 4) * 100}%` }} />
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={logoutAll} onChange={e => setLogoutAll(e.target.checked)}
                      className="rounded" style={{ accentColor: "var(--accent)" }} />
                    <span>Déconnecter tous les appareils</span>
                  </label>
                  <button type="submit" disabled={secLoading || strengthScore < 4 || password !== confirmPassword}
                    className="w-full flex h-8 items-center justify-center gap-2 rounded-lg text-sm font-medium text-white bg-accent shadow-sm disabled:opacity-50 transition-opacity">
                    {secLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    Définir le mot de passe
                  </button>
                </form>

                <div className="pt-6 space-y-3">
                  <button onClick={() => { if (confirm("Déconnecter toutes les sessions ?")) {
                    frappe.call("frappe.sessions.clear_sessions", { user: name });
                    setSecSuccess("Sessions déconnectées.");
                  }}}
                    className="w-full flex h-9 items-center gap-2 px-3 rounded-lg text-sm font-medium border border-line-strong bg-bg-muted hover:bg-line transition-colors">
                    <MonitorSmartphone className="size-4 text-ink-muted" />
                    Forcer la déconnexion
                  </button>
                  <button onClick={handleGenerateKeys} disabled={secLoading}
                    className="w-full flex h-9 items-center gap-2 px-3 rounded-lg text-sm font-medium border border-line-strong bg-bg-muted hover:bg-line transition-colors">
                    <Key className="size-4 text-ink-muted" />
                    Générer des clés API
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── API Keys Modal ── */}
      {keysModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl border border-line">
            <h3 className="text-lg font-bold mb-1">Clés API générées</h3>
            <p className="text-sm text-red-500 font-medium mb-4">Copiez le secret maintenant — il ne sera plus affiché !</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-ink-muted uppercase">API Key</label>
                <div className="mt-1 p-2 rounded-lg bg-bg-muted border border-line-strong font-mono text-sm break-all">{keysModal.key}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted uppercase">API Secret</label>
                <div className="mt-1 p-2 rounded-lg bg-bg-muted border border-line-strong font-mono text-sm break-all">{keysModal.secret}</div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setKeysModal(null)} className="px-4 py-2 rounded-lg bg-accent text-white font-medium text-sm">
                J'ai copié le secret
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
