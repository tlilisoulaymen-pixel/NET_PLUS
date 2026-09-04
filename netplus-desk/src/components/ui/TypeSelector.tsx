"use client";

import { useState } from "react";
import { Check, X, Layers } from "lucide-react";

export const MISSION_TYPES = [
  "NETTOYAGE DE TAPIS ET MEUBLES",
  "LAVAGE DE VITRES",
  "TRAITEMENT DE PLANCHERS",
  "LAVAGE DES AIRES DE STATIONNEMENT",
  "ENTRETIEN MÉNAGER",
  "DÉSINFECTION ET DÉCONTAMINATION",
  "DÉGATS D’EAU OU SINISTRE",
  "NETTOYAGES DES CHUTES À DÉCHETS",
  "NETTOYAGE APRÈS CONSTRUCTION",
  "NETTOYAGE DES BACS à POUBELLES – DÉCHETS",
  "NETTOYAGE DES TOILES DE TENTE ROULOTTE",
];

interface TypeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export function TypeSelector({ value, onChange, label = "Types de service" }: TypeSelectorProps) {
  const [open, setOpen] = useState(false);
  
  // value is expected to be a comma-separated string
  const selectedTypes = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];

  const toggleType = (t: string) => {
    if (selectedTypes.includes(t)) {
      onChange(selectedTypes.filter(x => x !== t).join(", "));
    } else {
      onChange([...selectedTypes, t].join(", "));
    }
  };

  return (
    <>
      <div>
        <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">
          {label}
        </label>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full text-left rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 hover:bg-gray-50 transition flex items-center justify-between"
        >
          <span className="truncate text-ink-primary">
            {selectedTypes.length > 0 
              ? `${selectedTypes.length} type(s) sélectionné(s)` 
              : "Sélectionner..."}
          </span>
          <Layers className="w-4 h-4 text-ink-tertiary" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h3 className="text-lg font-semibold text-ink-primary">Sélectionner les types</h3>
              <button onClick={() => setOpen(false)} className="p-1 rounded-full text-ink-tertiary hover:bg-gray-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-2 overflow-y-auto max-h-[60vh]">
              <div className="flex flex-col gap-1">
                {MISSION_TYPES.map(t => {
                  const isSelected = selectedTypes.includes(t);
                  return (
                    <div 
                      key={t}
                      onClick={() => toggleType(t)}
                      className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition ${isSelected ? "bg-brand-50" : "hover:bg-gray-50"}`}
                    >
                      <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${isSelected ? 'bg-brand-500 border-brand-500 text-white' : 'border-gray-300 bg-white'}`}>
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                      </div>
                      <span className={`text-sm font-medium ${isSelected ? 'text-brand-900' : 'text-ink-secondary'}`}>
                        {t}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-line bg-gray-50 flex justify-end">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-ink-primary hover:bg-ink-secondary text-white text-sm font-medium rounded-lg transition"
              >
                Valider ({selectedTypes.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
