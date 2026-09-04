"use client";

import React, { useRef, useState, useEffect } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter as useIntlRouter } from "@/i18n/routing";
import { frappe } from "@/lib/frappe/client";
import { useLoggedUserDoc } from "@/lib/frappe/hooks";
import { useQueryClient } from "@tanstack/react-query";
import {
  Camera, Loader2, Save, User, Globe, Mail,
  CheckCircle2, AlertCircle, Lock, Eye, EyeOff,
  Key, ShieldCheck,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function frappeSetValue(doctype: string, name: string, fieldname: string, value: string) {
  const params = new URLSearchParams({ doctype, name, fieldname, value });
  const res = await fetch(`/api/method/frappe.client.set_value?${params}`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`set_value failed: ${res.status}`);
  return res.json();
}

async function frappeSetPassword(user: string, newPassword: string, logout_all: boolean = false) {
  const body = new URLSearchParams({ user, new_password: newPassword, logout_all_sessions: logout_all ? "1" : "0" });
  const res = await fetch("/api/method/frappe.core.doctype.user.user.update_password", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Failed to update password: ${res.status}`);
  return res.json();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBar({ status }: { status: { type: "success" | "error"; message: string } | null }) {
  if (!status) return null;
  return (
    <div
      className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
        status.type === "success"
          ? "bg-green-500/10 text-green-500 border border-green-500/20"
          : "bg-red-500/10 text-red-500 border border-red-500/20"
      }`}
    >
      {status.type === "success" ? <CheckCircle2 className="size-5 shrink-0" /> : <AlertCircle className="size-5 shrink-0" />}
      <p className="font-medium text-sm">{status.message}</p>
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border p-6 shadow-sm"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--line)" }}
    >
      <h3
        className="font-semibold text-base mb-5 flex items-center gap-2"
        style={{ color: "var(--ink-primary)" }}
      >
        <span style={{ color: "var(--ink-muted)" }}>{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs" style={{ color: "var(--ink-muted)" }}>{hint}</p>}
    </div>
  );
}

