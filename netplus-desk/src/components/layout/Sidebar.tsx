"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SIDEBAR_NAV, getModule, MODULES } from "@/config/modules";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Search, ChevronDown, FileText, Settings, User } from "lucide-react";

import { useLoggedUserDoc } from "@/lib/frappe/hooks";

// Softer spring animation curve
const softSpringEasing = "cubic-bezier(0.25, 1.1, 0.4, 1)";

function AvatarCircle({ onNavigate }: { onNavigate: (href: string) => void }) {
  const { data: userDoc } = useLoggedUserDoc();
  
  const userImage = userDoc?.user_image;
  const initial = userDoc?.first_name?.charAt(0) || userDoc?.email?.charAt(0) || "?";

  return (
    <button 
      onClick={() => onNavigate("/desk/profile")}
      className="relative rounded-full shrink-0 size-8 bg-black hover:opacity-80 transition-opacity"
      title="Profile"
    >
      <div className="flex items-center justify-center size-8 overflow-hidden rounded-full bg-neutral-800">
        {userImage ? (
          <img src={userImage} alt="Profile" className="object-cover size-full" />
        ) : (
          <span className="text-neutral-50 text-xs font-semibold uppercase">{initial}</span>
        )}
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-full border border-neutral-800 pointer-events-none"
      />
    </button>
  );
}

