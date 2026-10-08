<?php
// Parola magica per sbloccare Dario Hubner. Il confronto avviene solo qui,
// mai nel codice del gioco: chi ispeziona la pagina non la trova.
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';
require_post();
$in = read_json();

$max = (int) (gng_config()['unlock_attempts'] ?? 8);
if (too_many('unlock', $max, 600)) json_out(['ok' => false, 'error' => 'rate'], 429);
log_attempt('unlock');

$guess = normalize_word((string) ($in['word'] ?? ''));
if ($guess === '' || strlen($guess) > 64) json_out(['ok' => true, 'unlocked' => false]);

// parola attiva adesso: l'ultima con data di inizio già passata
$word = q('SELECT id, word_norm FROM magic_words WHERE active_from <= ? ORDER BY active_from DESC, id DESC LIMIT 1', [time()])->fetch();
if (!$word || !hash_equals($word['word_norm'], $guess)) json_out(['ok' => true, 'unlocked' => false]);

q('INSERT INTO unlocks (word_id, created_at, ip_hash) VALUES (?, ?, ?)', [$word['id'], time(), client_hash()]);
json_out(['ok' => true, 'unlocked' => true]);
