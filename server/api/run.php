<?php
// Inizio e fine di una partita. Il gettone (token) lega il punteggio alla partita
// e permette di verificare che durata e punti siano plausibili.
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/anticheat.php';
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
    $rkey = bin2hex(random_bytes(32));       // chiave segreta di questa partita: firma i passaggi
    $kit = in_array($in['kit'] ?? '', GNG_KITS, true) ? $in['kit'] : 'home';
    $device = in_array($in['device'] ?? '', ['mobile', 'tablet', 'desktop'], true) ? $in['device'] : '';
    $lang = in_array($in['lang'] ?? '', ['it', 'en'], true) ? $in['lang'] : '';
    $cheat = !empty($in['cheat']) ? 1 : 0;
    $country = country_from_tz((string) ($in['tz'] ?? ''));
    q('INSERT INTO runs (token, hero, started_at, ip_hash, kit, device, lang, cheat, rkey, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$token, $hero, time(), client_hash(), $kit, $device, $lang, $cheat, $rkey, $country]);
    json_out(['ok' => true, 'token' => $token, 'key' => $rkey]);
}

// passaggio di livello: il server ci mette la sua ora
if ($action === 'progress') {
    $token = (string) ($in['token'] ?? '');
    if (!preg_match('/^[a-f0-9]{48}$/', $token)) json_out(['ok' => false, 'error' => 'token'], 400);
    $run = q('SELECT * FROM runs WHERE token = ?', [$token])->fetch();
    if (!$run || $run['ended_at'] !== null) json_out(['ok' => false, 'error' => 'token'], 409);
    $seq = (int) ($in['seq'] ?? 0);
    if ($seq <= (int) $run['seq'] || $seq > 40) json_out(['ok' => false, 'error' => 'seq'], 409);
    $lvl = max(1, min(AC_STAGES, (int) ($in['level'] ?? 1)));    // la tappa, 1..9
    $cont = !empty($in['cont']);                                     // CONTINUE: da qui il punteggio riparte da zero
    $score = max(0, min(99999999, (int) ($in['score'] ?? 0)));
    $kills = max(0, min(100000, (int) ($in['kills'] ?? 0)));
    $flags = [];
    $sig = ac_sig_ok($run, $cont ? "$token|$seq|cont|$lvl|$score|$kills" : "$token|$seq|$lvl|$score|$kills", (string) ($in['sig'] ?? ''));
    if ($sig === false) $flags[] = 'sig';
    if ($sig === null) $flags[] = 'nosig';
    if ($seq > (int) $run['seq'] + 1) $flags[] = 'gap';
    $events = ac_events($run);
    $prev = $events ? end($events) : ac_start_point($run);
    $point = ['s' => $seq, 'l' => $lvl, 'sc' => $score, 'k' => $kills, 't' => time()];
    if ($cont) {
        $point['c'] = 1;
        $flags[] = 'cont';
        if ($lvl !== $prev['l']) $flags[] = 'skip';      // si continua dalla tappa in cui si è perso
    } elseif ($lvl > $prev['l'] + 1) $flags[] = 'skip';
    $flags = array_merge($flags, ac_check_segment($prev, $point));
    $events[] = $point;
    q('UPDATE runs SET seq = ?, events = ?, flags = ? WHERE id = ?', [$seq, json_encode($events), ac_add_flags((string) $run['flags'], $flags), $run['id']]);
    json_out(['ok' => true]);
}

