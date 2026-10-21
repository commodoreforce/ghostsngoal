<?php
// Immagine dell'anteprima social di un record (1200x630): pixel art disegnata a 300x158 e
// ingrandita 4 volte senza sfumature, con il carattere del gioco.
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/share.php';

$id = (int) ($_GET['id'] ?? 0);
$en = ($_GET['lang'] ?? '') === 'en';
try { $s = share_score($id); } catch (Throwable $e) { $s = null; }

const SW = 300, SH = 158;
$font = __DIR__ . '/lib/fonts/PressStart2P.ttf';
$im = imagecreatetruecolor(SW, SH);
imagealphablending($im, true);
$rgb = fn (string $hex) => imagecolorallocate($im, hexdec(substr($hex, 1, 2)), hexdec(substr($hex, 3, 2)), hexdec(substr($hex, 5, 2)));

// cielo a bande e stelle
$bands = ['#07050f', '#0b0820', '#100c2c', '#161238', '#1d1744', '#251d50'];
foreach ($bands as $i => $b) imagefilledrectangle($im, 0, $i * 20, SW, $i * 20 + 19, $rgb($b));
imagefilledrectangle($im, 0, 120, SW, SH, $rgb('#251d50'));
mt_srand(7);
for ($i = 0; $i < 60; $i++) imagesetpixel($im, mt_rand(0, SW - 1), mt_rand(0, 100), $rgb(mt_rand(0, 9) < 3 ? '#f4f4f0' : '#8a86b8'));
// lo stadio in basso, scurito
$stands = __DIR__ . '/backgrounds/l1_inside0.png';
if (is_file($stands) && ($st = @imagecreatefrompng($stands))) {
    imagecopy($im, $st, 0, SH - 70, 60, 96, SW, 70);
    imagedestroy($st);
    for ($i = 0; $i < 6; $i++) imagefilledrectangle($im, 0, SH - 70 + $i * 4, SW, SH - 67 + $i * 4, imagecolorallocatealpha($im, 7, 5, 15, (int) (20 + $i * 16)));
    imagefilledrectangle($im, 0, SH - 46, SW, SH, imagecolorallocatealpha($im, 7, 5, 15, 70));
}
// luna
imagefilledellipse($im, 286, 40, 16, 16, $rgb('#fff2c8'));
imagefilledrectangle($im, 282, 37, 284, 39, $rgb('#e8d8a8'));

// testo a pixel pieni (colore negativo = niente sfumature), con contorno
function px_text($im, string $font, string $s, int $x, int $y, int $px, int $col, string $align = 'left', ?int $stroke = null): void {
    // GD misura in punti a 96 dpi: 8 pixel = 6 punti (il carattere va usato a multipli di 8 pixel)
    $size = $px * 0.75;
    $bb = imagettfbbox($size, 0, $font, $s);
    $w = $bb[2] - $bb[0];
    if ($align === 'center') $x = (int) round($x - $w / 2);
    if ($align === 'right') $x -= $w;
    $by = $y + $px;
    if ($stroke !== null) foreach ([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]] as [$dx, $dy]) imagettftext($im, $size, 0, $x + $dx, $by + $dy, -$stroke, $font, $s);
    imagettftext($im, $size, 0, $x, $by, -$col, $font, $s);
}

$black = $rgb('#000000');
px_text($im, $font, "GHOSTS 'N GOALS", SW / 2, 5, 16, $rgb('#f4f4f0'), 'center', $rgb('#ff7a1a'));

