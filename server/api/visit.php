<?php
// Conteggio degli accessi: anonimo (impronta dell'IP con sale, mai l'IP in chiaro), nessun cookie.
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';
require_post();
migrate();
$in = read_json();
$hash = client_hash();
$now = time();
// chi ricarica la pagina di continuo non gonfia i numeri: al massimo 20 accessi l'ora per dispositivo
$recent = (int) q('SELECT COUNT(*) FROM visits WHERE ip_hash = ? AND created_at > ?', [$hash, $now - 3600])->fetchColumn();
if ($recent < 20) {
    $device = in_array($in['device'] ?? '', ['mobile', 'tablet', 'desktop'], true) ? $in['device'] : '';
    $lang = in_array($in['lang'] ?? '', ['it', 'en'], true) ? $in['lang'] : '';
    $source = substr(preg_replace('/[^a-z0-9._-]/', '', strtolower((string) ($in['source'] ?? ''))) ?? '', 0, 60);
    $country = country_from_tz((string) ($in['tz'] ?? ''));
    q('INSERT INTO visits (created_at, ip_hash, device, lang, source, country) VALUES (?, ?, ?, ?, ?, ?)', [$now, $hash, $device, $lang, $source, $country]);
}
json_out(['ok' => true]);