if ($action === 'end') {
    $token = (string) ($in['token'] ?? '');
    if (!preg_match('/^[a-f0-9]{48}$/', $token)) json_out(['ok' => false, 'error' => 'token'], 400);
    $run = q('SELECT * FROM runs WHERE token = ?', [$token])->fetch();
    if (!$run || $run['ended_at'] !== null) json_out(['ok' => false, 'error' => 'token'], 409);

    $score = max(0, min(99999999, (int) ($in['score'] ?? 0)));
    $level = max(1, min(3, (int) ($in['level'] ?? 1)));       // livello dentro il campionato
    $lap = max(1, min(3, (int) ($in['loop'] ?? 1)));          // campionato: 1 Serie BKT, 2 Serie A, 3 Champions
    $stage = ac_stage($level, $lap);
    $continues = max(0, min(99, (int) ($in['continues'] ?? 0)));
    $champion = (!empty($in['champion']) && $stage === AC_STAGES && $cleared) ? 1 : 0;   // Champions vinta
    $cleared = !empty($in['cleared']) ? 1 : 0;
    $durMs = max(0, (int) ($in['durationMs'] ?? 0));
    $cause = substr(preg_replace('/[^a-z_]/', '', strtolower((string) ($in['cause'] ?? ''))) ?? '', 0, 24);
    $raw = (array) ($in['stats'] ?? []);
    $num = fn ($v, $max = 100000) => max(0, min($max, (int) $v));
    $st = [];
    foreach (['shots', 'hits', 'kills', 'deaths', 'boosts', 'pumpkins', 'crates'] as $k) $st[$k] = $num($raw[$k] ?? 0);
    $by = (array) ($raw['killsBy'] ?? []);
    foreach (GNG_KILL_KINDS as $k) $st["k_$k"] = $num($by[$k] ?? 0, in_array($k, ['boss', 'azdora', 'octopus', 'count'], true) ? 10 : 100000);
    $stats = json_encode($st);
    // modalità prova: dichiarata all'inizio o alla fine, la partita non va mai in classifica
    $cheat = ((int) $run['cheat'] === 1 || !empty($in['cheat'])) ? 1 : 0;

    // plausibilità: la durata dichiarata deve stare dentro quella misurata dal server,
    // e ogni tratto di partita (da un livello all'altro) deve avere tempi e punti possibili
    $now = time();
    $serverSec = $now - (int) $run['started_at'];
    $clientSec = $durMs / 1000;
    $flags = [];
    if ($clientSec > $serverSec + 15) $flags[] = 'duration';
    if ($serverSec < 20 && $score > 5000) $flags[] = 'quick';
    // "salvato": il Magazziniere Petrosino si libera davvero solo alla fine della Serie A
    // (i giocatori con la versione di prima in cache, senza campionati, lo liberavano al livello 3)
    $legacy = !array_key_exists('continues', $in);
    if ($cleared && $stage < ($legacy ? 3 : 6)) $flags[] = 'cleared';
    if ($st['hits'] > $st['shots'] * 3 + 10) $flags[] = 'hits';
    $seq = (int) ($in['seq'] ?? 0);
    $sig = ac_sig_ok($run, "$token|$seq|end|$score|$stage|$cleared|{$st['kills']}", (string) ($in['sig'] ?? ''));
    if ($sig === false) $flags[] = 'sig';
    if ($sig === null) $flags[] = 'nosig';
    if ($run['rkey'] !== '' && $seq !== (int) $run['seq'] + 1) $flags[] = 'gap';
    $events = ac_events($run);
    $prev = $events ? end($events) : ac_start_point($run);
    // il gioco finito (Champions vinta) chiude la tappa 9: per i controlli conta come "superata"
    $point = ['s' => $seq, 'l' => $stage, 'sc' => $score, 'k' => $st['kills'], 't' => $now, 'cleared' => ($stage === AC_STAGES && $cleared) ? 1 : 0, 'end' => 1];
    if ($stage > $prev['l'] + 1) $flags[] = $events ? 'skip' : 'missing';
    if ($continues > 0 && !in_array('cont', array_filter(explode(',', (string) $run['flags'])), true)) $flags[] = 'gap';
    $flags = array_merge($flags, ac_check_segment($prev, $point, $lap, true));
    // con il CONTINUE il punteggio riparte da zero: in classifica va il più alto della partita,
    // cioè il maggiore tra quello finale e quelli raggiunti prima di ogni CONTINUE (già controllati
    // tratto per tratto quando sono arrivati)
    $best = $score;
    foreach ($events as $e) if (!empty($e['c'])) $best = max($best, (int) $e['sc']);
    // controllo complessivo (anche per le partite senza passaggi): con un CONTINUE il punteggio
    // finale è solo una parte di quello fatto, quindi resta comunque sotto il limite
    $flags = array_merge($flags, ac_check_segment(ac_start_point($run), $point, $lap, true));
    $events[] = $point;
    $allFlags = ac_add_flags((string) $run['flags'], $flags);
    $flagList = array_filter(explode(',', $allFlags));
    $plausible = ($cheat || ac_is_hard($flagList)) ? 0 : 1;

    // la durata che conta per le statistiche non può superare quella vista dal server
    $durMs = min($durMs, ($serverSec + 5) * 1000);
    // da verificare a mano: difetti lievi, oppure primi posti / soglia di punti impostati in admin
    $size = (int) (gng_config()['leaderboard_size'] ?? 100);
    $better = (int) q('SELECT COUNT(*) FROM scores WHERE hidden = 0 AND score >= ?', [$best])->fetchColumn();
    $rank = $better + 1;
    $acs = ac_settings();
    if ($plausible) {
        if ($acs['review_top'] > 0 && $rank <= $acs['review_top']) $flagList[] = 'top';
        if ($acs['review_over'] > 0 && $best >= $acs['review_over']) $flagList[] = 'over';
        $allFlags = ac_add_flags($allFlags, $flagList);
    }
    $review = ($plausible && array_diff($flagList, AC_HARD, AC_INFO)) ? 1 : 0;

    $set = 'ended_at = ?, score = ?, level_reached = ?, lap = ?, cleared = ?, duration_ms = ?, cause = ?, stats = ?, plausible = ?, cheat = ?, seq = ?, events = ?, flags = ?, review = ?, champion = ?';
    $args = [$now, $best, $level, $lap, $cleared, $durMs, $cause, $stats, $plausible, $cheat, max($seq, (int) $run['seq']), json_encode($events), $allFlags, $review, $champion];
    foreach ($st as $k => $v) { $set .= ", $k = ?"; $args[] = $v; }
    $args[] = $run['id'];
    q("UPDATE runs SET $set WHERE id = ?", $args);

    $qualifies = $plausible && !$cheat && $best > 0 && $rank <= $size;
    json_out(['ok' => true, 'qualifies' => (bool) $qualifies, 'rank' => $rank]);
}

json_out(['ok' => false, 'error' => 'action'], 400);
