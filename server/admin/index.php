<?php
// Pannello admin: moderazione della classifica, parola magica, filtro, statistiche.
declare(strict_types=1);
require __DIR__ . '/_layout.php';
admin_session();
gng_config();

$p = $_GET['p'] ?? 'scores';
$isPost = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';

// ------------------------------------------------------------------ accesso
if (empty($_SESSION['admin_id'])) {
    $error = null;
    if ($isPost && $p === 'login') {
        csrf_check();
        if (too_many('login', 5, 900)) {
            $error = 'Troppi tentativi. Riprova tra 15 minuti.';
        } else {
            $u = trim((string) ($_POST['username'] ?? ''));
            $row = q('SELECT id, pass_hash FROM admins WHERE username = ?', [$u])->fetch();
            if ($row && password_verify((string) ($_POST['password'] ?? ''), $row['pass_hash'])) {
                session_regenerate_id(true);
                $_SESSION['admin_id'] = (int) $row['id'];
                $_SESSION['csrf'] = bin2hex(random_bytes(16));
                header('Location: ?p=scores'); exit;
            }
            log_attempt('login');
            usleep(400000);
            $error = 'Utente o password errati.';
        }
    }
    page_head('Accesso', false);
    ?>
    <div class="card" style="max-width:380px;margin:60px auto">
      <h1>GHOSTS 'N GOALS</h1><p class="lead">Pannello di amministrazione</p>
      <?php if ($error): ?><div class="flash err"><?= h($error) ?></div><?php endif; ?>
      <form method="post" action="?p=login">
        <?= csrf_field() ?>
        <p><input type="text" name="username" placeholder="Utente" autocomplete="username" required style="width:100%"></p>
        <p><input type="password" name="password" placeholder="Password" autocomplete="current-password" required style="width:100%"></p>
        <button style="width:100%">Entra</button>
      </form>
    </div>
    <?php
    page_foot(); exit;
}

// ------------------------------------------------------------------ azioni
if ($isPost) {
    csrf_check();
    $back = $_POST['back'] ?? ('?p=' . $p);
    if (!is_string($back) || !str_starts_with($back, '?')) $back = '?p=scores';
    $id = (int) ($_POST['id'] ?? 0);
    switch ($_POST['action'] ?? '') {
        case 'logout':
            $_SESSION = []; session_destroy(); header('Location: ./'); exit;
        case 'hide':
            q('UPDATE scores SET hidden = 1 WHERE id = ?', [$id]); flash('Punteggio nascosto dalla classifica.'); break;
        case 'show':
            q('UPDATE scores SET hidden = 0 WHERE id = ?', [$id]); flash('Punteggio ripristinato.'); break;
        case 'censor':
            q("UPDATE scores SET nickname = 'BURDEL' WHERE id = ?", [$id]); flash('Nome sostituito con BURDEL, punteggio mantenuto.'); break;
        case 'ban':
            $nick = (string) q('SELECT nickname FROM scores WHERE id = ?', [$id])->fetchColumn();
            if ($nick !== '') {
                $norm = normalize_for_filter($nick);
                if (!q('SELECT 1 FROM banned_names WHERE name_norm = ?', [$norm])->fetchColumn()) {
                    q('INSERT INTO banned_names (name_norm, created_at) VALUES (?, ?)', [$norm, time()]);
                }
                $n = 0;
                foreach (q('SELECT id, nickname FROM scores')->fetchAll() as $r) {
                    if (normalize_for_filter($r['nickname']) === $norm) { q('UPDATE scores SET hidden = 1 WHERE id = ?', [$r['id']]); $n++; }
                }
                flash("Nome «{$nick}» bannato: $n punteggi nascosti, non potrà più essere usato.");
            }
            break;
        case 'unban':
            q('DELETE FROM banned_names WHERE id = ?', [$id]); flash('Nome di nuovo consentito.'); break;
        case 'word_add':
            $word = trim((string) ($_POST['word'] ?? ''));
            $norm = normalize_word($word);
            $when = trim((string) ($_POST['active_from'] ?? ''));
            $ts = $when === '' ? time() : strtotime($when);
            if ($norm === '' || mb_strlen($word) > 64) { flash('Scrivi una parola valida (lettere e numeri).', 'err'); break; }
            if ($ts === false) { flash('Data non valida.', 'err'); break; }
            q('INSERT INTO magic_words (word, word_norm, active_from, created_at) VALUES (?, ?, ?, ?)', [$word, $norm, $ts, time()]);
            flash($ts <= time() ? "«{$word}» è attiva da adesso." : "«{$word}» si attiverà il " . date('d/m/Y \a\l\l\e H:i', $ts) . '.');
            break;
        case 'word_delete':
            q('DELETE FROM magic_words WHERE id = ?', [$id]); flash('Parola eliminata.'); break;
        case 'bad_add':
            $added = 0;
            foreach (preg_split('/[\s,;]+/', (string) ($_POST['words'] ?? '')) ?: [] as $w) {
                $w = trim(mb_strtolower($w, 'UTF-8'));
                $exact = str_starts_with($w, '=');
                $clean = ($exact ? '=' : '') . normalize_word($exact ? substr($w, 1) : $w);
                if (strlen($clean) < 3 || q('SELECT 1 FROM badwords WHERE word = ?', [$clean])->fetchColumn()) continue;
                q('INSERT INTO badwords (word) VALUES (?)', [$clean]); $added++;
            }
            flash($added ? "$added parole aggiunte al filtro." : 'Nessuna parola nuova da aggiungere.', $added ? 'ok' : 'err');
            break;
        case 'bad_delete':
            q('DELETE FROM badwords WHERE id = ?', [$id]); flash('Parola tolta dal filtro.'); break;
    }
    header('Location: ' . $back); exit;
}

