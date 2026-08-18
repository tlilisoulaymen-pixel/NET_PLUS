# Net Plus OS — Frontend

Plateforme modulaire (« système d'exploitation d'entreprise ») pour une société de nettoyage
opérant au Canada. À la connexion, l'utilisateur arrive sur un **launcher** présentant les
**24 applications** installées — affichables en **icônes ou en liste** (bouton de bascule en
haut, préférence mémorisée) — puis entre dans chaque module pour y gérer ses données.

## Pile technique

- **React 18 + TypeScript** : composants fonctionnels, typage strict
- **Vite 5** : développement instantané, build optimisé
- **React Router 6** : launcher + routage par module
- **Design system CSS maison** : tokens, aucun framework externe

## Démarrage

    npm install
    npm run dev        # http://localhost:5173
    npm run build      # build de production dans dist/
    npm run preview    # prévisualisation du build

Une couche API simulée (latence réaliste) rend toutes les interactions fonctionnelles sans
backend : attribution de créneaux, création d'enregistrements, export CSV, notes internes,
résolution d'alertes…

## Architecture

    src/
    |-- modules/registry.ts    # Registre des 24 modules : suites, icônes, collections
    |-- features/
    |   |-- launcher/          # Écran d'accueil (grille/liste, favoris, filtre)
    |   |-- generic/           # Gestionnaire de données universel (liste, kanban,
    |   |                      #   filtres, recherche, création, export CSV, notes)
    |   |-- dashboard/ crm/ operations/ hr/ stock/ purchasing/ finance/ alerts/
    |                          # Modules à implémentation dédiée
    |-- components/
    |   |-- layout/            # Topbar OS (recherche Ctrl+K, notifications), GlobalSearch
    |   |-- ui/                # Kit UI (DataTable triable, Modal, Toasts, Badges…)
    |-- data/                  # Référentiel de démonstration (mock.ts, os-mock.ts)
    |-- lib/                   # api.ts (couche service), format.ts (CAD, fr-CA, taxes)
    |-- styles/                # tokens.css, base.css, components.css, os.css

## Les 24 modules

Pilotage (Tableau de bord, IA, Alertes & Contrôles) · Relation client (CRM, Ventes,
Abonnements, Point de Vente, eCommerce, Site Web, E-mail Marketing, Assistance) ·
Opérations (Services sur Site, Planification, Projet, Feuilles de temps) · Chaîne
d'approvisionnement (Achats, Inventaire, Fabrication) · Finance & RH (Comptabilité, RH) ·
Productivité (Documents, Signature, Connaissances, Discussion) · Personnalisation (Studio).

Neuf modules ont une implémentation métier dédiée ; les autres s'appuient sur le
**gestionnaire de données universel** piloté par le registre (« src/modules/registry.ts ») :
ajouter un module ou une collection = décrire ses colonnes et ses données, aucune vue à coder.

## Raccourcis

- « Ctrl+K » : recherche globale (applications, clients, enregistrements)
- Launcher : bouton Icônes/Liste en haut à droite, étoile pour épingler un favori
//You are given a task to integrate an existing React component in the codebase

The codebase should support:
- shadcn project structure  
- Tailwind CSS
- Typescript

If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.

