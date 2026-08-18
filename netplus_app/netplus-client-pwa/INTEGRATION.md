# NetPlus Client PWA — Guide d'intégration

Livrable : application client mobile-first ("portail de confiance") —
frontend + backend Frappe — à fusionner dans l'app existante `netplus_app`.
Même architecture que les PWA opérateur et superviseur : zéro dépendance,
aucun build Node, fichiers statiques + endpoints Python whitelistés.

Route : **`/netplus-client`**. Palette 100 % extraite du logo :
vert feuille `#4FC221`, bleu profond `#00537F`, fonds clairs `#E8F7E2` /
`#E0F0F9`, fond app `#FAFDF9`.

## 0. Contenu du zip → destination dans `netplus_app`

| Fichier du zip | Destination | Rôle |
|---|---|---|
| `netplus/www/netplus_client.py` | `netplus_app/netplus/www/netplus_client.py` | Contrôleur (guard Guest + rôles, CSRF) |
| `netplus/www/netplus-client.html` | `netplus_app/netplus/www/netplus-client.html` | Coquille HTML |
| `netplus/public/client/app.js` | `netplus_app/netplus/public/client/app.js` | Application (SPA vanilla JS) |
| `netplus/public/client/app.css` | idem | Styles (palette logo) |
| `netplus/public/client/manifest.json` | idem | Manifest PWA (installable) |
| `netplus/public/client/icon.svg` | idem | Icône (dégradé vert→bleu) |
| `netplus/api/client_api.py` | `netplus_app/netplus/api/client_api.py` | Tous les endpoints client |

## 1. Pré-requis (mêmes règles que les deux autres PWA)

1. **Contrôleur en underscore** : `/netplus-client` → `netplus_client.py`
   (le HTML garde le tiret). Ne créez JAMAIS de `netplus-client.py`.
2. `netplus` dans `sites/apps.txt` + pip-installée, `modules.txt` complet.
3. **Chaîne client** : User (Website) → Contact (`user`) → Dynamic Link →
   Customer. Sans cette chaîne, l'app affiche "Aucun client associé" — c'est
   le même prérequis que `portal_api._customer_for_user()`.
4. **Missions client** : `Task.project` → `Project.customer`. Les missions
   sans Project (ou dont le Project n'a pas de customer) sont invisibles
   pour le client — vérifiez que vos missions clients sont bien rattachées
   à un Project du Customer.

## 2. Installation

```bash
# copier les fichiers (tableau ci-dessus), puis :
docker exec frappe_docker-backend-1 bash -c "cd /home/frappe/frappe-bench && \
  bench build --app netplus && \
  bench --site frontend clear-cache && \
  bench --site frontend clear-website-cache"
docker compose restart backend frontend websocket
```

Pas de migration : aucun nouveau doctype (lit Task, Project, Location,
Contact, Customer, Quality Feedback [+ Template], Service Contract).

### Redirection à la connexion (optionnel)

```python
role_home_page = {
    "NetPlus Operator": "netplus-pwa",
    "NetPlus Supervisor": "netplus-supervision",
    "NetPlus Client": "netplus-client",   # au lieu de "portal"
}
```

et la même valeur dans `netplus/auth.py::get_home_for()`. `/portal` reste
accessible (menu "Portail complet" dans l'onglet Profil).

## 3. FIELD map — aligner avec votre schéma (obligatoire)

En tête de `client_api.py` :

- `task_site` : `netplus_site` (Link Task → Location) — même valeur que
  dans `operator_api.py` / `supervisor_api.py`.
- Custom fields **Quality Feedback** (posés par `install.py` — vérifiez les
  fieldnames réels) : `netplus_task` (Link Task), `netplus_customer`
  (Link Customer), `netplus_overall` (Float 1–5, note globale),
  `netplus_comment` (Small Text), `netplus_nps` (Int 0–10).
- `FEEDBACK_TEMPLATE = "Prestation Nettoyage"` — le template 5 paramètres
  créé par install.py ; les notes par paramètre remplissent la child table
  native (fieldtype Rating = fraction 0–1, conversion faite côté serveur).

`Service Contract` est introspecté dynamiquement (`customer`/`client`,
`status`, `effective_date`, `expiry_date`, `rate_per_intervention`) : si un
champ manque, la carte contrat dégrade proprement.

## 4. Ce que fait le backend (`client_api.py`)

- **Isolation stricte** : le Customer est résolu côté serveur à chaque appel ;
  `submit_feedback` vérifie que la mission appartient bien au client
  (Task → Project → Customer) avant d'écrire. Un client ne voit et ne note
  que SES interventions.
- `bootstrap()` — 1 appel : profil + satisfaction (moyenne, distribution
  3 barres 5★/4★/≤3★, tendance 12 derniers retours), interventions à
  évaluer, prochaines interventions, paramètres du template feedback.
- `interventions(scope)` — toutes / à venir / terminées, avec note déjà
  donnée le cas échéant.
- `submit_feedback(task, overall, ratings, comment, nps)` — anti-doublon
  (1 évaluation par mission), validation 1–5 et NPS 0–10, création Quality
  Feedback (+ submit si le doctype est submittable → déclenche votre hook
  `on_submit` de scoring opérateur). Le filtre de mots interdits existant
  (hook serveur) s'applique tel quel.
- `my_feedback()` / `contracts()` — historique et contrats du client.

## 5. Ce que fait le frontend

Onglets : **Accueil** (hero satisfaction dégradé vert→bleu — score /5 en
36 px, 3 barres de distribution animées ; cartes "À évaluer" ; prochaines
interventions), **Interventions** (segments Toutes / À venir / Terminées,
bouton Évaluer inline), **★ FAB central** (choisir une intervention →
évaluation), **Contrats**, **Profil**.

Flux feedback **< 30 s** : 5 grandes étoiles (obligatoire, avec libellé
émotionnel) → étoiles par paramètre, commentaire et NPS 0–10 **tous
optionnels** → envoi → plein écran de remerciement 💚 (peak-end). Historique
avec sparkline de tendance (aire verte + delta).

## 6. Tests de vérification

```bash
# Guest redirigé (attendu : 301 -> /login?redirect-to=/netplus-client)
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:8080/netplus-client

# Login client puis bootstrap (attendu : JSON satisfaction + to_rate)
curl -s -c cl.txt -H "Content-Type: application/json" \
  -d '{"usr":"jdupont@gestionimmo.ca","pwd":"Netplus123!"}' http://localhost:8080/api/method/login
curl -s -b cl.txt -X POST http://localhost:8080/api/method/netplus.api.client_api.bootstrap

# Double évaluation de la même mission (attendu : "Vous avez déjà évalué…")
# Feedback sur une mission d'un AUTRE client (attendu : PermissionError)
# Un opérateur sur /netplus-client (attendu : 301 -> /netplus-pwa)
```

Scénario bout-en-bout : le client note 5★ + commentaire → le hook
`on_feedback_submit` recalcule le score de l'opérateur → visible dans le
cockpit superviseur (classement) et la PWA opérateur (profil).

## 7. Notes

- La page `/feedback?token=…` (magic-link 72 h, sans login) reste inchangée
  et complémentaire : `/netplus-client` est l'espace connecté permanent.
- Pas de service worker : app en ligne uniquement.
- Le NPS est stocké par évaluation (`netplus_nps`) ; un rapport NPS agrégé
  côté Desk peut se construire en Report Builder sans code.
