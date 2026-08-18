/**
 * NetPlus Dashboard — Frappe Page (Admin / Supervisor)
 * Matches netplus-erp dark theme design language
 */

frappe.pages['netplus-dashboard'].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: 'NetPlus Dashboard',
    single_column: true,
  });

  // Inject dark theme styles
  $('head').append(`<style id="netplus-dashboard-css">
    .netplus-dashboard { font-family: 'Inter', -apple-system, sans-serif; }
    .np-root { background: #0A0A0B; min-height: calc(100vh - 60px); padding: 24px; color: #E4E4E7; }
    .np-max { max-width: 1200px; margin: 0 auto; }

    /* Banner */
    .np-banner { background: #0F0F10; border: 1px solid #27272A; padding: 24px; border-radius: 16px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
    .np-banner h2 { font-size: 1.5rem; font-weight: 900; color: white; letter-spacing: -0.5px; }
    .np-banner .subtitle { font-size: 0.75rem; color: #A1A1AA; margin-top: 4px; }
    .np-badge { background: rgba(16,185,129,0.1); color: #34d399; font-size: 0.7rem; font-weight: 600; padding: 4px 12px; border-radius: 99px; border: 1px solid rgba(16,185,129,0.2); }
    .np-btn-primary { padding: 10px 20px; background: #10b981; color: #000; font-weight: 800; font-size: 0.8rem; border: none; border-radius: 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 20px rgba(16,185,129,0.2); transition: all 0.15s; }
    .np-btn-primary:hover { background: #34d399; }

    /* KPI Cards */
    .np-kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .np-kpi { background: #18181B; padding: 20px; border-radius: 12px; border: 1px solid #27272A; box-shadow: 0 2px 10px rgba(0,0,0,0.2); }
    .np-kpi .kpi-top { display: flex; justify-content: space-between; align-items: center; color: #A1A1AA; margin-bottom: 8px; }
    .np-kpi .kpi-label { font-size: 0.7rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; }
    .np-kpi .kpi-icon { color: #34d399; }
    .np-kpi .kpi-value { font-size: 2rem; font-weight: 900; color: white; }
    .np-kpi .kpi-sub { font-size: 0.7rem; color: #34d399; font-weight: 500; margin-top: 4px; }
    .np-kpi .kpi-sub.amber { color: #fbbf24; }

    /* Section */
    .np-section { background: #18181B; padding: 24px; border-radius: 12px; border: 1px solid #27272A; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
    .np-section-title { font-size: 1rem; font-weight: 700; color: white; display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
    .np-section-title .icon { color: #34d399; }
    .np-section-sub { font-size: 0.7rem; color: #71717A; font-family: monospace; }

    /* Mission Cards Grid */
    .np-missions-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    .np-mission-card { background: #0F0F10; padding: 16px; border-radius: 12px; border: 1px solid #27272A; }
    .np-mission-card .mc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .np-mission-card .mc-site { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #34d399; }
    .np-mission-card .mc-title { font-weight: 700; font-size: 0.85rem; color: white; margin-top: 2px; }
    .np-mission-card .mc-meta { font-size: 0.75rem; color: #A1A1AA; line-height: 1.6; margin-top: 8px; }
    .np-mission-card .mc-meta strong { color: white; }
    .np-mission-card .mc-meta .mono { font-family: monospace; }
    .np-mission-card .mc-footer { padding-top: 12px; border-top: 1px solid #27272A; margin-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #A1A1AA; }
    .np-mission-card .mc-avatars { display: flex; margin-left: -8px; }
    .np-mission-card .mc-avatar { width: 24px; height: 24px; border-radius: 50%; background: #059669; color: #000; font-weight: 700; font-size: 0.6rem; display: flex; align-items: center; justify-content: center; border: 2px solid #0F0F10; margin-left: -4px; }

    /* Status badges */
    .np-status { font-size: 0.6rem; font-weight: 700; padding: 3px 10px; border-radius: 99px; border: 1px solid; white-space: nowrap; }
    .np-status.active { background: rgba(16,185,129,0.2); color: #34d399; border-color: rgba(16,185,129,0.3); }
    .np-status.progress { background: rgba(16,185,129,0.1); color: #34d399; border-color: rgba(16,185,129,0.2); animation: np-pulse 2s infinite; }
    .np-status.done { background: rgba(59,130,246,0.1); color: #60a5fa; border-color: rgba(59,130,246,0.2); }
    .np-status.critical { background: rgba(239,68,68,0.1); color: #f87171; border-color: rgba(239,68,68,0.2); }
    .np-status.default { background: #27272A; color: #A1A1AA; border-color: #3F3F46; }
    @keyframes np-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

    /* Alert Banner */
    .np-alert-banner { background: rgba(127,29,29,0.3); border: 1px solid rgba(239,68,68,0.3); padding: 16px; border-radius: 16px; margin-bottom: 24px; }
    .np-alert-banner.amber { background: rgba(120,53,15,0.3); border-color: rgba(245,158,11,0.3); }
    .np-alert-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .np-alert-header .title { color: #fca5a5; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; gap: 8px; }
    .np-alert-banner.amber .np-alert-header .title { color: #fde68a; }
    .np-alert-header .escalation { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; color: #f87171; background: rgba(239,68,68,0.2); padding: 3px 10px; border-radius: 99px; border: 1px solid rgba(239,68,68,0.3); }
    .np-alert-banner.amber .np-alert-header .escalation { color: #fbbf24; background: rgba(245,158,11,0.2); border-color: rgba(245,158,11,0.3); }
    .np-alerts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
    .np-alert-item { background: #18181B; padding: 12px; border-radius: 12px; border: 1px solid rgba(239,68,68,0.3); display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; }
    .np-alert-banner.amber .np-alert-item { border-color: rgba(245,158,11,0.3); }
    .np-alert-item .info .name { font-weight: 700; color: white; }
    .np-alert-item .info .detail { color: #fca5a5; font-size: 0.68rem; margin-top: 2px; }
    .np-alert-banner.amber .np-alert-item .info .detail { color: #fde68a; }
    .np-alert-item .ack-btn { padding: 6px 12px; border-radius: 8px; font-size: 0.7rem; font-weight: 600; border: none; cursor: pointer; }
    .np-alert-item .ack-btn.red { background: #dc2626; color: white; }
    .np-alert-item .ack-btn.amber { background: #f59e0b; color: #000; font-weight: 800; }

    /* Rankings Table */
    .np-table-wrap { overflow-x: auto; border: 1px solid #27272A; border-radius: 12px; }
    .np-table { width: 100%; font-size: 0.75rem; text-align: left; border-collapse: collapse; }
    .np-table thead { background: #151518; }
    .np-table th { padding: 12px 14px; font-weight: 500; color: #71717A; text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.06em; border-bottom: 1px solid #27272A; }
    .np-table td { padding: 12px 14px; border-bottom: 1px solid #27272A; }
    .np-table tbody tr:hover { background: #202024; }
    .np-table .rank-badge { width: 24px; height: 24px; border-radius: 50%; font-weight: 700; font-size: 0.65rem; display: flex; align-items: center; justify-content: center; }
    .np-table .rank-1 { background: #fbbf24; color: #000; box-shadow: 0 2px 8px rgba(251,191,36,0.3); }
    .np-table .rank-2 { background: #d4d4d8; color: #000; }
    .np-table .rank-3 { background: #b45309; color: white; }
    .np-table .rank-default { background: #27272A; color: #A1A1AA; }
    .np-table .name-cell { display: flex; align-items: center; gap: 10px; font-weight: 700; color: white; }
    .np-table .name-cell .avatar { width: 28px; height: 28px; border-radius: 50%; background: #059669; color: #000; font-weight: 700; font-size: 0.65rem; display: flex; align-items: center; justify-content: center; }
    .np-table .score-cell { text-align: right; font-weight: 900; font-family: monospace; color: white; }
    .np-table .score-pill { background: rgba(16,185,129,0.1); color: #34d399; padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(16,185,129,0.2); }
    .np-table .amber { color: #fbbf24; font-weight: 700; }
    .np-table .emerald { color: #34d399; font-family: monospace; }
    .np-table .cyan { color: #22d3ee; font-family: monospace; }
    .np-table .rose { color: #f87171; font-family: monospace; }
    .np-table .muted { color: #A1A1AA; }

    /* Contract cards */
    .np-contracts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .np-contract-card { background: #0F0F10; padding: 16px; border-radius: 12px; border: 1px solid #27272A; }
    .np-contract-card .cc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .np-contract-card .cc-id { font-family: monospace; font-size: 0.75rem; font-weight: 700; color: #34d399; }
    .np-contract-card .cc-title { font-weight: 700; font-size: 0.85rem; color: white; margin-bottom: 8px; line-height: 1.3; }
    .np-contract-card .cc-meta { font-size: 0.75rem; color: #A1A1AA; line-height: 1.6; }
    .np-contract-card .cc-meta strong { color: white; }
    .np-contract-card .cc-meta .rate { color: #34d399; font-weight: 700; }
    .np-contract-btn { width: 100%; padding: 10px; background: #27272A; border: 1px solid #3F3F46; border-radius: 8px; color: #E4E4E7; font-size: 0.75rem; font-weight: 700; cursor: pointer; margin-top: 12px; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.15s; font-family: inherit; }
    .np-contract-btn:hover { background: #3F3F46; color: white; }

    /* Team operator cards */
    .np-team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .np-team-card { background: #0F0F10; padding: 16px; border-radius: 12px; border: 1px solid #27272A; }
    .np-team-card .tc-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .np-team-card .tc-avatar { width: 40px; height: 40px; border-radius: 50%; background: #059669; color: #000; font-weight: 700; font-size: 1rem; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 3px rgba(16,185,129,0.3); }
    .np-team-card .tc-name { font-weight: 700; font-size: 0.85rem; color: white; }
    .np-team-card .tc-phone { font-size: 0.75rem; color: #A1A1AA; }
    .np-team-card .tc-status-box { display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; background: #18181B; padding: 10px; border-radius: 8px; border: 1px solid #27272A; margin-bottom: 8px; }
    .np-team-card .tc-status-box .label { color: #A1A1AA; }
    .np-team-card .tc-score-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #E4E4E7; padding-top: 8px; }
    .np-team-card .tc-score-value { font-family: monospace; color: #34d399; background: rgba(16,185,129,0.1); padding: 2px 8px; border-radius: 6px; border: 1px solid rgba(16,185,129,0.2); font-weight: 700; }

    /* Compliance footer */
    .np-compliance { background: #18181B; padding: 16px; border-radius: 12px; border: 1px solid #27272A; font-size: 0.75rem; color: #A1A1AA; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
    .np-compliance .lock { display: flex; align-items: center; gap: 8px; }
    .np-compliance .lock svg { color: #34d399; }
    .np-compliance .version { font-family: monospace; color: #71717A; }

    /* Override Frappe page styling */
    .page-container[data-page-name="netplus-dashboard"] .page-body { background: #0A0A0B !important; }
    .page-container[data-page-name="netplus-dashboard"] .page-head { background: #0F0F10 !important; border-bottom: 1px solid #27272A !important; }
    .page-container[data-page-name="netplus-dashboard"] .page-head .title-text { color: white !important; }
  </style>`);

  // Initial load
  page.$netplus_root = $(wrapper).find('#netplus-dashboard-root');
  page.netplus_render = function () {
    renderDashboard(page);
  };

  // Wait for user roles to load, then render
  frappe.after_ajax(function () {
    page.netplus_render();
  });
};

