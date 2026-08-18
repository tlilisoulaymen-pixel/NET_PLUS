# NetPlus — Desk Workspace Icons : le fix définitif

## Pourquoi RIEN n'a changé (4 causes réelles, vérifiées)

1. **`Desktop Icon` n'existe plus.** Ce doctype a été supprimé de Frappe
   depuis la v13. Les scripts qui « configurent les Desktop Icons » écrivent
   dans le vide (ou créent des lignes orphelines que rien ne lit). En v15/v16,
   la sidebar et les cartes viennent UNIQUEMENT du doctype **Workspace**.
2. **`Workspace.icon` n'accepte pas un chemin PNG.** Le champ contient le nom
   d'un symbole SVG du sprite d'icônes chargé dans le Desk
   (`<use href="#icon-<nom>">`). Mettre `/files/ws_icon_accounting.png`
   produit `<use href="#icon-/files/…">` → icône vide. Aucune règle CSS ne
   contourne proprement ce rendu.
3. **`/desk` n'est pas une route.** Le Desk est sur **`/app`** (établi plus
   tôt dans ce projet). Vérifier sur `/desk` montrera toujours « rien ».
4. **`bench migrate` écrase les Workspaces standards.** Chaque migrate
   resynchronise les workspaces ERPNext depuis leurs JSON d'app : toute
   modification d'icône faite en base est annulée au migrate suivant.
   C'est pour ça qu'un fix « one-shot » ne peut pas être permanent.

Le fix permanent = (a) un **sprite SVG netplus** contenant vos 14 PNG
embarqués en base64, injecté dans le Desk ; (b) un **apply() idempotent**
qui pose les noms d'icônes sur les Workspaces ; (c) le hook **`after_migrate`**
qui ré-applique automatiquement après chaque migrate. Zéro action manuelle
ensuite.

## Contenu du zip

| Fichier | Destination | Rôle |
|---|---|---|
| `build_icon_sprite.py` | exécuté une fois dans le conteneur | PNG → sprite SVG (base64) dans `netplus/public/icons/` |
| `netplus/setup/__init__.py` | `netplus_app/netplus/setup/__init__.py` | package |
| `netplus/setup/workspace_icons.py` | `netplus_app/netplus/setup/workspace_icons.py` | mapping + `apply()` (icônes, visibilité, cache) |
| `netplus/public/js/netplus_icons.js` | `netplus_app/netplus/public/js/netplus_icons.js` | injecteur du sprite dans le DOM du Desk (fallback garanti) |
| `diagnose_desk.py` | exécuté au besoin | état réel : workspaces, champ app, sprite, preuves |

## Installation (dans l'ordre)

### 1. Générer le sprite depuis vos PNG

```bash
# copier le kit et vos icônes dans le conteneur (adaptez le chemin des PNG)
docker cp build_icon_sprite.py frappe_docker-backend-1:/tmp/build_icon_sprite.py
docker cp "C:\Users\tlili\OneDrive\Bureau\netplus\modules icons" frappe_docker-backend-1:/tmp/modules_icons

docker exec frappe_docker-backend-1 bash -c \
  "python3 /tmp/build_icon_sprite.py /tmp/modules_icons"
```

Le script écrit `apps/netplus/netplus/public/icons/netplus_icons.svg` et
liste les fichiers manquants s'il y en a. Les noms attendus sont exactement
ceux de votre dossier (`accounting.png`, `hr and payoll.png`,
`stock and inventroy.png`, etc.) — la table est en tête du script.

### 2. Copier les fichiers python/js (tableau ci-dessus) puis hooks.py

Ajoutez dans `netplus_app/netplus/hooks.py` :

```python
# Icônes custom du Desk
app_include_icons = ["netplus/public/icons/netplus_icons.svg"]
app_include_js = ["/assets/netplus/js/netplus_icons.js"]  # fusionnez si la clé existe déjà

# Ré-application automatique après CHAQUE migrate (c'est ça, le "permanent")
after_migrate = ["netplus.setup.workspace_icons.apply"]
```

`app_include_icons` est le mécanisme natif v15+ ; `netplus_icons.js` est un
fallback qui injecte le sprite quoi qu'il arrive — si l'un des deux passe,
les icônes s'affichent. Gardez les deux.

### 3. Appliquer

```bash
docker exec frappe_docker-backend-1 bash -c "cd /home/frappe/frappe-bench && \
  bench --site frontend execute netplus.setup.workspace_icons.apply && \
  bench --site frontend clear-cache && \
  bench --site frontend clear-website-cache"
docker compose restart backend frontend
```

### 4. Vérifier — sur /app, PAS /desk

1. Ouvrez **http://localhost:8080/app** et faites **Ctrl+F5**.
2. Sidebar + cartes d'accueil : icônes custom sur Accounting, Buying,
   Selling, Stock, Assets, Manufacturing, Quality, Projects, Support, CRM,
   et l'icône carte sur les 6 workspaces NetPlus.
3. Preuve technique si besoin : affichez le code source de la page et
   cherchez `icon-np-` — les symboles doivent être présents.

En cas de doute sur l'état réel :

```bash
docker cp diagnose_desk.py frappe_docker-backend-1:/tmp/diagnose_desk.py
docker exec frappe_docker-backend-1 bash -c \
  "cd /home/frappe/frappe-bench && ./env/bin/python /tmp/diagnose_desk.py"
```

## Détails qui évitent les prochaines heures perdues

- **Sélecteur d'app (v15/v16)** : la sidebar du Desk est filtrée par
  l'application sélectionnée (menu en haut à gauche). Un Workspace dont le
  champ `app` vaut `netplus` n'apparaît que sous l'app NetPlus. `apply()`
  aligne les workspaces NetPlus sur `app = "erpnext"` (si le champ existe)
  pour une sidebar unifiée — modifiez `TARGET_APP` en tête du fichier si
  vous préférez un espace NetPlus séparé.
- **Visibilité par utilisateur** : « Edit Sidebar » (Workspace Settings)
  peut masquer des workspaces PAR UTILISATEUR. Si un module manque pour un
  seul compte, c'est là, pas dans la base.
- **Ne relancez jamais du JSON inline dans PowerShell** (`bench execute
  --args '{...}'`) : PowerShell détruit les quotes — c'était l'erreur
  `unterminated string literal`. Toujours `docker cp` d'un fichier .py.
- Vos scripts de test qui appellent `frappe.boot.get_allowed_pages()`
  visent une API qui n'existe pas en v15 — l'AttributeError était du bruit,
  pas un symptôme.
