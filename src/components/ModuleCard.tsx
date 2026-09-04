"use client";

import Link from "next/link";
import type { ModuleDef } from "@/config/modules";
import { cn } from "@/lib/utils";

/**
 * Icon-style module tile — large icon above the label, no card box.
 * Clicking navigates to /desk/[slug].
 */
export function ModuleCard({ module, isFav, onToggleFav }: {
  module: ModuleDef;
  isFav?: boolean;
  onToggleFav?: (e: React.MouseEvent) => void;
}) {
  const Icon = module.icon;
  return (
    <Link
      href={`/desk/${module.slug}`}
      className="group relative flex flex-col items-center gap-3 rounded-2xl p-4 text-center transition-all duration-150 hover:bg-surface-muted focus-visible:ring-4 focus-visible:ring-primary-300/20"
    >
      {/* Icon bubble */}
      <span
        className={cn(
          "grid size-16 place-items-center rounded-2xl shadow-sm transition-all duration-150",
          "group-hover:scale-105 group-hover:shadow-md",
          module.tint,
        )}
      >
        <Icon className="size-7" strokeWidth={1.8} aria-hidden />
      </span>

      {/* Label */}
      <span className="max-w-[9rem] text-[13px] font-medium leading-[18px] text-ink-primary group-hover:text-primary-600">
        {module.name}
      </span>

      {/* Fav star — top-right corner, appears on hover */}
      {onToggleFav && (
        <button
          aria-label={isFav ? `Unstar ${module.name}` : `Star ${module.name}`}
          onClick={(e) => { e.preventDefault(); onToggleFav(e); }}
          className={cn(
            "absolute right-2 top-2 grid size-6 place-items-center rounded-full opacity-0 transition-opacity group-hover:opacity-100",
            isFav && "opacity-100",
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className={cn("size-4", isFav ? "fill-warning stroke-warning" : "stroke-ink-muted fill-none")}
            strokeWidth={2}
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      )}
    </Link>
  );
}
