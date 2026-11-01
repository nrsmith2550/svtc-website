/* Swaps site photos with the ones chosen in the owner's admin (content/photos.json). */
(function () {
  var root = document.documentElement;
  function done() { root.classList.remove("ph-wait"); }

  // Turn a CMS path ("/img/uploads/a.jpg") into one that works on any host or subfolder.
  function fix(url) {
    if (!url) return "";
    if (/^(https?:)?\/\//.test(url)) return url;
    return url.replace(/^\/+/, "");
  }
  function get(data, key) {
    var p = key.split(".");
    return data[p[0]] && data[p[0]][p[1]];
  }

  fetch("content/photos.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (data) {
      document.querySelectorAll("img[data-photo]").forEach(function (el) {
        var u = fix(get(data, el.getAttribute("data-photo")));
        if (u && el.getAttribute("src") !== u) el.src = u;
      });
      document.querySelectorAll("[data-photo-bg]").forEach(function (el) {
        var u = fix(get(data, el.getAttribute("data-photo-bg")));
        if (u) el.style.backgroundImage = "url('" + u.replace(/'/g, "%27") + "')";
      });
      var logo = fix(get(data, "site.logo"));
      var icon = document.querySelector('link[rel="icon"]');
      if (logo && icon) icon.href = logo;
    })
    .catch(function () {})
    .then(done);
})();