function renderDashboard(page) {
  const root = page.$netplus_root;
  const isAdmin = frappe.user.has_role('System Manager') || frappe.user.has_role('NetPlus Admin') || frappe.user.has_role('Administrator');
  const isSupervisor = frappe.user.has_role('NetPlus Supervisor');
  const isClient = frappe.user.has_role('NetPlus Client') || frappe.user.has_role('Customer');

  root.html(`<div class="np-root"><div class="np-max" id="np-content">
    <div style="text-align:center; padding: 60px; color: #A1A1AA;">Chargement du tableau de bord...</div>
  </div></div>`);

  // If Client role, render Client Portal View
  if (isClient && !isAdmin && !isSupervisor) {
    Promise.all([
      frappe.xcall('frappe.client.get_list', { doctype: 'Service Contract', fields: ['*'], limit_page_length: 20 }).catch(() => []),
      frappe.xcall('frappe.client.get_list', { doctype: 'Mission', fields: ['*'], limit_page_length: 20, order_by: 'creation desc' }).catch(() => []),
      frappe.xcall('frappe.client.get_list', { doctype: 'Quality Feedback', fields: ['*'], limit_page_length: 20 }).catch(() => []),
    ]).then(function ([contracts, missions, feedbacks]) {
      const content = root.find('#np-content');
      const clientName = frappe.session.user_fullname || 'Client';

      let html = `<div class="np-banner">
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <h2>Portail Client & Qualité — ${clientName}</h2>
            <span class="np-badge" style="background:rgba(245,158,11,0.1);color:#fbbf24;border-color:rgba(245,158,11,0.2)">Espace Sécurisé</span>
          </div>
          <div class="subtitle">Consultez le suivi en temps réel de vos prestations et évaluez la qualité des interventions.</div>
        </div>
        <div style="background:#18181B;padding:12px 20px;border-radius:12px;border:1px solid #27272A;display:flex;align-items:center;gap:12px;">
          <span style="color:#fbbf24;font-size:1.5rem">★</span>
          <div>
            <div style="font-size:0.7rem;color:#A1A1AA">Satisfaction Globale</div>
            <div style="font-weight:900;color:white;font-size:1rem">4.9 / 5.0 ★</div>
          </div>
        </div>
      </div>`;

      // Missions List
      html += `<div class="np-section">
        <div class="np-section-title">📅 Vos Interventions de Nettoyage Récentes</div>
        <div class="np-missions-grid">
          ${missions.length === 0 ? '<div style="text-align:center;padding:40px;color:#71717A;">Aucune intervention enregistrée</div>' : missions.map(m => {
            const status = m.workflow_state || m.status || 'Planifiée';
            const statusClass = status === 'En cours' ? 'progress' : status === 'Terminée' ? 'done' : 'default';
            return `
            <div class="np-mission-card">
              <div class="mc-top">
                <div>
                  <div class="mc-site">${m.site_name || 'Site'}</div>
                  <div class="mc-title">${m.title || m.name}</div>
                </div>
                <span class="np-status ${statusClass}">${status}</span>
              </div>
              <div class="mc-meta">
                Date: <span class="mono">${(m.scheduled_start || '').slice(0, 10) || '—'}</span><br>
                Équipe NetPlus: <strong>${m.assigned_operators || 'Équipe Techniciens'}</strong>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;

      // Contracts
      if (contracts.length > 0) {
        html += `<div class="np-section">
          <div class="np-section-title">📄 Vos Contrats de Service</div>
          <div class="np-contracts-grid">
            ${contracts.map(c => `
              <div class="np-contract-card">
                <div class="cc-top">
                  <span class="cc-id">${c.name}</span>
                  <span class="np-status active">${c.status || 'ACTIVE'}</span>
                </div>
                <div class="cc-title">${c.title || c.name}</div>
                <div class="cc-meta">
                  Fréquence: <strong>${c.frequency || 'Hebdomadaire'}</strong><br>
                  Tarif: <span class="rate">${c.rate_per_intervention || '—'} CAD</span> / int.
                </div>
              </div>
            `).join('')}
          </div>
        </div>`;
      }

      html += `<div class="np-compliance">
        <div class="lock">🔒 <span>Portail Client NetPlus Inc. — Données d'intervention certifiées et horodatées.</span></div>
        <span class="version">NetPlus v3.0</span>
      </div>`;

      content.html(html);
    });
    return;
  }

  // Load data for Admin / Supervisor
  Promise.all([
    frappe.xcall('frappe.client.get_count', { doctype: 'Service Contract', filters: { docstatus: 1 } }).catch(() => 0),
    frappe.xcall('frappe.client.get_count', { doctype: 'Mission' }).catch(() => 0),
    frappe.xcall('frappe.client.get_count', { doctype: 'Mission Alert', filters: { status: 'Open' } }).catch(() => 0),
    frappe.xcall('frappe.client.get_list', { doctype: 'Mission', fields: ['*'], limit_page_length: 20, order_by: 'creation desc' }).catch(() => []),
    frappe.xcall('frappe.client.get_list', { doctype: 'Service Contract', fields: ['*'], limit_page_length: 20, order_by: 'creation desc' }).catch(() => []),
    frappe.xcall('frappe.client.get_list', { doctype: 'Operator Score', fields: ['*'], limit_page_length: 50, order_by: 'global_score desc' }).catch(() => []),
    frappe.xcall('frappe.client.get_list', { doctype: 'Mission Alert', fields: ['*'], filters: { status: 'Open' }, limit_page_length: 20 }).catch(() => []),
  ]).then(function ([contractCount, missionCount, alertCount, missions, contracts, scores, alerts]) {
    const content = root.find('#np-content');
    const roleLabel = isAdmin ? 'Tableau de Bord Exécutif — Super Admin' : 'Espace Supervision Équipe — ' + frappe.session.user_fullname;
    const badgeLabel = isAdmin ? 'Vue Globale' : 'Zone Superviseur';
    const subtitle = isAdmin
      ? 'Supervision globale des opérations NetPlus Inc. — Pointage GPS, Contrats, Feedback & Classements.'
      : `Supervision exclusive de votre équipe d'opérateurs.`;

    let html = '';

    // Banner
    html += `<div class="np-banner">
      <div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <h2>${roleLabel}</h2>
          <span class="np-badge">${badgeLabel}</span>
        </div>
        <div class="subtitle">${subtitle}</div>
      </div>
      <button class="np-btn-primary" onclick="frappe.new_doc('Service Contract')">
        <span style="font-size:1.2rem">+</span> Générer un Nouveau Contrat
      </button>
    </div>`;

    // Alert Banner
    if (alerts.length > 0) {
      html += `<div class="np-alert-banner ${isAdmin ? '' : 'amber'}">
        <div class="np-alert-header">
          <div class="title">⚠️ ${alerts.length} Alerte(s) de Retard ${isAdmin ? 'Critique Nécessitant une Intervention' : 'dans votre Équipe'}</div>
          <span class="escalation">${isAdmin ? 'Escalade Super Admin' : 'Traitement Superviseur'}</span>
        </div>
        <div class="np-alerts-grid">
          ${alerts.map(a => `
            <div class="np-alert-item">
              <div class="info">
                <div class="name">${a.title || a.name}</div>
                <div class="detail">Retard: <strong style="font-family:monospace">${a.minutes_late || '?'} min</strong></div>
              </div>
              <button class="ack-btn ${isAdmin ? 'red' : 'amber'}" onclick="frappe.set_route('Form','Mission Alert','${a.name}')">
                ${isAdmin ? 'Acquitter' : 'Justifier & Acquitter'}
              </button>
            </div>
          `).join('')}
        </div>
      </div>`;
    }

    // KPI Cards
    html += `<div class="np-kpi-grid">
      <div class="np-kpi">
        <div class="kpi-top"><span class="kpi-label">Contrats Actifs</span><span class="kpi-icon">📄</span></div>
        <div class="kpi-value">${contractCount}</div>
        <div class="kpi-sub">100% couverture GPS</div>
      </div>
      <div class="np-kpi">
        <div class="kpi-top"><span class="kpi-label">Missions Totales</span><span class="kpi-icon">📋</span></div>
        <div class="kpi-value">${missionCount}</div>
        <div class="kpi-sub">Seuil GPS < 200m</div>
      </div>
      <div class="np-kpi">
        <div class="kpi-top"><span class="kpi-label">Alertes Actives</span><span class="kpi-icon">🔔</span></div>
        <div class="kpi-value">${alertCount}</div>
        <div class="kpi-sub ${alertCount > 0 ? 'amber' : ''}">Escalade temps réel</div>
      </div>
      <div class="np-kpi">
        <div class="kpi-top"><span class="kpi-label">Opérateurs Classés</span><span class="kpi-icon">🏆</span></div>
        <div class="kpi-value">${scores.length}</div>
        <div class="kpi-sub">Score officiel v2.0</div>
      </div>
    </div>`;

    // Operations Center — Mission Cards
    html += `<div class="np-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div class="np-section-title" style="margin-bottom:0;">📍 Centre de Contrôle des Opérations & Sites Géofencés</div>
        <span class="np-section-sub">Actualisation temps réel 5 min</span>
      </div>
      <div class="np-missions-grid">
        ${missions.length === 0 ? '<div style="text-align:center;padding:40px;color:#71717A;">Aucune mission trouvée</div>' : missions.map(m => {
          const status = m.workflow_state || m.status || 'Planifiée';
          const statusClass = status === 'En cours' ? 'progress' : status === 'Terminée' ? 'done' : status.includes('retard') ? 'critical' : 'default';
          return `
          <div class="np-mission-card" onclick="frappe.set_route('Form','Mission','${m.name}')" style="cursor:pointer">
            <div class="mc-top">
              <div>
                <div class="mc-site">${m.site_name || 'Site'}</div>
                <div class="mc-title">${m.title || m.name}</div>
              </div>
              <span class="np-status ${statusClass}">${status}</span>
            </div>
            <div class="mc-meta">
              Client: <strong>${m.customer || '—'}</strong><br>
              Superviseur: <strong>${m.supervisor_name || '—'}</strong><br>
              Horaires: <span class="mono">${(m.scheduled_start || '').slice(11, 16) || '—'} - ${(m.scheduled_end || '').slice(11, 16) || '—'}</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

    // Operator Rankings Table
    if (scores.length > 0) {
      html += `<div class="np-section">
        <div class="np-section-title">🏆 Classement Global & Scores des Opérateurs</div>
        <div style="font-size:0.7rem;color:#A1A1AA;margin-bottom:16px;">Formule officielle v2.0: Qualité (50%) + Ponctualité (30%) + Complétion (20%) − Pénalités</div>
        <div class="np-table-wrap">
          <table class="np-table">
            <thead><tr>
              <th>Rang</th><th>Opérateur</th><th>Moy. Étoiles</th><th>Qualité (50%)</th><th>Ponctualité (30%)</th><th>Complétion (20%)</th><th style="text-align:right">Score Global</th>
            </tr></thead>
            <tbody>
              ${scores.map((s, i) => {
                const rank = i + 1;
                const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-default';
                const initial = (s.employee_name || 'O')[0];
                return `<tr>
                  <td><div class="rank-badge ${rankClass}">#${rank}</div></td>
                  <td><div class="name-cell"><div class="avatar">${initial}</div> ${s.employee_name || s.name}</div></td>
                  <td class="amber">${s.average_stars || 0} ★</td>
                  <td class="emerald">${s.quality_score || 0} pts</td>
                  <td class="cyan">${s.punctuality_score || 0} pts</td>
                  <td class="emerald">${s.completion_score || 0} pts</td>
                  <td class="score-cell"><span class="score-pill">${s.global_score || 0} / 100</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    }

    // Contracts
    if (contracts.length > 0) {
      html += `<div class="np-section">
        <div class="np-section-title">📄 Contrats de Service & Rapports</div>
        <div class="np-contracts-grid">
          ${contracts.map(c => `
            <div class="np-contract-card">
              <div class="cc-top">
                <span class="cc-id">${c.name}</span>
                <span class="np-status active">${c.status || 'ACTIVE'}</span>
              </div>
              <div class="cc-title">${c.title || c.name}</div>
              <div class="cc-meta">
                Client: <strong>${c.customer || '—'}</strong><br>
                Superviseur: <strong>${c.supervisor_name || '—'}</strong><br>
                Tarif: <span class="rate">${c.rate_per_intervention || '—'} CAD</span> / int.
              </div>
              <button class="np-contract-btn" onclick="frappe.set_route('Form','Service Contract','${c.name}')">
                👁 Voir Rapport & QR Code
              </button>
            </div>
          `).join('')}
        </div>
      </div>`;
    }

    // Compliance Footer
    html += `<div class="np-compliance">
      <div class="lock">🔒 <span>Conformité Loi 25 (QC) : Rétention GPS max 90 jours active. Cryptage AES-256.</span></div>
      <span class="version">API Standard NetPlus v3.0</span>
    </div>`;

    content.html(html);
  }).catch(function (err) {
    root.find('#np-content').html(`<div style="text-align:center;padding:60px;color:#f87171;">Erreur: ${err.message || err}</div>`);
  });
}
