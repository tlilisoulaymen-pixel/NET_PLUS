# NetPlus — Guide d'intégration ERPNext / Frappe + Google Maps Platform

## 1. Installation dans votre bench ERPNext existant

```bash
cd frappe-bench
bench get-app /path/to/netplus_app        # or push it to a git repo and get-app <url>
bench --site yoursite install-app netplus
bench --site yoursite migrate
bench restart
```

`install-app` exécute `netplus/install.py` qui crée automatiquement :

- les 3 rôles portail (**NetPlus Supervisor / Operator / Client**, `desk_access = 0`) ;
- les **custom fields** sur `Task` (mission), `Location` (site géofencé) et
  `Quality Feedback` (note globale, commentaire, NPS…) — aucun doctype core
  n'est forké, tout survit à `bench update` ;
- le **Quality Feedback Template** « Prestation Nettoyage » (5 paramètres) ;
- les valeurs par défaut de **NetPlus Settings** (rayon 200 m, précision
  100 m, seuils 5/15/30 min, TTL 72 h, rétention GPS 90 j).

## 2. Mise en place des utilisateurs (le point critique)

| Rôle NetPlus | User Frappe | Lien données | user_type |
|---|---|---|---|
| Super Admin | System Manager | — | System User (Desk complet) |
| Superviseur | + rôle `NetPlus Supervisor` | Employee (`user_id`) | **Website User** |
| Opérateur | + rôle `NetPlus Operator` | Employee (`user_id`) | **Website User** |
| Client | + rôle `NetPlus Client` | Contact → Customer | **Website User** |

1. Créez chaque **Employee** ERPNext et renseignez `user_id` (son compte User).
2. **Relation superviseur ↔ opérateur = champ natif `Employee.reports_to`.**
   L'équipe d'un superviseur est simplement l'ensemble des Employees dont
   `reports_to` pointe vers lui — c'est ce que `portal_api._team_of()` requête.
3. Pour chaque client : User (website) + Contact lié au Customer
   (Dynamic Link) — `portal_api._customer_for_user()` suit cette chaîne.
4. Convertissez les rôles portail en Website Users :

```bash
bench --site yoursite execute netplus.setup_users.convert_to_website_users
```

Un Website User **ne peut pas ouvrir /app** : plus aucun module Desk visible,
sans JS de masquage. `netplus/auth.py` route ensuite chaque rôle à la
connexion : opérateur → `/netplus-pwa`, superviseur & client → `/portal`,
admin → Desk natif ERPNext (tous les modules + les doctypes NetPlus).

## 3. Correspondance données ↔ modules ERPNext

| Donnée NetPlus | Où elle vit | Module |
|---|---|---|
| Mission | `Task` + champs custom + table enfant `Mission Operator` | Projects |
| Site géofencé | `Location` (lat/lng natifs + rayon custom) | Assets |
| Pointage GPS | lignes `Mission Operator` (timestamps + coords) | — |
| Feedback | `Quality Feedback` (+ template 5 paramètres) | Quality |
| Contrat | `Service Contract` (doctype NetPlus) | — |
| Client | `Customer` / Contact | Selling |
| Facturation | à brancher : Timesheet → Sales Invoice (voir §7) | Accounting |

## 4. Intégration Google Maps Platform / Firebase

Créez un projet Google Cloud, activez **Maps JavaScript API**, **Geocoding
API**, (optionnel : Places, Directions), générez 2 clés :

- **Clé navigateur** (restreinte à votre domaine, Maps JS API) → collez-la
  dans **NetPlus Settings › Clé API Google Maps**. La PWA opérateur charge la
  carte, le marqueur du site, le cercle de géofence et la position temps réel
  (`navigator.geolocation.watchPosition`, équivalent web du
  FusedLocationProviderClient).
- **Clé serveur** (restreinte par IP, Geocoding API) — le hook
  `Location.before_save` géocode l'adresse du site à la création
  (`netplus/utils/geo.py::geocode_location_if_needed`). Vous pouvez utiliser
  la même clé au début, séparez-les en production.

