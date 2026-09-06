"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { frappe } from "@/lib/frappe/client";
import { Loader2, Save, Plus, Trash2, ChevronLeft, FileText, MapPin, X, CheckSquare } from "lucide-react";
import { toast } from "@/lib/toast";
import Link from "next/link";
import { LinkField } from "../ui/LinkField";
import { TypeSelector } from "../ui/TypeSelector";
import { AppShell } from "@/components/layout/AppShell";

/* ─── Types ───────────────────────────────────────────────── */
interface Site {
  address: string; lat: string; lng: string; rayon: number; _id?: string;
}
interface ContractDoc {
  name?: string; status?: string; date_entree_en_vigueur?: string;
  date_expiration?: string; version?: string; superviseur?: string;
  party_name?: string; type_de_service?: string; mode_d_equipe?: string;
  chef_d_equipe_requis?: number; tarif_par_intervention?: number;
  devise?: string; cycle_de_facturation?: string; delai_de_paiement?: number;
  lois_applicables?: string; notes?: string;
  sites_du_contrat?: Site[];
}

/* ─── Map Pin Picker ───────────────────────────────────────── */
function MapPinPicker({ site, onChange, loaded }: { site: Site; onChange: (s: Partial<Site>) => void; loaded: boolean; }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || !(window as any).google) return;
    const google = (window as any).google;
    const defaultLat = parseFloat(site.lat) || 36.8065;
    const defaultLng = parseFloat(site.lng) || 10.1815;
    const center = { lat: defaultLat, lng: defaultLng };



    if (!mapObjRef.current) {
      mapObjRef.current = new google.maps.Map(mapRef.current, {
        center, zoom: 14,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        styles: [{ elementType: "geometry", stylers: [{ color: "#1a1f2e" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#8a9ab5" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d3448" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1520" }] }]
      });
      markerRef.current = new google.maps.Marker({ position: center, map: mapObjRef.current, draggable: true,
        icon: { url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='40'%3E%3Cellipse cx='16' cy='36' rx='6' ry='3' fill='rgba(0,0,0,0.3)'/%3E%3Cpath d='M16 2C9.4 2 4 7.4 4 14c0 9 12 24 12 24S28 23 28 14C28 7.4 22.6 2 16 2z' fill='%233b82f6'/%3E%3Ccircle cx='16' cy='14' r='5' fill='white'/%3E%3C/svg%3E" }
      });
      markerRef.current.addListener("dragend", (e: any) => {
        onChange({ lat: String(e.latLng.lat().toFixed(6)), lng: String(e.latLng.lng().toFixed(6)) });
      });
      mapObjRef.current.addListener("click", (e: any) => {
        const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        markerRef.current.setPosition(pos);
        onChange({ lat: String(pos.lat.toFixed(6)), lng: String(pos.lng.toFixed(6)) });
      });
    }
  }, [loaded, site.lat, site.lng]);

  return <div ref={mapRef} style={{ height: 200, borderRadius: 8, overflow: "hidden", marginTop: 8 }} />;
}

/* ─── Main Form ──────────────────────────────────────────────── */
export default function ServiceContractForm({ isNew = false }: { isNew?: boolean }) {
  const router = useRouter();
  const params = useParams();
  const docName = params?.name as string | undefined;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [doc, setDoc] = useState<ContractDoc>({ status: "Brouillon", devise: "TND", rayon: 200 } as any);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  /* Load Google Maps */
  useEffect(() => {
    if ((window as any).google) {
      setMapsLoaded(true);
      return;
    }
    const cbName = "initGoogleMaps" + Date.now();
    (window as any)[cbName] = () => setMapsLoaded(true);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyDBVwEYtvHGnuKdmaKEfEo-OgaIC6RflnQ&libraries=marker&callback=${cbName}`;
    document.head.appendChild(s);
  }, []);

  /* Load existing doc */
  useEffect(() => {
    if (isNew || !docName) { setLoading(false); return; }
    (async () => {
      try {
        const res = await frappe.call<any>("frappe.client.get", { doctype: "Service Contract", name: docName });
        setDoc(res.message || res);
      } catch (e: any) { toast.error(e.message); }
      finally { setLoading(false); }
    })();
  }, [docName, isNew]);

  const set = (field: string, value: any) => setDoc(prev => ({ ...prev, [field]: value }));

  const addSite = () => {
    const sites = [...(doc.sites_du_contrat || []), { address: "", lat: "", lng: "", rayon: 200, _id: String(Date.now()) }];
    set("sites_du_contrat", sites);
  };

  const removeSite = (idx: number) => {
    const sites = [...(doc.sites_du_contrat || [])];
    sites.splice(idx, 1);
    set("sites_du_contrat", sites);
  };

  const updateSite = (idx: number, data: Partial<Site>) => {
    const sites = [...(doc.sites_du_contrat || [])];
    sites[idx] = { ...sites[idx], ...data };
    set("sites_du_contrat", sites);
  };

  async function save() {
    setSaving(true);
    try {
      const payload = { ...doc, doctype: "Service Contract" };
      delete (payload as any)._id;
      let res;
      if (isNew || !docName) {
        res = await frappe.call<any>("frappe.client.insert", { doc: payload });
        toast.success("Contrat créé !");
        router.replace(`/desk/netplus/Service Contract/${res.message?.name || res.name}`);
      } else {
        res = await frappe.call<any>("frappe.client.save", { doc: payload });
        toast.success("Contrat sauvegardé !");
        setDoc(res.message || res);
      }
    } catch (e: any) { toast.error(e.message || "Erreur lors de la sauvegarde"); }
    finally { setSaving(false); }
  }

  if (loading) return (
    <AppShell>
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-brand-500 w-8 h-8" />
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-white sticky top-0 z-20 -mx-6 -mt-6 mb-6">
        <div className="flex items-center gap-3">
          <Link href="/desk/netplus/Service Contract" className="text-ink-secondary hover:text-ink-primary"><ChevronLeft className="w-5 h-5" /></Link>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-tertiary mb-0.5">
               <Link href="/desk" className="hover:text-ink-primary transition">Desk</Link>
               <span className="opacity-50">/</span>
               <Link href="/desk/netplus" className="hover:text-ink-primary transition">NetPlus</Link>
               <span className="opacity-50">/</span>
               <Link href="/desk/netplus/Service Contract" className="hover:text-ink-primary transition">Service Contract</Link>
            </div>
            <h1 className="text-lg font-semibold text-ink-primary">{isNew ? "Nouveau Contrat de Service" : doc.name}</h1>
            {!isNew && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${doc.status === "Active" ? "bg-emerald-100 text-emerald-700" : doc.status === "Annulé" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{doc.status || "Brouillon"}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {!isNew && (
            <button onClick={() => window.open("http://localhost:8000/app/doc_flow#service_contract", "_blank")} className="flex items-center gap-2 border border-brand-300 text-brand-700 hover:bg-brand-50 px-4 py-2 rounded-lg text-sm font-medium transition">
              <FileText className="w-4 h-4" /> Générer PDF (Doc Flow)
            </button>
          )}
          {!isNew && doc.status === "Brouillon" && (
            <button onClick={async () => { setSaving(true); try { await frappe.call("frappe.client.set_value", { doctype: "Service Contract", name: doc.name, fieldname: "status", value: "Active" }); set("status", "Active"); toast.success("Contrat activé"); } catch(e:any){toast.error(e.message);} finally{setSaving(false);} }} className="flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition">
              <CheckSquare className="w-4 h-4" /> Valider
            </button>
          )}
          <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-ink-primary hover:bg-ink-secondary text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Infos générales */}
          <section className="bg-white rounded-2xl border border-line p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-ink-secondary uppercase tracking-wide mb-4">Informations générales</h2>
            <div className="grid grid-cols-2 gap-4">
              <LinkField label="Client" value={doc.party_name || ""} doctype="Customer" roleFilter="NetPlus Client" onChange={v => set("party_name", v)} />
              <LinkField label="Superviseur" value={doc.superviseur || ""} doctype="Employee" roleFilter="NetPlus Supervisor" onChange={v => set("superviseur", v)} />
              <div>
                <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Date d'entrée en vigueur</label>
                <input type="date" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.date_entree_en_vigueur || ""} onChange={e => set("date_entree_en_vigueur", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Date d'expiration</label>
                <input type="date" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.date_expiration || ""} onChange={e => set("date_expiration", e.target.value)} />
              </div>
              <TypeSelector label="Type(s) de service" value={doc.type_de_service || ""} onChange={v => set("type_de_service", v)} />
              <div>
                <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Mode d'équipe</label>
                <select className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.mode_d_equipe || ""} onChange={e => set("mode_d_equipe", e.target.value)}>
                  <option value="">Sélectionner…</option>
                  <option value="Solo">Solo</option>
                  <option value="Duo">Duo</option>
                  <option value="Équipe">Équipe</option>
                </select>
              </div>
            </div>
          </section>

          {/* Tarification */}
          <section className="bg-white rounded-2xl border border-line p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-ink-secondary uppercase tracking-wide mb-4">Tarification & Facturation</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Tarif / intervention</label>
                <input type="number" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.tarif_par_intervention || ""} onChange={e => set("tarif_par_intervention", parseFloat(e.target.value))} placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Devise</label>
                <input className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.devise || "TND"} onChange={e => set("devise", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Cycle de facturation</label>
                <select className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.cycle_de_facturation || ""} onChange={e => set("cycle_de_facturation", e.target.value)}>
                  <option value="">Sélectionner…</option>
                  <option value="Mensuel">Mensuel</option>
                  <option value="Hebdomadaire">Hebdomadaire</option>
                  <option value="Annuel">Annuel</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Délai de paiement (jours)</label>
                <input type="number" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.delai_de_paiement || ""} onChange={e => set("delai_de_paiement", parseInt(e.target.value))} placeholder="30" />
              </div>
            </div>
          </section>

          {/* Sites */}
          <section className="bg-white rounded-2xl border border-line p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-ink-secondary uppercase tracking-wide">Sites du contrat</h2>
              <button onClick={addSite} className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700 text-sm font-medium">
                <Plus className="w-4 h-4" /> Ajouter un site
              </button>
            </div>
            <div className="space-y-4">
              {(doc.sites_du_contrat || []).length === 0 && (
                <div className="border-2 border-dashed border-line rounded-xl p-8 text-center text-ink-tertiary text-sm">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Aucun site ajouté. Cliquez "Ajouter un site" pour commencer.
                </div>
              )}
              {(doc.sites_du_contrat || []).map((site, idx) => (
                <div key={site._id || idx} className="border border-line rounded-xl p-4 space-y-3 bg-surface/40">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink-primary">Site {idx + 1}</span>
                    <button onClick={() => removeSite(idx)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Adresse</label>
                    <input className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={site.address} onChange={e => updateSite(idx, { address: e.target.value })} placeholder="Ex: 12 Rue de la Paix, Tunis" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Latitude</label>
                      <input className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={site.lat} onChange={e => updateSite(idx, { lat: e.target.value })} placeholder="36.8065" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Longitude</label>
                      <input className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={site.lng} onChange={e => updateSite(idx, { lng: e.target.value })} placeholder="10.1815" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Rayon (m)</label>
                      <input type="number" className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={site.rayon} onChange={e => updateSite(idx, { rayon: parseInt(e.target.value) || 200 })} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Pointage GPS</label>
                    <MapPinPicker site={site} onChange={(s) => updateSite(idx, s)} loaded={mapsLoaded} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Notes */}
          <section className="bg-white rounded-2xl border border-line p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-ink-secondary uppercase tracking-wide mb-4">Notes & Conditions</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Lois applicables</label>
                <input className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={doc.lois_applicables || ""} onChange={e => set("lois_applicables", e.target.value)} placeholder="Ex: Code du travail tunisien — Art. 123" />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1 block">Notes</label>
                <textarea rows={4} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" value={doc.notes || ""} onChange={e => set("notes", e.target.value)} placeholder="Informations complémentaires…" />
              </div>
            </div>
          </section>

        </div>
      </div>
    </AppShell>
  );
}
