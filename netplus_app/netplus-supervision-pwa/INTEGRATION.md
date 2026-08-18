# NetPlus Supervision PWA — Guide d'intégration

Livrable : application superviseur mobile-first ("cockpit") — frontend +
backend Frappe — à fusionner dans l'app existante `netplus_app`. Même
architecture que la PWA opérateur : aucune dépendance externe, aucun build
Node, fichiers statiques + endpoints Python whitelistés.

Route : **`/netplus-supervision`** (les pages `/portal` existantes restent
intactes ; cette app les complète côté mobile, elle ne les remplace pas).

## 0. Contenu du zip → destination dans `netplus_app`

| Fichier du zip | Destination | Rôle |
|---|---|---|
| `netplus/www/netplus_supervision.py` | `netplus_app/netplus/www/netplus_supervision.py` | Contrôleur (guard Guest + rôles, CSRF) |
| `netplus/www/netplus-supervision.html` | `netplus_app/netplus/www/netplus-supervision.html` | Coquille HTML |
| `netplus/public/supervision/app.js` | `netplus_app/netplus/public/supervision/app.js` | Application (SPA vanilla JS) |
| `netplus/public/supervision/app.css` | idem | Styles ("dark authority, light clarity") |
| `netplus/public/supervision/manifest.json` | idem | Manifest PWA (installable) |
| `netplus/public/supervision/icon.svg` | idem | Icône (dégradé nuit) |
| `netplus/api/supervisor_api.py` | `netplus_app/netplus/api/supervisor_api.py` | Tous les endpoints superviseur |

## 1. Pré-requis (mêmes règles que la PWA opérateur)

1. **Contrôleur en underscore** : `/netplus-supervision` → `netplus_supervision.py`
   (le HTML garde le tiret). Ne créez JAMAIS de `netplus-supervision.py`.
2. **Dépend de la PWA opérateur v2** : le doctype **Site Anomaly** (module
   `Netplus Core`) doit déjà être migré — l'onglet Anomalies du cockpit le lit
   et écrit son statut (`Ouverte` → `En cours` → `Résolue`).
3. `netplus` dans `sites/apps.txt` + pip-installée, `modules.txt` complet —
   sinon migrate saute l'app ou purge les doctypes (incidents déjà vus).

## 2. Installation

```bash
# copier les fichiers (tableau ci-dessus), puis :
docker exec frappe_docker-backend-1 bash -c "cd /home/frappe/frappe-bench && \
  bench build --app netplus && \
  bench --site frontend clear-cache && \
  bench --site frontend clear-website-cache"
docker compose restart backend frontend websocket
```

Pas de migration nécessaire : aucun nouveau doctype (le cockpit lit Task,
Mission Operator, Location, Employee, Operator Score, Site Anomaly,
Mission Alert, Notification Log).

### Redirection à la connexion (optionnel mais recommandé)

Pour que les superviseurs arrivent sur le cockpit mobile plutôt que sur
`/portal`, changez dans `hooks.py` :

```python
role_home_page = {
    "NetPlus Operator": "netplus-pwa",
    "NetPlus Supervisor": "netplus-supervision",   # au lieu de "portal"
    "NetPlus Client": "portal",
}
```

et la même valeur dans `netplus/auth.py::get_home_for()`. Le portail web
`/portal` reste accessible (item de menu "Portail complet" dans l'onglet
Profil du cockpit). Si vous préférez garder `/portal` par défaut, ne changez
rien : `/netplus-supervision` reste accessible directement.

## 3. FIELD map — aligner avec votre schéma (obligatoire)

`supervisor_api.py` embarque le même dict `FIELD` qu'`operator_api.py`
(champs custom de Task / Location / Mission Operator). **Les deux fichiers
doivent être identiques sur ce dict.** Champs utilisés ici :
`netplus_site`, `netplus_operators`, `operator_user`, `check_in_time`,
`check_out_time`, `checkout_out_of_zone`, `last_heartbeat`.

Autres dépendances de schéma (natif ERPNext, rien à créer) :
- `Employee.reports_to` → définit l'équipe du superviseur ;
- `Employee.cell_number` → bouton "📞 Appeler" (deep link `tel:`) ;
- `Task.expected_time` (heures) → anneaux de progression des missions actives.

`Mission Alert` et `Operator Score` sont **introspectés dynamiquement**
(`frappe.get_meta`) : si un champ (`status`, `operator`, `details`…) manque,
l'app dégrade proprement au lieu de planter.

## 4. Ce que fait le backend (`supervisor_api.py`)

