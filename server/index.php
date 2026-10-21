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
if ($base !== 'https://ghostsngoals.com/') $html = str_replace('https://ghostsngoals.com/', htmlspecialchars($base, ENT_QUOTES, 'UTF-8'), $html);
echo $html;
