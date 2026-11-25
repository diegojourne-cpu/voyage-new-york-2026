/* Appliqué avant l'affichage pour éviter un flash : apparence choisie dans Plus → Apparence. */
(function () {
  try {
    var t = JSON.parse(localStorage.getItem("nyc26:theme") || '"auto"');
    if (t === "clair" || t === "sombre") {
      document.documentElement.dataset.theme = t;
      var m = document.createElement("meta"); m.name = "theme-color"; m.content = t === "sombre" ? "#000000" : "#f5f5f7";
      document.head.appendChild(m);
    }
  } catch (e) {}
})();
