// doc_flow.js — Desk page script (place next to doc_flow.json in
// <your_app>/<your_app>/page/doc_flow/).
// One page hosts every module: the route's hash picks the module,
// e.g.  /app/doc_flow#sales_invoice  or  /app/doc_flow#purchase_invoice

frappe.pages["doc_flow"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: "Documents",
    single_column: true,
  });
  const host = document.createElement("div");
  page.main.get(0).appendChild(host);
  wrapper.docFlowHost = host;
  mountFromHash(wrapper);
};

frappe.pages["doc_flow"].on_page_show = function (wrapper) {
  mountFromHash(wrapper);
};

function mountFromHash(wrapper) {
  const host = wrapper.docFlowHost;
  if (!host) return;
  const key = (window.location.hash || "").replace("#", "").trim();
  host.innerHTML = "";
  if (key && DocFlow.MODULES[key]) {
    wrapper.docFlowApp = DocFlow.mount(host, { module: key });
  } else {
    // No module picked: show the grouped menu (Ventes / Achats / ...)
    DocFlow.buildMenu(host, function (picked) {
      window.location.hash = picked;
      mountFromHash(wrapper);
    });
  }
}
