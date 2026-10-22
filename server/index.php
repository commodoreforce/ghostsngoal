<?php
// Porta d'ingresso del sito: il gioco, oppure il volantino "MISSING" quando dall'admin è attiva
// la manutenzione. Chi è collegato all'admin vede sempre il gioco, così può provarlo online.
// Se il database non risponde si mostra il gioco: meglio aperto che chiuso per errore.
declare(strict_types=1);

$maint = false;
$cfg = getenv('GNG_CONFIG') ?: __DIR__ . '/config.php';
// sito appena caricato e non ancora installato: si parte con l'installazione guidata
if (!is_file($cfg) && is_file(__DIR__ . '/install.php')) { header('Location: install.php', true, 302); exit; }
if (is_file($cfg)) {
    require __DIR__ . '/lib/bootstrap.php';
    $maint = meta_get('maint_on', '0') === '1';
    if ($maint && isset($_COOKIE['gng_admin'])) {
        session_name('gng_admin');
        session_start(['read_and_close' => true]);
        if (!empty($_SESSION['admin_id']) && empty($_GET['missing'])) $maint = false;   // ?missing=1: l'admin vede il volantino
    }
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('X-Content-Type-Options: nosniff');

if ($maint) {
    require_once __DIR__ . '/lib/share.php';
    http_response_code(503);            // per i motori di ricerca: torna presto, non è un errore
    header('Retry-After: 3600');
    $html = (string) file_get_contents(__DIR__ . '/lib/maintenance.html');
    echo str_replace('%BASE%', htmlspecialchars(share_base_url(), ENT_QUOTES, 'UTF-8'), $html);
    exit;
}

// gli indirizzi completi dell'anteprima dei link seguono il dominio da cui si apre il sito (es. lo staging)
require_once __DIR__ . '/lib/share.php';
$html = (string) file_get_contents(__DIR__ . '/index.html');
$base = share_base_url();
$prod = 'https://ghostsngoals.com/';

// ?lang=en: la stessa pagina in inglese per i motori di ricerca e per i link condivisi all'estero
if (($_GET['lang'] ?? '') === 'en') {
    $it = "Ghosts 'N Goals: il videogioco ufficiale del Cesena FC per Halloween";
    $en = "Ghosts 'N Goals: the official Cesena FC Halloween video game";
    $html = strtr($html, [
        '<html lang="it">' => '<html lang="en">',
        $it => $en,
        "Hanno rapito il Magazziniere Petrosino: salvalo con Shpendi, Ciofi, Klinsmann e il Mister Diamanti. Gioca gratis dal telefono, entra in classifica. #DAIBURDEL"
            => "Petrosino the kit man has been kidnapped: save him with Shpendi, Ciofi, Klinsmann and Mister Diamanti. Play free on your phone and climb the leaderboard. #DAIBURDEL",
        "Hanno rapito il Magazziniere Petrosino. Tocca a te: gioca gratis, sfida la classifica e condividi il tuo record. #DAIBURDEL"
            => "Petrosino the kit man has been kidnapped. It's up to you: play free, top the leaderboard and share your record. #DAIBURDEL",
        "Hanno rapito il Magazziniere Petrosino. Tocca a te. #DAIBURDEL" => "Petrosino the kit man has been kidnapped. It's up to you. #DAIBURDEL",
        '<meta property="og:locale" content="it_IT" />' => '<meta property="og:locale" content="en_GB" />',
        '<meta property="og:locale:alternate" content="en_GB" />' => '<meta property="og:locale:alternate" content="it_IT" />',
        '<link rel="canonical" href="https://ghostsngoals.com/" />' => '<link rel="canonical" href="https://ghostsngoals.com/?lang=en" />',
        '<meta property="og:url" content="https://ghostsngoals.com/" />' => '<meta property="og:url" content="https://ghostsngoals.com/?lang=en" />',
    ]);
}

$host = strtolower(preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? '')));
if ($host !== 'ghostsngoals.com' || parse_url($base, PHP_URL_PATH) !== '/') {
    // staging o altri indirizzi: niente motori di ricerca (sarebbe un doppione del sito vero)
    header('X-Robots-Tag: noindex, nofollow');
    $html = str_replace('content="index, follow, max-image-preview:large"', 'content="noindex, nofollow"', $html);
}
if ($base !== $prod) $html = str_replace($prod, htmlspecialchars($base, ENT_QUOTES, 'UTF-8'), $html);
echo $html;
