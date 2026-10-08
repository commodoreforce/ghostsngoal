<?php
// Inizio e fine di una partita. Il gettone (token) lega il punteggio alla partita
// e permette di verificare che durata e punti siano plausibili.
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';
require_post();
$in = read_json();
$action = $in['action'] ?? '';

if ($action === 'start') {
    $hero = in_array($in['character'] ?? '', GNG_HEROES, true) ? $in['character'] : 'shpendi';
    // freno contro chi apre migliaia di partite finte
    if (too_many('run', 120, 3600)) json_out(['ok' => false, 'error' => 'rate'], 429);
    log_attempt('run');
    $token = bin2hex(random_bytes(24));
    q('INSERT INTO runs (token, hero, started_at, ip_hash) VALUES (?, ?, ?, ?)', [$token, $hero, time(), client_hash()]);
    json_out(['ok' => true, 'token' => $token]);
}

if ($action === 'end') {
    $token = (string) ($in['token'] ?? '');
    if (!preg_match('/^[a-f0-9]{48}$/', $token)) json_out(['ok' => false, 'error' => 'token'], 400);
    $run = q('SELECT * FROM runs WHERE token = ?', [$token])->fetch();
    if (!$run || $run['ended_at'] !== null) json_out(['ok' => false, 'error' => 'token'], 409);

    $score = max(0, min(99999999, (int) ($in['score'] ?? 0)));
    $level = max(1, min(3, (int) ($in['level'] ?? 1)));
    $lap = max(1, min(2, (int) ($in['loop'] ?? 1)));
    $cleared = !empty($in['cleared']) ? 1 : 0;
    $durMs = max(0, (int) ($in['durationMs'] ?? 0));
    $cause = substr(preg_replace('/[^a-z_]/', '', strtolower((string) ($in['cause'] ?? ''))) ?? '', 0, 24);
    $stats = json_encode(array_map('intval', array_intersect_key((array) ($in['stats'] ?? []), array_flip(['shots', 'hits', 'kills', 'deaths', 'boosts']))));

    // plausibilità: la durata dichiarata deve stare dentro quella misurata dal server,
    // e i punti non possono crescere più velocemente di quanto il gioco permetta
    $now = time();
    $serverSec = $now - (int) $run['started_at'];
    $clientSec = $durMs / 1000;
    $plausible = 1;
    if ($clientSec > $serverSec + 15) $plausible = 0;
    if ($serverSec < 20 && $score > 5000) $plausible = 0;
    $maxScore = 120000 + $serverSec * 1500;
    if ($score > $maxScore) $plausible = 0;

    q('UPDATE runs SET ended_at = ?, score = ?, level_reached = ?, lap = ?, cleared = ?, duration_ms = ?, cause = ?, stats = ?, plausible = ? WHERE id = ?',
        [$now, $score, $level, $lap, $cleared, $durMs, $cause, $stats, $plausible, $run['id']]);

    $size = (int) (gng_config()['leaderboard_size'] ?? 100);
    $better = (int) q('SELECT COUNT(*) FROM scores WHERE hidden = 0 AND score >= ?', [$score])->fetchColumn();
    $rank = $better + 1;
    $qualifies = $plausible && $score > 0 && $rank <= $size;
    json_out(['ok' => true, 'qualifies' => (bool) $qualifies, 'rank' => $rank]);
}

json_out(['ok' => false, 'error' => 'action'], 400);
