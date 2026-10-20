<?php
// Cookie policy per il gioco: dice se è attiva e ne restituisce il testo (con i dati del titolare
// presi dal pannello admin). Quando è spenta il gioco non mostra il pulsante.
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/cookie_policy.php';

try { migrate(); } catch (Throwable $e) { json_out(['ok' => true, 'enabled' => false], 200, 60); }
$s = cp_settings();
if (!$s['enabled']) json_out(['ok' => true, 'enabled' => false], 200, 60);
$lang = ($_GET['lang'] ?? 'it') === 'en' ? 'en' : 'it';
json_out(['ok' => true, 'enabled' => true, 'html' => cp_html($s, $lang), 'url' => 'cookie.php?lang=' . $lang], 200, 60);
