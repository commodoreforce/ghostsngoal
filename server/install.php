<?php
// GHOSTS 'N GOALS — installazione guidata (come quella di WordPress).
//
// 1. Carica via FTP tutti i file nella cartella del sito.
// 2. Apri https://tuosito/install.php
// 3. Inserisci i dati del database MySQL (dal pannello Serverplan) e crea l'utente dell'admin.
//
// L'installazione scrive config.php, crea le tabelle e l'account, poi si cancella da sola.
// Se config.php esiste già, questa pagina non fa nulla: nessuno può reinstallare sopra un sito attivo.
declare(strict_types=1);

const GNG_CFG_FILE = __DIR__ . '/config.php';
date_default_timezone_set('Europe/Rome');

require __DIR__ . '/admin/_layout.php';
admin_session();
header('X-Robots-Tag: noindex');

$step = $_GET['step'] ?? 'start';
$isPost = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
$S = &$_SESSION['gng_install'];
if (!is_array($S)) $S = [];

// -------------------------------------------------------------- già installato: si chiude qui
if (is_file(GNG_CFG_FILE) && $step !== 'done') {
    page_head('Installazione', false);
    echo '<div class="card" style="max-width:520px;margin:60px auto"><h1>Il gioco è già installato</h1>'
        . '<p class="lead">Il file di configurazione esiste già, quindi l\'installazione è bloccata. '
        . 'Se vuoi davvero reinstallare, cancella <code>config.php</code> via FTP e ricarica questa pagina.</p>'
        . '<div class="row"><a class="btn" href="./">Vai al gioco</a> <a class="btn" href="admin/" style="background:transparent;color:var(--text);border:1px solid var(--line)">Vai al pannello</a></div></div>';
    page_foot(); exit;
}

function inst_head(int $n, string $title): void {
    page_head('Installazione', false);
    $steps = ['Controllo', 'Database', 'Amministratore', 'Fatto'];
    echo '<div style="max-width:560px;margin:40px auto">';
    echo '<p style="letter-spacing:.08em;margin:0 0 6px"><b>GHOSTS <span style="color:var(--orange)">\'N</span> GOALS</b> · installazione</p>';
    echo '<div class="row" style="gap:6px;margin:0 0 18px">';
    foreach ($steps as $i => $s) echo '<span class="badge ' . ($i + 1 === $n ? 'next' : ($i + 1 < $n ? 'live' : '')) . '">' . ($i + 1) . '. ' . h($s) . '</span>';
    echo '</div><h1>' . h($title) . '</h1>';
}
function inst_foot(): void { echo '</div>'; page_foot(); }
function field(string $name, string $label, string $value = '', string $type = 'text', string $help = '', array $attr = []): void {
    $a = '';
    foreach ($attr as $k => $v) $a .= ' ' . $k . '="' . h((string) $v) . '"';
    echo '<p style="margin:0 0 14px"><label style="display:block;color:var(--muted);font-size:13px;margin-bottom:4px" for="' . $name . '">' . h($label) . '</label>'
        . '<input id="' . $name . '" type="' . $type . '" name="' . $name . '" value="' . h($value) . '" style="width:100%"' . $a . '>'
        . ($help ? '<span style="display:block;color:var(--muted);font-size:12px;margin-top:4px">' . $help . '</span>' : '') . '</p>';
}

