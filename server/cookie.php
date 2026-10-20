<?php
// La cookie policy come pagina a sé (da linkare ovunque). Spenta dal pannello admin: non esiste.
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/cookie_policy.php';

try { migrate(); $s = cp_settings(); } catch (Throwable $e) { $s = ['enabled' => false]; }
if (!$s['enabled']) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); exit('Pagina non disponibile.'); }
$lang = ($_GET['lang'] ?? 'it') === 'en' ? 'en' : 'it';
header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=300');
?><!doctype html>
<html lang="<?= $lang ?>"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cookie policy · GHOSTS 'N GOALS · Cesena FC</title>
<style>
body { margin:0; background:#0a0a0c; color:#ecece6; font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
main { max-width:760px; margin:0 auto; padding:28px 18px 60px; }
a { color:#ffb070; }
h1 { font-size:26px; margin:0 0 4px; } h2 { font-size:18px; margin:28px 0 8px; color:#ff7a1a; }
.upd { color:#9a9aa8; margin:0 0 20px; }
table { width:100%; border-collapse:collapse; font-size:14px; } th, td { text-align:left; padding:8px 6px; border-bottom:1px solid #2a2a36; vertical-align:top; }
th { color:#9a9aa8; } code { color:#ffd23f; }
.top { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:18px; }
.top a { text-decoration:none; }
</style></head><body><main>
<div class="top"><a href="./">← GHOSTS 'N GOALS</a><a href="?lang=<?= $lang === 'it' ? 'en' : 'it' ?>"><?= $lang === 'it' ? 'English' : 'Italiano' ?></a></div>
<?= cp_html($s, $lang) ?>
</main></body></html>