// ------------------------------------------------------------------ pagine
$heroNames = ['shpendi' => 'Shpendi', 'ciofi' => 'Ciofi', 'klinsmann' => 'Klinsmann', 'diamanti' => 'Diamanti', 'hubner' => 'Hubner'];

if ($p === 'magic') {
    page_head('Parola magica', true, 'magic');
    $now = time();
    $words = q('SELECT w.*, (SELECT COUNT(*) FROM unlocks u WHERE u.word_id = w.id) AS unlocks FROM magic_words w ORDER BY active_from DESC, id DESC')->fetchAll();
    $current = null;
    foreach ($words as $w) { if ((int) $w['active_from'] <= $now) { $current = $w; break; } }
    ?>
    <h1>Parola magica</h1>
    <p class="lead">Sblocca Dario Hubner. Vale sempre l'ultima parola già partita; quelle programmate si attivano da sole all'ora indicata. Maiuscole, accenti e spazi non contano.</p>
    <div class="card">
      <?php if ($current): ?>
        <div class="row"><span class="badge live">ATTIVA ORA</span> <b style="font-size:22px"><?= h($current['word']) ?></b>
        <span style="color:var(--muted)"><?= (int) $current['unlocks'] ?> sblocchi</span></div>
      <?php else: ?>
        <b>Nessuna parola attiva:</b> Tatanka per ora non si può sbloccare.
      <?php endif; ?>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Nuova parola</h2>
      <form method="post" class="row">
        <?= csrf_field() ?><input type="hidden" name="action" value="word_add">
        <input type="text" name="word" placeholder="es. TATANKA" required maxlength="64" style="flex:1 1 180px">
        <label style="color:var(--muted)">attiva dal</label>
        <input type="datetime-local" name="active_from" title="Lascia vuoto per attivarla subito">
        <button>Salva</button>
      </form>
      <p style="color:var(--muted);font-size:13px;margin:8px 0 0">Lascia vuota la data per attivarla subito.</p>
    </div>
    <h2>Calendario</h2>
    <div class="card"><table>
      <tr><th>Parola</th><th>Attiva dal</th><th>Stato</th><th class="num">Sblocchi</th><th></th></tr>
      <?php foreach ($words as $w):
        $ts = (int) $w['active_from'];
        $state = $current && $current['id'] === $w['id'] ? '<span class="badge live">attiva</span>' : ($ts > $now ? '<span class="badge next">programmata</span>' : '<span class="badge">scaduta</span>');
      ?>
      <tr><td><b><?= h($w['word']) ?></b></td><td><?= date('d/m/Y H:i', $ts) ?></td><td><?= $state ?></td><td class="num"><?= (int) $w['unlocks'] ?></td>
        <td><form method="post" class="inline" onsubmit="return confirm('Eliminare questa parola?')"><?= csrf_field() ?><input type="hidden" name="action" value="word_delete"><input type="hidden" name="id" value="<?= (int) $w['id'] ?>"><button class="ghost small">Elimina</button></form></td></tr>
      <?php endforeach; if (!$words): ?><tr><td colspan="5" style="color:var(--muted)">Ancora nessuna parola.</td></tr><?php endif; ?>
    </table></div>
    <?php
    page_foot(); exit;
}