// dati del database -> connessione PDO (MySQL; SQLite solo per i test automatici in locale)
function inst_pdo(array $db): PDO {
    if (($db['driver'] ?? 'mysql') === 'sqlite') return new PDO('sqlite:' . $db['name'], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    return new PDO(inst_dsn($db), $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
}
function inst_dsn(array $db): string {
    if (($db['driver'] ?? 'mysql') === 'sqlite') return 'sqlite:' . $db['name'];
    $host = $db['host']; $port = '';
    if (preg_match('/^(.+):(\d+)$/', $host, $m)) { $host = $m[1]; $port = ';port=' . $m[2]; }
    return 'mysql:host=' . $host . $port . ';dbname=' . $db['name'] . ';charset=utf8mb4';
}

// il contenuto di config.php
function inst_config(array $db): string {
    $v = fn ($x) => var_export($x, true);
    $salt = bin2hex(random_bytes(32));
    $key = bin2hex(random_bytes(16));
    return "<?php\n// GHOSTS 'N GOALS — configurazione scritta dall'installazione guidata il " . date('d/m/Y H:i') . ".\n"
        . "// Contiene le password del database: non va mai pubblicata né caricata su GitHub.\n\nreturn [\n"
        . "    'db_dsn'   => " . $v(inst_dsn($db)) . ",\n"
        . "    'db_user'  => " . $v(($db['driver'] ?? 'mysql') === 'sqlite' ? '' : $db['user']) . ",\n"
        . "    'db_pass'  => " . $v(($db['driver'] ?? 'mysql') === 'sqlite' ? '' : $db['pass']) . ",\n\n"
        . "    // stringa segreta per rendere anonimi gli indirizzi IP (mai salvati in chiaro)\n"
        . "    'salt'      => " . $v($salt) . ",\n"
        . "    'setup_key' => " . $v($key) . ",\n"
        . "    'timezone'  => 'Europe/Rome',\n"
        . "    'leaderboard_size' => 100,\n"
        . "    'unlock_attempts' => 8,\n];\n";
}

// -------------------------------------------------------------- 1. controllo del server
if ($step === 'start') {
    $checks = [
        ['PHP 8.0 o più recente', version_compare(PHP_VERSION, '8.0.0', '>='), 'Versione attuale: ' . PHP_VERSION . '. Dal pannello Serverplan si cambia la versione di PHP del dominio.', false],
        ['Estensione PDO MySQL', extension_loaded('pdo_mysql'), 'Serve per il database.', false],
        ['Estensione mbstring', extension_loaded('mbstring'), 'Serve per i nomi in classifica.', false],
        ['Estensione GD', extension_loaded('gd'), 'Serve per l\'immagine dei record condivisi sui social (senza, il resto funziona).', true],
        ['Cartella del sito scrivibile', is_writable(__DIR__), 'Serve a scrivere config.php. Se manca, alla fine ti do il testo da caricare a mano.', true],
    ];
    $ok = true;
    foreach ($checks as $c) if (!$c[1] && empty($c[3])) $ok = false;
    inst_head(1, 'Benvenuto');
    echo '<p class="lead">In tre passaggi colleghiamo il gioco al database e creiamo il tuo accesso al pannello. Prima controllo che il server abbia tutto.</p><div class="card"><table>';
    foreach ($checks as [$label, $pass, $help, $optional]) {
        echo '<tr><td style="width:28px;font-size:18px">' . ($pass ? '✅' : (!empty($optional) ? '⚠️' : '❌')) . '</td><td><b>' . h($label) . '</b>'
            . ($pass ? '' : '<br><span style="color:var(--muted);font-size:13px">' . h($help) . '</span>') . '</td></tr>';
    }
    echo '</table></div>';
    echo $ok ? '<a class="btn" href="?step=db">Avanti →</a>' : '<div class="flash err">Manca qualcosa di indispensabile: sistemalo dal pannello Serverplan (o chiedi al loro supporto) e ricarica la pagina.</div>';
    inst_foot(); exit;
}

// -------------------------------------------------------------- 2. database
if ($step === 'db') {
    $error = null;
    $db = $S['db'] ?? ['driver' => 'mysql', 'host' => 'localhost', 'name' => '', 'user' => '', 'pass' => ''];
    if ($isPost) {
        csrf_check();
        $db = [
            'driver' => (getenv('GNG_INSTALL_TEST') && ($_POST['driver'] ?? '') === 'sqlite') ? 'sqlite' : 'mysql',
            'host' => trim((string) ($_POST['host'] ?? 'localhost')) ?: 'localhost',
            'name' => trim((string) ($_POST['name'] ?? '')),
            'user' => trim((string) ($_POST['user'] ?? '')),
            'pass' => (string) ($_POST['pass'] ?? ''),
        ];
        if ($db['name'] === '' || ($db['driver'] === 'mysql' && $db['user'] === '')) {
            $error = 'Servono almeno il nome del database e l\'utente.';
        } elseif ($db['driver'] === 'mysql' && !preg_match('/^[A-Za-z0-9_\-.:]+$/', $db['host'] . $db['name'])) {
            $error = 'Il nome del database o il server contengono caratteri non validi.';
        } else {
            try {
                $pdo = inst_pdo($db);
                $pdo->query('SELECT 1');
                if ($db['driver'] === 'mysql') {
                    $ver = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
                    // permessi: prova a creare e cancellare una tabella
                    $pdo->exec('CREATE TABLE IF NOT EXISTS gng_install_probe (id INT)');
                    $pdo->exec('DROP TABLE gng_install_probe');
                }
                $S['db'] = $db;
                header('Location: ?step=admin'); exit;
            } catch (Throwable $e) {
                $msg = $e->getMessage();
                if (str_contains($msg, 'Access denied')) $error = 'Utente o password del database sbagliati (oppure l\'utente non ha i permessi su questo database).';
                elseif (str_contains($msg, 'Unknown database')) $error = 'Il database "' . $db['name'] . '" non esiste: controlla il nome nel pannello Serverplan.';
                elseif (str_contains($msg, 'getaddrinfo') || str_contains($msg, 'Connection refused') || str_contains($msg, 'No such file')) $error = 'Non riesco a raggiungere il server del database "' . $db['host'] . '". Su Serverplan di solito è localhost.';
                elseif (str_contains($msg, 'command denied')) $error = 'L\'utente del database non ha il permesso di creare tabelle: dagli tutti i privilegi su questo database dal pannello.';
                else $error = 'Connessione non riuscita: ' . $msg;
            }
        }
    }
    inst_head(2, 'Il database');
    echo '<p class="lead">Crea un database MySQL dal pannello Serverplan (sezione Database / MySQL) e copia qui i dati che ti dà. Il database può essere vuoto: le tabelle le creo io.</p>';
    if ($error) echo '<div class="flash err">' . h($error) . '</div>';
    echo '<form method="post" class="card">' . csrf_field();
    if (getenv('GNG_INSTALL_TEST')) echo '<p><label><input type="checkbox" name="driver" value="sqlite"' . ($db['driver'] === 'sqlite' ? ' checked' : '') . '> SQLite (solo test locali)</label></p>';
    field('host', 'Server del database', $db['host'], 'text', 'Quasi sempre <b>localhost</b>.');
    field('name', 'Nome del database', $db['name'], 'text', '', ['required' => 'required', 'autocomplete' => 'off']);
    field('user', 'Utente del database', $db['user'], 'text', '', ['autocomplete' => 'off']);
    field('pass', 'Password del database', '', 'password', 'Per sicurezza non la mostro di nuovo: se torni indietro va riscritta.', ['autocomplete' => 'new-password']);
    echo '<button>Prova la connessione e vai avanti →</button></form>';
    inst_foot(); exit;
}

// -------------------------------------------------------------- 3. amministratore e scrittura
if ($step === 'admin') {
    if (empty($S['db'])) { header('Location: ?step=db'); exit; }
    $error = null;
    $user = '';
    if ($isPost) {
        csrf_check();
        $user = trim((string) ($_POST['username'] ?? ''));
        $pass = (string) ($_POST['password'] ?? '');
        $pass2 = (string) ($_POST['password2'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_.\-]{3,40}$/', $user)) $error = 'Utente: da 3 a 40 caratteri, solo lettere, numeri, punto e trattino.';
        elseif (strlen($pass) < 12) $error = 'La password deve avere almeno 12 caratteri.';
        elseif ($pass !== $pass2) $error = 'Le due password non coincidono.';
        else {
            try {
                $db = $S['db'];
                $cfg = inst_config($db);
                // 1) il database: tabelle e account
                putenv('GNG_CONFIG');
                $tmp = tempnam(sys_get_temp_dir(), 'gngcfg');
                file_put_contents($tmp, $cfg);
                putenv('GNG_CONFIG=' . $tmp);
                ensure_schema();
                migrate();
                q('DELETE FROM admins');
                q('INSERT INTO admins (username, pass_hash, created_at) VALUES (?, ?, ?)', [$user, password_hash($pass, PASSWORD_DEFAULT), time()]);
                $adminId = (int) db()->lastInsertId();
                if (!empty($_POST['maint'])) meta_set('maint_on', '1');
                @unlink($tmp);
                // 2) config.php: se la cartella non è scrivibile, il testo va caricato a mano
                $written = @file_put_contents(GNG_CFG_FILE, $cfg) !== false;
                if ($written) @chmod(GNG_CFG_FILE, 0640);
                $S = ['written' => $written, 'cfg' => $written ? '' : $cfg, 'maint' => !empty($_POST['maint'])];
                // già collegato al pannello
                session_regenerate_id(true);
                $_SESSION['admin_id'] = $adminId;
                $_SESSION['csrf'] = bin2hex(random_bytes(16));
                $_SESSION['gng_install'] = $S;
                header('Location: ?step=done'); exit;
            } catch (Throwable $e) {
                $error = 'Errore durante la creazione delle tabelle: ' . $e->getMessage();
            }
        }
    }
    inst_head(3, 'Il tuo accesso al pannello');
    echo '<p class="lead">Scegli utente e password per entrare in <b>/admin/</b>: da lì gestisci classifica, parola magica, manutenzione, statistiche. C\'è un solo amministratore.</p>';
    if ($error) echo '<div class="flash err">' . h($error) . '</div>';
    echo '<form method="post" class="card">' . csrf_field();
    field('username', 'Utente', $user, 'text', '', ['required' => 'required', 'autocomplete' => 'username']);
    field('password', 'Password (almeno 12 caratteri)', '', 'password', '', ['required' => 'required', 'minlength' => '12', 'autocomplete' => 'new-password']);
    field('password2', 'Ripeti la password', '', 'password', '', ['required' => 'required', 'minlength' => '12', 'autocomplete' => 'new-password']);
    echo '<p style="margin:4px 0 16px"><label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><input type="checkbox" name="maint" value="1" checked style="width:20px;height:20px;margin-top:2px">'
        . '<span><b>Tieni il sito in manutenzione</b><br><span style="color:var(--muted);font-size:13px">Il pubblico vede il volantino MISSING finché non lo spegni dal pannello (voce Manutenzione). Tu, collegato, vedi già il gioco.</span></span></label></p>';
    echo '<button>Installa</button></form>';
    inst_foot(); exit;
}

// -------------------------------------------------------------- 4. fatto
if ($step === 'done') {
    if (!isset($S['written'])) { header('Location: ./'); exit; }
    $selfDeleted = false;
    if ($S['written']) $selfDeleted = @unlink(__FILE__);
    inst_head(4, $S['written'] ? 'Installato!' : 'Quasi fatto: manca un file');
    if ($S['written']) {
        echo '<div class="flash ok">Database pronto, account creato e configurazione salvata. Sei già collegato al pannello.</div>';
        echo '<div class="card"><ul style="margin:0;padding-left:18px">'
            . '<li>Il gioco: <a href="./" style="color:var(--orange)">apri il sito</a>' . ($S['maint'] ? ' (il pubblico vede il volantino MISSING, tu il gioco)' : '') . '</li>'
            . '<li>Il pannello: <a href="admin/" style="color:var(--orange)">/admin/</a></li>'
            . '<li>' . ($selfDeleted ? 'Questa pagina di installazione si è cancellata da sola.' : '<b>Cancella il file install.php via FTP</b> (non sono riuscito a farlo da solo). In ogni caso ora è bloccata.') . '</li>'
            . '</ul></div>';
        $_SESSION['gng_install'] = [];
    } else {
        echo '<p class="lead">Il database è pronto e l\'account è creato, ma il server non mi lascia scrivere il file di configurazione. Crea sul tuo computer un file chiamato <b>config.php</b>, incollaci dentro il testo qui sotto e caricalo via FTP nella cartella del sito (accanto a index.php). Poi <a href="admin/" style="color:var(--orange)">apri il pannello</a>.</p>';
        echo '<div class="card"><textarea readonly style="width:100%;height:320px;background:#0b0b10;color:var(--text);border:1px solid var(--line);border-radius:6px;font:12px/1.4 ui-monospace,monospace;padding:10px" onclick="this.select()">' . h($S['cfg']) . '</textarea></div>';
        echo '<p class="lead">Contiene la password del database: non mandarla via mail e non pubblicarla. Quando config.php è caricato, cancella anche install.php.</p>';
    }
    inst_foot(); exit;
}

header('Location: ?step=start');
