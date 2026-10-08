<?php
// Aspetto e sicurezza comuni del pannello admin.
declare(strict_types=1);
require_once __DIR__ . '/../lib/bootstrap.php';

function admin_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('gng_admin');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
    header('X-Frame-Options: DENY');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store');
    header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'");
}

function csrf_token(): string {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['csrf'];
}
function csrf_field(): string { return '<input type="hidden" name="csrf" value="' . h(csrf_token()) . '">'; }
function csrf_check(): void {
    if (!hash_equals($_SESSION['csrf'] ?? '', (string) ($_POST['csrf'] ?? ''))) {
        http_response_code(400); exit('Richiesta non valida. Ricarica la pagina.');
    }
}

function h(?string $s): string { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }

function flash(?string $msg = null, string $kind = 'ok'): ?array {
    if ($msg !== null) { $_SESSION['flash'] = [$msg, $kind]; return null; }
    $f = $_SESSION['flash'] ?? null; unset($_SESSION['flash']); return $f;
}

function page_head(string $title, bool $nav = true, string $active = ''): void {
    $f = flash();
    ?><!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= h($title) ?> · Ghosts 'n Goals admin</title>
<style>
:root { --bg:#0b0b10; --panel:#15151d; --line:#2a2a36; --text:#ecece6; --muted:#9a9aa8; --orange:#ff7a1a; --red:#ff4d4d; --green:#5fd07a; --gold:#ffd23f; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
header { display:flex; align-items:center; gap:16px; flex-wrap:wrap; padding:14px 20px; background:#000; border-bottom:3px solid var(--orange); }
header b { letter-spacing:.06em; }
header b span { color:var(--orange); }
nav { display:flex; gap:4px; flex-wrap:wrap; }
nav a { color:var(--muted); text-decoration:none; padding:6px 12px; border-radius:6px; }
nav a.on, nav a:hover { color:#000; background:var(--text); }
nav form { margin-left:auto; }
main { max-width:1080px; margin:0 auto; padding:24px 20px 60px; }
h1 { font-size:22px; margin:0 0 4px; } h2 { font-size:17px; margin:28px 0 10px; }
p.lead { color:var(--muted); margin:0 0 20px; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px; margin-bottom:16px; }
table { width:100%; border-collapse:collapse; }
th, td { text-align:left; padding:9px 8px; border-bottom:1px solid var(--line); vertical-align:middle; }
th { color:var(--muted); font-weight:600; font-size:13px; }
td.num { font-variant-numeric:tabular-nums; text-align:right; }
tr.hidden td { opacity:.45; text-decoration:line-through; }
input[type=text], input[type=password], input[type=datetime-local], input[type=search] { background:#0b0b10; color:var(--text); border:1px solid var(--line); border-radius:6px; padding:9px 10px; font:inherit; min-width:0; }
button, .btn { font:inherit; border:0; border-radius:6px; padding:8px 14px; cursor:pointer; background:var(--text); color:#000; font-weight:600; text-decoration:none; display:inline-block; }
button.ghost { background:transparent; color:var(--text); border:1px solid var(--line); }
button.danger { background:var(--red); color:#fff; }
button.small { padding:4px 9px; font-size:13px; }
.row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.inline { display:inline; }
.flash { padding:10px 14px; border-radius:8px; margin-bottom:16px; }
.flash.ok { background:rgba(95,208,122,.15); border:1px solid var(--green); }
.flash.err { background:rgba(255,77,77,.15); border:1px solid var(--red); }
.badge { display:inline-block; padding:2px 8px; border-radius:99px; font-size:12px; background:var(--line); color:var(--muted); }
.badge.live { background:var(--green); color:#000; }
.badge.next { background:var(--gold); color:#000; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; }
.stat b { display:block; font-size:28px; font-variant-numeric:tabular-nums; }
.stat span { color:var(--muted); font-size:13px; }
.bar { height:8px; background:var(--line); border-radius:4px; overflow:hidden; } .bar i { display:block; height:100%; background:var(--orange); }
.chips { display:flex; flex-wrap:wrap; gap:6px; }
.chip { display:inline-flex; align-items:center; gap:4px; background:#0b0b10; border:1px solid var(--line); border-radius:99px; padding:3px 4px 3px 10px; font-size:13px; }
.chip button { background:none; color:var(--muted); padding:0 6px; font-weight:400; }
.pager { display:flex; gap:8px; margin-top:12px; }
@media (max-width:640px) { th.opt, td.opt { display:none; } }
</style></head><body>
<?php if ($nav): ?>
<header>
  <b>GHOSTS <span>'N</span> GOALS · ADMIN</b>
  <nav>
    <a href="?p=scores" class="<?= $active === 'scores' ? 'on' : '' ?>">Classifica</a>
    <a href="?p=magic" class="<?= $active === 'magic' ? 'on' : '' ?>">Parola magica</a>
    <a href="?p=filter" class="<?= $active === 'filter' ? 'on' : '' ?>">Filtro nomi</a>
    <a href="?p=stats" class="<?= $active === 'stats' ? 'on' : '' ?>">Statistiche</a>
  </nav>
  <nav><form method="post" action="?p=logout"><?= csrf_field() ?><input type="hidden" name="action" value="logout"><button class="ghost small">Esci</button></form></nav>
</header>
<?php endif; ?>
<main>
<?php if ($f): ?><div class="flash <?= h($f[1]) ?>"><?= h($f[0]) ?></div><?php endif;
}

function page_foot(): void { echo "</main></body></html>"; }
