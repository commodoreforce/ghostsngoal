<?php
// Inizio e fine di una partita. Il gettone (token) lega il punteggio alla partita
// e permette di verificare che durata e punti siano plausibili.
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';
require_post();
migrate();
$in = read_json();
$action = $in['action'] ?? '';

if ($action === 'start') {
    $hero = in_array($in['character'] ?? '', GNG_HEROES, true) ? $in['character'] : 'shpendi';
    // freno contro chi apre migliaia di partite finte
    if (too_many('run', 120, 3600)) json_out(['ok' => false, 'error' => 'rate'], 429);
    log_attempt('run');
    $token = bin2hex(random_bytes(24));
    $kit = in_array($in['kit'] ?? '', GNG_KITS, true) ? $in['kit'] : 'home';
    $device = in_array($in['device'] ?? '', ['mobile', 'tablet', 'desktop'], true) ? $in['device'] : '';
    $lang = in_array($in['lang'] ?? '', ['it', 'en'], true) ? $in['lang'] : '';
    $cheat = !empty($in['cheat']) ? 1 : 0;
    q('INSERT INTO runs (token, hero, started_at, ip_hash, kit, device, lang, cheat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$token, $hero, time(), client_hash(), $kit, $device, $lang, $cheat]);
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
    $raw = (array) ($in['stats'] ?? []);
    $num = fn ($v, $max = 100000) => max(0, min($max, (int) $v));
    $st = [];
    foreach (['shots', 'hits', 'kills', 'deaths', 'boosts', 'pumpkins', 'crates'] as $k) $st[$k] = $num($raw[$k] ?? 0);
    $by = (array) ($raw['killsBy'] ?? []);
    foreach (GNG_KILL_KINDS as $k) $st["k_$k"] = $num($by[$k] ?? 0, ($k === 'boss' || $k === 'azdora') ? 10 : 100000);
    $stats = json_encode($st);
    // modalità prova: dichiarata all'inizio o alla fine, la partita non va mai in classifica
    $cheat = ((int) $run['cheat'] === 1 || !empty($in['cheat'])) ? 1 : 0;

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
    if ($cheat) $plausible = 0;
    if ($st['hits'] > $st['shots'] * 3 + 10) $plausible = 0;

    // la durata che conta per le statistiche non può superare quella vista dal server
    $durMs = min($durMs, ($serverSec + 5) * 1000);
    $set = 'ended_at = ?, score = ?, level_reached = ?, lap = ?, cleared = ?, duration_ms = ?, cause = ?, stats = ?, plausible = ?, cheat = ?';
    $args = [$now, $score, $level, $lap, $cleared, $durMs, $cause, $stats, $plausible, $cheat];
    foreach ($st as $k => $v) { $set .= ", $k = ?"; $args[] = $v; }
    $args[] = $run['id'];
    q("UPDATE runs SET $set WHERE id = ?", $args);

    $size = (int) (gng_config()['leaderboard_size'] ?? 100);
    $better = (int) q('SELECT COUNT(*) FROM scores WHERE hidden = 0 AND score >= ?', [$score])->fetchColumn();
    $rank = $better + 1;
    $qualifies = $plausible && !$cheat && $score > 0 && $rank <= $size;
    json_out(['ok' => true, 'qualifies' => (bool) $qualifies, 'rank' => $rank]);
}

json_out(['ok' => false, 'error' => 'action'], 400);
