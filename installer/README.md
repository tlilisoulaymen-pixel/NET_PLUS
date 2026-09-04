# NetPlus — Installer Builder

Ce dossier `installer/` contient tout ce qu'il faut pour produire **`NetPlus-Setup-1.0.0.exe`**, un installeur Windows professionnel avec :
- Assistant d'installation (bienvenue → licence → dossier → install → terminer)
- Installation silencieuse de WSL2 + Docker Desktop si absents
- Icône bureau qui démarre l'app en un clic

---

## Structure

```
installer/
├── build-installer.ps1      ← Script de build automatique (point d'entrée)
├── netplus-installer.iss    ← Script Inno Setup (config de l'installeur)
├── install-prerequisites.ps1← Installé avec l'app, lancé par le wizard
├── NetPlus-Launcher.bat     ← Cible de l'icône bureau
├── LICENSE.txt              ← Affiché dans le wizard (page licence)
└── dist/                   ← Dossier de sortie (créé automatiquement)
    └── NetPlus-Setup-1.0.0.exe
```

---

## Construire l'installeur en une commande

Ouvrez PowerShell **en tant qu'administrateur** depuis la racine du dépôt :

```powershell
.\installer\build-installer.ps1
```

Le script fait tout automatiquement :
1. **Détecte Inno Setup 6** — le télécharge et l'installe via `winget` s'il est absent
2. **Construit `payload/`** — copie les dossiers applicatifs en excluant `node_modules/`, `.next/`, `__pycache__/`, `.git/`, etc.
3. **Compile** `netplus-installer.iss` → `dist/NetPlus-Setup-1.0.0.exe`
4. **Affiche** le chemin et la taille du fichier final

Pour reconstruire sans recréer le payload :
```powershell
.\installer\build-installer.ps1 -SkipPayload
```

Pour une version spécifique :
```powershell
.\installer\build-installer.ps1 -Version "2.0.0"
```

---

## Ce que le client vit

1. Double-clic sur `NetPlus-Setup-1.0.0.exe` (invite admin)
2. Wizard : langue → bienvenue → licence → dossier → installation
3. WSL2 + Docker Desktop installés silencieusement si absents
4. Page finale : case « Lancer NetPlus maintenant »
5. Icône **NetPlus** sur le bureau — démarre Docker + les conteneurs + ouvre le navigateur

---

## Informations importantes

| Sujet | Détail |
|---|---|
| **GUID** | `E6C1D1B2-1D2A-4D7C-A261-C8A31B8AE255` — ne jamais changer (identifie le produit pour les mises à jour) |
| **Signature** | Les installeurs non signés déclenchent SmartScreen. Signez avec un certificat Sectigo/DigiCert (~€100–400/an) : `signtool sign /fd SHA256 /td SHA256 /a NetPlus-Setup-1.0.0.exe` |
| **Docker licensing** | Gratuit pour les particuliers et PME. Les entreprises >250 employés ou >10M$/an nécessitent un abonnement Docker payant. |
| **Premier lancement** | Lent (téléchargement des images Docker ~1–2 GB). Les lancements suivants sont rapides. |
| **Désinstallation** | Via « Applications » Windows → NetPlus → Désinstaller (arrête les conteneurs proprement) |
| **Redémarrage** | Parfois requis après WSL2 sur un PC vierge. L'icône bureau gère ça : relancer après redémarrage suffit. |
