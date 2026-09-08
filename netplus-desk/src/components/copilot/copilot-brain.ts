/**
 * NetPlus Copilot — Navigation Brain
 * Matches user queries to ERP pages without any external API.
 * Returns structured responses with direct links and explanations.
 */

export interface CopilotLink {
  label: string;
  href: string;
  description?: string;
}

export interface CopilotResponse {
  answer: string;
  links: CopilotLink[];
  followUp?: string;
}

// ─── Knowledge base ──────────────────────────────────────────────────────────

interface KnowledgeEntry {
  keywords: string[];
  response: CopilotResponse;
}

const KNOWLEDGE: KnowledgeEntry[] = [
  // ── NetPlus core ──────────────────────────────────────────────────────────
  {
    keywords: ["mission", "missions", "tâche", "taches", "intervention", "rondes"],
    response: {
      answer: "Les **Missions** vous permettent de créer et suivre les interventions terrain de vos opérateurs.",
      links: [
        { label: "Liste des Missions", href: "/desk/all/Mission", description: "Voir toutes les missions" },
        { label: "Nouvelle Mission", href: "/desk/new/Mission", description: "Créer une mission" },
        { label: "Module NetPlus", href: "/desk/netplus", description: "Vue d'ensemble NetPlus" },
      ],
      followUp: "Voulez-vous aussi voir les **scores opérateurs** ou les **contrats de service** ?",
    },
  },
  {
    keywords: ["contrat", "contrats", "service contract", "contract", "site"],
    response: {
      answer: "Les **Contrats de service** définissent les sites, horaires et obligations de chaque client.",
      links: [
        { label: "Contrats de service", href: "/desk/all/Service Contract", description: "Tous les contrats" },
        { label: "Nouveau contrat", href: "/desk/new/Service Contract", description: "Créer un contrat" },
        { label: "Sites géofencés", href: "/desk/all/Location", description: "Gérer les sites" },
      ],
    },
  },
  {
    keywords: ["score", "scores", "opérateur", "operateur", "performance", "notation", "évaluation"],
    response: {
      answer: "Les **Scores opérateurs** agrègent les notes de mission, ponctualité et feedback client en un score global.",
      links: [
        { label: "Scores opérateurs", href: "/desk/all/Operator Score", description: "Tableau des scores" },
        { label: "Feedback qualité", href: "/desk/all/Quality Feedback", description: "Retours clients" },
        { label: "Analytics NetPlus", href: "/desk/analytics", description: "Graphiques & KPIs" },
      ],
    },
  },
  {
    keywords: ["feedback", "retour", "avis", "client", "qualité", "qualite"],
    response: {
      answer: "Les **Feedbacks qualité** capturent les évaluations clients après chaque intervention.",
      links: [
        { label: "Feedbacks qualité", href: "/desk/all/Quality Feedback", description: "Tous les retours" },
        { label: "Clients (CRM)", href: "/desk/all/Customer", description: "Gérer les clients" },
        { label: "Scores opérateurs", href: "/desk/all/Operator Score", description: "Impact sur les scores" },
      ],
    },
  },
  {
    keywords: ["tracking", "carte", "map", "géolocalisation", "gps", "temps réel", "temps reel", "localisation", "position"],
    response: {
      answer: "Le **Tracking Center** affiche en temps réel la position GPS de vos opérateurs sur une carte interactive.",
      links: [
        { label: "Tracking Center", href: "/desk/tracking-center", description: "Tableau de bord temps réel" },
        { label: "Carte en direct", href: "/desk/tracking-center#map", description: "Vue cartographique" },
        { label: "Superviseurs", href: "/desk/tracking-center#supervisors", description: "Gestion des superviseurs" },
      ],
    },
  },
  {
    keywords: ["alert", "alerte", "alertes", "notification", "anomalie"],
    response: {
      answer: "Les alertes sont configurables dans les **Paramètres NetPlus** et s'affichent dans le Tracking Center.",
      links: [
        { label: "Tracking Center", href: "/desk/tracking-center", description: "Alertes en temps réel" },
        { label: "Paramètres NetPlus", href: "/desk/all/NetPlus Settings", description: "Configurer les alertes" },
        { label: "Notifications système", href: "/desk/all/Notification", description: "Notifications email/SMS" },
      ],
    },
  },

  // ── Ventes ───────────────────────────────────────────────────────────────
  {
    keywords: ["vente", "ventes", "sales", "devis", "quotation", "bon de commande", "commande"],
    response: {
      answer: "Le module **Ventes** couvre les devis, bons de commande, factures client et livraisons.",
      links: [
        { label: "Module Ventes", href: "/desk/selling", description: "Vue d'ensemble" },
        { label: "Devis", href: "/desk/all/Quotation", description: "Créer/gérer les devis" },
        { label: "Bons de commande", href: "/desk/all/Sales Order", description: "Commandes clients" },
        { label: "Factures client", href: "/desk/all/Sales Invoice", description: "Facturation" },
      ],
    },
  },
  {
    keywords: ["facture", "facturation", "invoice", "paiement", "payment"],
    response: {
      answer: "La **facturation** est gérée dans les modules Ventes (factures client) et Comptabilité (règlements).",
      links: [
        { label: "Factures client", href: "/desk/all/Sales Invoice", description: "Nouvelles factures" },
        { label: "Factures fournisseur", href: "/desk/all/Purchase Invoice", description: "Achats" },
        { label: "Règlements", href: "/desk/all/Payment Entry", description: "Paiements reçus/émis" },
        { label: "Comptabilité", href: "/desk/accounts", description: "Module comptable" },
      ],
    },
  },

  // ── CRM ──────────────────────────────────────────────────────────────────
  {
    keywords: ["crm", "prospect", "lead", "opportunité", "opportunite", "pipeline", "commercial"],
    response: {
      answer: "Le **CRM** gère votre pipeline commercial : leads → opportunités → clients.",
      links: [
        { label: "Module CRM", href: "/desk/crm", description: "Vue d'ensemble" },
        { label: "Leads", href: "/desk/all/Lead", description: "Prospects entrants" },
        { label: "Opportunités", href: "/desk/all/Opportunity", description: "Pipeline commercial" },
        { label: "Clients", href: "/desk/all/Customer", description: "Base clients" },
      ],
    },
  },

  // ── Stock ────────────────────────────────────────────────────────────────
  {
    keywords: ["stock", "inventaire", "entrepôt", "warehouse", "article", "item", "produit"],
    response: {
      answer: "Le module **Inventaire** gère les articles, entrepôts, mouvements de stock et numéros de série.",
      links: [
        { label: "Module Inventaire", href: "/desk/stock", description: "Vue d'ensemble" },
        { label: "Articles", href: "/desk/all/Item", description: "Catalogue produits" },
        { label: "Entrepôts", href: "/desk/all/Warehouse", description: "Gestion des stocks" },
        { label: "Mouvements de stock", href: "/desk/all/Stock Entry", description: "Entrées/sorties" },
      ],
    },
  },

  // ── Achats ───────────────────────────────────────────────────────────────
  {
    keywords: ["achat", "achats", "fournisseur", "purchase", "supplier", "approvisionnement"],
    response: {
      answer: "Le module **Achats** couvre les fournisseurs, appels d'offres, bons de commande et réceptions.",
      links: [
        { label: "Module Achats", href: "/desk/buying", description: "Vue d'ensemble" },
        { label: "Fournisseurs", href: "/desk/all/Supplier", description: "Base fournisseurs" },
        { label: "Bons de commande", href: "/desk/all/Purchase Order", description: "Commandes fournisseurs" },
        { label: "Réceptions", href: "/desk/all/Purchase Receipt", description: "Réceptions marchandises" },
      ],
    },
  },

  // ── Comptabilité ─────────────────────────────────────────────────────────
  {
    keywords: ["comptabilité", "comptabilite", "accounting", "bilan", "balance", "journal", "trésorerie", "tresorerie"],
    response: {
      answer: "La **Comptabilité** inclut le grand livre, les journaux d'écriture, paiements et états financiers.",
      links: [
        { label: "Module Comptabilité", href: "/desk/accounts", description: "Vue d'ensemble" },
        { label: "Écritures journal", href: "/desk/all/Journal Entry", description: "Saisies comptables" },
        { label: "Plan comptable", href: "/desk/all/Chart of Accounts", description: "Structure comptable" },
        { label: "Paiements", href: "/desk/all/Payment Entry", description: "Règlements" },
      ],
    },
  },

  // ── RH ───────────────────────────────────────────────────────────────────
  {
    keywords: ["rh", "hr", "employé", "employe", "employee", "paie", "paieroll", "payroll", "salaire", "congé", "conge", "absence", "présence"],
    response: {
      answer: "Le module **RH & Paie** gère les employés, présences, congés, fiches de paie et recrutement.",
      links: [
        { label: "Module RH", href: "/desk/hr", description: "Vue d'ensemble" },
        { label: "Employés", href: "/desk/all/Employee", description: "Registre du personnel" },
        { label: "Présences", href: "/desk/all/Attendance", description: "Pointage" },
        { label: "Demandes de congé", href: "/desk/all/Leave Application", description: "Gestion des congés" },
        { label: "Fiches de paie", href: "/desk/all/Salary Slip", description: "Bulletins de salaire" },
      ],
    },
  },

  // ── Projets ──────────────────────────────────────────────────────────────
  {
    keywords: ["projet", "projets", "project", "task", "tâche", "taches", "timesheet", "temps"],
    response: {
      answer: "Le module **Projets** organise vos projets, tâches et feuilles de temps.",
      links: [
        { label: "Module Projets", href: "/desk/projects", description: "Vue d'ensemble" },
        { label: "Projets", href: "/desk/all/Project", description: "Tous les projets" },
        { label: "Tâches", href: "/desk/all/Task", description: "Gestion des tâches" },
        { label: "Feuilles de temps", href: "/desk/all/Timesheet", description: "Suivi du temps" },
      ],
    },
  },

  // ── Analytique ───────────────────────────────────────────────────────────
  {
    keywords: ["analytics", "analytique", "rapport", "rapports", "kpi", "dashboard", "tableau de bord", "statistiques", "graphique"],
    response: {
      answer: "L'**Analytics Hub** centralise tous les KPIs, graphiques de revenus, flux de trésorerie et santé des stocks.",
      links: [
        { label: "Analytics Hub", href: "/desk/analytics", description: "Tableau de bord principal" },
        { label: "Rapports", href: "/desk/all/Report", description: "Rapports personnalisés" },
        { label: "Dashboards", href: "/desk/all/Dashboard", description: "Tableaux de bord" },
      ],
    },
  },

  // ── Paramètres ───────────────────────────────────────────────────────────
  {
    keywords: ["paramètre", "parametre", "settings", "configuration", "setup", "réglage", "utilisateur", "utilisateurs", "user", "users", "rôle", "role", "permission"],
    response: {
      answer: "Les **Paramètres** regroupent la gestion des utilisateurs, rôles, permissions et configuration système.",
      links: [
        { label: "Paramètres", href: "/desk/setup", description: "Vue d'ensemble" },
        { label: "Utilisateurs", href: "/desk/setup/User", description: "Comptes utilisateurs" },
        { label: "Rôles", href: "/desk/all/Role", description: "Gestion des droits" },
        { label: "Paramètres système", href: "/desk/all/System Settings", description: "Config globale" },
        { label: "Entreprise", href: "/desk/all/Company", description: "Infos société" },
      ],
    },
  },

  // ── Navigation générale ───────────────────────────────────────────────────
  {
    keywords: ["accueil", "home", "bureau", "desk", "menu", "modules", "retour"],
    response: {
      answer: "Le **Bureau (Desk)** est votre page d'accueil. Elle affiche tous les modules disponibles.",
      links: [
        { label: "Page d'accueil", href: "/desk", description: "Bureau principal" },
        { label: "Tracking Center", href: "/desk/tracking-center", description: "Surveillance temps réel" },
        { label: "NetPlus", href: "/desk/netplus", description: "Module principal" },
        { label: "Analytics", href: "/desk/analytics", description: "Tableaux de bord" },
      ],
    },
  },
  {
    keywords: ["profil", "profile", "compte", "mon compte", "password", "mot de passe"],
    response: {
      answer: "Votre **profil** vous permet de modifier vos informations, photo et mot de passe.",
      links: [
        { label: "Mon profil", href: "/desk/profile", description: "Informations personnelles" },
        { label: "Paramètres utilisateur", href: "/desk/setup", description: "Administration" },
      ],
    },
  },
];