if ($p === 'filter') {
    page_head('Filtro nomi', true, 'filter');
    $bad = q('SELECT id, word FROM badwords ORDER BY word')->fetchAll();
    $banned = q('SELECT id, name_norm, created_at FROM banned_names ORDER BY created_at DESC')->fetchAll();
    ?>
    <h1>Filtro dei nomi</h1>
    <p class="lead">I nomi che contengono queste parole vengono rifiutati prima di entrare in classifica. Il filtro riconosce anche le varianti con numeri e simboli (D10, C4ZZ0). Scrivi una parola con <b>=</b> davanti (es. <b>=figa</b>) per bloccarla solo quando è la parola intera, così nomi come MAGNIFICA restano validi.</p>
    <div class="card">
      <form method="post" class="row">
        <?= csrf_field() ?><input type="hidden" name="action" value="bad_add">
        <input type="text" name="words" placeholder="una o più parole, separate da spazi o virgole" style="flex:1 1 260px" required>
        <button>Aggiungi</button>
      </form>
    </div>
    <div class="card"><div class="chips">
      <?php foreach ($bad as $b): ?>
        <form method="post" class="chip"><?= csrf_field() ?><input type="hidden" name="action" value="bad_delete"><input type="hidden" name="id" value="<?= (int) $b['id'] ?>"><?= h($b['word']) ?><button title="Togli">✕</button></form>
      <?php endforeach; ?>
    </div></div>
    <h2>Nomi bannati</h2>
    <div class="card"><table>
      <tr><th>Nome</th><th>Dal</th><th></th></tr>
      <?php foreach ($banned as $b): ?>
        <tr><td><?= h(strtoupper($b['name_norm'])) ?></td><td><?= date('d/m/Y H:i', (int) $b['created_at']) ?></td>
        <td><form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="action" value="unban"><input type="hidden" name="id" value="<?= (int) $b['id'] ?>"><button class="ghost small">Consenti di nuovo</button></form></td></tr>
      <?php endforeach; if (!$banned): ?><tr><td colspan="3" style="color:var(--muted)">Nessun nome bannato.</td></tr><?php endif; ?>
    </table></div>
    <?php
    page_foot(); exit;
}

