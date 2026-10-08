<?php
// Base comune di API e pannello admin.
declare(strict_types=1);

const GNG_HEROES = ['shpendi', 'ciofi', 'klinsmann', 'diamanti', 'hubner'];
const GNG_NAME_MAX = 10;

function gng_config(): array {
    static $cfg = null;
    if ($cfg === null) {
        $path = getenv('GNG_CONFIG') ?: __DIR__ . '/../config.php';
        if (!is_file($path)) {
            http_response_code(503);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['ok' => false, 'error' => 'config']);
            exit;
        }
        $cfg = require $path;
        date_default_timezone_set($cfg['timezone'] ?? 'Europe/Rome');
    }
    return $cfg;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $c = gng_config();
        $pdo = new PDO($c['db_dsn'], $c['db_user'] ?? null, $c['db_pass'] ?? null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}

function db_driver(): string { return db()->getAttribute(PDO::ATTR_DRIVER_NAME); }

function q(string $sql, array $params = []): PDOStatement {
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function json_out(array $data, int $status = 200, int $cacheSeconds = 0): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header($cacheSeconds > 0 ? "Cache-Control: public, max-age=$cacheSeconds" : 'Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function read_json(): array {
    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > 8192) json_out(['ok' => false, 'error' => 'size'], 413);
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

function require_post(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') json_out(['ok' => false, 'error' => 'method'], 405);
}

// impronta anonima del dispositivo: l'IP non viene mai salvato in chiaro
function client_hash(): string {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return hash('sha256', gng_config()['salt'] . '|' . $ip);
}

function too_many(string $kind, int $max, int $windowSec): bool {
    $since = time() - $windowSec;
    $n = (int) q('SELECT COUNT(*) FROM attempts WHERE kind = ? AND ip_hash = ? AND created_at > ?', [$kind, client_hash(), $since])->fetchColumn();
    return $n >= $max;
}

function log_attempt(string $kind): void {
    q('INSERT INTO attempts (kind, ip_hash, created_at) VALUES (?, ?, ?)', [$kind, client_hash(), time()]);
    // pulizia periodica dei tentativi vecchi
    if (random_int(1, 50) === 1) q('DELETE FROM attempts WHERE created_at < ?', [time() - 86400]);
}

// minuscole, senza accenti, solo lettere e numeri: "Tàtanka!" -> "tatanka"
function normalize_word(string $s): string {
    $s = trim($s);
    if (class_exists('Normalizer')) {
        $s = Normalizer::normalize($s, Normalizer::FORM_D) ?: $s;
        $s = preg_replace('/\p{Mn}+/u', '', $s) ?? $s;
    } else {
        $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
        if ($t !== false) $s = $t;
    }
    $s = mb_strtolower($s, 'UTF-8');
    return preg_replace('/[^a-z0-9]+/', '', $s) ?? '';
}

// per il filtro: anche "D10", "C4ZZ0" e simili vengono riconosciuti
function normalize_for_filter(string $s): string {
    $s = mb_strtolower($s, 'UTF-8');
    $s = strtr($s, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '8' => 'b', '@' => 'a', '$' => 's', '!' => 'i', '|' => 'i']);
    $s = normalize_word($s);
    // lettere ripetute: "cazzzzo" -> "cazo" (si confronta anche con la versione compressa)
    return $s;
}

function squeeze(string $s): string { return preg_replace('/(.)\1+/', '$1', $s) ?? $s; }

function clean_nickname(string $raw): ?string {
    $n = mb_strtoupper(trim($raw), 'UTF-8');
    $n = preg_replace('/\s+/', ' ', $n) ?? '';
    if ($n === '' || mb_strlen($n) > GNG_NAME_MAX) return null;
    if (!preg_match('/^[A-Z0-9 .\-!]+$/', $n)) return null;
    if (!preg_match('/[A-Z0-9]/', $n)) return null;
    return $n;
}

function nickname_allowed(string $nick): bool {
    $norm = normalize_for_filter($nick);
    $sq = squeeze($norm);
    if ($norm === '') return false;
    $banned = q('SELECT 1 FROM banned_names WHERE name_norm = ? OR name_norm = ?', [$norm, $sq])->fetchColumn();
    if ($banned) return false;
    // parole intere del nickname, normalizzate una per una
    $tokens = array_filter(array_map('normalize_for_filter', preg_split('/[\s.\-]+/', $nick) ?: []));
    $tokens[] = $norm;
    foreach (q('SELECT word FROM badwords')->fetchAll(PDO::FETCH_COLUMN) as $raw) {
        $raw = (string) $raw;
        $exact = str_starts_with($raw, '=');
        $w = normalize_for_filter($exact ? substr($raw, 1) : $raw);
        if ($w === '') continue;
        if ($exact) {
            foreach ($tokens as $tk) if ($tk === $w || squeeze($tk) === squeeze($w)) return false;
        } elseif (str_contains($norm, $w) || str_contains($sq, squeeze($w))) {
            return false;
        }
    }
    return true;
}