function SearchContainer({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const [searchValue, setSearchValue] = useState("");

  return (
    <div
      className={`relative shrink-0 transition-all duration-500 ${
        isCollapsed ? "w-full flex justify-center" : "w-full"
      }`}
      style={{ transitionTimingFunction: softSpringEasing }}
    >
      <div
        className={`bg-black h-10 relative rounded-lg flex items-center transition-all duration-500 ${
          isCollapsed ? "w-10 min-w-10 justify-center" : "w-full"
        }`}
        style={{ transitionTimingFunction: softSpringEasing }}
      >
        <div
          className={`flex items-center justify-center shrink-0 transition-all duration-500 ${
            isCollapsed ? "p-1" : "px-1"
          }`}
          style={{ transitionTimingFunction: softSpringEasing }}
        >
          <div className="size-8 flex items-center justify-center">
            <Search size={16} className="text-neutral-50" />
          </div>
        </div>

        <div
          className={`flex-1 relative transition-opacity duration-500 overflow-hidden ${
            isCollapsed ? "opacity-0 w-0" : "opacity-100"
          }`}
          style={{ transitionTimingFunction: softSpringEasing }}
        >
          <div className="flex flex-col justify-center size-full">
            <div className="flex flex-col gap-2 items-start justify-center pr-2 py-1 w-full">
              <input
                type="text"
                placeholder="Search..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="w-full bg-transparent border-none outline-none font-['Lexend:Regular',_sans-serif] text-[14px] text-neutral-50 placeholder:text-neutral-400 leading-[20px]"
                tabIndex={isCollapsed ? -1 : 0}
              />
            </div>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-lg border border-neutral-800 pointer-events-none"
        />
      </div>
    </div>
  );
}

function IconNavButton({
  children,
  isActive = false,
  onClick,
  title
}: {
  children: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`flex items-center justify-center rounded-lg size-10 min-w-10 transition-colors duration-500
        ${isActive ? "bg-neutral-800 text-neutral-50" : "hover:bg-neutral-800 text-neutral-400 hover:text-neutral-300"}`}
      style={{ transitionTimingFunction: softSpringEasing }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function IconNavigation({
  activeSlug,
  onNavigate,
}: {
  activeSlug: string;
  onNavigate: (href: string) => void;
}) {
  return (
    <aside className="bg-black flex flex-col gap-2 items-center p-4 w-16 min-h-screen border-r border-neutral-800 relative z-20">
      {/* Logo */}
      <div className="mb-2 size-10 flex items-center justify-center relative">
        <Image
          src="/logo.png"
          alt="Net Plus"
          fill
          className="object-contain"
          priority
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>

      {/* Navigation Icons */}
      <div className="flex flex-col gap-2 w-full items-center">
        {SIDEBAR_NAV.filter(i => i.label !== "Settings").map((item) => {
          const Icon = item.icon;
          // Extract slug from href (e.g. /desk/netplus -> netplus)
          const itemSlug = item.href.split("/")[2] || "desk";
          const isActive = activeSlug === itemSlug || (activeSlug === "desk" && item.href === "/desk");
          return (
            <IconNavButton
              key={item.href}
              title={item.label}
              isActive={isActive}
              onClick={() => onNavigate(item.href)}
            >
              <Icon size={18} strokeWidth={2} />
            </IconNavButton>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* Bottom section */}
      <div className="flex flex-col gap-2 w-full items-center">
        <IconNavButton isActive={activeSlug === "setup"} onClick={() => onNavigate("/desk/setup")} title="Settings">
          <Settings size={18} strokeWidth={2} />
        </IconNavButton>
        <div className="size-8">
          <AvatarCircle onNavigate={onNavigate} />
        </div>
      </div>
    </aside>
  );
}

function SectionTitle({
  title,
  onToggleCollapse,
  isCollapsed,
}: {
  title: string;
  onToggleCollapse: () => void;
  isCollapsed: boolean;
}) {
  if (isCollapsed) {
    return (
      <div className="w-full flex justify-center transition-all duration-500" style={{ transitionTimingFunction: softSpringEasing }}>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center justify-center rounded-lg size-10 min-w-10 transition-all duration-500 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-300"
          style={{ transitionTimingFunction: softSpringEasing }}
          aria-label="Expand sidebar"
        >
          <span className="inline-block rotate-180">
            <ChevronDown size={16} />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden transition-all duration-500" style={{ transitionTimingFunction: softSpringEasing }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center h-10">
          <div className="px-2 py-1">
            <div className="font-['Lexend:SemiBold',_sans-serif] text-[18px] text-neutral-50 leading-[27px]">
              {title}
            </div>
          </div>
        </div>
        <div className="pr-1">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex items-center justify-center rounded-lg size-10 min-w-10 transition-all duration-500 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-300"
            style={{ transitionTimingFunction: softSpringEasing }}
            aria-label="Collapse sidebar"
          >
            <ChevronDown size={16} className="-rotate-90" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailSidebar({
  activeSlug,
  isCollapsed,
  onToggleCollapse
}: {
  activeSlug: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("Sidebar");
  const moduleDef = getModule(activeSlug) || MODULES.find((m) => m.slug === "netplus")!;
  
  return (
    <aside
      className={`bg-black relative flex flex-col gap-4 items-start p-4 transition-all duration-500 min-h-screen ${
        isCollapsed ? "w-16 min-w-16 !px-0 justify-center" : "w-60"
      }`}
      style={{ transitionTimingFunction: softSpringEasing }}
    >
      {/* BIG LOGO (Above Section Title) */}
      <div 
        className={`relative shrink-0 w-full flex justify-start transition-all duration-500 overflow-hidden ${
          isCollapsed ? "h-0 opacity-0 mb-0" : "h-16 opacity-100 -mt-2"
        }`}
        style={{ transitionTimingFunction: softSpringEasing }}
      >
        <div className="relative h-16 w-32 flex items-center justify-start ml-2">
          <Image
            src="/logo.png"
            alt="Net Plus"
            fill
            className="object-contain object-left"
            priority
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      </div>

      <SectionTitle title={moduleDef.name} onToggleCollapse={onToggleCollapse} isCollapsed={isCollapsed} />

      <div
        className={`flex flex-col w-full overflow-y-auto transition-all duration-500 ${
          isCollapsed ? "gap-2 items-center" : "gap-4 items-start"
        }`}
        style={{ transitionTimingFunction: softSpringEasing }}
      >
        <div className="flex flex-col w-full">
          <div
            className={`relative shrink-0 w-full transition-all duration-500 overflow-hidden ${
              isCollapsed ? "h-0 opacity-0" : "h-10 opacity-100"
            }`}
            style={{ transitionTimingFunction: softSpringEasing }}
          >
            <div className="flex items-center h-10 px-4">
              <div className="font-['Lexend:Regular',_sans-serif] text-[14px] text-neutral-400">
                Quick Links
              </div>
            </div>
          </div>

          <div className="w-full flex flex-col">
            {moduleDef.doctypes?.map((d) => (
              <div
                key={d.name}
                className={`relative shrink-0 transition-all duration-500 ${
                  isCollapsed ? "w-full flex justify-center" : "w-full"
                }`}
                style={{ transitionTimingFunction: softSpringEasing }}
              >
                <div
                  className={`rounded-lg cursor-pointer transition-all duration-500 flex items-center relative hover:bg-neutral-800 ${
                    isCollapsed ? "w-10 min-w-10 h-10 justify-center p-4" : "w-full h-10 px-4 py-2"
                  }`}
                  style={{ transitionTimingFunction: softSpringEasing }}
                  onClick={() => router.push(d.href ?? `/desk/${moduleDef.slug}/${encodeURIComponent(d.name)}`)}
                  title={isCollapsed ? (d.label ?? d.name) : undefined}
                >
                  <div className="flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-neutral-50" />
                  </div>

                  <div
                    className={`flex-1 relative transition-opacity duration-500 overflow-hidden ${
                      isCollapsed ? "opacity-0 w-0" : "opacity-100 ml-3"
                    }`}
                    style={{ transitionTimingFunction: softSpringEasing }}
                  >
                    <div className="font-['Lexend:Regular',_sans-serif] text-[14px] text-neutral-50 leading-[20px] truncate">
                      {d.label ?? d.name}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!isCollapsed && (
        <div className="w-full mt-auto pt-4 border-t border-neutral-800">
          <div className="flex items-center gap-2 px-2 py-2">
            <LanguageSwitcher />
          </div>
          <div className="px-2 pt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
            {t("version")}
          </div>
        </div>
      )}
    </aside>
  );
}

export function Sidebar({ isCollapsed, onToggleCollapse }: { isCollapsed?: boolean, onToggleCollapse?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  
  const segments = pathname.split("/").filter(Boolean);
  const deskIndex = segments.indexOf("desk");
  const urlSlug = (deskIndex !== -1 && segments.length > deskIndex + 1)
    ? segments[deskIndex + 1]
    : "desk";
  
  const [activeMenuSlug, setActiveMenuSlug] = useState(urlSlug);

  useEffect(() => {
    setActiveMenuSlug(urlSlug);
  }, [urlSlug]);

  const handleNavClick = (href: string) => {
    const hrefSegments = href.split("/").filter(Boolean);
    const hDeskIndex = hrefSegments.indexOf("desk");
    const itemSlug = (hDeskIndex !== -1 && hrefSegments.length > hDeskIndex + 1)
      ? hrefSegments[hDeskIndex + 1]
      : "desk";
    
    const mod = getModule(itemSlug);
    
    // If the item has no sub-pages, or is Home, just navigate.
    if (!mod || !mod.doctypes || mod.doctypes.length === 0) {
      router.push(href);
      setActiveMenuSlug(itemSlug);
    } else {
      // It has sub-pages, just open the menu, don't navigate
      setActiveMenuSlug(itemSlug);
    }
  };

  return (
    <div className="fixed inset-y-0 left-0 z-40 flex flex-row shadow-2xl overflow-hidden">
      <IconNavigation activeSlug={activeMenuSlug} onNavigate={handleNavClick} />
      <DetailSidebar activeSlug={activeMenuSlug} isCollapsed={!!isCollapsed} onToggleCollapse={() => onToggleCollapse?.()} />
    </div>
  );
}
