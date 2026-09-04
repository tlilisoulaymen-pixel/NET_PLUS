"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { MODULES, RECENT_SHORTCUTS } from "@/config/modules";
import Link from "next/link";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dock, DockIcon, DockItem, DockLabel } from "@/components/ui/dock";
import { useTranslations } from "next-intl";

// Wrapper to prevent framer-motion props injected by DockItem from leaking to native DOM elements
const DockAction = ({ children, width, isHovered, ...rest }: any) => {
  return <>{children}</>;
};

const TABS = ["All modules", "Favorites"] as const;

export default function DeskPage() {
  const t = useTranslations("Desk");
  const [tab, setTab] = useState<(typeof TABS)[number]>("All modules");
  const [favorites, setFavorites] = useState<string[]>(() =>
    typeof window !== "undefined" ? JSON.parse(localStorage.getItem("np_favorites") ?? "[]") : [],
  );

  function toggleFav(e: React.MouseEvent, slug: string) {
    e.preventDefault();
    const next = favorites.includes(slug) ? favorites.filter((s) => s !== slug) : [...favorites, slug];
    setFavorites(next);
    localStorage.setItem("np_favorites", JSON.stringify(next));
  }

  const visible = tab === "Favorites" ? MODULES.filter((m) => favorites.includes(m.slug)) : MODULES;

  return (
    <AppShell>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink-primary tracking-tight">{t('allModules')}</h1>
          <p className="mt-1 text-sm text-ink-secondary">Your business, organized in one place.</p>
        </div>
      </div>

      {/* Tabs and Recently Used (Same Level) */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        {/* Tab pills */}
        <div className="flex gap-1 rounded-button bg-surface-muted p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "h-8 rounded-[8px] px-3.5 text-[13px] font-medium transition-colors",
                tab === t ? "bg-surface text-ink-heading shadow-card" : "text-ink-secondary hover:text-ink-primary",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Recently used shortcuts */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Recently used</span>
          <div className="flex flex-wrap gap-2">
            {RECENT_SHORTCUTS.map(({ doctype, icon: Icon }) => (
              <Link
                key={doctype}
                href={`/desk/all/${encodeURIComponent(doctype)}`}
                className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] font-medium text-ink-primary shadow-sm transition hover:border-primary-300 hover:text-primary-600 hover:shadow-hover"
              >
                <Icon className="size-3.5 text-primary-500" />
                {doctype}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Module Dock - Rectangular Centered */}
      <section className="mt-20 flex flex-col gap-12 items-center pb-16 w-full">
        {visible.length === 0 ? (
          <p className="text-sm text-ink-muted text-center w-full">{t('noFavorites')}</p>
        ) : (
          Array.from({ length: Math.ceil(visible.length / 8) }).map((_, i) => (
            <div key={i} className="relative h-[96px] w-full z-10 hover:z-50">
              <div className="absolute bottom-0 left-0 w-full flex justify-center">
                <Dock className="items-end pb-4 bg-transparent border-none shadow-none px-0">
                {visible.slice(i * 8, (i + 1) * 8).map((m) => {
                  const Icon = m.icon;
                  return (
                    <Link href={`/desk/${m.slug}`} key={m.slug} className="block outline-none cursor-pointer">
                      <DockItem className={cn("group aspect-[4/3] rounded-3xl shadow-sm border border-line/50 flex flex-col items-center justify-center transition-shadow hover:shadow-md", m.tint)}>
                        {/* Favorite Button */}
                        <DockAction>
                          <button
                            onClick={(e) => toggleFav(e, m.slug)}
                            className="absolute top-2 right-2 p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-all z-20"
                            title={favorites.includes(m.slug) ? t('removeFromFavorites') : t('addToFavorites')}
                          >
                            <Star 
                              className={cn(
                                "w-4 h-4", 
                                favorites.includes(m.slug) ? "fill-yellow-400 text-yellow-400" : "text-white/60 hover:text-white"
                              )} 
                            />
                          </button>
                        </DockAction>

                        <DockLabel>{m.name}</DockLabel>
                        <DockIcon>
                          <Icon className="size-full" />
                        </DockIcon>
                      </DockItem>
                    </Link>
                  );
                })}
                </Dock>
              </div>
            </div>
          ))
        )}
      </section>
    </AppShell>
  );
}