- `bootstrap()` — 1 appel au chargement : profil, KPIs (missions du jour +
  delta vs hier, actifs/effectif, alertes + critiques, score équipe moyen),
  cartes équipe avec statut calculé (**en mission / en retard / disponible /
  hors ligne** — retard = mission du jour dont l'heure prévue est dépassée
  sans check-in), missions actives avec progression temps réel, aperçu
  alertes, top performeurs. Requêtes groupées, pas de N+1.
- `missions(scope)` — aujourd'hui / semaine / passées, avec statut agrégé
  par mission (planifiée / en cours / terminée / en retard) et état de
  chaque opérateur (pointé, hors zone).
- `alerts_feed()` — fil combiné **Site Anomaly + Mission Alert**, trié par
  date, avec niveau (critique / avertissement / passée) et téléphone de
  l'opérateur pour l'action Appeler.
- `acknowledge_alert()` — acquitte une Mission Alert (statut → Resolved).
- `anomalies()` / `review_anomaly(name, action)` — liste avec photos
  (pièces jointes privées) ; actions **Valider** (→ En cours), **Marquer
  résolue**, **Rejeter** (→ Résolue + trace). L'opérateur est notifié du
  verdict (Notification Log).
- `ranking()` — classement complet de l'équipe (Operator Score).

Sécurité : tous les endpoints exigent le rôle **NetPlus Supervisor** (ou
System Manager) ; l'équipe est TOUJOURS résolue côté serveur via
`Employee.reports_to` — un superviseur ne voit jamais l'équipe d'un autre.

## 5. Ce que fait le frontend

5 onglets : **Accueil** (header dynamique selon l'heure, KPI scroll
horizontal avec animation de comptage, alertes bordure-gauche colorée,
missions actives avec anneaux SVG, top performeurs 🥇🥈🥉), **Équipe**
(grille 2 colonnes, bandeau + dot de statut, filtre Tous / En mission / En
retard, tap = appel), **Missions** (segmented Aujourd'hui / Semaine /
Passées, layout bloc-temps + séparateur + avatars empilés), **Alertes**
(timeline à ligne centrale + segment Anomalies : cartes média-rich avec
photo réelle du signalement, Valider / Rejeter, badge rouge sur l'onglet
avec bounce), **Profil** (héro dégradé nuit, 3 stats, menu, déconnexion).

Décisions reprises de la spec : noir = couleur d'interaction (pas de bleu
sur les boutons primaires), pastels de statut (fonds 10 %), dégradés
d'avatar uniques générés du hash du nom, grille 8pt stricte, empty states
avec personnalité, rafraîchissement auto toutes les 60 s (+ vibration si
nouvelle alerte).

## 6. Tests de vérification

```bash
# Guest redirigé (attendu : 301 -> /login?redirect-to=/netplus-supervision)
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:8080/netplus-supervision

# Un opérateur qui tape l'URL est renvoyé vers SA page (attendu : 301 -> /netplus-pwa)
# Un superviseur obtient 200 :
curl -s -c s.txt -H "Content-Type: application/json" \
  -d '{"usr":"supervisor1@netplus.ca","pwd":"Netplus123!"}' http://localhost:8080/api/method/login
curl -s -b s.txt -o /dev/null -w "%{http_code}\n" http://localhost:8080/netplus-supervision

# bootstrap (attendu : JSON kpis + team + active_missions)
curl -s -b s.txt -X POST http://localhost:8080/api/method/netplus.api.supervisor_api.bootstrap

# Isolation d'équipe : un opérateur appelant l'API doit recevoir 403
curl -s -b op_cookies.txt -X POST \
  http://localhost:8080/api/method/netplus.api.supervisor_api.bootstrap   # attendu: PermissionError
```

Scénario bout-en-bout : opérateur signale une anomalie depuis `/netplus-pwa`
→ badge Alertes du cockpit s'incrémente (≤ 60 s) → Valider → l'opérateur
reçoit la notification "prise en charge" → Marquer résolue.

## 7. Notes

- Les photos d'anomalies étant privées, elles ne s'affichent que pour les
  rôles autorisés sur Site Anomaly (le superviseur l'est).
- Pas de service worker : app en ligne uniquement, cohérent avec un cockpit
  temps réel.
- Le graphique d'évolution du score (spec §7) nécessite un historique de
  scores ; Operator Score ne stocke que la valeur courante. Point d'accroche
  prévu : stocker un instantané quotidien dans le job nightly
  `recompute_all_scores`, puis brancher une sparkline SVG dans `V.ranking`.