Determine the default path for components and styles. 
If default path for components is not /components/ui, provide instructions on why it's important to create this folder
Copy-paste this component to /components/ui folder:
```tsx
dock.tsx
'use client';

import {
  motion,
  MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
  type SpringOptions,
  AnimatePresence,
} from 'framer-motion';
import {
  Children,
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

const DOCK_HEIGHT = 128;
const DEFAULT_MAGNIFICATION = 80;
const DEFAULT_DISTANCE = 150;
const DEFAULT_PANEL_HEIGHT = 64;

type DockProps = {
  children: React.ReactNode;
  className?: string;
  distance?: number;
  panelHeight?: number;
  magnification?: number;
  spring?: SpringOptions;
};
type DockItemProps = {
  className?: string;
  children: React.ReactNode;
};
type DockLabelProps = {
  className?: string;
  children: React.ReactNode;
};
type DockIconProps = {
  className?: string;
  children: React.ReactNode;
};

type DocContextType = {
  mouseX: MotionValue;
  spring: SpringOptions;
  magnification: number;
  distance: number;
};
type DockProviderProps = {
  children: React.ReactNode;
  value: DocContextType;
};

const DockContext = createContext<DocContextType | undefined>(undefined);

function DockProvider({ children, value }: DockProviderProps) {
  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}

function useDock() {
  const context = useContext(DockContext);
  if (!context) {
    throw new Error('useDock must be used within an DockProvider');
  }
  return context;
}

function Dock({
  children,
  className,
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = DEFAULT_MAGNIFICATION,
  distance = DEFAULT_DISTANCE,
  panelHeight = DEFAULT_PANEL_HEIGHT,
}: DockProps) {
  const mouseX = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);

  const maxHeight = useMemo(() => {
    return Math.max(DOCK_HEIGHT, magnification + magnification / 2 + 4);
  }, [magnification]);

  const heightRow = useTransform(isHovered, [0, 1], [panelHeight, maxHeight]);
  const height = useSpring(heightRow, spring);

  return (
    <motion.div
      style={{
        height: height,
        scrollbarWidth: 'none',
      }}
      className='mx-2 flex max-w-full items-end overflow-x-auto'
    >
      <motion.div
        onMouseMove={({ pageX }) => {
          isHovered.set(1);
          mouseX.set(pageX);
        }}
        onMouseLeave={() => {
          isHovered.set(0);
          mouseX.set(Infinity);
        }}
        className={cn(
          'mx-auto flex w-fit gap-4 rounded-2xl bg-gray-50 px-4 dark:bg-neutral-900',
          className
        )}
        style={{ height: panelHeight }}
        role='toolbar'
        aria-label='Application dock'
      >
        <DockProvider value={{ mouseX, spring, distance, magnification }}>
          {children}
        </DockProvider>
      </motion.div>
    </motion.div>
  );
}

function DockItem({ children, className }: DockItemProps) {
  const ref = useRef<HTMLDivElement>(null);

  const { distance, magnification, mouseX, spring } = useDock();

  const isHovered = useMotionValue(0);

  const mouseDistance = useTransform(mouseX, (val) => {
    const domRect = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - domRect.x - domRect.width / 2;
  });

  const widthTransform = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [40, magnification, 40]
  );

  const width = useSpring(widthTransform, spring);

  return (
    <motion.div
      ref={ref}
      style={{ width }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      className={cn(
        'relative inline-flex items-center justify-center',
        className
      )}
      tabIndex={0}
      role='button'
      aria-haspopup='true'
    >
      {Children.map(children, (child) =>
        cloneElement(child as React.ReactElement, { width, isHovered })
      )}
    </motion.div>
  );
}

function DockLabel({ children, className, ...rest }: DockLabelProps) {
  const restProps = rest as Record<string, unknown>;
  const isHovered = restProps['isHovered'] as MotionValue<number>;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = isHovered.on('change', (latest) => {
      setIsVisible(latest === 1);
    });

    return () => unsubscribe();
  }, [isHovered]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -10 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'absolute -top-6 left-1/2 w-fit whitespace-pre rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs text-neutral-700 dark:border-neutral-900 dark:bg-neutral-800 dark:text-white',
            className
          )}
          role='tooltip'
          style={{ x: '-50%' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DockIcon({ children, className, ...rest }: DockIconProps) {
  const restProps = rest as Record<string, unknown>;
  const width = restProps['width'] as MotionValue<number>;

  const widthTransform = useTransform(width, (val) => val / 2);

  return (
    <motion.div
      style={{ width: widthTransform }}
      className={cn('flex items-center justify-center', className)}
    >
      {children}
    </motion.div>
  );
}

export { Dock, DockIcon, DockItem, DockLabel };


demo.tsx
import {
  Activity,
  Component,
  HomeIcon,
  Mail,
  Package,
  ScrollText,
  SunMoon,
} from 'lucide-react';

import { Dock, DockIcon, DockItem, DockLabel } from '@/components/ui/dock';

const data = [
  {
    title: 'Home',
    icon: (
      <HomeIcon className='h-full w-full text-neutral-600 dark:text-neutral-300' />
    ),
    href: '#',
  },
  {
    title: 'Products',
    icon: (
      <Package className='h-full w-full text-neutral-600 dark:text-neutral-300' />
    ),
    href: '#',
  },
  {
    title: 'Components',
    icon: (
      <Component className='h-full w-full text-neutral-600 dark:text-neutral-300' />
    ),
    href: '#',
  },
  {
    title: 'Activity',
    icon: (
      <Activity className='h-full w-full text-neutral-600 dark:text-neutral-300' />
    ),
    href: '#',
  },
  {
    title: 'Change Log',
    icon: (
      <ScrollText className='h-full w-full text-neutral-600 dark:text-neutral-300' />
    ),
    href: '#',
  },
  {
    title: 'Email',
    icon: (
      <Mail className='h-full w-full text-neutral-600 dark:text-neutral-300' />
    ),
    href: '#',
  },
  {
    title: 'Theme',
    icon: (
      <SunMoon className='h-full w-full text-neutral-600 dark:text-neutral-300' />
    ),
    href: '#',
  },
];

export function AppleStyleDock() {
  return (
    <div className='absolute bottom-2 left-1/2 max-w-full -translate-x-1/2'>
      <Dock className='items-end pb-3'>
        {data.map((item, idx) => (
          <DockItem
            key={idx}
            className='aspect-square rounded-full bg-gray-200 dark:bg-neutral-800'
          >
            <DockLabel>{item.title}</DockLabel>
            <DockIcon>{item.icon}</DockIcon>
          </DockItem>
        ))}
      </Dock>
    </div>
  );
}

```