const inputCls = "w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors border focus:border-[var(--accent)]";
const inputStyle = { backgroundColor: "var(--bg-muted)", borderColor: "var(--line-strong)", color: "var(--ink-primary)" };
const disabledStyle = { backgroundColor: "var(--bg-app)", borderColor: "var(--line)", color: "var(--ink-muted)", cursor: "not-allowed" as const };

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const locale = useLocale();
  const intlRouter = useIntlRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const { data: userDoc, isLoading } = useLoggedUserDoc();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedLang, setSelectedLang] = useState(locale);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [logoutAll, setLogoutAll] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingPw, setIsSavingPw] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (userDoc) {
      const doc = userDoc as any;
      setFirstName(doc.first_name || "");
      setLastName(doc.last_name || "");
      if (doc.language) setSelectedLang(doc.language);
    }
  }, [userDoc]);

  const showStatus = (type: "success" | "error", message: string) => {
    setStatus({ type, message });
    setTimeout(() => setStatus(null), 4000);
  };

  const invalidateUser = () => {
    const username = (userDoc as any)?.name;
    if (username) queryClient.invalidateQueries({ queryKey: ["doc", "User", username] });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const username = (userDoc as any)?.name;
    if (!username) return;
    try {
      setIsUploading(true);
      // Upload file to Frappe, attached to the User doctype record
      const fileUrl = await frappe.uploadFile(file, "User", username);
      // Use set_value instead of full PUT to avoid triggering re-hashing or permission errors
      await frappeSetValue("User", username, "user_image", fileUrl);
      invalidateUser();
      showStatus("success", "Profile picture updated");
    } catch (error: any) {
      showStatus("error", error.message || "Failed to upload image");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveProfile = async () => {
    const username = (userDoc as any)?.name;
    if (!username) return;
    try {
      setIsSaving(true);
      // PUT to /api/resource/User/{email} — Frappe REST resource endpoint
      await frappe.update("User", username, { first_name: firstName, last_name: lastName });
      // Language is a separate set_value call to avoid triggering the full
      // User controller validation (which can require System Manager perms)
      if (selectedLang !== locale) {
        await frappeSetValue("User", username, "language", selectedLang);
        intlRouter.replace(pathname, { locale: selectedLang });
      }
      invalidateUser();
      showStatus("success", "Profile saved successfully");
    } catch (error: any) {
      showStatus("error", error.message || "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePassword = async () => {
    const username = (userDoc as any)?.name;
    if (!username) return;
    if (!newPassword) return showStatus("error", "Enter a new password");
    if (newPassword !== confirmPassword) return showStatus("error", "Passwords do not match");
    if (newPassword.length < 8) return showStatus("error", "Password must be at least 8 characters");
    try {
      setIsSavingPw(true);
      // Calls frappe.core.doctype.user.user.update_password
      // Hashes via PBKDF2 and writes to __Auth table — never to User DocType fields
      await frappeSetPassword(username, newPassword, logoutAll);
      setNewPassword("");
      setConfirmPassword("");
      showStatus("success", "Password updated." + (logoutAll ? " All sessions terminated." : ""));
    } catch (error: any) {
      showStatus("error", error.message || "Failed to update password");
    } finally {
      setIsSavingPw(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin" style={{ color: "var(--ink-muted)" }} />
      </div>
    );
  }

  if (!userDoc) {
    return (
      <div className="p-8 text-center text-sm" style={{ color: "var(--ink-secondary)" }}>
        Could not load profile data from Frappe.
      </div>
    );
  }

  const doc = userDoc as any;
  const userImage: string | undefined = doc.user_image;
  const initial = (doc.first_name || doc.email || "?").charAt(0).toUpperCase();
  const displayName = doc.full_name || doc.name || "User";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--ink-primary)" }}>My Profile</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-secondary)" }}>
          Manage your personal information, language, and security settings. Changes sync directly with Frappe.
        </p>
      </div>

      <StatusBar status={status} />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* ── Left column ── */}
        <div className="flex flex-col gap-6">
          {/* Avatar Card */}
          <div
            className="rounded-2xl border p-6 flex flex-col items-center text-center shadow-sm"
            style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--line)" }}
          >
            <div className="relative mb-4">
              <div
                className="size-28 rounded-full overflow-hidden flex items-center justify-center border-4 shadow-md"
                style={{ borderColor: "var(--bg-app)", backgroundColor: "var(--accent)" }}
              >
                {isUploading ? (
                  <Loader2 className="size-7 animate-spin text-white" />
                ) : userImage ? (
                  <img src={userImage} alt="Profile" className="size-full object-cover" />
                ) : (
                  <span className="text-4xl font-bold text-white">{initial}</span>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute bottom-0 right-0 size-9 flex items-center justify-center rounded-full text-white shadow-md hover:opacity-90 transition-opacity disabled:opacity-40"
                style={{ backgroundColor: "var(--accent)" }}
                title="Upload a new profile picture"
              >
                <Camera className="size-4" />
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleImageUpload} />
            </div>
            <p className="font-semibold text-[15px]" style={{ color: "var(--ink-primary)" }}>{displayName}</p>
            <p className="text-xs mt-0.5 truncate max-w-full" style={{ color: "var(--ink-muted)" }}>{doc.email}</p>
            {doc.role_profile_name && (
              <span className="mt-3 text-[11px] font-medium px-3 py-1 rounded-full border" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>
                {doc.role_profile_name}
              </span>
            )}
            <p className="text-[11px] mt-4" style={{ color: "var(--ink-muted)" }}>PNG, JPG, GIF or WEBP · Max 10 MB</p>
          </div>

          {/* Language Card */}
          <SectionCard title="Language" icon={<Globe className="size-4" />}>
            <Field label="Interface Language" hint="Saved to Frappe and applied on next load.">
              <select value={selectedLang} onChange={(e) => setSelectedLang(e.target.value)} className={inputCls} style={inputStyle}>
                <option value="en">🇬🇧 English</option>
                <option value="fr">🇫🇷 Français</option>
                <option value="pt">🇧🇷 Português</option>
                <option value="es">🇪🇸 Español</option>
                <option value="ar">🇸🇦 العربية</option>
              </select>
            </Field>
          </SectionCard>

          {/* Account Info (read-only) */}
          {(doc.user_type || doc.enabled !== undefined) && (
            <SectionCard title="Account Info" icon={<Key className="size-4" />}>
              <div className="space-y-3 text-sm">
                {doc.user_type && (
                  <div className="flex justify-between">
                    <span style={{ color: "var(--ink-muted)" }}>User Type</span>
                    <span className="font-medium" style={{ color: "var(--ink-primary)" }}>{doc.user_type}</span>
                  </div>
                )}
                {doc.enabled !== undefined && (
                  <div className="flex justify-between">
                    <span style={{ color: "var(--ink-muted)" }}>Status</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: doc.enabled ? "#22c55e20" : "#ef444420", color: doc.enabled ? "#22c55e" : "#ef4444" }}>
                      {doc.enabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                )}
              </div>
            </SectionCard>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-6">
          {/* Personal Info */}
          <SectionCard title="Personal Information" icon={<User className="size-4" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
              <Field label="First Name">
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className={inputCls} style={inputStyle} />
              </Field>
              <Field label="Last Name">
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className={inputCls} style={inputStyle} />
              </Field>
            </div>
            <Field label="Email Address" hint="Email is the primary key in Frappe and cannot be changed here.">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--ink-muted)" }} />
                <input type="email" value={doc.email || ""} disabled className={`${inputCls} pl-9`} style={disabledStyle} />
              </div>
            </Field>
            <div className="mt-5 flex justify-end pt-4 border-t" style={{ borderColor: "var(--line)" }}>
              <button onClick={handleSaveProfile} disabled={isSaving} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50" style={{ backgroundColor: "var(--accent)" }}>
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save Changes
              </button>
            </div>
          </SectionCard>

          {/* Security / Password */}
          <SectionCard title="Security" icon={<ShieldCheck className="size-4" />}>
            <p className="text-xs mb-5 p-3 rounded-lg" style={{ color: "var(--ink-secondary)", backgroundColor: "var(--bg-muted)" }}>
              Passwords are hashed with <strong>PBKDF2</strong> via <code className="text-xs">passlib</code> and stored in
              Frappe's internal <code className="text-xs">__Auth</code> table — never in the User document fields.
            </p>
            <div className="space-y-5">
              <Field label="New Password">
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--ink-muted)" }} />
                  <input type={showNewPw ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" className={`${inputCls} pl-9 pr-10`} style={inputStyle} />
                  <button type="button" onClick={() => setShowNewPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-muted)" }} tabIndex={-1}>
                    {showNewPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm New Password">
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--ink-muted)" }} />
                  <input type={showConfirmPw ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" className={`${inputCls} pl-9 pr-10`} style={inputStyle} />
                  <button type="button" onClick={() => setShowConfirmPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-muted)" }} tabIndex={-1}>
                    {showConfirmPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={logoutAll} onChange={(e) => setLogoutAll(e.target.checked)} className="size-4 rounded" style={{ accentColor: "var(--accent)" }} />
                <span className="text-sm" style={{ color: "var(--ink-secondary)" }}>
                  Log out of all other sessions
                  <span className="block text-xs" style={{ color: "var(--ink-muted)" }}>Clears active rows from <code className="text-xs">tabSessions</code></span>
                </span>
              </label>
            </div>
            <div className="flex justify-end pt-4 mt-4 border-t" style={{ borderColor: "var(--line)" }}>
              <button onClick={handleSavePassword} disabled={isSavingPw || !newPassword} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50" style={{ backgroundColor: "var(--accent)" }}>
                {isSavingPw ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Update Password
              </button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