if ($s) {
    $hero = preg_replace('/[^a-z]/', '', (string) $s['hero']);
    $gold = (int) $s['cleared'] === 1;
    // ritratto nella cornice
    $px = 12; $py = 26; $pw = 128;      // il ritratto a 2x esatto: pixel tutti uguali
    imagefilledrectangle($im, $px - 6, $py - 6, $px + $pw + 5, $py + $pw + 5, $black);
    imagefilledrectangle($im, $px - 4, $py - 4, $px + $pw + 3, $py + $pw + 3, $rgb($gold ? '#ffd23f' : '#ff7a1a'));
    imagefilledrectangle($im, $px, $py, $px + $pw - 1, $py + $pw - 1, $rgb('#120c22'));
    $pf = __DIR__ . "/sprites/portrait_$hero.png";
    if (is_file($pf) && ($p = @imagecreatefrompng($pf))) {
        imagecopyresized($im, $p, $px, $py, 0, 0, $pw, $pw, imagesx($p), imagesy($p));
        imagedestroy($p);
    }
    // lo scudetto del Cesena in alto a destra, a metà misura
    $crest = __DIR__ . '/sprites/en_crest.png';
    if (is_file($crest) && ($c = @imagecreatefrompng($crest))) {
        imagecopyresampled($im, $c, SW - 36, 18, 0, 0, (int) (imagesx($c) / 2), (int) (imagesy($c) / 2), imagesx($c), imagesy($c));
        imagedestroy($c);
    }
    $x = 152;
    px_text($im, $font, (string) $s['nickname'], $x, 30, 8, $rgb('#9fe8ff'), 'left', $black);
    px_text($im, $font, $en ? 'MY HIGH SCORE' : 'IL MIO RECORD', $x, 46, 8, $rgb('#ff3b3b'), 'left', $black);
    px_text($im, $font, str_pad((string) (int) $s['score'], 7, '0', STR_PAD_LEFT), $x, 58, 16, $rgb('#ffd23f'), 'left', $black);
    px_text($im, $font, '#' . $s['rank'] . ($en ? ' ON THE BOARD' : ' IN CLASSIFICA'), $x, 80, 8, $rgb('#f4f4f0'), 'left', $black);
    // il campionato in cui si è arrivati: Serie BKT, Serie A, Champions
    $lap = max(1, min(3, (int) ($s['lap'] ?? 1)));
    $league = ['SERIE BKT', 'SERIE A', 'CHAMPIONS'][$lap - 1];
    if ($gold && $lap === 3) $lvl = $en ? ['CHAMPIONS', 'OF EUROPE!'] : ["CAMPIONI", "D'EUROPA!"];
    elseif ($gold) $lvl = $en ? ['KIT MAN PETROSINO', 'SAVED!'] : ['IL MAGAZZINIERE', 'PETROSINO SALVATO!'];
    else $lvl = [$league . ($en ? ' · STAGE ' : ' · LIV. ') . (int) $s['level_reached']];
    foreach ($lvl as $i => $ln) px_text($im, $font, $ln, $x, 92 + $i * 10, 8, $rgb($gold ? '#7fd06a' : '#c8c4e8'), 'left', $black);
    imagefilledrectangle($im, $x - 4, 114, SW - 6, 140, $black);
    imagefilledrectangle($im, $x - 4, 114, SW - 6, 114, $rgb('#ff7a1a'));
    imagefilledrectangle($im, $x - 4, 140, SW - 6, 140, $rgb('#ff7a1a'));
    px_text($im, $font, $en ? 'BEAT ME' : 'BATTIMI SE', $x + 2, 118, 8, $rgb('#ffd23f'));
    px_text($im, $font, $en ? 'IF YOU CAN!' : 'CI RIESCI!', $x + 2, 129, 8, $rgb('#ffd23f'));
} else {
    $crest = __DIR__ . '/sprites/en_crest.png';
    if (is_file($crest) && ($c = @imagecreatefrompng($crest))) {
        imagecopyresized($im, $c, 24, 30, 0, 0, imagesx($c) * 3 / 2, imagesy($c) * 3 / 2, imagesx($c), imagesy($c));
        imagedestroy($c);
    }
    $lines = $en ? ['PETROSINO THE', 'KIT MAN HAS BEEN', 'KIDNAPPED!'] : ['HANNO RAPITO IL', 'MAGAZZINIERE', 'PETROSINO!'];
    foreach ($lines as $i => $ln) px_text($im, $font, $ln, 140, 40 + $i * 12, 8, $rgb('#ff3b3b'), 'left', $black);
    px_text($im, $font, $en ? "IT'S UP TO YOU." : 'TOCCA A TE.', 140, 84, 8, $rgb('#f4f4f0'), 'left', $black);
    px_text($im, $font, '#DAIBURDEL', 140, 104, 8, $rgb('#ff7a1a'), 'left', $black);
}

$out = imagecreatetruecolor(1200, 630);
imagecopyresized($out, $im, 0, 0, 0, 0, 1200, 632, SW, SH);
header('Content-Type: image/png');
header('Cache-Control: public, max-age=86400');
imagepng($out, null, 6);