Install NPM dependencies:
```bash
framer-motion
```

Implementation Guidelines
 1. Analyze the component structure and identify all required dependencies
 2. Review the component's argumens and state
 3. Identify any required context providers or hooks and install them
 4. Questions to Ask
 - What data/props will be passed to this component?
 - Are there any specific state management requirements?
 - Are there any required assets (images, icons, etc.)?
 - What is the expected responsive behavior?
 - What is the best place to use this component in the app?

Steps to integrate
 0. Copy paste all the code above in the correct directories
 1. Install external dependencies
 2. Fill image assets with Unsplash stock images you know exist
 3. Use lucide-react icons for svgs or logos if component requires them
// --- Component ---
"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    Send,
    BarChart2,
    Globe,
    Video,
    PlaneTakeoff,
    AudioLines,
} from "lucide-react";

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
}

interface SearchResult {
    actions: Action[];
}

const allActions = [
    {
        id: "1",
        label: "Book tickets",
        icon: <PlaneTakeoff className="h-4 w-4 text-blue-500" />,
        description: "Operator",
        short: "⌘K",
        end: "Agent",
    },
    {
        id: "2",
        label: "Summarize",
        icon: <BarChart2 className="h-4 w-4 text-orange-500" />,
        description: "gpt-4o",
        short: "⌘cmd+p",
        end: "Command",
    },
    {
        id: "3",
        label: "Screen Studio",
        icon: <Video className="h-4 w-4 text-purple-500" />,
        description: "gpt-4o",
        short: "",
        end: "Application",
    },
    {
        id: "4",
        label: "Talk to Jarvis",
        icon: <AudioLines className="h-4 w-4 text-green-500" />,
        description: "gpt-4o voice",
        short: "",
        end: "Active",
    },
    {
        id: "5",
        label: "Translate",
        icon: <Globe className="h-4 w-4 text-blue-500" />,
        description: "gpt-4o",
        short: "",
        end: "Command",
    },
];

