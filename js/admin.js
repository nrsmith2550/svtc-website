/* Silent Victory owner admin.
   - Login: username + password decrypt a GitHub access key (content/admin-key.json) that can only
     edit this repo. The key is kept in this browser tab only (sessionStorage) until logout.
   - Admin mode: every site photo gets a "Change image" button. The new picture is resized in the
     browser and committed to the repo (img/uploads + content/photos.json) in one commit. */
(function () {
  "use strict";
  var S = (window.SVTC = window.SVTC || {});
  S.REPO = "nrsmith2550/svtc-website";
  S.BRANCH = "main";
  S.API = "https://api.github.com";
  S.KEY_PATH = "content/admin-key.json";
  S.PHOTOS_PATH = "content/photos.json";
  S.ITER = 600000;
  var SESSION = "svtc_admin";

  /* ---------- small helpers ---------- */
  function b64(buf) {
    var bytes = new Uint8Array(buf), s = "";
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) {
    var bin = atob(str.replace(/\s/g, "")), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  S.b64 = b64; S.unb64 = unb64;

  S.session = {
    get: function () { try { return sessionStorage.getItem(SESSION); } catch (e) { return null; } },
    set: function (t) { try { sessionStorage.setItem(SESSION, t); } catch (e) {} },
    clear: function () { try { sessionStorage.removeItem(SESSION); } catch (e) {} }
  };

  /* ---------- crypto: username+password -> AES key that wraps the GitHub token ---------- */
  function deriveKey(user, pass, salt, iter) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(user.trim().toLowerCase() + "\n" + pass), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" },
          base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      });
  }
  S.encryptToken = function (user, pass, token) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(user, pass, salt, S.ITER).then(function (key) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(token));
    }).then(function (ct) {
      return { v: 1, kdf: "PBKDF2-SHA256", iter: S.ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
    });
  };
  S.decryptToken = function (user, pass, blob) {
    return deriveKey(user, pass, unb64(blob.salt), blob.iter).then(function (key) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(blob.iv) }, key, unb64(blob.ct));
    }).then(function (pt) { return new TextDecoder().decode(pt); });
  };

  /* ---------- GitHub API ---------- */
  S.gh = function (token, path, opts) {
    opts = opts || {};
    var headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (token) headers.Authorization = "Bearer " + token;
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch(S.API + path, { method: opts.method || "GET", headers: headers, cache: "no-store",
      body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        if (r.status === 204) return null;
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) { var e = new Error((data && data.message) || ("GitHub error " + r.status)); e.status = r.status; throw e; }
          return data;
        });
      });
  };
  function repoPath(p) { return "/repos/" + S.REPO + p; }

  S.readJson = function (token, path, ref) {
    return S.gh(token, repoPath("/contents/" + path + "?ref=" + encodeURIComponent(ref || S.BRANCH)))
      .then(function (d) { return { sha: d.sha, data: JSON.parse(new TextDecoder().decode(unb64(d.content))) }; });
  };

  /* One commit that adds files and rewrites content/photos.json. Retries if someone else committed first. */
  S.commitPhoto = function (token, key, fileName, blob, message) {
    var imgBlobSha;
    function attempt(left) {
      var commitSha, treeSha, photos;
      return S.gh(token, repoPath("/git/ref/heads/" + S.BRANCH)).then(function (ref) {
        commitSha = ref.object.sha;
        return S.gh(token, repoPath("/git/commits/" + commitSha));
      }).then(function (c) {
        treeSha = c.tree.sha;
        return S.readJson(token, S.PHOTOS_PATH, commitSha);
      }).then(function (j) {
        photos = j.data;
        var parts = key.split(".");
        photos[parts[0]] = photos[parts[0]] || {};
        photos[parts[0]][parts[1]] = "/img/uploads/" + fileName;
        if (imgBlobSha) return { sha: imgBlobSha };
        return blob.arrayBuffer().then(function (buf) {
          return S.gh(token, repoPath("/git/blobs"), { method: "POST", body: { content: b64(buf), encoding: "base64" } });
        });
      }).then(function (b) {
        imgBlobSha = b.sha;
        return S.gh(token, repoPath("/git/blobs"), { method: "POST",
          body: { content: JSON.stringify(photos, null, 2) + "\n", encoding: "utf-8" } });
      }).then(function (jb) {
        return S.gh(token, repoPath("/git/trees"), { method: "POST", body: { base_tree: treeSha, tree: [
          { path: "img/uploads/" + fileName, mode: "100644", type: "blob", sha: imgBlobSha },
          { path: S.PHOTOS_PATH, mode: "100644", type: "blob", sha: jb.sha }] } });
      }).then(function (t) {
        return S.gh(token, repoPath("/git/commits"), { method: "POST", body: { message: message, tree: t.sha, parents: [commitSha] } });
      }).then(function (c) {
        return S.gh(token, repoPath("/git/refs/heads/" + S.BRANCH), { method: "PATCH", body: { sha: c.sha, force: false } });
      }).then(function () { return photos; }, function (e) {
        if (left > 0 && (e.status === 409 || e.status === 422)) return attempt(left - 1);
        throw e;
      });
    }
    return attempt(3);
  };

  /* ---------- image preparation: resize + compress in the browser ---------- */
  function loadImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file).catch(function () { return viaImg(file); });
    }
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
          keepPng ? "image/png" : "image/jpeg", 0.85);
      }).then(function (blob) { return { blob: blob, ext: keepPng ? "png" : "jpg" }; });
    });
  };

  /* ---------- admin mode on the public pages ---------- */
  function rawUrl(u) {
    if (!u) return u;
    var m = u.match(/^\/?(img\/uploads\/.+)$/);
    return m ? "https://raw.githubusercontent.com/" + S.REPO + "/" + S.BRANCH + "/" + m[1] : u;
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
    if (e && e.status === 401) return "Your login has expired. Please log out and log in again.";
    if (e && e.status === 403) return "This login isn't allowed to change the website. Please run admin setup again.";
    if (e && e.status === 404) return "Couldn't reach the website files. Please run admin setup again.";
    return (e && e.message) || "Something went wrong. Please try again.";
  }
  function adminHref() {
    return /\/admin\/?$|\/admin\/[^/]*$/.test(location.pathname) ? "./" : "admin/";
  }

  function startEditor(token) {
    var root = document.documentElement;
    root.classList.add("svtc-admin");

    var bar = document.createElement("div");
    bar.className = "admin-bar";
    bar.innerHTML = '<div class="wrap"><b>Admin Mode</b><span>Click <em>Change image</em> on any photo to upload a new one. Changes go live in about a minute.</span>' +
      '<button type="button" class="admin-logout">Log out</button></div>';
    document.body.insertBefore(bar, document.body.firstChild);
    bar.querySelector(".admin-logout").addEventListener("click", function () {
      S.session.clear(); location.reload();
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
    S.readJson(token, S.PHOTOS_PATH).then(function (j) {
      Object.keys(j.data).forEach(function (g) {
        Object.keys(j.data[g]).forEach(function (n) { setSlot(g + "." + n, rawUrl(j.data[g][n])); });
      });
    }).catch(function (e) { if (e.status === 401) toast(friendly(e), "err"); });

    input.addEventListener("change", function () {
      var file = input.files && input.files[0], key = currentKey;
      if (!file || !key) return;
      busy = true;
      buttonsFor(key).forEach(function (b) { b.classList.add("saving"); b.querySelector("span").textContent = "Saving..."; });
      var keepPng = key === "site.logo";
      S.prepareImage(file, keepPng).then(function (img) {
        var name = key.replace(".", "-") + "-" + Date.now() + "." + img.ext;
        var preview = URL.createObjectURL(img.blob);
        return S.commitPhoto(token, key, name, img.blob, "Change photo: " + key + " (via site admin)").then(function () {
          setSlot(key, preview);
          toast("Saved! The live website will show the new photo in about a minute.", "ok");
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
    var t = S.session.get();
    if (t) startEditor(t);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
