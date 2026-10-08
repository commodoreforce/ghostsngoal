<?php
// Inserimento del nome in classifica, una sola volta per partita.
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';
require_post();
$in = read_json();

$token = (string) ($in['token'] ?? '');
if (!preg_match('/^[a-f0-9]{48}$/', $token)) json_out(['ok' => false, 'error' => 'token'], 400);
$run = q('SELECT * FROM runs WHERE token = ?', [$token])->fetch();
if (!$run || $run['ended_at'] === null || (int) $run['submitted'] === 1 || (int) $run['plausible'] !== 1) {
    json_out(['ok' => false, 'error' => 'token'], 409);
}
// il nome va inserito entro 10 minuti dalla fine della partita
if (time() - (int) $run['ended_at'] > 600) json_out(['ok' => false, 'error' => 'expired'], 409);

$nick = clean_nickname((string) ($in['nickname'] ?? ''));
if ($nick === null || !nickname_allowed($nick)) {
    if (too_many('name', 30, 600)) json_out(['ok' => false, 'error' => 'rate'], 429);
    log_attempt('name');
    json_out(['ok' => false, 'error' => 'name'], 422);
}

q('UPDATE runs SET submitted = 1 WHERE id = ?', [$run['id']]);
q('INSERT INTO scores (run_id, nickname, score, hero, level_reached, lap, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [$run['id'], $nick, (int) $run['score'], $run['hero'], (int) $run['level_reached'], (int) $run['lap'], time(), $run['ip_hash']]);
$id = (int) db()->lastInsertId();
$rank = 1 + (int) q('SELECT COUNT(*) FROM scores WHERE hidden = 0 AND (score > ? OR (score = ? AND id < ?))', [(int) $run['score'], (int) $run['score'], $id])->fetchColumn();
json_out(['ok' => true, 'id' => $id, 'rank' => $rank]);
