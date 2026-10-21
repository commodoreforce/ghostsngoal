<?php
// Link di un record condiviso: ai social mostra l'anteprima con il punteggio (Open Graph),
// le persone vengono mandate subito al gioco.
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/share.php';

$id = (int) ($_GET['id'] ?? 0);
$en = ($_GET['lang'] ?? '') === 'en';
try { $s = share_score($id); } catch (Throwable $e) { $s = null; }
$base = share_base_url();
$e = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
if ($s) {
    $title = $en ? "Ghosts 'N Goals: the official Cesena FC Halloween video game" : "Ghosts 'N Goals: il videogioco ufficiale del Cesena FC per Halloween";
    $desc = ($en ? "{$s['nickname']} scored {$s['score']} points: #{$s['rank']} on the leaderboard. Beat me if you can!" : "{$s['nickname']} ha fatto {$s['score']} punti: #{$s['rank']} in classifica. Battimi se ci riesci!") . ' #DAIBURDEL';
    $img = $base . 'share_img.php?id=' . (int) $s['id'] . ($en ? '&lang=en' : '');
} else {
    $title = $en ? "Ghosts 'N Goals: the official Cesena FC Halloween video game" : "Ghosts 'N Goals: il videogioco ufficiale del Cesena FC per Halloween";
    $desc = $en ? "Petrosino the kit man has been kidnapped. It's up to you. The Cesena FC Halloween arcade." : "Hanno rapito il Magazziniere Petrosino. Tocca a te. L'arcade di Halloween del Cesena FC.";
    $img = $base . 'og.png';
}
$game = $base . '?utm_source=share';
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: public, max-age=300');
?><!doctype html>
<html lang="<?= $en ? 'en' : 'it' ?>"><head><meta charset="utf-8">
<title><?= $e($title) ?></title>
<meta name="description" content="<?= $e($desc) ?>">
<meta property="og:type" content="website">
<meta property="og:title" content="<?= $e($title) ?>">
<meta property="og:description" content="<?= $e($desc) ?>">
<meta property="og:image" content="<?= $e($img) ?>">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="<?= $e($base . 'share.php?id=' . $id) ?>">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=<?= $e($game) ?>">
</head><body style="background:#07050f;color:#fff;font-family:sans-serif">
<p><a href="<?= $e($game) ?>" style="color:#ff7a1a">GHOSTS 'N GOALS</a></p>
<script>location.replace(<?= json_encode($game) ?>);</script>
</body></html>
