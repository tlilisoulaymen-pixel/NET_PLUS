"use client";

import { AppShell } from "@/components/layout/AppShell";
import { UserForm } from "@/components/UserForm";

import { useLocale } from "next-intl";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function NewUserPage() {
  const locale = useLocale();
  return (
    <AppShell>
      <nav className="flex items-center gap-1.5 text-[13px] text-ink-muted mb-4" aria-label="Breadcrumb">
        <Link href={`/${locale}/desk`} className="hover:text-ink-primary">Desk</Link>
        <ChevronRight className="size-3.5" />
        <Link href={`/${locale}/desk/setup`} className="hover:text-ink-primary">Settings</Link>
        <ChevronRight className="size-3.5" />
        <Link href={`/${locale}/desk/setup/User`} className="hover:text-ink-primary">User</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-ink-primary">New User</span>
      </nav>
      <UserForm mode="create" />
    </AppShell>
  );
}