// ─── Fallback suggestions ─────────────────────────────────────────────────────

const FALLBACK: CopilotResponse = {
  answer: "Je n'ai pas trouvé de page correspondante. Voici les sections principales de NetPlus :",
  links: [
    { label: "Tracking Center", href: "/desk/tracking-center", description: "Opérateurs en temps réel" },
    { label: "Missions", href: "/desk/all/Mission", description: "Interventions terrain" },
    { label: "Analytics", href: "/desk/analytics", description: "KPIs & tableaux de bord" },
    { label: "Paramètres", href: "/desk/setup", description: "Utilisateurs & config" },
  ],
  followUp: "Essayez des mots-clés comme : *mission*, *contrat*, *facture*, *employé*, *stock*…",
};

// ─── Greeting ─────────────────────────────────────────────────────────────────

export const GREETING: CopilotResponse = {
  answer: "Bonjour 👋 Je suis votre assistant NetPlus. Dites-moi où vous voulez aller ou ce que vous cherchez !",
  links: [
    { label: "Tracking Center", href: "/desk/tracking-center", description: "Opérateurs en temps réel" },
    { label: "Missions", href: "/desk/all/Mission", description: "Interventions terrain" },
    { label: "Analytics Hub", href: "/desk/analytics", description: "KPIs & tableaux de bord" },
    { label: "Paramètres", href: "/desk/setup", description: "Utilisateurs & droits" },
  ],
  followUp: "Exemples : *Où sont les factures ?* · *Comment créer une mission ?* · *Voir les scores opérateurs*",
};

// ─── Engine ──────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents for matching
    .split(/\s+/)
    .filter(Boolean);
}

export function query(userInput: string): CopilotResponse {
  const tokens = tokenize(userInput);

  let bestEntry: KnowledgeEntry | null = null;
  let bestScore = 0;

  for (const entry of KNOWLEDGE) {
    let score = 0;
    const normalizedKw = entry.keywords.map((kw) =>
      kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    );
    for (const token of tokens) {
      for (const kw of normalizedKw) {
        if (kw === token) score += 2;
        else if (kw.includes(token) || token.includes(kw)) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  return bestScore >= 1 && bestEntry ? bestEntry.response : FALLBACK;
}
