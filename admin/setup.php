<?php
/* One-time setup + server check for the owner admin (IONOS / PHP version).
   - First visit: shows a server check and lets you create the owner's username and password.
   - After that: only a logged-in owner can change the username/password here. */
declare(strict_types=1);
require __DIR__ . '/lib.php';
start_session();

$user = load_user();
$canEdit = ($user === null) || is_logged_in();
$msg = ''; $err = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$canEdit) { $err = 'Log in first to change the owner login.'; }
    elseif (!hash_equals(csrf_token(), (string)($_POST['csrf'] ?? ''))) { $err = 'The form expired. Please try again.'; }
    else {
        $u = trim((string)($_POST['username'] ?? ''));
        $p = (string)($_POST['password'] ?? '');
        $p2 = (string)($_POST['password2'] ?? '');
        if (!preg_match('/^[A-Za-z0-9._@-]{3,60}$/', $u)) $err = 'Username: 3-60 letters, numbers, dots, dashes or @.';
        elseif (strlen($p) < 10) $err = 'The password needs at least 10 characters.';
        elseif ($p !== $p2) $err = "The two passwords don't match.";
        else {
            save_user($u, $p);
            $user = load_user();
            $msg = 'Saved! The owner can now log in with that username and password.';
        }
    }
}

function check(string $label, bool $ok, string $fix = ''): string {
    return '<li class="' . ($ok ? 'ok' : 'bad') . '"><b>' . ($ok ? '&#10003;' : '&#10007;') . '</b> ' . htmlspecialchars($label)
         . ($ok || !$fix ? '' : '<br><small>' . htmlspecialchars($fix) . '</small>') . '</li>';
}
$writable = fn(string $d) => is_dir($d) ? is_writable($d) : is_writable(dirname($d));
$checks = [
    check('PHP version ' . PHP_VERSION, version_compare(PHP_VERSION, '8.0', '>='), 'In IONOS, set this site\'s PHP version to 8.1 or newer (Hosting > PHP settings).'),
    check('Image tools (GD)', function_exists('imagecreatefromstring') && function_exists('imagejpeg'), 'Ask IONOS support to enable the PHP GD extension.'),
    check('Photo folder writable (img/uploads)', $writable(UPLOAD_DIR), 'In the IONOS File Manager, allow writing (permission 755) on img/uploads.'),
    check('Settings folder writable (content)', $writable(SITE_ROOT . '/content'), 'In the IONOS File Manager, allow writing (permission 755) on content.'),
    check('Private folder writable (private)', $writable(PRIVATE_DIR), 'In the IONOS File Manager, allow writing (permission 755) on private.'),
    check('Uploads up to ' . ini_get('upload_max_filesize') . ' allowed', (int)ini_get('upload_max_filesize') >= 4 || stripos((string)ini_get('upload_max_filesize'), 'G') !== false,
          'Raise upload_max_filesize to at least 8M in the IONOS PHP settings.'),
    check('Secure connection (https)', (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'),
          'Turn on SSL for this domain in IONOS before using the login for real.'),
];
$csrf = csrf_token();
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Silent Victory Training Center | Admin Setup</title>
<link rel="icon" href="../img/uploads/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css">
<style>
.checks{list-style:none;margin:6px 0 26px;padding:0}
.checks li{padding:10px 0;border-bottom:1px solid #2a2a2a;color:#ddd}
.checks li.ok b{color:#5cb85c}.checks li.bad b{color:#d9534f}
.checks small{color:#f0a0a0}
</style>
</head>
<body data-admin-page style="background:#111">
<header class="nav"><div class="wrap">
  <a class="brand" href="../index.html"><img src="../img/uploads/logo.png" alt="Silent Victory Training Center logo"><span>Silent Victory<small>Training Center</small></span></a>
  <a class="btn sm ghost" href="index.html" style="margin-left:auto">Owner Login</a>
</div></header>
<section class="block"><div class="wrap">
  <div class="admin-box form">
    <div class="eyebrow">Website Manager Only</div>
    <h1>Admin Setup</h1>
    <h4 style="font:800 22px/1 var(--display);text-transform:uppercase;margin:6px 0 8px">Server check</h4>
    <ul class="checks"><?= implode('', $checks) ?></ul>

    <?php if ($msg): ?><div class="alert ok" style="display:block"><?= htmlspecialchars($msg) ?> <a href="index.html">Go to Owner Login &rarr;</a></div><?php endif; ?>
    <?php if ($err): ?><div class="alert err" style="display:block"><?= htmlspecialchars($err) ?></div><?php endif; ?>

    <?php if ($canEdit): ?>
    <h4 style="font:800 22px/1 var(--display);text-transform:uppercase;margin:10px 0 8px"><?= $user ? 'Change owner login' : 'Create owner login' ?></h4>
    <form method="post" autocomplete="off">
      <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf) ?>">
      <div class="field"><label for="u">Owner username</label><input id="u" name="username" required value="<?= htmlspecialchars((string)($_POST['username'] ?? ($user['username'] ?? ''))) ?>" placeholder="e.g. shane"></div>
      <div class="row2">
        <div class="field"><label for="p">Password</label><input id="p" name="password" type="password" autocomplete="new-password" required minlength="10"></div>
        <div class="field"><label for="p2">Confirm password</label><input id="p2" name="password2" type="password" autocomplete="new-password" required minlength="10"></div>
      </div>
      <p class="admin-small">At least 10 characters. A short phrase makes a strong password.</p>
      <button class="btn" type="submit">Save Login <span class="arr">&rarr;</span></button>
    </form>
    <?php else: ?>
    <p>The owner login is already set up. To change the username or password, <a href="index.html">log in</a> first and then come back to this page.</p>
    <?php endif; ?>
  </div>
</div></section>
</body>
</html>
