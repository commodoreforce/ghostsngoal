<?php
// Record condivisi: i dati di un punteggio in classifica (solo quelli visibili) per l'anteprima
// sui social (share.php) e per l'immagine (share_img.php).
declare(strict_types=1);

function share_score(int $id): ?array {
    if ($id <= 0) return null;
    $r = q('SELECT s.id, s.nickname, s.score, s.hero, s.level_reached, COALESCE(r.cleared, 0) AS cleared
            FROM scores s LEFT JOIN runs r ON r.id = s.run_id WHERE s.id = ? AND s.hidden = 0', [$id])->fetch();
    if (!$r) return null;
    $r['rank'] = 1 + (int) q('SELECT COUNT(*) FROM scores WHERE hidden = 0 AND (score > ? OR (score = ? AND id < ?))', [(int) $r['score'], (int) $r['score'], (int) $r['id']])->fetchColumn();
    return $r;
}

function share_base_url(): string {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host = preg_replace('/[^a-z0-9.\-:]/i', '', (string) ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $dir = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
    return ($https ? 'https' : 'http') . '://' . $host . $dir . '/';
}
