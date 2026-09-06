"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { frappe } from "@/lib/frappe/client";
import { Loader2, Save, ChevronLeft, MapPin, Plus, Trash2, CheckSquare, Square } from "lucide-react";
import { toast } from "@/lib/toast";
import Link from "next/link";
import { LinkField } from "../ui/LinkField";
import { TypeSelector } from "../ui/TypeSelector";
import { AppShell } from "@/components/layout/AppShell";

/* ─── Types ───────────────────────────────────────── */
interface ContractSite { address: string; lat: string; lng: string; rayon: number; }
interface MissionDoc {
  name?: string;
  contract?: string; superviseur?: string; client?: string; type?: string; mode_d_equipe?: string; status?: string;
  site_address?: string; lat?: string; lng?: string; rayon?: number;
  instructions?: string; recurrence_model?: string;
  start_datetime?: string; end_datetime?: string;
  start_date?: string; end_date?: string; start_time?: string; end_time?: string;
  lun?: number; mar?: number; mer?: number; jeu?: number; ven?: number; sam?: number; dim?: number;
  excluded_dates?: { date: string; _id?: string }[];
  assigned_operators?: { operator: string; _id?: string }[];
  notes_internes?: string;
}

/* ─── Day Checkbox ──────────────────────────────────── */
function DayCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`flex flex-col items-center px-3 py-2 rounded-lg border-2 transition font-medium text-xs ${checked ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink-secondary"}`}>
      {checked ? <CheckSquare className="w-4 h-4 mb-0.5" /> : <Square className="w-4 h-4 mb-0.5" />}
      {label}
    </button>
  );
}

