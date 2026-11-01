<?php
/* Owner admin API (IONOS / PHP version).
   GET  ?action=status                  -> {loggedIn, csrf}
   POST ?action=login   (username, password)
   POST ?action=logout
   POST ?action=photo   (slot, image file)   requires login + X-CSRF-Token
   POST ?action=link    (key, url)           requires login + X-CSRF-Token */
declare(strict_types=1);
require __DIR__ . '/lib.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($action !== 'status' && $method !== 'POST') fail('Method not allowed.', 405);

switch ($action) {
case 'status':
    start_session();
    json_out(['ok' => true, 'loggedIn' => is_logged_in(), 'setup' => load_user() !== null,
              'csrf' => is_logged_in() ? csrf_token() : null]);

case 'login':
    $user = load_user();
    if (!$user) fail("The owner login hasn't been set up yet.", 409);
    $left = locked_minutes_left();
    if ($left > 0) fail("Too many wrong tries. Please wait $left minute" . ($left === 1 ? '' : 's') . ' and try again.', 429);
    $name = strtolower(trim((string)($_POST['username'] ?? '')));
    $pass = (string)($_POST['password'] ?? '');
    $ok = hash_equals($user['username'], $name) & password_verify($pass, $user['hash']);
    record_attempt((bool)$ok);
    if (!$ok) { usleep(400000); fail('Wrong username or password.', 401); }
    start_session();
    session_regenerate_id(true);
    $_SESSION['svtc_user'] = $user['username'];
    unset($_SESSION['csrf']);
    json_out(['ok' => true, 'csrf' => csrf_token()]);

case 'logout':
    start_session();
    $_SESSION = [];
    session_destroy();
    json_out(['ok' => true]);

case 'photo':
    require_login_and_csrf();
    $slot = (string)($_POST['slot'] ?? '');
    if (!preg_match('/^([a-z_]+)\.([a-z_]+)$/', $slot, $m)) fail('Unknown photo.');
    $photos = json_decode((string)@file_get_contents(PHOTOS_FILE), true) ?: [];
    if (!isset($photos[$m[1]][$m[2]])) fail('Unknown photo.');

    $f = $_FILES['image'] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $code = $f['error'] ?? UPLOAD_ERR_NO_FILE;
        fail(in_array($code, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
            ? 'That picture is too large for the server.' : 'The picture did not upload. Please try again.');
    }
    if ($f['size'] > MAX_UPLOAD_BYTES) fail('That picture is too large. Please use one under 15 MB.');
    $info = @getimagesize($f['tmp_name']);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP, IMAGETYPE_GIF], true))
        fail("That file isn't a picture we can use. Please choose a JPG or PNG.");
    if (!function_exists('imagecreatefromstring')) fail('The server is missing image support (GD).', 500);
    if ($info[0] * $info[1] > 60_000_000) fail('That picture is too large. Please use a smaller one.');

    // Re-encode with GD: strips anything that isn't plain image data and resizes big photos.
    $src = @imagecreatefromstring((string)file_get_contents($f['tmp_name']));
    if (!$src) fail("Couldn't read that picture. Please choose a JPG or PNG.");
    $w = imagesx($src); $h = imagesy($src);
    $scale = min(1, MAX_SIDE / max($w, $h));
    $nw = max(1, (int)round($w * $scale)); $nh = max(1, (int)round($h * $scale));
    $keepPng = ($slot === 'site.logo');
    $dst = imagecreatetruecolor($nw, $nh);
    if ($keepPng) { imagealphablending($dst, false); imagesavealpha($dst, true); }
    else imagefill($dst, 0, 0, imagecolorallocate($dst, 0, 0, 0));
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);

    if (!is_dir(UPLOAD_DIR) && !mkdir(UPLOAD_DIR, 0755, true)) fail('The photo folder is not writable.', 500);
    $name = str_replace('.', '-', $slot) . '-' . date('YmdHis') . '-' . bin2hex(random_bytes(3)) . ($keepPng ? '.png' : '.jpg');
    $ok = $keepPng ? imagepng($dst, UPLOAD_DIR . '/' . $name, 6) : imagejpeg($dst, UPLOAD_DIR . '/' . $name, 85);
    imagedestroy($src); imagedestroy($dst);
    if (!$ok) fail('The photo folder is not writable.', 500);

    $url = 'img/uploads/' . $name;
    update_json(PHOTOS_FILE, function (array $d) use ($m, $url) { $d[$m[1]][$m[2]] = '/' . $url; return $d; });
    json_out(['ok' => true, 'url' => $url]);

case 'link':
    require_login_and_csrf();
    $key = (string)($_POST['key'] ?? '');
    if (!in_array($key, EDITABLE_LINKS, true)) fail('Unknown link.');
    $url = trim((string)($_POST['url'] ?? ''));
    if (!preg_match('~^[a-z][a-z0-9+.-]*:~i', $url)) $url = 'https://' . $url;
    $parts = parse_url($url);
    if (!filter_var($url, FILTER_VALIDATE_URL) || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)
        || strpos($parts['host'] ?? '', '.') === false || strlen($url) > 2000)
        fail("That doesn't look like a web address. It should look like https://...");
    $links = update_json(LINKS_FILE, function (array $d) use ($key, $url) { $d[$key] = $url; return $d; });
    json_out(['ok' => true, 'links' => $links]);

default:
    fail('Unknown action.', 404);
}