if ($p === 'stats') {
    page_head('Statistiche', true, 'stats');
    $today = strtotime('today');
    $runs = (int) q('SELECT COUNT(*) FROM runs')->fetchColumn();
    $runsToday = (int) q('SELECT COUNT(*) FROM runs WHERE started_at >= ?', [$today])->fetchColumn();
    $players = (int) q('SELECT COUNT(DISTINCT ip_hash) FROM runs')->fetchColumn();
    $avg = (int) q('SELECT AVG(score) FROM runs WHERE ended_at IS NOT NULL AND plausible = 1')->fetchColumn();
    $avgDur = (int) q('SELECT AVG(duration_ms) FROM runs WHERE ended_at IS NOT NULL AND plausible = 1')->fetchColumn();
    $cleared = (int) q('SELECT COUNT(*) FROM runs WHERE cleared = 1')->fetchColumn();
    $unlocks = (int) q('SELECT COUNT(*) FROM unlocks')->fetchColumn();
    $byHero = q('SELECT hero, COUNT(*) AS n FROM runs GROUP BY hero ORDER BY n DESC')->fetchAll();
    $byCause = q("SELECT cause, COUNT(*) AS n FROM runs WHERE cause IS NOT NULL AND cause <> '' GROUP BY cause ORDER BY n DESC")->fetchAll();
    $byLevel = q('SELECT level_reached, COUNT(*) AS n FROM runs WHERE ended_at IS NOT NULL GROUP BY level_reached ORDER BY level_reached')->fetchAll();
    $causeNames = ['pit' => 'Caduto in una buca', 'time' => 'Tempo scaduto', 'zombie' => 'Zombie', 'bat' => 'Pipistrello', 'pumpkin' => 'Zucca', 'ghost' => 'Fantasma', 'boss' => 'Arbitro Non-Morto', 'enemy' => 'Nemico'];
    $bars = function (array $rows, string $key, callable $label) {
        $max = max(1, ...array_map(fn ($r) => (int) $r['n'], $rows ?: [['n' => 1]]));
        echo '<table>';
        foreach ($rows as $r) {
            $pct = round((int) $r['n'] / $max * 100);
            echo '<tr><td style="width:40%">' . h($label($r[$key])) . '</td><td><div class="bar"><i style="width:' . $pct . '%"></i></div></td><td class="num" style="width:70px">' . (int) $r['n'] . '</td></tr>';
        }
        if (!$rows) echo '<tr><td style="color:var(--muted)">Ancora nessun dato.</td></tr>';
        echo '</table>';
    };
    ?>
    <h1>Statistiche</h1>
    <p class="lead">Dati anonimi: nessun indirizzo IP è salvato in chiaro, nessun cookie di profilazione.</p>
    <div class="grid">
      <div class="card stat"><b><?= number_format($runs, 0, ',', '.') ?></b><span>partite giocate</span></div>
      <div class="card stat"><b><?= number_format($runsToday, 0, ',', '.') ?></b><span>oggi</span></div>
      <div class="card stat"><b><?= number_format($players, 0, ',', '.') ?></b><span>giocatori diversi (circa)</span></div>
      <div class="card stat"><b><?= number_format($avg, 0, ',', '.') ?></b><span>punteggio medio</span></div>
      <div class="card stat"><b><?= gmdate('i:s', intdiv($avgDur, 1000)) ?></b><span>durata media partita</span></div>
      <div class="card stat"><b><?= number_format($cleared, 0, ',', '.') ?></b><span>partite finite fino in fondo</span></div>
      <div class="card stat"><b><?= number_format($unlocks, 0, ',', '.') ?></b><span>sblocchi di Tatanka</span></div>
    </div>
    <h2>Personaggio scelto</h2>
    <div class="card"><?php $bars($byHero, 'hero', fn ($v) => $heroNames[$v] ?? $v); ?></div>
    <h2>Livello raggiunto</h2>
    <div class="card"><?php $bars($byLevel, 'level_reached', fn ($v) => 'Livello ' . $v); ?></div>
    <h2>Come si muore</h2>
    <div class="card"><?php $bars($byCause, 'cause', fn ($v) => $causeNames[$v] ?? $v); ?></div>
    <?php
    page_foot(); exit;
}