/* ─── Mini Map ──────────────────────────────────────── */
function MiniMap({ lat, lng, onChange }: { lat: string, lng: string, onChange: (lat: string, lng: string) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(typeof window !== "undefined" && !!(window as any).google);

  useEffect(() => {
    if ((window as any).google) {
      setLoaded(true);
      return;
    }
    const cbName = "initGoogleMaps" + Date.now();
    (window as any)[cbName] = () => setLoaded(true);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyDBVwEYtvHGnuKdmaKEfEo-OgaIC6RflnQ&libraries=marker&callback=${cbName}`;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const google = (window as any).google;
    const defaultLat = parseFloat(lat) || 36.8065;
    const defaultLng = parseFloat(lng) || 10.1815;
    const center = { lat: defaultLat, lng: defaultLng };

    if (!mapObjRef.current) {
      mapObjRef.current = new google.maps.Map(mapRef.current, {
        center, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
        styles: [{ elementType: "geometry", stylers: [{ color: "#1a1f2e" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#8a9ab5" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d3448" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1520" }] }]
      });
      markerRef.current = new google.maps.Marker({ position: center, map: mapObjRef.current, draggable: true });
      
      markerRef.current.addListener("dragend", (e: any) => onChange(String(e.latLng.lat().toFixed(6)), String(e.latLng.lng().toFixed(6))));
      mapObjRef.current.addListener("click", (e: any) => {
        const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        markerRef.current.setPosition(pos);
        onChange(String(pos.lat.toFixed(6)), String(pos.lng.toFixed(6)));
      });

      if (searchInputRef.current) {
        const geocoder = new google.maps.Geocoder();
        searchInputRef.current.addEventListener("keydown", (e: any) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const address = searchInputRef.current?.value;
            if (address) {
              geocoder.geocode({ address }, (results: any, status: any) => {
                if (status === "OK" && results && results[0]) {
                  const pos = results[0].geometry.location;
                  mapObjRef.current.setCenter(pos);
                  mapObjRef.current.setZoom(17);
                  markerRef.current.setPosition(pos);
                  onChange(String(pos.lat().toFixed(6)), String(pos.lng().toFixed(6)));
                } else {
                  toast.error("Adresse introuvable");
                }
              });
            }
          }
        });
      }
    } else {
      const pos = { lat: defaultLat, lng: defaultLng };
      mapObjRef.current.setCenter(pos);
      markerRef.current.setPosition(pos);
    }
  }, [loaded, lat, lng, onChange]);

  return (
    <div className="relative" style={{ height: 350, borderRadius: 8, overflow: "hidden", marginTop: 8 }}>
      <input 
        ref={searchInputRef}
        type="text" 
        placeholder="Rechercher (Appuyez sur Entrée)..." 
        className="absolute top-3 left-3 z-10 w-64 rounded-md border-0 shadow bg-white px-3 py-2 text-sm text-black focus:ring-2 focus:ring-brand-500"
      />
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

/* ─── Main Form ─────────────────────────────────────── */
export default function MissionForm({ isNew = false, docName }: { isNew?: boolean; docName?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [doc, setDoc] = useState<MissionDoc>({
    recurrence_model: "Ponctuelle",
    assigned_operators: [],
    excluded_dates: [],
  });
  const [contractSites, setContractSites] = useState<ContractSite[]>([]);
  const [useCustomSite, setUseCustomSite] = useState(false);

  useEffect(() => {
    if (isNew) return;
    if (!docName) return;
    async function load() {
      try {
        const res = await frappe.call<any>("frappe.client.get", { doctype: "Mission", name: docName });
        const d = res.message || res;
        d.assigned_operators = d.assigned_operators || [];
        d.excluded_dates = d.excluded_dates || [];
        setDoc(d);
        if (d.contract) await loadContractSites(d.contract);
      } catch (e: any) { toast.error(e.message || "Erreur de chargement"); }
      finally { setLoading(false); }
    }
    load();
  }, [isNew, docName]);

  async function loadContractSites(contractName: string) {
    try {
      const res = await frappe.call<any>("frappe.client.get", { doctype: "Service Contract", name: contractName });
      const c = res.message || res;
      setContractSites(c.sites_du_contrat || []);
    } catch { setContractSites([]); }
  }

  const set = (k: keyof MissionDoc, v: any) => setDoc(p => ({ ...p, [k]: v }));

  const onContractChange = async (c: string) => {
    set("contract", c);
    if (!c) { setContractSites([]); return; }
    await loadContractSites(c);
  };

  const selectSite = (s: ContractSite) => {
    setDoc(p => ({ ...p, site_address: s.address, lat: s.lat, lng: s.lng, rayon: s.rayon }));
    setUseCustomSite(false);
  };

  function addExcludedDate() {
    set("excluded_dates", [...(doc.excluded_dates || []), { date: "", _id: String(Date.now()) }]);
  }
  function removeExcludedDate(idx: number) {
    const d = [...(doc.excluded_dates || [])]; d.splice(idx, 1); set("excluded_dates", d);
  }
  function addOperator() {
    set("assigned_operators", [...(doc.assigned_operators || []), { operator: "", _id: String(Date.now()) }]);
  }
  function removeOperator(idx: number) {
    const d = [...(doc.assigned_operators || [])]; d.splice(idx, 1); set("assigned_operators", d);
  }
  function updateOperator(idx: number, val: string) {
    const d = [...(doc.assigned_operators || [])]; d[idx] = { ...d[idx], operator: val }; set("assigned_operators", d);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = { ...doc, doctype: "Mission" };
      delete (payload as any)._id;
      let res;
      if (isNew || !docName) {
        res = await frappe.call<any>("frappe.client.insert", { doc: payload });
        toast.success("Mission créée !");
        router.replace(`/desk/netplus/Mission/${res.message?.name || res.name}`);
      } else {
        res = await frappe.call<any>("frappe.client.save", { doc: payload });
        toast.success("Mission sauvegardée !"); setDoc(res.message || res);
      }
    } catch (e: any) { toast.error(e.message || "Erreur"); }
    finally { setSaving(false); }
  }

  if (loading) return (
    <AppShell>
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-brand-500 w-8 h-8" />
      </div>
    </AppShell>
  );

  const DAYS = [["lun","Lun"],["mar","Mar"],["mer","Mer"],["jeu","Jeu"],["ven","Ven"],["sam","Sam"],["dim","Dim"]] as const;

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-white sticky top-0 z-20 -mx-6 -mt-6 mb-6">
        <div className="flex items-center gap-3">
          <Link href="/desk/netplus/Mission" className="text-ink-secondary hover:text-ink-primary"><ChevronLeft className="w-5 h-5" /></Link>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-tertiary mb-0.5">
               <Link href="/desk" className="hover:text-ink-primary transition">Desk</Link>
               <span className="opacity-50">/</span>
               <Link href="/desk/netplus" className="hover:text-ink-primary transition">NetPlus</Link>
               <span className="opacity-50">/</span>
               <Link href="/desk/netplus/Mission" className="hover:text-ink-primary transition">Mission</Link>
            </div>
            <h1 className="text-lg font-semibold text-ink-primary">{isNew ? "Nouvelle Mission" : doc.name}</h1>
            {!isNew && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                doc.status === "En cours" ? "bg-blue-100 text-blue-700" :
                doc.status === "Terminée" ? "bg-emerald-100 text-emerald-700" :
                doc.status === "Annulée" ? "bg-red-100 text-red-700" :
                doc.status === "Planifiée" ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"
              }`}>{doc.status || "Brouillon"}</span>
            )}
          </div>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-ink-primary hover:bg-ink-secondary text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Contrat & infos */}
          <section className="bg-white rounded-2xl border border-line p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-ink-secondary uppercase tracking-wide mb-4">Rattachement & Infos</h2>
            <div className="grid grid-cols-2 gap-4">
              <LinkField label="Contrat de service" value={doc.contract || ""} doctype="Service Contract" onChange={onContractChange} />
              <LinkField label="Superviseur" value={doc.superviseur || ""} doctype="Employee" roleFilter="NetPlus Supervisor" onChange={v => set("superviseur", v)} />
              <LinkField label="Client" value={doc.client || ""} doctype="Customer" roleFilter="NetPlus Client" onChange={v => set("client", v)} readOnly={!!doc.contract} />
              <TypeSelector label="Type(s) de mission" value={doc.type || ""} onChange={v => set("type", v)} />
              <div>
                <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Mode d'équipe</label>
                <select className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.mode_d_equipe || ""} onChange={e => set("mode_d_equipe", e.target.value)}>
                  <option value="">Sélectionner…</option>
                  <option value="Solo">Solo</option><option value="Duo">Duo</option><option value="Équipe">Équipe</option>
                </select>
              </div>
            </div>
          </section>

          {/* Site selection */}
          <section className="bg-white rounded-2xl border border-line p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-ink-secondary uppercase tracking-wide mb-4">
              <MapPin className="w-4 h-4 inline mr-1.5 text-brand-500" />Site d'intervention
            </h2>
            {contractSites.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-ink-secondary mb-2">Sites issus du contrat :</p>
                <div className="flex flex-wrap gap-2">
                  {contractSites.map((site, i) => (
                    <button key={i} onClick={() => selectSite(site)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition ${doc.site_address === site.address && !useCustomSite ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-ink-secondary hover:border-brand-300"}`}>
                      📍 {site.address || `Site ${i + 1}`}
                    </button>
                  ))}
                  <button onClick={() => setUseCustomSite(true)} className={`px-3 py-1.5 rounded-lg text-sm border transition ${useCustomSite ? "border-brand-500 bg-brand-50 text-brand-700" : "border-dashed border-line text-ink-tertiary hover:border-brand-300"}`}>
                    + Nouvelle adresse
                  </button>
                </div>
              </div>
            )}
            {(useCustomSite || contractSites.length === 0) && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Adresse</label>
                  <input className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.site_address || ""} onChange={e => set("site_address", e.target.value)} placeholder="Adresse complète…" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Latitude</label><input className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.lat || ""} onChange={e => set("lat", e.target.value)} /></div>
                  <div><label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Longitude</label><input className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.lng || ""} onChange={e => set("lng", e.target.value)} /></div>
                  <div><label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Rayon (m)</label><input type="number" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.rayon || 200} onChange={e => set("rayon", parseInt(e.target.value) || 200)} /></div>
                </div>
                <MiniMap lat={doc.lat || ""} lng={doc.lng || ""} onChange={(lat, lng) => { set("lat", lat); set("lng", lng); }} />
              </div>
            )}
            {!useCustomSite && doc.site_address && (
              <div className="mt-3 p-3 bg-surface rounded-lg border border-line text-sm text-ink-secondary">
                📍 {doc.site_address} — Rayon : {doc.rayon || 200}m
              </div>
            )}
          </section>

          {/* Fenêtre d'activité */}
          <section className="bg-white rounded-2xl border border-line p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-ink-secondary uppercase tracking-wide mb-4">Fenêtre d'activité</h2>
            <div className="flex gap-2 mb-6">
              {(["Ponctuelle","Récurrente Hebdo","Période Continue"] as const).map(model => (
                <button key={model} onClick={() => set("recurrence_model", model)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${doc.recurrence_model === model ? "bg-brand-500 text-white border-brand-500" : "border-line text-ink-secondary hover:border-brand-300"}`}>
                  {model}
                </button>
              ))}
            </div>

            {doc.recurrence_model === "Ponctuelle" && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Début prévu</label><input type="datetime-local" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.start_datetime || ""} onChange={e => set("start_datetime", e.target.value)} /></div>
                <div><label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Fin prévue</label><input type="datetime-local" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.end_datetime || ""} onChange={e => set("end_datetime", e.target.value)} /></div>
              </div>
            )}

            {doc.recurrence_model === "Récurrente Hebdo" && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-2 block">Jours de la semaine</label>
                  <div className="flex gap-2">
                    {DAYS.map(([key, label]) => (
                      <DayCheck key={key} label={label} checked={!!doc[key as keyof MissionDoc]} onChange={v => set(key, v ? 1 : 0)} />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Heure de début</label><input type="time" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.start_time || ""} onChange={e => set("start_time", e.target.value)} /></div>
                  <div><label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Heure de fin</label><input type="time" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.end_time || ""} onChange={e => set("end_time", e.target.value)} /></div>
                  <div><label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Fin de récurrence</label><input type="date" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.end_date || ""} onChange={e => set("end_date", e.target.value)} /></div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">Dates exclues</label>
                    <button onClick={addExcludedDate} className="text-xs text-brand-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3" />Ajouter</button>
                  </div>
                  <div className="space-y-2">
                    {(doc.excluded_dates || []).map((d, i) => (
                      <div key={d._id || i} className="flex items-center gap-2">
                        <input type="date" className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={d.date} onChange={e => { const arr = [...(doc.excluded_dates||[])]; arr[i]={...arr[i],date:e.target.value}; set("excluded_dates",arr); }} />
                        <button onClick={() => removeExcludedDate(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {doc.recurrence_model === "Période Continue" && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Date de début</label><input type="date" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.start_date || ""} onChange={e => set("start_date", e.target.value)} /></div>
                <div><label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Date de fin</label><input type="date" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.end_date || ""} onChange={e => set("end_date", e.target.value)} /></div>
                <div><label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Heure de début (quotidien)</label><input type="time" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.start_time || ""} onChange={e => set("start_time", e.target.value)} /></div>
                <div><label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Heure de fin (quotidien)</label><input type="time" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.end_time || ""} onChange={e => set("end_time", e.target.value)} /></div>
              </div>
            )}
          </section>

          {/* Opérateurs assignés */}
          <section className="bg-white rounded-2xl border border-line p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-ink-secondary uppercase tracking-wide mb-4">Opérateurs assignés</h2>
            
            <div className="border border-line rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface border-b border-line text-xs font-semibold text-ink-secondary uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 font-medium">No.</th>
                    <th className="px-4 py-3 font-medium">Opérateur</th>
                    <th className="px-4 py-3 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(doc.assigned_operators || []).map((op, i) => (
                    <tr key={op._id || i} className="group hover:bg-gray-50 transition">
                      <td className="px-4 py-2 w-12 text-center text-sm text-ink-tertiary">{i + 1}</td>
                      <td className="px-4 py-2">
                        <LinkField label="" value={op.operator} doctype="Employee" roleFilter="NetPlus Operator" onChange={v => updateOperator(i, v)} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => removeOperator(i)} className="p-1.5 text-ink-tertiary hover:text-red-600 hover:bg-red-50 rounded transition opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {(doc.assigned_operators || []).length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-ink-tertiary">Aucun opérateur assigné</td></tr>
                  )}
                </tbody>
              </table>
              <div className="bg-surface border-t border-line px-4 py-2">
                <button onClick={addOperator} className="text-xs font-medium text-ink-primary hover:text-ink-secondary bg-white border border-line px-3 py-1.5 rounded shadow-sm hover:shadow transition">Add Row</button>
              </div>
            </div>
          </section>

          {/* Instructions */}
          <section className="bg-white rounded-2xl border border-line p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-ink-secondary uppercase tracking-wide mb-4">Instructions & Notes</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Instructions opérateur</label>
                <textarea rows={3} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" value={doc.instructions || ""} onChange={e => set("instructions", e.target.value)} placeholder="Instructions de sécurité, accès, matériel requis…" />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Notes internes (superviseur)</label>
                <textarea rows={3} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" value={doc.notes_internes || ""} onChange={e => set("notes_internes", e.target.value)} placeholder="Notes internes, contexte…" />
              </div>
            </div>
          </section>

        </div>
      </div>
    </AppShell>
  );
}
