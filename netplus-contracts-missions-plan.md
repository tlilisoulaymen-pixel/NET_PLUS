# NetPlus — Hiérarchie des comptes, Contrats de service & Missions
## Analyse du flow + prompt de build complet pour l'AI développeur

---

# PARTIE A — ÉTUDE DU FLOW (scénarios, points de friction, risques)

## A.1 La chaîne complète

```
Superadmin (Administrator / admin)
   └─ crée → Admin (sous-ensemble de permissions choisies par page frontend)
                ├─ crée → Client (compte netplus / Customer)
                ├─ crée → Opérateur (System User, rôle "NetPlus Operator")
                └─ crée → Superviseur (System User, rôle "NetPlus Supervisor" + Employee)

Admin/Superadmin
   └─ crée → Service Contract (client, superviseur, jours d'intervention, sites, tarif…)
                └─ sauvegarde → liste des contrats → Doc Flow (aperçu A4, QR, print)
                └─ crée → Mission (contrat lié → client auto-rempli, site + géofence,
                                   fenêtre horaire/récurrence, opérateurs assignés)
                             └─ sauvegarde → NOTIFICATION IMMÉDIATE aux apps des
                                opérateurs/superviseurs → le pointage fonctionne
```

Le flow tient debout **si** les verrous suivants sont posés — chacun correspond à un
scénario qui casserait en production sans eux.

## A.2 Scénarios critiques étudiés

### Hiérarchie des comptes
1. **Admin ≠ System Manager.** L'admin doit recevoir un rôle dédié (ex. `NetPlus Admin`)
   dont les permissions DocType sont configurées via le **Permission Manager** de Frappe,
   et la page frontend de gestion des permissions ne fait que lire/écrire ces enregistrements
   (`DocPerm` / Custom DocPerm). JAMAIS une permission stockée côté frontend seul : le
   backend re-valide chaque appel — sinon un admin malveillant contourne l'UI.
2. **Le superadmin choisit les permissions de l'admin** → page frontend qui édite les
   `Custom DocPerm` du rôle `NetPlus Admin` : matrice DocTypes × 12 opérations
   (read/write/create/delete/submit/cancel/amend/report/print/export/import/share).
3. **Création de Client** = `Customer` (ERPNext) **+ optionnellement un User Website**
   lié (accès portail). Ne pas confondre les deux : un client n'a pas besoin d'un login.
4. **Opérateur/Superviseur** = User (System User) + Employee lié. Le superviseur doit
   avoir `reports_to` = l'admin (alimente le Tracking Center). 
   **Règle absolue d'auto-provisioning :** Tout User ayant un rôle `NetPlus Operator` ou `NetPlus Supervisor` doit automatiquement se voir créer et lier une fiche `Employee` active (via API `provisionstaff` et un filet de sécurité `doc_events`). Le frontend ne manipule l'identité que via des fiches Employee pour respecter l'écosystème RH de Frappe.

### Service Contract
5. **Sélection Client style ERPNext** : autocomplete serveur (`frappe.desk.search.search_link`
   = le mécanisme standard des Link fields) avec bouton « + Créer un nouveau client » qui
   ouvre un quick-entry modal, crée le Customer, puis le sélectionne automatiquement.
6. **Sites du contrat** (child table) : chaque site porte adresse + lat/lng + rayon geofence.
   C'est **ici** que vivent les localisations — la Mission ne fait que les référencer.
7. **Contrat expiré** : validation serveur — impossible de créer une Mission sur un contrat
   dont `date_expiration < today` ou `statut != Active`.
8. **Tarif + devise** : devise par défaut = devise de la company ; cycle de facturation et
   délai de paiement alimentent plus tard la facturation récurrente — les stocker même si
   la facturation n'est pas encore construite.
9. **Sauvegarde → Doc Flow** : le contrat suit exactement le pattern du module Doc Flow
   (liste → création → aperçu A4 iframe srcdoc → QR de référence → print). Le QR encode
   la référence contrat + client + dates — scannable par un superviseur sur site.