function ActionSearchBar({ actions = allActions }: { actions?: Action[] }) {
    const [query, setQuery] = useState("");
    const [result, setResult] = useState<SearchResult | null>(null);
    const [isFocused, setIsFocused] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [selectedAction, setSelectedAction] = useState<Action | null>(null);
    const debouncedQuery = useDebounce(query, 200);

    useEffect(() => {
        if (!isFocused) {
            setResult(null);
            return;
        }

        if (!debouncedQuery) {
            setResult({ actions: allActions });
            return;
        }

        const normalizedQuery = debouncedQuery.toLowerCase().trim();
        const filteredActions = allActions.filter((action) => {
            const searchableText = action.label.toLowerCase();
            return searchableText.includes(normalizedQuery);
        });

        setResult({ actions: filteredActions });
    }, [debouncedQuery, isFocused]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
        setIsTyping(true);
    };

    const container = {
        hidden: { opacity: 0, height: 0 },
        show: {
            opacity: 1,
            height: "auto",
            transition: {
                height: {
                    duration: 0.4,
                },
                staggerChildren: 0.1,
            },
        },
        exit: {
            opacity: 0,
            height: 0,
            transition: {
                height: {
                    duration: 0.3,
                },
                opacity: {
                    duration: 0.2,
                },
            },
        },
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: {
            opacity: 1,
            y: 0,
            transition: {
                duration: 0.3,
            },
        },
        exit: {
            opacity: 0,
            y: -10,
            transition: {
                duration: 0.2,
            },
        },
    };

    // Reset selectedAction when focusing the input
    const handleFocus = () => {
        setSelectedAction(null);
        setIsFocused(true);
    };

    return (
        <div className="w-full max-w-xl mx-auto">
            <div className="relative flex flex-col justify-start items-center min-h-[300px]">
                <div className="w-full max-w-sm sticky top-0 bg-background z-10 pt-4 pb-1">
                    <label
                        className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block"
                        htmlFor="search"
                    >
                        Search Commands
                    </label>
                    <div className="relative">
                        <Input
                            type="text"
                            placeholder="What's up?"
                            value={query}
                            onChange={handleInputChange}
                            onFocus={handleFocus}
                            onBlur={() =>
                                setTimeout(() => setIsFocused(false), 200)
                            }
                            className="pl-3 pr-9 py-1.5 h-9 text-sm rounded-lg focus-visible:ring-offset-0"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4">
                            <AnimatePresence mode="popLayout">
                                {query.length > 0 ? (
                                    <motion.div
                                        key="send"
                                        initial={{ y: -20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        exit={{ y: 20, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <Send className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="search"
                                        initial={{ y: -20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        exit={{ y: 20, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                <div className="w-full max-w-sm">
                    <AnimatePresence>
                        {isFocused && result && !selectedAction && (
                            <motion.div
                                className="w-full border rounded-md shadow-sm overflow-hidden dark:border-gray-800 bg-white dark:bg-black mt-1"
                                variants={container}
                                initial="hidden"
                                animate="show"
                                exit="exit"
                            >
                                <motion.ul>
                                    {result.actions.map((action) => (
                                        <motion.li
                                            key={action.id}
                                            className="px-3 py-2 flex items-center justify-between hover:bg-gray-200 dark:hover:bg-zinc-900  cursor-pointer rounded-md"
                                            variants={item}
                                            layout
                                            onClick={() =>
                                                setSelectedAction(action)
                                            }
                                        >
                                            <div className="flex items-center gap-2 justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-500">
                                                        {action.icon}
                                                    </span>
                                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                        {action.label}
                                                    </span>
                                                    <span className="text-xs text-gray-400">
                                                        {action.description}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-400">
                                                    {action.short}
                                                </span>
                                                <span className="text-xs text-gray-400 text-right">
                                                    {action.end}
                                                </span>
                                            </div>
                                        </motion.li>
                                    ))}
                                </motion.ul>
                                <div className="mt-2 px-3 py-2 border-t border-gray-100 dark:border-gray-800">
                                    <div className="flex items-center justify-between text-xs text-gray-500">
                                        <span>Press ⌘K to open commands</span>
                                        <span>ESC to cancel</span>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

export { ActionSearchBar, Action };


// --- Demo ---
import { ActionSearchBar } from "@/components/ui/action-search-bar"
import {
    BarChart2,
    Globe,
    Video,
    PlaneTakeoff,
    AudioLines,
} from "lucide-react";


function actionSearchBarDemo() {

    const allActions = [
    {
        id: "1",
        label: "Book tickets",
        icon: <PlaneTakeoff className="h-4 w-4 text-blue-500" />,
        description: "Operator",
        short: "⌘K",
        end: "Agent",
    },
    {
        id: "2",
        label: "Summarize",
        icon: <BarChart2 className="h-4 w-4 text-orange-500" />,
        description: "gpt-4o",
        short: "⌘cmd+p",
        end: "Command",
    },
    {
        id: "3",
        label: "Screen Studio",
        icon: <Video className="h-4 w-4 text-purple-500" />,
        description: "gpt-4o",
        short: "",
        end: "Application",
    },
    {
        id: "4",
        label: "Talk to Jarvis",
        icon: <AudioLines className="h-4 w-4 text-green-500" />,
        description: "gpt-4o voice",
        short: "",
        end: "Active",
    },
    {
        id: "5",
        label: "Translate",
        icon: <Globe className="h-4 w-4 text-blue-500" />,
        description: "gpt-4o",
        short: "",
        end: "Command",
    },
];

    return <ActionSearchBar actions={allActions} />
}

export { actionSearchBarDemo }
**
// --- Component ---
"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** --- Types --- */
type Row = {
  id: number;
  name: string;
  email: string;
  role: string;
  location: string;
  status: "Active" | "Inactive" | "Suspended";
  balance: number;
};

type ColumnDef = {
  key: keyof Row;
  label: string;
  width?: string; // optional width
  sticky?: boolean;
};

/** --- Example data --- */
const defaultRows: Row[] = [
  { id: 1, name: "Arjun Mehta", email: "arjun.mehta@company.com", role: "Manager", location: "Bangalore", status: "Active", balance: 1250 },
  { id: 2, name: "Hannah Park", email: "hannah.park@company.com", role: "Designer", location: "Seoul", status: "Active", balance: 600 },
  { id: 3, name: "Oliver Scott", email: "oliver.scott@company.com", role: "Engineer", location: "Manchester", status: "Inactive", balance: 650 },
  { id: 4, name: "Camila Torres", email: "camila.torres@company.com", role: "HR", location: "Bogotá", status: "Active", balance: 0 },
  { id: 5, name: "Kenji Tanaka", email: "kenji.tanaka@company.com", role: "Developer", location: "Osaka", status: "Suspended", balance: -1000 },
];

/** --- Default columns --- */
const defaultColumns: ColumnDef[] = [
  { key: "name", label: "Name", width: "220px", sticky: true },
  { key: "email", label: "Email", width: "260px" },
  { key: "role", label: "Role", width: "140px" },
  { key: "location", label: "Location", width: "160px" },
  { key: "status", label: "Status", width: "120px" },
  { key: "balance", label: "Balance", width: "120px" },
];

/** --- localStorage keys --- */
const LS_ORDER = "reorderable_table_order_v1";
const LS_VISIBLE = "reorderable_table_visible_v1";

/** --- Component --- */
export default function ReorderableTable() {
  const [rows] = useState<Row[]>(defaultRows);
  const columnKeys = defaultColumns.map((c) => c.key as string);

  // load saved order or default order
  const [columnOrder, setColumnOrder] = useState<string[]>(
    () => JSON.parse(localStorage.getItem(LS_ORDER) || "null") || columnKeys
  );

  // visible columns
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    const saved = JSON.parse(localStorage.getItem(LS_VISIBLE) || "null");
    if (saved) return saved;
    const initial: Record<string, boolean> = {};
    columnKeys.forEach((k) => (initial[k] = true));
    return initial;
  });

  // simple search
  const [query, setQuery] = useState("");

  // ensure columnOrder contains all keys (if columns changed)
  useEffect(() => {
    const all = columnKeys;
    setColumnOrder((prev) => {
      const missing = all.filter((k) => !prev.includes(k));
      const next = [...prev.filter((k) => all.includes(k)), ...missing];
      return next;
    });
  }, [/* runs once on mount, columnKeys static */]);

  // persist on change
  useEffect(() => {
    localStorage.setItem(LS_ORDER, JSON.stringify(columnOrder));
  }, [columnOrder]);

  useEffect(() => {
    localStorage.setItem(LS_VISIBLE, JSON.stringify(visible));
  }, [visible]);

  // derive visible ordered columns
  const orderedColumns = useMemo(() => {
    return columnOrder
      .map((key) => defaultColumns.find((c) => c.key === key))
      .filter(Boolean) as ColumnDef[];
  }, [columnOrder]);

  // filtered rows
  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) =>
      [r.name, r.email, r.role, r.location, r.status].some((v) =>
        String(v).toLowerCase().includes(q)
      )
    );
  }, [rows, query]);

  /** --- Drag & Drop handlers for header columns --- */
  const dragSrcRef = React.useRef<number | null>(null);

  function onDragStart(e: React.DragEvent, index: number) {
    dragSrcRef.current = index;
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", String(index));
    } catch {
      /* some browsers may throw */
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault(); // allow drop
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    const srcIndex = dragSrcRef.current ?? parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (isNaN(srcIndex)) return;
    if (srcIndex === targetIndex) return;
    // compute new order array by moving src to target
    setColumnOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(srcIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    dragSrcRef.current = null;
  }

  /** --- Move left / right for accessibility --- */
  function moveColumn(key: string, direction: -1 | 1) {
    setColumnOrder((prev) => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const newIndex = idx + direction;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  }

  /** --- Toggle visibility --- */
  function toggleVisible(key: string) {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  /** --- Reset layout --- */
  function resetLayout() {
    setColumnOrder(columnKeys);
    const defaultVis: Record<string, boolean> = {};
    columnKeys.forEach((k) => (defaultVis[k] = true));
    setVisible(defaultVis);
    localStorage.removeItem(LS_ORDER);
    localStorage.removeItem(LS_VISIBLE);
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex gap-2 items-center">
          <Input placeholder="Search name, email, role..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-[320px]" />
          <Button variant="outline" onClick={() => setQuery("")}>
            Clear
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Columns</Button>
            </PopoverTrigger>
            <PopoverContent className="w-48">
              <div className="flex flex-col gap-2">
                {defaultColumns.map((col) => (
                  <label key={String(col.key)} className="flex items-center gap-2">
                    <Checkbox checked={!!visible[String(col.key)]} onCheckedChange={() => toggleVisible(String(col.key))} />
                    <span className="text-sm">{col.label}</span>
                  </label>
                ))}
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" size="sm" onClick={resetLayout}>Reset</Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    // move all visible to front (simple utility)
                    const visKeys = Object.entries(visible).filter(([, v]) => v).map(([k]) => k);
                    setColumnOrder((prev) => [...visKeys, ...prev.filter(k => !visKeys.includes(k))]);
                  }}>Bring visible front</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Table container with sticky header */}
      <div className="border rounded-md overflow-auto">
        <Table className="min-w-full border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-20 bg-background/90 backdrop-blur-sm">
            <TableRow>
              {/* Render header cells according to columnOrder */}
              {orderedColumns.map((colDef, idx) => {
                const key = String(colDef.key);
                if (!visible[key]) return null;
                return (
                  <TableHead
                    // using div inside TableHead to attach drag events
                    key={key}
                    style={{ width: colDef.width }}
                  >
                    <div
                      draggable
                      onDragStart={(e) => onDragStart(e, idx)}
                      onDragOver={onDragOver}
                      onDrop={(e) => onDrop(e, idx)}
                      className="flex items-center justify-between gap-2 select-none"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{colDef.label}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => moveColumn(key, -1)} aria-label={`Move ${colDef.label} left`}>
                          <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => moveColumn(key, 1)} aria-label={`Move ${colDef.label} right`}>
                          <ChevronsRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id} className="hover:bg-muted/10">
                {orderedColumns.map((colDef) => {
                  const key = String(colDef.key);
                  if (!visible[key]) return null;
                  const value = row[colDef.key];
                  // simple renderers for certain keys
                  let content: React.ReactNode = String(value);
                  if (colDef.key === "balance") {
                    content = `$${(value as number).toLocaleString()}`;
                  }
                  if (colDef.key === "status") {
                    content = (
                      <span className={cn("inline-block px-2 py-0.5 rounded-md text-sm font-medium",
                        value === "Active" ? "bg-green-100 text-green-800 dark:bg-green-900/30" :
                        value === "Inactive" ? "bg-slate-100 text-slate-800 dark:bg-slate-800/30" :
                        "bg-red-100 text-red-800 dark:bg-red-900/30")}>
                        {value}
                      </span>
                    );
                  }
                  return <TableCell key={key}>{content}</TableCell>;
                })}
              </TableRow>
            ))}
          </TableBody>

          <TableFooter className="bg-background/90 sticky bottom-0">
            <TableRow>
              {/* footer: show total label and sum of visible balance column */}
              <TableCell colSpan={orderedColumns.filter(c => visible[String(c.key)]).length - 1} className="font-medium">
                Total ({filtered.length} rows)
              </TableCell>
              {/* compute sum of balance if balance column visible */}
              {orderedColumns.some((c) => c.key === "balance" && visible[String(c.key)]) ? (
                <TableCell className="text-right font-semibold">
                  ${filtered.reduce((acc, r) => acc + r.balance, 0).toLocaleString()}
                </TableCell>
              ) : (
                <TableCell className="text-right font-semibold">—</TableCell>
              )}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}


// --- Demo ---
import ReorderableTable from "@/components/ui/reorderable-table";

export default function DemoOne() {
  return <ReorderableTable />;
}
// --- Component ---
import { usePagination } from "@/components/hooks/use-pagination";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type NumberedPaginationProps = {
  currentPage: number;
  totalPages: number;
  paginationItemsToDisplay?: number;
  onPageChange: (page: number) => void;
};

function NumberedPagination({
  currentPage,
  totalPages,
  paginationItemsToDisplay = 5,
  onPageChange,
}: NumberedPaginationProps) {
  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage,
    totalPages,
    paginationItemsToDisplay,
  });

  const handlePageChange = (page: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    onPageChange(page);
  };

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            href="#"
            onClick={handlePageChange(currentPage - 1)}
            aria-disabled={currentPage === 1}
          />
        </PaginationItem>

        {showLeftEllipsis && (
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        )}

        {pages.map((page) => (
          <PaginationItem key={page}>
            <PaginationLink
              href="#"
              onClick={handlePageChange(page)}
              isActive={page === currentPage}
            >
              {page}
            </PaginationLink>
          </PaginationItem>
        ))}

        {showRightEllipsis && (
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        )}

        <PaginationItem>
          <PaginationNext
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            href="#"
            onClick={handlePageChange(currentPage + 1)}
            aria-disabled={currentPage === totalPages}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export { NumberedPagination };

// --- Demo ---
import { useState } from "react";
import { NumberedPagination } from "@/components/ui/numbered-pagination";

const ITEMS_PER_PAGE = 5;
const TOTAL_ITEMS = 50;

function NumberedPaginationDemo() {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(TOTAL_ITEMS / ITEMS_PER_PAGE);

  const items = Array.from({ length: ITEMS_PER_PAGE }, (_, i) => ({
    id: (currentPage - 1) * ITEMS_PER_PAGE + i + 1,
    title: `Item ${(currentPage - 1) * ITEMS_PER_PAGE + i + 1}`,
  }));

  return (
    <div className="flex min-w-[400px] flex-col space-y-4 rounded-lg border p-4">
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-md bg-muted/50 p-2 text-sm"
          >
            {item.title}
          </div>
        ))}
      </div>

      <NumberedPagination
        currentPage={currentPage}
        totalPages={totalPages}
        paginationItemsToDisplay={5}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}

export { NumberedPaginationDemo };