# Silent Victory Training Center — IONOS (PHP) version

This branch (`ionos-php`) is the self-hosted version of the site for regular IONOS web hosting.
The live GitHub Pages site and its GitHub-based admin stay on the `main` branch and are not affected.

Same pages and design as `main`. The difference is the owner admin: logins, photo uploads and the
Calendar link are handled by PHP on the IONOS server, and changes go live instantly. No GitHub needed.

## Test it on IONOS (without touching the current site)
1. Download `svtc-ionos-php.zip` (or this branch as a zip) and unzip it.
2. In IONOS, open **Hosting → File Manager** (or connect with SFTP) and create a test folder,
   e.g. `svtc-test`. Upload everything from the unzipped folder into it, including the
   hidden `.htaccess` files in `content/`, `img/uploads/` and `private/`.
3. Visit `https://YOUR-DOMAIN/svtc-test/admin/setup.php`. The **Server check** should be all green
   (fix any red item using the hint under it), then create the owner username and password.
4. Visit `https://YOUR-DOMAIN/svtc-test/private/admin-user.php`. You should see **403 Forbidden**.
   That confirms the private folder is locked.
5. Log in at `https://YOUR-DOMAIN/svtc-test/admin/` and try **Change image** and **Change Calendar Link**.

When you're happy, the same files go into the main web folder for silentvictorytc.com
(after the test, either re-upload fresh or move the test folder's contents, including `content/`,
`img/uploads/` and `private/`, so the owner's changes and login come along).

## How the admin works
- `admin/index.html` is the login page; `admin/api.php` handles login/logout, photo uploads and link changes.
- `admin/setup.php` shows a server check and creates the owner login. Once a login exists, only a
  logged-in owner can change it there.
- The password is stored only as a one-way hash in `private/admin-user.php` (blocked from the web).
- Security: session cookie (HttpOnly, SameSite=Strict, Secure on https), CSRF token on every change,
  5 wrong tries locks that address for 15 minutes, uploads are re-encoded by the server (GD) and
  resized to at most 2400px, and `img/uploads` can't run scripts.
- Photo slots live in `content/photos.json`, links in `content/links.json`; `js/photos.js` applies them
  for visitors and `js/admin.js` adds the admin buttons. Old photos are kept in `img/uploads/`, so any
  earlier picture can be restored by uploading it again.

## Requirements
PHP 8.0+ with GD (standard on IONOS), and write access to `img/uploads`, `content` and `private`.