### Mission
10. **Client auto-dérivé du contrat** : dès que `Service Contract` est choisi, Client,
    Superviseur par défaut et la **liste des sites du contrat** se remplissent. Le champ
    Adresse/Lat/Lng devient un sélecteur de sites existants + option « nouvelle adresse ».
    C'est le pattern ERPNext (« pull from linked doc ») — toujours offrir l'existant avant
    de saisir du nouveau.
11. **Géofence** : lat/lng obligatoires, rayon par défaut 200 m. UX : mini-carte Google Maps
    avec pin déplaçable au lieu de deux champs numériques — un pointage GPS saisi à la main
    est toujours faux.
12. **Fenêtres d'activité — les 3 modèles à supporter** :
    - **Période** : `start_datetime` → `end_datetime` (mission ponctuelle, ex. intervention X).
    - **Récurrente hebdo** : jours de semaine (lun–ven) + plage horaire (a→b) + dates
      d'exclusion (child table `excluded_dates`) + fin de récurrence (6 mois).
    - **Durée limitée** : date début → date fin + plage horaire quotidienne.
    Le serveur matérialise cela en une méthode `is_mission_active(mission, at_datetime)` —
    c'est ELLE qui autorise le pointage, pas l'app.
13. **Notification immédiate à la sauvegarde** : à `doc.submit()` (ou insert validé),
    publier via **Frappe realtime** (`frappe.publish_realtime(event="new_mission",
    user=<chaque opérateur/superviseur>)`) + une Notification. L'app écoute le socket et
    rafraîchit la liste des missions — pas de push natif nécessaire en v1 (PWA/websocket).
14. **Pointage lié au geofence** : l'app de l'opérateur n'autorise « Pointer l'arrivée » que
    si `distance(GPS_opérateur, site) <= rayon` ET `is_mission_active() == true` ; le serveur
    **re-vérifie** les deux à l'enregistrement du pointage (jamais confiance au client).
    Le pointage écrit dans le même mécanisme de positions que le Tracking Center.
15. **Conflits d'affectation** : un opérateur ne peut pas avoir deux missions dont les
    fenêtres se chevauchent — validation serveur au save de la Mission avec message clair
    (« X est déjà assigné à Mission M-0003 le jeudi 9h-12h »).
16. **États** : Brouillon → Planifiée → En cours → Terminée / Annulée. La transition
    « En cours » est automatique au premier pointage, « Terminée » à la fin de fenêtre +
    pointage de sortie (ou clôture manuelle par le superviseur).

### Sécurité transverse
17. Chaque endpoint : `frappe.has_permission` sur le DocType + User Permissions
    (un superviseur ne voit que SES missions/opérateurs via row-level restrictions).
18. Tout ce que le frontend affiche comme « choix » (clients, sites, contrats, opérateurs)
    vient de requêtes serveur filtrées par permissions — jamais de listes embarquées.

## A.3 Résumé des objets à créer côté Frappe

| Objet | Type | Champs clés |
|---|---|---|
| Rôles `NetPlus Admin` / `NetPlus Operator` / `NetPlus Supervisor` | Role | + Custom DocPerm |
| Service Contract | DocType (existant dans votre backend) | statut, dates, superviseur, client, type_service, mode_équipe, tarif, devise, cycle, délai, **Jours d'intervention** (child), **Sites** (child: adresse/lat/lng/rayon), lois, notes |
| Mission | DocType (existant) | contrat, client (fetch_from), superviseur, statut, type, mode_équipe, site (link vers Site du contrat OU adresse libre + lat/lng/rayon), instructions, début/fin prévus, **récurrence** (fréquence, jours, heure début/fin, dates exclues, fin de récurrence), **Opérateurs assignés** (child), notes internes |
| Mission Attendance (pointage) | DocType nouveau | mission, opérateur, check_in/check_out, lat/lng de chaque pointage, distance_au_site, statut (validé/hors-zone) |

