// analytics_hub.js — Desk page script (place next to analytics_hub.json in
// <your_app>/<your_app>/page/analytics_hub/). Mounts the dashboard on page load.

frappe.pages["analytics-hub"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: "Analytics Hub",
    single_column: true,
  });
  const host = document.createElement("div");
  page.main.get(0).appendChild(host);
  wrapper.analyticsHub = AnalyticsHub.mount(host, {});
};

// Reload when the user navigates back to the page
frappe.pages["analytics-hub"].on_page_show = function (wrapper) {
  if (wrapper.analyticsHub) wrapper.analyticsHub.load();
};
