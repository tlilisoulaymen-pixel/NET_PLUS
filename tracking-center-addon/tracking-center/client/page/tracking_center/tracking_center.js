// tracking_center.js — Desk page script (place next to tracking_center.json
// in <your_app>/<your_app>/page/tracking_center/).

frappe.pages["tracking-center"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: "Tracking Center",
    single_column: true,
  });
  const host = document.createElement("div");
  page.main.get(0).appendChild(host);
  wrapper.trackingCenter = TrackingCenter.mount(host);
};

frappe.pages["tracking-center"].on_page_show = function (wrapper) {
  if (wrapper.trackingCenter) wrapper.trackingCenter.showTab(wrapper.trackingCenter.tab);
};