**Règle de sécurité déjà appliquée** : le client mobile ne fait que de l'UX
(activer le bouton) ; `check_in()`/`check_out()` recalculent TOUJOURS la
distance haversine côté serveur contre les coordonnées stockées du site, et
rejettent précision > 100 m ou distance > rayon. Un GPS spoofé côté client
ne suffit donc pas.

**Places Autocomplete (admin)** : ajoutez un Client Script Desk sur Location
qui branche `google.maps.places.Autocomplete` sur le champ adresse — confort
de saisie uniquement, le géocodage serveur reste la source de vérité.

**FCM (push)** — points d'accroche prévus dans `tasks/alerts.py::_notify` :
1. Projet Firebase → Cloud Messaging → clé serveur + config web.
2. Ajoutez `firebase-messaging-sw.js` dans `netplus/public/` et demandez la
   permission notification dans la PWA ; stockez le token FCM sur le User
   (petit custom field `fcm_token`).
3. Dans `_notify()`, après le `frappe.sendmail`, POST vers
   `https://fcm.googleapis.com/v1/projects/<id>/messages:send`.
En attendant, chaque alerte part déjà par **email** et par
`frappe.publish_realtime` (websocket — le portail superviseur se rafraîchit
toutes les 60 s de toute façon).

**SMS (palier Critique)** : configurez **SMS Settings** (core Frappe) avec
votre passerelle (Twilio propose une API compatible) puis appelez
`frappe.core.doctype.sms_settings.sms_settings.send_sms` au point `TODO`
marqué dans `_notify()`.

## 5. QR contrat

`Service Contract.validate()` écrit `qr_payload` =
`{"contract_id": ..., "client_id": ..., "effective_date": ...}`.

- **Génération dans le PDF** : créez un Print Format Jinja et rendez le QR
  avec la lib `pyqrcode`/`qrcode` (installez `qrcode[pil]` dans le bench) :
  `{{ get_qr_svg(doc.qr_payload) }}` via une méthode Jinja whitelisted, ou
  un simple `<img src="https://api.qrserver.com/v1/create-qr-code/?data={{ doc.qr_payload | urlencode }}">`
  pour prototyper.
- **Vérification mobile** : l'onglet « Scanner QR » de la PWA lit le QR
  (BarcodeDetector natif Chrome/Android ; sur iOS ajoutez `html5-qrcode`) et
  appelle `verify_contract(payload)` qui confirme contrat + client + date
  d'effet + statut Active.

## 6. Tests de vérification

```bash
# 1. Un Website User ne peut pas ouvrir le Desk
curl -b op_cookies.txt -o /dev/null -w "%{http_code}" https://site/app     # attendu: 403/redirect

# 2. Check-in hors périmètre rejeté (serveur)
#    -> appeler check_in avec des coords à >200m : doit lever "Hors zone"

# 3. Token feedback: soumettre 2x le même token -> "existe déjà"
# 4. Mot interdit dans le commentaire -> rejet serveur
# 5. bench --site X execute netplus.utils.scoring.recompute_all_scores
```

## 7. Étapes suivantes recommandées

1. **Facturation** : au check-out, créer aussi un Timesheet (billable) lié au
   Project du client → bouton natif « Create Sales Invoice ». Le champ
   `rate_per_intervention` du contrat donne le tarif.
2. **Remplacer les pages www par votre build React** (`netplus-erp`) : les
   pages `/portal`, `/netplus-pwa`, `/feedback` fournies ici sont
   fonctionnelles mais volontairement simples ; l'API
   (`netplus.api.portal_api`) est la même — pointez vos composants React
   dessus et servez le build Vite depuis `netplus/www/portal/`
   (`base: '/portal/'`).
3. **Workspaces admin** : créez les 6 workspaces Desk (Missions, Alertes,
   Classement, Contrats, Feedback, Dashboard) avec les icônes SVG intégrées.
4. **Frappe HR (optionnel)** : si vous l'installez plus tard, le pointage
   peut en plus alimenter Employee Checkin/Attendance pour la paie.
