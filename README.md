# Silent Victory Training Center — UFC-style redesign
Pages: index.html, about.html, services.html, contact.html, shop.html  (styles in css/style.css)

All photos live in img/uploads/ in this repo (copied from the original site), so the site doesn't depend
on silentvictorytc.com.

The contact form opens the visitor's email app addressed to SilentVictory.Shane@gmail.com.
To use a real form backend (Formspree, Netlify Forms, your old PHP handler), set the form's action.

## Changing photos (owner admin)
Every photo on the site is a named slot in `content/photos.json`; uploads are stored in `img/uploads/`.

**Admin mode (recommended):** the "Owner Login" link in the footer opens `admin/`. After logging in, every
page shows an admin bar and a **Change image** button on each photo. The chosen picture is resized in the
browser and committed to this repo (one commit per change); the live site updates in about a minute.

How the login works: `admin/setup.html` takes a fine-grained GitHub token (this repo only, Contents read/write)
plus an owner username and password, encrypts the token in the browser (PBKDF2-SHA256 600k + AES-GCM), and
saves only the encrypted copy to `content/admin-key.json`. Logging in decrypts it into the browser tab
(sessionStorage) until logout. Re-run setup to change the password or when the token expires; deleting the
token on GitHub disables the login immediately.

**Pages CMS (alternative):** the same photos can also be edited at https://app.pagescms.org (`.pages.yml`).
