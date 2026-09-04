"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Send, FileText, Settings, Users, LayoutDashboard, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

export interface Action {
  id: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
  short?: string;
  end?: string;
  url?: string;
}

const defaultActions: Action[] = [
  { id: "1", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4 text-blue-500" />, short: "G B", description: "Go to Dashboard" },
  { id: "2", label: "Sales Orders", icon: <FileText className="h-4 w-4 text-green-500" />, short: "S O", description: "View Sales Orders" },
  { id: "3", label: "Customers", icon: <Users className="h-4 w-4 text-orange-500" />, short: "C U", description: "Manage Customers" },
  { id: "4", label: "Calendar", icon: <Calendar className="h-4 w-4 text-purple-500" />, short: "C L", description: "View Schedule" },
  { id: "5", label: "Settings", icon: <Settings className="h-4 w-4 text-slate-500" />, short: "S E", description: "System Settings" },
];

export function ActionSearchBar({
  onSearch,
  actions = defaultActions,
}: {
  onSearch: (query: string) => void;
  actions?: Action[];
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ actions: Action[] } | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const debouncedQuery = useDebounce(query, 200);

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!isFocused) {
      setResult(null);
      return;
    }
    if (!debouncedQuery) {
      setResult({ actions });
      return;
    }

    const normalizedQuery = debouncedQuery.toLowerCase().trim();
    const filteredActions = actions.filter((action) => {
      return action.label.toLowerCase().includes(normalizedQuery) ||
             (action.description && action.description.toLowerCase().includes(normalizedQuery));
    });

    setResult({ actions: filteredActions });
  }, [debouncedQuery, isFocused, actions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleFocus = () => setIsFocused(true);
  
  const handleBlur = () => {
    // delay to allow click on results
    setTimeout(() => setIsFocused(false), 200);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      setQuery("");
      setIsFocused(false);
    }
  };

  const container = {
    hidden: { opacity: 0, height: 0 },
    show: {
      opacity: 1,
      height: "auto",
      transition: { height: { duration: 0.3 }, staggerChildren: 0.05 },
    },
    exit: {
      opacity: 0,
      height: 0,
      transition: { height: { duration: 0.2 }, opacity: { duration: 0.15 } },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
    exit: { opacity: 0, y: -5, transition: { duration: 0.1 } },
  };

  return (
    <div className="relative w-full max-w-lg">
      <form ref={formRef} onSubmit={handleSubmit} className="relative z-20">
        <input
          type="text"
          placeholder="Search Net Plus OS or hit ⌘K"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="flex h-9 w-full rounded-[10px] border border-line bg-surface px-9 text-sm text-ink-primary shadow-sm placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-all"
        />
        
        {/* Left Icon */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
          <Search className="size-4 text-ink-muted" />
        </div>

        {/* Right Icon (Submit or Loading) */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4">
          <AnimatePresence mode="popLayout">
            {query.length > 0 ? (
              <motion.button
                key="send"
                type="submit"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center text-accent hover:opacity-80"
              >
                <Send className="size-4" />
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
      </form>

      {/* Dropdown Results */}
      <AnimatePresence>
        {isFocused && result && (
          <motion.div
            className="absolute top-full left-0 right-0 mt-2 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg z-50"
            variants={container}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            {result.actions.length > 0 ? (
              <motion.ul className="py-2">
                {result.actions.map((action) => (
                  <motion.li
                    key={action.id}
                    variants={item}
                    layout
                    className="flex cursor-pointer items-center justify-between px-4 py-2 hover:bg-bg-muted"
                    onClick={() => {
                      if (action.url) {
                        // handle predefined action routing here if needed
                        console.log("Action clicked:", action);
                      } else {
                        onSearch(action.label);
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-7 items-center justify-center rounded-md bg-white border border-line shadow-sm dark:bg-black">
                        {action.icon}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-[13px] font-medium text-ink-primary">
                          {action.label}
                        </span>
                        {action.description && (
                          <span className="text-[11px] text-ink-muted">
                            {action.description}
                          </span>
                        )}
                      </div>
                    </div>
                    {action.short && (
                      <span className="text-[10px] font-semibold text-ink-muted bg-bg-muted px-1.5 py-0.5 rounded border border-line">
                        {action.short}
                      </span>
                    )}
                  </motion.li>
                ))}
              </motion.ul>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-ink-muted">
                Press Enter to search for "{query}" in all records.
              </div>
            )}
            
            <div className="border-t border-line bg-bg-muted px-4 py-2 flex items-center justify-between text-[11px] text-ink-muted">
              <span>Press ↵ to search</span>
              <span>ESC to close</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