// ------------------------------------------------------------------ schema
function schema_statements(string $driver): array {
    $pk = $driver === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
    $eng = $driver === 'sqlite' ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return [
        "CREATE TABLE IF NOT EXISTS runs (
            id $pk,
            token CHAR(48) NOT NULL UNIQUE,
            hero VARCHAR(16) NOT NULL,
            started_at INT NOT NULL,
            ended_at INT NULL,
            score INT NULL,
            level_reached SMALLINT NULL,
            lap SMALLINT NULL,
            cleared SMALLINT NOT NULL DEFAULT 0,
            duration_ms INT NULL,
            cause VARCHAR(24) NULL,
            stats TEXT NULL,
            plausible SMALLINT NOT NULL DEFAULT 0,
            submitted SMALLINT NOT NULL DEFAULT 0,
            ip_hash CHAR(64) NOT NULL
        )$eng",
        "CREATE TABLE IF NOT EXISTS scores (
            id $pk,
            run_id INT NOT NULL,
            nickname VARCHAR(16) NOT NULL,
            score INT NOT NULL,
            hero VARCHAR(16) NOT NULL,
            level_reached SMALLINT NOT NULL DEFAULT 1,
            lap SMALLINT NOT NULL DEFAULT 1,
            created_at INT NOT NULL,
            hidden SMALLINT NOT NULL DEFAULT 0,
            ip_hash CHAR(64) NOT NULL
        )$eng",
        "CREATE INDEX idx_scores_rank ON scores (hidden, score)",
        "CREATE TABLE IF NOT EXISTS magic_words (
            id $pk,
            word VARCHAR(64) NOT NULL,
            word_norm VARCHAR(64) NOT NULL,
            active_from INT NOT NULL,
            created_at INT NOT NULL
        )$eng",
        "CREATE TABLE IF NOT EXISTS unlocks (
            id $pk,
            word_id INT NOT NULL,
            created_at INT NOT NULL,
            ip_hash CHAR(64) NOT NULL
        )$eng",
        "CREATE TABLE IF NOT EXISTS attempts (
            id $pk,
            kind VARCHAR(16) NOT NULL,
            ip_hash CHAR(64) NOT NULL,
            created_at INT NOT NULL
        )$eng",
        "CREATE INDEX idx_attempts ON attempts (kind, ip_hash, created_at)",
        "CREATE TABLE IF NOT EXISTS badwords (
            id $pk,
            word VARCHAR(64) NOT NULL UNIQUE
        )$eng",
        "CREATE TABLE IF NOT EXISTS banned_names (
            id $pk,
            name_norm VARCHAR(64) NOT NULL UNIQUE,
            created_at INT NOT NULL
        )$eng",
        "CREATE TABLE IF NOT EXISTS admins (
            id $pk,
            username VARCHAR(64) NOT NULL UNIQUE,
            pass_hash VARCHAR(255) NOT NULL,
            created_at INT NOT NULL
        )$eng",
    ];
}

// lista iniziale del filtro (modificabile dal pannello)
function default_badwords(): array {
    return [
        // bestemmie e varianti
        'diocane', 'dioporco', 'porcodio', 'diomaiale', 'maialedio', 'diobestia', 'dioboia', 'dioschifo', 'diobastardo',
        'porcamadonna', 'madonnaputtana', 'madonnatroia', 'cristodio', 'diostronzo', 'dioladro', 'diomerda', 'porcodi',
        // volgarità (il prefisso "=" vuol dire: solo se è la parola intera, così "MAGNIFICA" o "NAZIONALE" passano)
        'cazzo', 'cazz', 'merda', 'stronz', 'vaffanculo', 'fanculo', '=culo', 'troia', 'puttan', 'zoccol', 'coglion',
        'minchia', '=figa', '=fica', 'pompin', '=sega', 'bastard', 'mignott', 'frocio', 'froci', 'ricchion', 'finocch',
        '=negro', '=negri', 'terron', 'handicap', '=mongol', 'ritardat', '=nazi', 'nazist', 'hitler', '=duce', '=heil', '=sieg',
        'fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fagg', '=dick', 'pussy', 'whore', 'slut', 'porn', '=sex',
        // tifoserie: niente insulti nominativi verso i rivali
        'merdar',
    ];
}

function ensure_schema(): void {
    $driver = db_driver();
    foreach (schema_statements($driver) as $sql) {
        try { db()->exec($sql); } catch (PDOException $e) {
            // gli indici già esistenti danno errore su MySQL: si ignorano
            if (!str_contains($sql, 'CREATE INDEX')) throw $e;
        }
    }
    if ((int) q('SELECT COUNT(*) FROM badwords')->fetchColumn() === 0) {
        foreach (default_badwords() as $w) q('INSERT INTO badwords (word) VALUES (?)', [$w]);
    }
}