---

# PARTIE B — PROMPT POUR L'AI DÉVELOPPEUR

Copiez-collez le bloc ci-dessous tel quel :

```
Build the NetPlus account hierarchy + Service Contract + Mission flow in our
Next.js frontend (netplus-desk, App Router, [locale]) backed by Frappe/ERPNext.
All permissions are enforced server-side by Frappe; the frontend NEVER grants access.

=== 1. ACCOUNT HIERARCHY ===

Create roles NetPlus Admin / NetPlus Operator / NetPlus Supervisor via fixtures.

SUPERADMIN (Administrator) creates ADMINS:
- Page /desk/netplus/AdminPermissions: reads & writes Custom DocPerm rows for the role
  "NetPlus Admin" — matrix DocTypes x 12 operations (read, write, create, delete, submit,
  cancel, amend, report, print, export, import, share). Save = PUT via
  frappe.client on "Custom DocPerm". Superadmin-only page (check roles client-side,
  Frappe re-checks server-side).

ADMIN (and superadmin) creates:
- CLIENT: POST /api/resource/Customer (+ optional linked Website User for portal access).
- OPERATOR/SUPERVISOR: Uses a bespoke User form.
  -> AUTO-PROVISIONING REQUIREMENT: A single whitelisted method (`netplus.api.provisionstaff`) 
     creates the User (with NetPlus Operator/Supervisor role), creates the linked Employee 
     (status=Active, reports_to=admin), and returns the Employee ID.
  -> SAFETY NET: A `doc_events` hook on User (`after_insert` / `on_update`) guarantees 
     that ANY User with a NetPlus role automatically gets an Employee record, regardless of origin.
  -> FRONTEND: The `LinkField` for Supervisor strictly queries the `Employee` DocType, 
     filtered by `user_id IN (...)` mapped to the "NetPlus Supervisor" role.

=== 2. SERVICE CONTRACT ===
Route: /desk/netplus/Service Contract/new and [name]. Bespoke form (no generic renderer).
Fields (existing DocType): Statut, Date d'entrée en vigueur, Date d'expiration, Version,
Superviseur (Link Employee), Client (Link Customer), Type de service, Mode d'équipe,
Chef d'équipe requis, Tarif par intervention, Devise (default = company currency),
Cycle de facturation, Délai de paiement (jours), Jours d'intervention (child grid),
Sites du contrat (child grid: adresse, latitude, longitude, rayon geofence, default 200),
Lois applicables, Notes.

LINK FIELD UX (ERPNext-style, applies to ALL Link fields in both forms):
- Autocomplete calling frappe.desk.search.search_link (server-filtered by permissions),
  debounce 300ms, keyboard navigable.
- "+ Créer" option at the bottom of every dropdown -> quick-entry modal -> creates the
  record -> auto-selects it.
- Sites child grid: each row has a mini Google Maps pin picker (drag = set lat/lng)
  instead of raw number fields.

After save: contract appears in the list view and follows the Doc Flow pattern already
installed: Aperçu modal (iframe srcdoc, A4), reference QR code (PS_QR), print/download,
Brouillon/Valider actions.

Server validations (DocType controller):
- date_expiration > date_entree_en_vigueur.
- At least one site and one intervention day when statut = Active.

=== 3. MISSION ===
Route: /desk/netplus/Mission/new and [name]. Fields (existing DocType): Contrat de
service (Link), Client (fetch_from contract.client, read-only), Superviseur (default
from contract, editable), Statut, Type, Mode d'équipe, Site selector, Instructions,
Début/Fin prévus, Opérateurs assignés (child), Notes internes.

SITE SELECTION UX:
- When a contract is picked, its Sites become the options of a "Site" dropdown;
  selecting one fills adresse/lat/lng/rayon (read-only).
- "Nouvelle adresse" option unlocks manual address + map pin picker + rayon (200 default).

ACTIVITY WINDOWS — support 3 models with a single recurrence UI:
- PONCTUELLE: début prévu -> fin prévu (datetime).
- RÉCURRENTE HEBDO: weekday checkboxes (Lun..Dim), plage horaire (heure début/fin),
  child table Dates exclues, date de fin de récurrence (e.g. +6 mois).
- PÉRIODE CONTINUE: date début -> date fin + plage horaire quotidienne.
Server: implement whitelisted is_mission_active(mission, at_datetime) evaluating the
model — the pointage system calls ONLY this method.

ON SAVE (docstatus submit or validated insert):
- Publish frappe.publish_realtime("new_mission", {...}, user=<each assigned operator
  and supervisor>) + create a Frappe Notification per user.
- Frontend app subscribes to the socket and refreshes the mission list instantly.

SERVER VALIDATIONS:
- Contract must be Active and not expired.
- No overlapping windows for the same operator (clear message naming the conflict).
- lat/lng mandatory; rayon >= 10m.

=== 4. POINTAGE (MISSION ATTENDANCE) ===
New DocType: mission, operateur, check_in, check_out, check_in_lat/lng,
check_out_lat/lng, distance_au_site, statut (Valide / Hors zone).
Whitelisted method record_checkin(mission, lat, lng):
- verifies is_mission_active(mission, now) -> else 403 with the window details.
- verifies haversine distance <= site rayon -> else saves as "Hors zone" + flags it.
- writes the position into the Tracking Center cache (same mechanism as
  tracking_center.api.report_location) so the live map reflects it.

=== 5. INTEGRATION WITH EXISTING MODULES ===
- Service Contract list + preview reuse Doc Flow components (.df-*) and Print Studio
  default templates; QR payload = contract name + client + dates.
- Missions/pointages surface in Tracking Center (operators tab + live map).
- Everything permission-gated: NetPlus Admin sees all NetPlus docs; Supervisors see
  only missions/operators in their scope via User Permissions (row-level).

=== 6. STATES ===
Mission: Brouillon -> Planifiée -> En cours (auto on first valid check-in) ->
Terminée (auto at window end + check-out, or manual supervisor close) / Annulée.

=== 7. TESTS ===
1. Superadmin grants NetPlus Admin only "Service Contract: read/write/create" -> admin
   cannot open Mission (clean 403 state).
2. Create client via quick-entry inside the contract form -> auto-selected.
3. Contract Active with 2 sites -> mission site dropdown lists exactly those 2.
4. Recurrent mission Lun-Ven 08:00-12:00, excluded 2026-08-25 -> is_mission_active
   true on 2026-08-24 09:00, false on 2026-08-25 09:00.
5. Assign operator to two overlapping missions -> save rejected with conflict message.
6. Save mission -> operator's app receives new_mission event without refresh.
7. Check-in at 300m from site (rayon 200) -> saved as Hors zone; check-in outside the
   window -> refused with window details.
8. Saved contract -> appears in list, Aperçu opens A4 with QR, print is clean.
```

---

# PARTIE C — Ce qui rend les formulaires plus faciles (résumé pour vous)

1. **Toujours proposer l'existant avant de saisir** : autocomplete serveur + quick-entry
   « + Créer » dans chaque liste déroulante — le pattern ERPNext, généralisé.
2. **Le contrat pilote la mission** : client, superviseur, sites hérités automatiquement ;
   l'admin ne ressaisit jamais une information déjà connue.
3. **La carte remplace les chiffres** : pin Google Maps déplaçable au lieu de lat/lng tapés
   à la main (source n°1 d'erreurs de geofence).
4. **Le serveur est le seul juge** : fenêtre active, distance geofence, conflits
   d'affectation — l'app affiche, le backend décide. Zéro pointage falsifié.
5. **Notification temps réel** via websocket Frappe à la sauvegarde — la mission arrive
   sur l'app de l'opérateur sans qu'il rafraîchisse, donc le pointage peut démarrer
   immédiatement.
