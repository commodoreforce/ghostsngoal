<?php
// Classifica a prova di furbi.
//
// Come funziona, in breve:
//  1. a inizio partita il server dà un gettone e una chiave segreta diversa per ogni partita;
//  2. a ogni livello nuovo e alla fine il gioco manda punteggio e uccisioni firmati con la chiave;
//     il server ci scrive accanto l'ora del SUO orologio (quella del telefono non conta);
//  3. per ogni tratto di partita si controlla che tempo e punti siano possibili davvero:
//     un livello non si finisce in 10 secondi, e i punti non crescono più in fretta di quanto
//     il gioco permetta (nemici, combo, boss e bonus di fine livello compresi);
//  4. le partite impossibili vengono scartate; quelle strane (firma mancante, un passaggio perso
//     per strada) e, se lo decidi dall'admin, i primi posti finiscono "da verificare": entrano in
//     classifica solo quando le approvi tu.
//
// Nessun gioco nel browser è inattaccabile al 100% (il codice gira sul telefono di chi gioca),
// ma così per falsare la classifica non basta più mandare un numero al server: bisogna giocare
// davvero, con tempi e punti credibili, e i primi posti li guarda comunque una persona.
declare(strict_types=1);

// Le tappe: il gioco si ripete in tre campionati (Serie BKT, Serie A, Champions), tre livelli
// ciascuno. Tappa = (campionato - 1) * 3 + livello, da 1 a 9. Il campionato moltiplica i punti
// (x1, x2, x3), quindi anche i limiti dei punti crescono con lui.
const AC_STAGES = 9;
function ac_lap_of(int $stage): int { return intdiv(max(1, $stage) - 1, 3) + 1; }
function ac_lvl_of(int $stage): int { return (max(1, $stage) - 1) % 3 + 1; }
function ac_stage(int $level, int $lap): int { return (max(1, min(3, $lap)) - 1) * 3 + max(1, min(3, $level)); }

// tempo minimo (secondi, orologio del server) per finire ogni livello, intro compresa:
// è la corsa più veloce possibile da un capo all'altro, più il boss, con un buon margine
const AC_LEVEL_MIN_SEC = [1 => 35, 2 => 45, 3 => 50];
// punti "a pacchetto" che si possono fare in un livello oltre alla media al secondo:
// boss, bonus di fine livello (tempo, precisione, nessun colpo), zucche d'oro, casse
const AC_LEVEL_BURST = [1 => 80000, 2 => 105000, 3 => 80000];   // 1 e 2 comprendono il bonus dei rigori
const AC_RATE = 300;          // punti al secondo, di media, sopra i pacchetti
const AC_KILL_RATE = 3;       // nemici sconfitti al secondo, di media
const AC_SLACK = 2000;

// impostazioni modificabili dall'admin
function ac_settings(): array {
    return [
        'review_top' => max(0, (int) meta_get('ac_review_top', '3')),     // i primi N della classifica: da verificare
        'review_over' => max(0, (int) meta_get('ac_review_over', '0')),   // sopra questi punti: da verificare (0 = mai)
    ];
}

// difetti gravi: la partita è scartata. Gli altri mandano il punteggio in verifica.
const AC_HARD = ['sig', 'rate', 'fast', 'skip', 'score_down', 'kills', 'kills_down', 'duration', 'quick', 'cleared', 'hits'];

// solo informazioni per l'admin: non mandano il punteggio in verifica
const AC_INFO = ['cont'];

const AC_LABELS = [
    'sig' => 'firma sbagliata (dati manomessi)',
    'rate' => 'punti cresciuti troppo in fretta',
    'fast' => 'livello finito in un tempo impossibile',
    'skip' => 'livello saltato',
    'score_down' => 'punteggio che scende',
    'kills' => 'troppi nemici sconfitti per il tempo giocato',
    'kills_down' => 'uccisioni che scendono',
    'duration' => 'durata dichiarata più lunga di quella reale',
    'quick' => 'troppi punti nei primi secondi',
    'cleared' => 'Petrosino salvato senza arrivare alla fine della Serie A',
    'hits' => 'più colpi a segno che tiri',
    'nosig' => 'partita senza firma (browser vecchio o dati non firmati)',
    'gap' => 'un passaggio di livello non è arrivato al server',
    'cont' => 'ha usato il CONTINUE (punteggio ripartito da zero)',
    'missing' => 'mancano i passaggi di livello',
    'top' => 'tra i primi posti della classifica',
    'over' => 'sopra la soglia di punti impostata',
];

function ac_sig_ok(array $run, string $msg, string $sig): ?bool {
    if (($run['rkey'] ?? '') === '') return true;            // partite iniziate prima di questa versione
    if ($sig === '') return null;                            // niente firma: si verifica a mano
    if (!preg_match('/^[a-f0-9]{64}$/', $sig)) return false;
    return hash_equals(hash_hmac('sha256', $msg, hex2bin($run['rkey'])), $sig);
}

function ac_events(array $run): array {
    $ev = json_decode((string) ($run['events'] ?? ''), true);
    return is_array($ev) ? $ev : [];
}

// il punto di partenza di ogni partita
function ac_start_point(array $run): array {
    return ['l' => 1, 'sc' => 0, 'k' => 0, 't' => (int) $run['started_at']];
}

// controlla un tratto di partita, da un passaggio al successivo.
// 'l' è la tappa (1..9). Dopo un CONTINUE ('c') il punteggio riparte da zero.
function ac_check_segment(array $a, array $b, int $lap = 1, bool $final = false): array {
    $f = [];
    $dt = max(1, $b['t'] - $a['t']);
    $from = !empty($a['c']) ? 0 : $a['sc'];
    $ds = $b['sc'] - $from;
    $dk = $b['k'] - $a['k'];
    if ($ds < 0) $f[] = 'score_down';
    if ($dk < 0) $f[] = 'kills_down';
    if ($b['l'] < $a['l']) $f[] = 'skip';
    $burst = 0;
    for ($l = $a['l']; $l <= $b['l']; $l++) $burst += (AC_LEVEL_BURST[ac_lvl_of($l)] ?? 80000) * ac_lap_of($l);
    if ($ds > $burst + (AC_RATE * $dt + AC_SLACK) * ac_lap_of($b['l'])) $f[] = 'rate';
    if ($dk > AC_KILL_RATE * $dt + 20) $f[] = 'kills';
    // si è passati a livelli successivi (o si è finito il gioco): serve almeno il tempo minimo di ognuno
    $last = ($final && !empty($b['cleared'])) ? $b['l'] : $b['l'] - 1;
    $min = 0;
    for ($l = $a['l']; $l <= $last; $l++) $min += AC_LEVEL_MIN_SEC[ac_lvl_of($l)] ?? 40;
    if ($min > 0 && $dt < $min) $f[] = 'fast';
    return $f;
}

function ac_is_hard(array $flags): bool {
    return (bool) array_intersect($flags, AC_HARD);
}

function ac_labels(string $flags): array {
    $out = [];
    foreach (array_filter(explode(',', $flags)) as $f) $out[] = AC_LABELS[$f] ?? $f;
    return $out;
}

function ac_add_flags(string $have, array $new): string {
    $all = array_values(array_unique(array_merge(array_filter(explode(',', $have)), $new)));
    return substr(implode(',', $all), 0, 255);
}
