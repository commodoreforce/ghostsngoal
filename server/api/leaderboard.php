<?php
// Classifica pubblica e contatore delle partite giocate.
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';

$size = (int) (gng_config()['leaderboard_size'] ?? 100);
$limit = max(1, min($size, (int) ($_GET['limit'] ?? 10)));
$rows = q("SELECT id, nickname, score, hero, level_reached, lap FROM scores WHERE hidden = 0 ORDER BY score DESC, id ASC LIMIT $limit")->fetchAll();
$scores = array_map(fn ($r) => [
    'id' => (int) $r['id'],
    'nickname' => $r['nickname'],
    'score' => (int) $r['score'],
    'character' => $r['hero'],
    'level' => (int) $r['level_reached'],
    'loop' => (int) $r['lap'],
], $rows);
$plays = (int) q('SELECT COUNT(*) FROM runs')->fetchColumn();
json_out(['ok' => true, 'scores' => $scores, 'plays' => $plays], 200, 15);
