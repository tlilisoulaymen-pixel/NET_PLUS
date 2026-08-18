# NetPlus Operator PWA v2 — Guide d'intégration

Livrable : PWA opérateur complète (frontend mobile-first + backend Frappe) à
fusionner dans l'app existante `netplus_app`. Aucune dépendance externe,
aucun build Node : fichiers statiques + endpoints Python.

## 0. Contenu du zip → destination dans `netplus_app`

| Fichier du zip | Destination | Rôle |
|---|---|---|
| `netplus/www/netplus_pwa.py` | `netplus_app/netplus/www/netplus_pwa.py` | Contrôleur de `/netplus-pwa` (guard Guest + rôles, CSRF) |
| `netplus/www/netplus-pwa.html` | `netplus_app/netplus/www/netplus-pwa.html` | Coquille HTML (remplace l'existante) |
| `netplus/public/pwa/app.js` | `netplus_app/netplus/public/pwa/app.js` | Application (SPA vanilla JS) |
| `netplus/public/pwa/app.css` | `netplus_app/netplus/public/pwa/app.css` | Styles |
| `netplus/public/pwa/manifest.json` | idem | Manifest PWA (installable) |
| `netplus/public/pwa/icon.svg` | idem | Icône |
| `netplus/api/operator_api.py` | `netplus_app/netplus/api/operator_api.py` | Tous les endpoints opérateur |
| `netplus/netplus_core/doctype/site_anomaly/*` | `netplus_app/netplus/netplus_core/doctype/site_anomaly/` | Nouveau DocType **Site Anomaly** + notifications superviseur |

## 1. Pré-requis CRITIQUES (leçons des incidents précédents)

1. **Contrôleur en underscore.** Frappe résout le contrôleur d'une page www
   en remplaçant les tirets par des underscores : `/netplus-pwa` →
   `netplus_pwa.py`. **Supprimez tout ancien `netplus-pwa.py`** (avec tiret) :
   il ne sera jamais chargé et sème la confusion.
2. **App réellement enregistrée.** `netplus` doit être dans
   `sites/apps.txt` ET pip-installée dans le bench
   (`./env/bin/pip install -e apps/netplus`). Sinon `migrate` ignore l'app.
3. **`modules.txt` complet.** Le DocType Site Anomaly est déclaré dans le
   module `Netplus Core`. Si `modules.txt` ne contient pas exactement
   `Netplus Core`, le prochain `migrate` le **supprimera comme orphelin**
   (incident déjà vécu). Vérifiez avant de migrer.

## 2. Installation

```bash
# 1. Copier les fichiers (voir tableau ci-dessus), puis :
docker exec frappe_docker-backend-1 bash -c "cd /home/frappe/frappe-bench && \
  bench --site frontend migrate && \
  bench --site frontend clear-cache && \
  bench --site frontend clear-website-cache"

# 2. Lien assets (si /assets/netplus/ ne répond pas déjà) :
docker exec frappe_docker-backend-1 bash -c "cd /home/frappe/frappe-bench && bench build --app netplus"

docker compose restart backend frontend websocket
```

`migrate` crée le DocType **Site Anomaly** (module Netplus Core) avec ses
permissions : NetPlus Operator (créer/lire), NetPlus Supervisor (lire/écrire),
System Manager (tout).

## 3. Adapter le FIELD map (obligatoire, 5 minutes)

Tous les noms de champs custom sont centralisés dans le dict `FIELD` en tête
de `netplus/api/operator_api.py`. Alignez chaque valeur avec les fieldnames
réels de l'app existante :

- `task_site` : champ Link de **Task** vers Location
- `task_operators` : champ Table de **Task** vers Mission Operator
- `loc_radius` : champ Float de **Location** (rayon m) — vide → défaut Settings
- `mo_*` : champs de la table enfant **Mission Operator** (check-in/out,
  coords, heartbeat). Champs à AJOUTER s'ils n'existent pas encore :
  `checkout_out_of_zone` (Check), `out_of_zone_since` (Datetime),
  `out_of_zone_alerted` (Check), `last_heartbeat` (Datetime),
  `last_lat`/`last_lng` (Float).

Clés lues dans **NetPlus Settings** (défauts si absentes) :
`geofence_radius` (200), `gps_accuracy_threshold` (100),
`heartbeat_interval` (5 min), `out_of_zone_alert_minutes` (10).

## 4. Ce que fait le backend

- `bootstrap()` — **1 seul appel** au chargement : profil, missions + coords
  sites (requêtes groupées, pas de N+1), mission active, score, réglages.
- `check_in / check_out` — recalcul **haversine côté serveur** contre les
  coordonnées stockées du site ; précision > seuil ou distance > rayon ⇒
  rejet. Check-out hors zone : accepté mais **signalé au superviseur**
  (Notification Log + email + realtime).
- `heartbeat` — throttlé (≥ 60 s entre écritures) ; > 10 min hors zone ⇒
  alerte superviseur (une seule fois par sortie).
- `report_anomaly` — crée **Site Anomaly** + photos en pièces jointes
  privées ; le superviseur (`Employee.reports_to` → `user_id`) reçoit
  notification cloche + email + événement realtime `netplus_anomaly` ;
  gravité **Critique** ⇒ crée aussi un Mission Alert si le doctype existe.
- `resolve_site_qr` — QR site `{"s": "SITE-…"}` ou ID brut → coordonnées.
- `my_history / my_alerts / my_stats` — paginé, requêtes groupées.

## 5. Ce que fait le frontend

Onglets : **Accueil** (missions du jour + mission active), **Historique**
(paginé), **Scan** (bouton central caméra — QR site via BarcodeDetector,
repli saisie manuelle), **Alertes**, **Profil** (stats mois, score, logout).

Carte SVG légère (pas de Google Maps côté opérateur) avec les 5 états de la
spec : hors zone / approche / en zone / mission en cours / sortie de zone,
vibrations aux transitions, check-in activé uniquement en zone verte avec
précision suffisante, check-out hors zone protégé par double-tap. Le flux
anomalie : scan (cadres jaunes) → formulaire (chips type, gravité 3 niveaux,
photos compressées ≤ 1280 px min. 1 / max. 5, description) → envoi →
plein écran de confirmation.

La clé Google Maps de NetPlus Settings reste utilisée par le géocodage
serveur des sites (hook `Location.before_save` existant) — rien à changer.

## 6. Tests de vérification

```bash
# Guest redirigé (attendu : 301 -> /login?redirect-to=/netplus-pwa)
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:8080/netplus-pwa

# Login opérateur puis bootstrap (attendu : JSON avec missions)
curl -s -c c.txt -H "Content-Type: application/json" \
  -d '{"usr":"operator1@netplus.ca","pwd":"Netplus123!"}' \
  http://localhost:8080/api/method/login
curl -s -b c.txt -X POST http://localhost:8080/api/method/netplus.api.operator_api.bootstrap

# Check-in hors zone (attendu : erreur "Hors zone — vous êtes à …")
# Check-in précision 250m (attendu : erreur "Précision GPS insuffisante")
# Anomalie sans photo (attendu : erreur "Au moins une photo est obligatoire")
```

Dans le navigateur : superviseur connecté sur `/portal` → signaler une
anomalie depuis la PWA → la cloche du superviseur doit sonner (Notification
Log) + email (si `mute_emails` désactivé) + événement realtime.

## 7. Notes

- Les photos d'anomalies sont **privées** (`is_private=1`) : visibles des
  rôles ayant accès au doctype, pas des invités.
- Le manifest rend l'app installable ("Ajouter à l'écran d'accueil"). Pas de
  service worker inclus (hors scope `/assets/`) : l'app nécessite le réseau,
  ce qui est cohérent avec un pointage GPS temps réel.
- iOS < 17 n'a pas `BarcodeDetector` : le scan bascule automatiquement sur
  la saisie manuelle de l'ID site (prévu dans l'UI).
