/* Injecteur du sprite d'icônes NetPlus dans le DOM du Desk.
   Fallback garanti : même si le hook app_include_icons n'est pas pris en
   compte par la version de Frappe, ce script charge le sprite et les
   <use href="#icon-np-*"> des Workspaces se résolvent dynamiquement. */
(function () {
  if (document.getElementById("netplus-icon-sprite")) return;
  fetch("/assets/netplus/icons/netplus_icons.svg")
    .then(function (r) { return r.ok ? r.text() : null; })
    .then(function (svg) {
      if (!svg || document.getElementById("netplus-icon-sprite")) return;
      var holder = document.createElement("div");
      holder.id = "netplus-icon-sprite";
      holder.style.display = "none";
      holder.innerHTML = svg;
      document.body.insertBefore(holder, document.body.firstChild);
    })
    .catch(function () { /* silencieux : le sprite natif peut déjà être inclus */ });
})();
