<?php
/* Shared helpers for the Silent Victory owner admin (IONOS / PHP version). */
declare(strict_types=1);

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'lib.php') { http_response_code(404); exit; }

define('SITE_ROOT', dirname(__DIR__));
define('PRIVATE_DIR', SITE_ROOT . '/private');
define('USER_FILE', PRIVATE_DIR . '/admin-user.php');
define('ATTEMPTS_FILE', PRIVATE_DIR . '/login-attempts.json');
define('PHOTOS_FILE', SITE_ROOT . '/content/photos.json');
define('LINKS_FILE', SITE_ROOT . '/content/links.json');
define('UPLOAD_DIR', SITE_ROOT . '/img/uploads');
define('EDITABLE_LINKS', ['calendar']);
define('MAX_UPLOAD_BYTES', 15 * 1024 * 1024);
define('MAX_SIDE', 2400);
define('LOCK_AFTER', 5);          // failed logins...
define('LOCK_MINUTES', 15);       // ...lock that IP for this long

function start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
          || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('svtc_admin');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https,
                               'httponly' => true, 'samesite' => 'Strict']);
    session_start();
}

function json_out(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $msg, int $status = 400): never { json_out(['ok' => false, 'error' => $msg], $status); }

function load_user(): ?array {
    if (!is_file(USER_FILE)) return null;
    $u = include USER_FILE;
    return is_array($u) && isset($u['username'], $u['hash']) ? $u : null;
}

function save_user(string $username, string $password): void {
    if (!is_dir(PRIVATE_DIR)) mkdir(PRIVATE_DIR, 0755, true);
    $data = ['username' => strtolower(trim($username)),
             'hash' => password_hash($password, PASSWORD_DEFAULT),
             'updated' => date('c')];
    $php = "<?php\n// Owner login for the site admin. Password is stored as a one-way hash.\nreturn " . var_export($data, true) . ";\n";
    write_atomic(USER_FILE, $php);
}

function is_logged_in(): bool {
    start_session();
    return !empty($_SESSION['svtc_user']);
}

function csrf_token(): string {
    start_session();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}

function require_login_and_csrf(): void {
    if (!is_logged_in()) fail('Your login has expired. Please log in again.', 401);
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($sent) || !hash_equals(csrf_token(), $sent)) fail('Your session expired. Please reload the page.', 403);
}

function client_ip(): string { return $_SERVER['REMOTE_ADDR'] ?? 'unknown'; }

/* ----- login attempt limiting ----- */
function attempts_all(): array {
    if (!is_file(ATTEMPTS_FILE)) return [];
    $d = json_decode((string)file_get_contents(ATTEMPTS_FILE), true);
    return is_array($d) ? $d : [];
}
function locked_minutes_left(): int {
    $a = attempts_all()[client_ip()] ?? null;
    if (!$a || ($a['count'] ?? 0) < LOCK_AFTER) return 0;
    $left = ($a['last'] + LOCK_MINUTES * 60) - time();
    return $left > 0 ? (int)ceil($left / 60) : 0;
}
function record_attempt(bool $success): void {
    $all = attempts_all();
    $ip = client_ip();
    foreach ($all as $k => $v) if (($v['last'] ?? 0) < time() - 86400) unset($all[$k]);
    if ($success) unset($all[$ip]);
    else {
        $cur = $all[$ip] ?? ['count' => 0, 'last' => 0];
        if ($cur['last'] < time() - LOCK_MINUTES * 60) $cur['count'] = 0;
        $all[$ip] = ['count' => $cur['count'] + 1, 'last' => time()];
    }
    if (!is_dir(PRIVATE_DIR)) mkdir(PRIVATE_DIR, 0755, true);
    write_atomic(ATTEMPTS_FILE, json_encode($all));
}

/* ----- files ----- */
function write_atomic(string $path, string $data): void {
    $tmp = $path . '.tmp-' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, $data, LOCK_EX) === false) fail('The server could not save the change (folder not writable).', 500);
    if (!rename($tmp, $path)) { @unlink($tmp); fail('The server could not save the change.', 500); }
}

/* Read-modify-write a JSON file under an exclusive lock. */
function update_json(string $path, callable $mutate): array {
    $lock = fopen($path . '.lock', 'c');
    if (!$lock) fail('The server could not save the change (folder not writable).', 500);
    flock($lock, LOCK_EX);
    try {
        $data = is_file($path) ? json_decode((string)file_get_contents($path), true) : [];
        if (!is_array($data)) $data = [];
        $data = $mutate($data);
        write_atomic($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
        return $data;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
