# Informations de Connexion NetPlus

Voici les identifiants et les liens d'accès pour les 4 profils utilisateurs de la plateforme NetPlus.
Toutes les applications partagent la même session (vous pouvez vous connecter sur l'une et accéder aux autres).

---

## 1. Administrateur (ERPNext Hub & Monitoring)
L'administrateur a accès à tout le système, y compris la configuration, la création des missions, et le **Monitoring en temps réel**.

- **Lien :** [http://localhost:8080/app](http://localhost:8080/app) (NetPlus Hub)
- **Monitoring Live :** [http://localhost:8080/netplus-monitoring](http://localhost:8080/netplus-monitoring)
- **Email / Login :** `Administrator` ou `admin@example.com`
- **Mot de passe :** `admin`

---

## 2. Superviseur (Portail de Supervision)
Le superviseur gère les équipes, voit le statut en temps réel de ses opérateurs, reçoit les alertes, et peut valider les check-ins manuellement.

- **Lien :** [http://localhost:8080/netplus-supervision](http://localhost:8080/netplus-supervision)
- **Email / Login :** `supervisor1@netplus.ca`
- **Mot de passe :** `admin`

---

## 3. Opérateur (PWA Terrain)
L'opérateur utilise l'application mobile pour voir ses missions, faire le pointage GPS sur site (Check-In / Check-Out), et signaler des anomalies.

- **Lien :** [http://localhost:8080/netplus-pwa](http://localhost:8080/netplus-pwa)
- **Email / Login :** `operator1@netplus.ca`
- **Mot de passe :** `admin`

---

## 4. Client (Portail Client)
Le client peut suivre l'avancement de ses missions, consulter l'historique des interventions sur ses sites, et laisser des évaluations (feedback).

- **Lien :** [http://localhost:8080/netplus-client](http://localhost:8080/netplus-client)
- **Email / Login :** `jdupont@gestionimmo.ca`
- **Mot de passe :** `admin`

---

> **Note technique :** 
> Le serveur backend (démon Frappe) est **déjà actif** et fonctionne en arrière-plan via Docker (`frappe_docker-backend-1`). Tous les services (API, WebSocket, Worker) sont opérationnels sur le port 8080.
