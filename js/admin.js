/* Silent Victory owner admin (IONOS / PHP version).
   - Login: username + password checked by admin/api.php (PHP session cookie).
   - Admin mode: every site photo gets a "Change image" button and the Calendar links get "Edit link".
     Photos are resized in the browser, then re-checked and saved by the server into img/uploads. */
(function () {
  "use strict";
  var S = (window.SVTC = window.SVTC || {});
  var SESSION = "svtc_admin";
  var me = document.currentScript && document.currentScript.src;
  S.ROOT = me ? new URL("../", me).href : new URL("./", location.href).href;
  S.API = S.ROOT + "admin/api.php";
  S.LINK_LABELS = { calendar: "Calendar" };

  S.session = {
    get: function () { try { return sessionStorage.getItem(SESSION); } catch (e) { return null; } },
    set: function (t) { try { sessionStorage.setItem(SESSION, t); } catch (e) {} },
    clear: function () { try { sessionStorage.removeItem(SESSION); } catch (e) {} }
  };

  /* ---------- PHP API ---------- */
  S.api = function (action, form, csrf) {
    var opts = { method: form ? "POST" : "GET", credentials: "same-origin", cache: "no-store", headers: {} };
    if (form) opts.body = form;
    if (csrf) opts.headers["X-CSRF-Token"] = csrf;
    return fetch(S.API + "?action=" + action, opts).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: "The server sent an unexpected reply (" + r.status + ")." }; })
        .then(function (d) {
          if (!r.ok || !d.ok) { var e = new Error(d.error || ("Server error " + r.status)); e.status = r.status; throw e; }
          return d;
        });
    }, function () { var e = new Error("Couldn't reach the website server. Check your internet and try again."); e.status = 0; throw e; });
  };
  S.login = function (user, pass) {
    var f = new FormData(); f.append("username", user); f.append("password", pass);
    return S.api("login", f).then(function (d) { S.session.set(d.csrf); return d; });
  };
  S.logout = function () { S.session.clear(); return S.api("logout", new FormData()).catch(function () {}); };
  S.status = function () { return S.api("status"); };
  S.readJson = function (path) {
    return fetch(S.ROOT + path + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : {}; });
  };
  S.savePhoto = function (csrf, key, blob, ext) {
    var f = new FormData(); f.append("slot", key); f.append("image", blob, "photo." + ext);
    return S.api("photo", f, csrf);
  };
  S.saveLink = function (csrf, key, url) {
    var f = new FormData(); f.append("key", key); f.append("url", url);
    return S.api("link", f, csrf);
  };
  S.normalizeUrl = function (raw) {
    var u = String(raw || "").trim();
    if (!u) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
    try { var p = new URL(u); } catch (e) { return null; }
    if (!/^https?:$/.test(p.protocol) || p.hostname.indexOf(".") < 0) return null;
    return p.href;
  };

  /* ---------- image preparation: resize + compress in the browser (server re-checks) ---------- */
  function loadImage(file) {
    if (window.createImageBitmap) return createImageBitmap(file).catch(function () { return viaImg(file); });
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (res, rej) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { rej(new Error("Couldn't read that picture. Please choose a JPG or PNG file.")); };
      i.src = URL.createObjectURL(file);
    });
  }
  S.prepareImage = function (file, keepPng) {
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name))
      return Promise.reject(new Error("That file isn't a picture. Please choose a JPG or PNG."));
    return loadImage(file).then(function (img) {
      var w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
      var scale = Math.min(1, 2400 / Math.max(w, h));
      var c = document.createElement("canvas");
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      var ctx = c.getContext("2d");
      if (!keepPng) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (res, rej) {
        c.toBlob(function (b) { b ? res(b) : rej(new Error("Couldn't process that picture.")); },
          keepPng ? "image/png" : "image/jpeg", 0.88);
      }).then(function (blob) { return { blob: blob, ext: keepPng ? "png" : "jpg" }; });
    });
  };

  /* ---------- admin mode on the public pages ---------- */
  function siteUrl(u) {
    if (!u) return u;
    if (/^(https?:)?\/\//.test(u)) return u;
    return S.ROOT + u.replace(/^\/+/, "");
  }
  function slotEls(key) {
    return document.querySelectorAll('[data-photo="' + key + '"],[data-photo-bg="' + key + '"]');
  }
  function setSlot(key, url) {
    slotEls(key).forEach(function (el) {
      if (el.tagName === "IMG") el.src = url;
      else el.style.backgroundImage = "url('" + String(url).replace(/'/g, "%27") + "')";
    });
  }
  function toast(msg, kind) {
    var t = document.getElementById("svtc-toast");
    if (!t) { t = document.createElement("div"); t.id = "svtc-toast"; document.body.appendChild(t); }
    t.className = "svtc-toast show " + (kind || "");
    t.textContent = msg;
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.className = "svtc-toast " + (kind || ""); }, kind === "err" ? 9000 : 5000);
  }
  function friendly(e) {
    return (e && e.message) || "Something went wrong. Please try again.";
  }
  function adminHref() {
    return /\/admin\/?$|\/admin\/[^/]*$/.test(location.pathname) ? "./" : "admin/";
  }

  function startEditor(csrf) {
    var root = document.documentElement;
    root.classList.add("svtc-admin");

    var bar = document.createElement("div");
    bar.className = "admin-bar";
    bar.innerHTML = '<div class="wrap"><b>Admin Mode</b><span>Click <em>Change image</em> on any photo to upload a new one. Changes go live right away.</span>' +
      '<button type="button" class="admin-logout">Log out</button></div>';
    document.body.insertBefore(bar, document.body.firstChild);
    bar.querySelector(".admin-logout").addEventListener("click", function () {
      S.logout().then(function () { location.reload(); });
    });

    var input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.hidden = true;
    document.body.appendChild(input);
    var currentKey = null, busy = false;

    function buttonsFor(key) { return document.querySelectorAll('.change-img[data-key="' + key + '"]'); }

    var seen = [];
    document.querySelectorAll("[data-photo],[data-photo-bg]").forEach(function (el) {
      var key = el.getAttribute("data-photo") || el.getAttribute("data-photo-bg");
      var host = el.tagName === "IMG" ? el.parentElement : el;
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      var b = document.createElement("button");
      b.type = "button";
      b.className = "change-img" + (el.tagName === "IMG" ? "" : " on-bg") + (el.closest(".brand, .footer") ? " tiny" : "");
      b.setAttribute("data-key", key);
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-2h6l2 2h3v12H4z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>Change image</span>';
      b.title = "Change this photo";
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        if (busy) { toast("Please wait, still saving the last photo..."); return; }
        currentKey = key; input.value = ""; input.click();
      });
      host.appendChild(b);
      if (seen.indexOf(key) < 0) seen.push(key);
    });

    // show the latest saved photos straight from the repo (the live site can lag ~1 min)
    S.readJson("content/photos.json").then(function (data) {
      Object.keys(data).forEach(function (g) {
        Object.keys(data[g]).forEach(function (n) { setSlot(g + "." + n, siteUrl(data[g][n])); });
      });
    }).catch(function () {});

    /* ----- editable links (Calendar) ----- */
    var links = {};
    function applyLinks() {
      document.querySelectorAll("a[data-link]").forEach(function (a) {
        var u = links[a.getAttribute("data-link")];
        if (u) a.href = u;
      });
    }
    S.readJson("content/links.json").then(function (d) { links = d || {}; applyLinks(); }).catch(function () {});

    var modal = document.createElement("div");
    modal.className = "svtc-modal";
    modal.hidden = true;
    modal.innerHTML = '<form class="svtc-modal-box" novalidate>' +
      '<h3>Change <span class="lk-name">Calendar</span> link</h3>' +
      '<p>Paste the web address the <b class="lk-name">Calendar</b> button should open (for example an Instagram post, Google Calendar or a PDF link). It updates everywhere the button appears.</p>' +
      '<div class="field"><label for="svtc-link-url">Link address</label><input id="svtc-link-url" type="url" inputmode="url" placeholder="https://..." autocomplete="off" spellcheck="false"></div>' +
      '<p class="svtc-modal-err" hidden></p>' +
      '<div class="svtc-modal-actions"><button type="submit" class="btn sm">Save Link</button>' +
      '<a class="btn sm ghost svtc-test" href="#" target="_blank" rel="noopener">Test Link</a>' +
      '<button type="button" class="btn sm ghost svtc-cancel">Cancel</button></div></form>';
    document.body.appendChild(modal);
    var mForm = modal.querySelector("form"), mInput = modal.querySelector("input"), mErr = modal.querySelector(".svtc-modal-err"),
        mSave = modal.querySelector('button[type="submit"]'), mTest = modal.querySelector(".svtc-test"), linkKey = null;
    function closeModal() { modal.hidden = true; linkKey = null; }
    function openModal(key) {
      linkKey = key;
      var label = S.LINK_LABELS[key] || key;
      modal.querySelectorAll(".lk-name").forEach(function (s) { s.textContent = label; });
      var cur = links[key] || (document.querySelector('a[data-link="' + key + '"]') || {}).href || "";
      mInput.value = cur; mErr.hidden = true; mSave.disabled = false; mSave.textContent = "Save Link";
      modal.hidden = false; setTimeout(function () { mInput.focus(); mInput.select(); }, 30);
    }
    modal.querySelector(".svtc-cancel").addEventListener("click", closeModal);
    mInput.addEventListener("input", function () { mErr.hidden = true; });
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });
    mTest.addEventListener("click", function (e) {
      var u = S.normalizeUrl(mInput.value);
      if (!u) { e.preventDefault(); mErr.textContent = "That doesn't look like a web address. It should look like https://..."; mErr.hidden = false; return; }
      mTest.href = u;
    });
    mForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var u = S.normalizeUrl(mInput.value), key = linkKey;
      if (!u) { mErr.textContent = "That doesn't look like a web address. It should look like https://..."; mErr.hidden = false; return; }
      mErr.hidden = true; mSave.disabled = true; mSave.textContent = "Saving...";
      S.saveLink(csrf, key, u).then(function (d) {
        links = d.links || links; applyLinks(); closeModal();
        toast("Saved! The " + (S.LINK_LABELS[key] || key) + " button now opens the new link.", "ok");
      }).catch(function (err) {
        mErr.textContent = friendly(err); mErr.hidden = false; mSave.disabled = false; mSave.textContent = "Save Link";
      });
    });

    // "Edit link" buttons next to each editable link, plus one in the admin bar
    document.querySelectorAll("a[data-link]").forEach(function (a) {
      var key = a.getAttribute("data-link");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "edit-link" + (a.classList.contains("promo") ? " on-card" : "");
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Edit link</span>';
      b.title = "Change where the " + (S.LINK_LABELS[key] || key) + " link goes";
      b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openModal(key); });
      if (a.classList.contains("promo")) { a.style.position = "relative"; a.appendChild(b); }
      else a.insertAdjacentElement("afterend", b);
    });
    var barBtn = document.createElement("button");
    barBtn.type = "button"; barBtn.className = "admin-cal";
    barBtn.textContent = "Change Calendar Link";
    barBtn.addEventListener("click", function () { openModal("calendar"); });
    bar.querySelector(".admin-logout").insertAdjacentElement("beforebegin", barBtn);

    input.addEventListener("change", function () {
      var file = input.files && input.files[0], key = currentKey;
      if (!file || !key) return;
      busy = true;
      buttonsFor(key).forEach(function (b) { b.classList.add("saving"); b.querySelector("span").textContent = "Saving..."; });
      var keepPng = key === "site.logo";
      S.prepareImage(file, keepPng).then(function (img) {
        return S.savePhoto(csrf, key, img.blob, img.ext).then(function (d) {
          setSlot(key, siteUrl(d.url));
          toast("Saved! The new photo is live on the website.", "ok");
        });
      }).catch(function (e) {
        toast(friendly(e), "err");
      }).then(function () {
        busy = false;
        buttonsFor(key).forEach(function (b) { b.classList.remove("saving"); b.querySelector("span").textContent = "Change image"; });
      });
    });
  }

  S.startEditor = startEditor;
  function init() {
    if (document.body.hasAttribute("data-admin-page")) return;
    if (document.documentElement.classList.contains("svtc-admin")) return;
    if (!S.session.get()) return;
    // confirm the server session is still valid before showing admin tools
    S.status().then(function (d) {
      if (d.loggedIn && d.csrf) { S.session.set(d.csrf); startEditor(d.csrf); }
      else { S.session.clear(); location.reload(); }
    }).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