// classifica (pagina predefinita)
page_head('Classifica', true, 'scores');
$search = trim((string) ($_GET['q'] ?? ''));
$page = max(1, (int) ($_GET['page'] ?? 1));
$per = 50;
$where = '1=1'; $args = [];
if ($search !== '') { $where = 'nickname LIKE ?'; $args[] = '%' . mb_strtoupper($search, 'UTF-8') . '%'; }
$total = (int) q("SELECT COUNT(*) FROM scores WHERE $where", $args)->fetchColumn();
$offset = ($page - 1) * $per;
$rows = q("SELECT * FROM scores WHERE $where ORDER BY hidden ASC, score DESC, id ASC LIMIT $per OFFSET $offset", $args)->fetchAll();
$back = '?p=scores' . ($search !== '' ? '&q=' . urlencode($search) : '') . ($page > 1 ? "&page=$page" : '');
?>
<h1>Classifica</h1>
<p class="lead">Nascondi un punteggio, sostituisci un nome offensivo con BURDEL mantenendo i punti, oppure banna il nome: sparisce da tutta la classifica e non potrà più essere usato.</p>
<form class="row" method="get" style="margin-bottom:14px">
  <input type="hidden" name="p" value="scores">
  <input type="search" name="q" value="<?= h($search) ?>" placeholder="Cerca un nome" style="flex:1 1 200px">
  <button class="ghost">Cerca</button>
</form>
<div class="card"><table>
  <tr><th class="num">#</th><th>Nome</th><th class="num">Punti</th><th class="opt">Personaggio</th><th class="opt">Quando</th><th>Azioni</th></tr>
  <?php
  foreach ($rows as $i => $r):
    $hidden = (int) $r['hidden'] === 1;
    $rank = $hidden ? '–' : (string) (1 + (int) q('SELECT COUNT(*) FROM scores WHERE hidden = 0 AND (score > ? OR (score = ? AND id < ?))', [$r['score'], $r['score'], $r['id']])->fetchColumn());
  ?>
  <tr class="<?= $hidden ? 'hidden' : '' ?>">
    <td class="num"><?= $rank ?></td>
    <td><b><?= h($r['nickname']) ?></b></td>
    <td class="num"><?= number_format((int) $r['score'], 0, ',', '.') ?></td>
    <td class="opt"><?= h($heroNames[$r['hero']] ?? $r['hero']) ?></td>
    <td class="opt"><?= date('d/m H:i', (int) $r['created_at']) ?></td>
    <td><div class="row">
      <?php $form = fn ($action, $label, $cls = 'ghost small', $confirm = '') => '<form method="post" class="inline"' . ($confirm ? ' onsubmit="return confirm(\'' . $confirm . '\')"' : '') . '>' . csrf_field() . '<input type="hidden" name="action" value="' . $action . '"><input type="hidden" name="id" value="' . (int) $r['id'] . '"><input type="hidden" name="back" value="' . h($back) . '"><button class="' . $cls . '">' . $label . '</button></form>'; ?>
      <?= $hidden ? $form('show', 'Ripristina') : $form('hide', 'Nascondi') ?>
      <?= $form('censor', 'BURDEL') ?>
      <?= $form('ban', 'Banna nome', 'danger small', 'Bannare questo nome? Tutti i suoi punteggi verranno nascosti.') ?>
    </div></td>
  </tr>
  <?php endforeach; if (!$rows): ?><tr><td colspan="6" style="color:var(--muted)">Nessun punteggio<?= $search ? ' per questa ricerca' : ' per ora' ?>.</td></tr><?php endif; ?>
</table>
<div class="pager">
  <?php if ($page > 1): ?><a class="btn" href="?p=scores&page=<?= $page - 1 ?><?= $search ? '&q=' . urlencode($search) : '' ?>">← Precedenti</a><?php endif; ?>
  <?php if ($offset + $per < $total): ?><a class="btn" href="?p=scores&page=<?= $page + 1 ?><?= $search ? '&q=' . urlencode($search) : '' ?>">Successivi →</a><?php endif; ?>
  <span style="color:var(--muted);align-self:center"><?= $total ?> punteggi in tutto</span>
</div>
</div>
<?php
page_foot();
