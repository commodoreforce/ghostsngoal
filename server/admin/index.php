<?php
// Pannello admin: moderazione della classifica, parola magica, filtro, statistiche.
declare(strict_types=1);
require __DIR__ . '/_layout.php';
require __DIR__ . '/../lib/cookie_policy.php';
require __DIR__ . '/../lib/anticheat.php';
admin_session();
gng_config();
try { migrate(); } catch (Throwable $e) { /* database non ancora installato: ci pensa setup.php */ }

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
        case 'cookie_save':
            meta_set('cp_enabled', !empty($_POST['cp_enabled']) ? '1' : '0');
            foreach (array_keys(CP_FIELDS) as $k) meta_set($k, trim((string) ($_POST[$k] ?? '')));
            flash(!empty($_POST['cp_enabled']) ? 'Cookie policy salvata e attiva nel gioco.' : 'Cookie policy salvata. È spenta: nel gioco non compare.');
            break;
        case 'approve':
            q('UPDATE scores SET hidden = 0 WHERE id = ? AND hidden = 2', [$id]); flash('Punteggio approvato: ora è in classifica.'); break;
        case 'reject':
            q('UPDATE scores SET hidden = 1 WHERE id = ? AND hidden = 2', [$id]); flash('Punteggio rifiutato: resta fuori dalla classifica.'); break;
        case 'ac_save':
            meta_set('ac_review_top', (string) max(0, min(100, (int) ($_POST['review_top'] ?? 0))));
            meta_set('ac_review_over', (string) max(0, (int) ($_POST['review_over'] ?? 0)));
            flash('Impostazioni della verifica salvate.'); break;
        case 'maint_save':
            meta_set('maint_on', !empty($_POST['maint_on']) ? '1' : '0');
            flash(!empty($_POST['maint_on']) ? 'Manutenzione ATTIVA: chi apre il sito vede il volantino MISSING. Tu, collegato all\'admin, vedi il gioco.' : 'Manutenzione spenta: il gioco è online per tutti.');
            break;
        case 'reset':
            // azzeramento della classifica (ed eventualmente delle statistiche) dopo il periodo di prova
            if (trim(mb_strtoupper((string) ($_POST['confirm_word'] ?? ''), 'UTF-8')) !== 'RESET') {
                flash('Niente è stato cancellato: per confermare devi scrivere RESET nella casella.', 'err');
                $back = '?p=scores#reset';
                break;
            }
            $nScores = (int) q('SELECT COUNT(*) FROM scores')->fetchColumn();
            db()->beginTransaction();
            try {
                q('DELETE FROM scores');
                // le partite già giocate non possono più entrare in classifica
                q('UPDATE runs SET submitted = 1 WHERE submitted = 0');
                $what = "Classifica azzerata: cancellati $nScores punteggi.";
                if (!empty($_POST['with_stats'])) {
                    q('DELETE FROM runs');
                    q('DELETE FROM visits');
                    q('DELETE FROM unlocks');
                    q('DELETE FROM attempts');
                    $what .= ' Azzerate anche le statistiche (partite, accessi, sblocchi).';
                }
                db()->commit();
                flash($what . ' Parole magiche, filtro dei nomi, nomi bannati e impostazioni sono rimasti.');
            } catch (Throwable $e) {
                db()->rollBack();
                flash('Errore durante l\'azzeramento: non è stato cancellato nulla.', 'err');
            }
            break;
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

if ($p === 'maint') {
    page_head('Manutenzione', true, 'maint');
    $on = meta_get('maint_on', '0') === '1';
    ?>
    <h1>Manutenzione</h1>
    <p class="lead">Quando è attiva, chi apre il sito vede il volantino <b>MISSING · PETROSINO</b> al posto del gioco (anche condividendo il link, l'anteprima sui social è il volantino). Tu, finché sei collegato a questo pannello con lo stesso browser, vedi il gioco normale e puoi provarlo online.</p>
    <form method="post">
      <?= csrf_field() ?><input type="hidden" name="action" value="maint_save">
      <div class="card">
        <label class="switch"><input type="checkbox" name="maint_on" value="1" <?= $on ? 'checked' : '' ?>>
          <b>Manutenzione attiva</b> <span class="badge <?= $on ? 'next' : 'live' ?>"><?= $on ? 'IL PUBBLICO VEDE IL VOLANTINO' : 'GIOCO ONLINE PER TUTTI' ?></span></label>
        <p style="margin:14px 0 0"><button>Salva</button></p>
      </div>
    </form>
    <div class="card row" style="gap:16px;align-items:flex-start">
      <img src="../missing/poster.png" alt="Volantino MISSING" style="width:160px;image-rendering:pixelated;border-radius:4px">
      <div>
        <p style="margin-top:0">Per vedere la pagina esattamente come la vede il pubblico: <a href="../?missing=1" target="_blank" style="color:var(--orange)">apri l'anteprima</a>.</p>
        <p class="muted" style="color:var(--muted);font-size:13px">La classifica e le statistiche continuano a funzionare. I motori di ricerca ricevono il messaggio "torna presto", così il sito non viene penalizzato.</p>
      </div>
    </div>
    <?php
    page_foot(); exit;
}

if ($p === 'review') {
    page_head('Da verificare', true, 'review');
    $acs = ac_settings();
    $rows = q('SELECT s.*, r.started_at, r.ended_at, r.duration_ms, r.events, r.flags, r.kills, r.shots, r.hits, r.device, r.cleared
               FROM scores s LEFT JOIN runs r ON r.id = s.run_id WHERE s.hidden = 2 ORDER BY s.score DESC, s.id ASC LIMIT 100')->fetchAll();
    $since = time() - 7 * 86400;
    $rejected = q('SELECT id, hero, score, level_reached, started_at, ended_at, flags FROM runs
                   WHERE plausible = 0 AND cheat = 0 AND ended_at IS NOT NULL AND started_at > ? AND score > 0 ORDER BY score DESC LIMIT 20', [$since])->fetchAll();
    $mmss = fn ($sec) => sprintf('%d:%02d', intdiv(max(0, (int) $sec), 60), max(0, (int) $sec) % 60);
    $timeline = function (array $r) use ($mmss): string {
        $ev = json_decode((string) ($r['events'] ?? ''), true) ?: [];
        $prevT = (int) $r['started_at']; $prevS = 0; $out = [];
        foreach ($ev as $e) {
            $dt = (int) $e['t'] - $prevT; $ds = (int) $e['sc'] - $prevS;
            $label = !empty($e['end']) ? (!empty($e['cleared']) ? 'fino al finale' : 'fino al game over') : 'fino al livello ' . (int) $e['l'];
            $out[] = $label . ': ' . $mmss($dt) . ' · ' . number_format($ds, 0, ',', '.') . ' punti' . ($dt > 0 ? ' (' . round($ds / $dt) . '/s)' : '');
            $prevT = (int) $e['t']; $prevS = (int) $e['sc'];
        }
        return implode('<br>', array_map('h', $out));
    };
    ?>
    <h1>Da verificare</h1>
    <p class="lead">Qui arrivano i punteggi che entrano in classifica solo dopo il tuo OK: i primi posti (se lo imposti qui sotto), quelli sopra una soglia, e le partite con qualcosa di strano ma non impossibile (per esempio un passaggio di livello perso per strada da una connessione ballerina). Le partite impossibili sono già scartate in automatico: le trovi in fondo alla pagina.</p>
    <form method="post" class="card">
      <?= csrf_field() ?><input type="hidden" name="action" value="ac_save">
      <div class="row" style="gap:18px">
        <label>Verifica a mano i primi <input type="text" name="review_top" value="<?= (int) $acs['review_top'] ?>" style="width:60px" inputmode="numeric"> posti</label>
        <label>e tutti i punteggi sopra <input type="text" name="review_over" value="<?= (int) $acs['review_over'] ?>" style="width:110px" inputmode="numeric"> punti</label>
        <button>Salva</button>
      </div>
      <p style="color:var(--muted);font-size:13px;margin:10px 0 0">0 = spento. Con premi in palio consiglio almeno i primi 3. Chi gioca vede comunque la sua posizione, con la scritta "RECORD IN VERIFICA".</p>
    </form>
    <div class="card"><table>
      <tr><th>Nome</th><th class="num">Punti</th><th>Partita</th><th>Perché è qui</th><th>Azioni</th></tr>
      <?php foreach ($rows as $r):
        $dur = $r['ended_at'] ? (int) $r['ended_at'] - (int) $r['started_at'] : 0; ?>
      <tr class="pending">
        <td><b><?= h($r['nickname']) ?></b><br><span style="color:var(--muted);font-size:13px"><?= h($heroNames[$r['hero']] ?? $r['hero']) ?> · <?= date('d/m H:i', (int) $r['created_at']) ?></span></td>
        <td class="num"><?= number_format((int) $r['score'], 0, ',', '.') ?><br><span style="color:var(--muted);font-size:13px"><?= $dur > 0 ? round((int) $r['score'] / $dur) . '/s' : '' ?></span></td>
        <td class="timeline">Durata reale <?= $mmss($dur) ?> · livello <?= (int) $r['level_reached'] ?><?= (int) $r['cleared'] ? ' · Petrosino salvato' : '' ?><br><?= $timeline($r) ?><br>Nemici <?= (int) $r['kills'] ?> · tiri <?= (int) $r['shots'] ?> · a segno <?= (int) $r['hits'] ?></td>
        <td><ul class="flags"><?php foreach (ac_labels((string) $r['flags']) as $l): ?><li><?= h($l) ?></li><?php endforeach; ?></ul></td>
        <td><div class="row">
          <form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="action" value="approve"><input type="hidden" name="id" value="<?= (int) $r['id'] ?>"><input type="hidden" name="back" value="?p=review"><button class="small">Approva</button></form>
          <form method="post" class="inline" onsubmit="return confirm('Rifiutare questo punteggio?')"><?= csrf_field() ?><input type="hidden" name="action" value="reject"><input type="hidden" name="id" value="<?= (int) $r['id'] ?>"><input type="hidden" name="back" value="?p=review"><button class="danger small">Rifiuta</button></form>
        </div></td>
      </tr>
      <?php endforeach; if (!$rows): ?><tr><td colspan="5" style="color:var(--muted)">Niente da verificare.</td></tr><?php endif; ?>
    </table></div>
    <h2>Partite scartate in automatico (ultimi 7 giorni)</h2>
    <div class="card"><table>
      <tr><th class="num">Punti</th><th class="opt">Personaggio</th><th class="opt">Quando</th><th>Motivo</th></tr>
      <?php foreach ($rejected as $r): ?>
      <tr><td class="num"><?= number_format((int) $r['score'], 0, ',', '.') ?></td><td class="opt"><?= h($heroNames[$r['hero']] ?? $r['hero']) ?></td>
        <td class="opt"><?= date('d/m H:i', (int) $r['started_at']) ?> · <?= $mmss((int) $r['ended_at'] - (int) $r['started_at']) ?></td>
        <td><ul class="flags"><?php foreach (ac_labels((string) $r['flags']) as $l): ?><li><?= h($l) ?></li><?php endforeach; ?></ul></td></tr>
      <?php endforeach; if (!$rejected): ?><tr><td colspan="4" style="color:var(--muted)">Nessuna partita scartata.</td></tr><?php endif; ?>
    </table></div>
    <?php
    page_foot(); exit;
}

if ($p === 'cookie') {
    page_head('Cookie policy', true, 'cookie');
    $s = cp_settings();
    ?>
    <h1>Cookie policy</h1>
    <p class="lead">Il testo è già scritto su misura per il gioco (nessun cookie per chi gioca, solo memoria locale per le preferenze, nessuno strumento di terze parti). Qui compili solo i dati del titolare e decidi se mostrarla: quando è attiva compare il pulsante 🍪 nel gioco e la pagina <a href="../cookie.php" target="_blank" style="color:var(--orange)">cookie.php</a>.</p>
    <form method="post">
      <?= csrf_field() ?><input type="hidden" name="action" value="cookie_save">
      <div class="card">
        <label class="row" style="font-size:17px"><input type="checkbox" name="cp_enabled" value="1" <?= $s['enabled'] ? 'checked' : '' ?> style="width:22px;height:22px">
          <b>Cookie policy attiva</b> <span class="badge <?= $s['enabled'] ? 'live' : '' ?>"><?= $s['enabled'] ? 'VISIBILE NEL GIOCO' : 'SPENTA' ?></span></label>
      </div>
      <div class="card">
        <h2 style="margin-top:0">Dati del titolare</h2>
        <?php foreach (CP_FIELDS as $k => $label): ?>
          <p style="margin:0 0 12px"><label style="display:block;color:var(--muted);font-size:13px;margin-bottom:4px"><?= h($label) ?></label>
          <input type="text" name="<?= $k ?>" value="<?= h($s[$k]) ?>" maxlength="255" style="width:100%"></p>
        <?php endforeach; ?>
        <button>Salva</button>
      </div>
    </form>
    <h2>Anteprima</h2>
    <div class="card cp-preview" style="background:#0a0a0c"><?= cp_html($s, 'it') ?></div>
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
    $days = max(7, min(60, (int) ($_GET['days'] ?? 14)));
    $now = time();
    $today = strtotime('today');
    $off = (int) date('Z');                          // fuso orario di Roma (ora legale compresa)
    $one = fn (string $sql, array $a = []) => q($sql, $a)->fetchColumn();
    $n = fn ($v) => number_format((float) $v, 0, ',', '.');
    $pct = fn ($a, $b) => $b > 0 ? round($a / $b * 100) . '%' : '–';
    $G = 'cheat = 0';                                // le partite di prova non contano
    $E = "$G AND ended_at IS NOT NULL";

    // accessi
    $visits = (int) $one('SELECT COUNT(*) FROM visits');
    $uniq = (int) $one('SELECT COUNT(DISTINCT ip_hash) FROM visits');
    $visitsToday = (int) $one('SELECT COUNT(*) FROM visits WHERE created_at >= ?', [$today]);
    $uniqToday = (int) $one('SELECT COUNT(DISTINCT ip_hash) FROM visits WHERE created_at >= ?', [$today]);
    $playersAll = (int) $one("SELECT COUNT(DISTINCT ip_hash) FROM runs WHERE $G");
    $visitorsWhoPlayed = (int) $one("SELECT COUNT(DISTINCT v.ip_hash) FROM visits v WHERE EXISTS (SELECT 1 FROM runs r WHERE r.ip_hash = v.ip_hash AND r.cheat = 0)");

    // partite e tempo
    $runs = (int) $one("SELECT COUNT(*) FROM runs WHERE $G");
    $runsToday = (int) $one("SELECT COUNT(*) FROM runs WHERE $G AND started_at >= ?", [$today]);
    $ended = (int) $one("SELECT COUNT(*) FROM runs WHERE $E");
    $totMs = (float) $one("SELECT COALESCE(SUM(duration_ms), 0) FROM runs WHERE $E");
    $maxMs = (int) $one("SELECT COALESCE(MAX(duration_ms), 0) FROM runs WHERE $E");
    $cleared = (int) $one("SELECT COUNT(*) FROM runs WHERE $G AND cleared = 1");
    $avgScore = (int) $one("SELECT COALESCE(AVG(score), 0) FROM runs WHERE $E AND plausible = 1");
    $best = (int) $one('SELECT COALESCE(MAX(score), 0) FROM scores WHERE hidden = 0');
    $names = (int) $one('SELECT COUNT(*) FROM scores WHERE hidden = 0');
    $perPlayer = $playersAll ? $runs / $playersAll : 0;
    $tests = (int) $one('SELECT COUNT(*) FROM runs WHERE cheat = 1');
    $unlocks = (int) $one('SELECT COUNT(*) FROM unlocks');
    $hours = $totMs / 3600000;
    $fmtDur = fn (int $ms) => sprintf('%d:%02d', intdiv($ms, 60000), intdiv($ms % 60000, 1000));

    // in campo
    $sum = q("SELECT COALESCE(SUM(kills),0) kills, COALESCE(SUM(shots),0) shots, COALESCE(SUM(hits),0) hits, COALESCE(SUM(deaths),0) deaths,
        COALESCE(SUM(boosts),0) boosts, COALESCE(SUM(pumpkins),0) pumpkins, COALESCE(SUM(crates),0) crates,
        COALESCE(SUM(k_zombie),0) k_zombie, COALESCE(SUM(k_bat),0) k_bat, COALESCE(SUM(k_pumpkin),0) k_pumpkin,
        COALESCE(SUM(k_ghost),0) k_ghost, COALESCE(SUM(k_boss),0) k_boss,
        COALESCE(SUM(k_fisher),0) k_fisher, COALESCE(SUM(k_owl),0) k_owl, COALESCE(SUM(k_eel),0) k_eel, COALESCE(SUM(k_washer),0) k_washer,
        COALESCE(SUM(k_wolf),0) k_wolf, COALESCE(SUM(k_book),0) k_book, COALESCE(SUM(k_azdora),0) k_azdora,
        COALESCE(SUM(k_crab),0) k_crab, COALESCE(SUM(k_gull),0) k_gull, COALESCE(SUM(k_jelly),0) k_jelly, COALESCE(SUM(k_sailor),0) k_sailor,
        COALESCE(SUM(k_rat),0) k_rat, COALESCE(SUM(k_octopus),0) k_octopus, COALESCE(SUM(k_count),0) k_count FROM runs WHERE $E")->fetch();

    // distribuzioni
    $byHero = q("SELECT hero AS k, COUNT(*) AS n FROM runs WHERE $G GROUP BY hero ORDER BY n DESC")->fetchAll();
    $byKit = q("SELECT kit AS k, COUNT(*) AS n FROM runs WHERE $G GROUP BY kit ORDER BY n DESC")->fetchAll();
    $heroScore = q("SELECT hero AS k, ROUND(AVG(score)) AS n FROM runs WHERE $E AND plausible = 1 GROUP BY hero ORDER BY n DESC")->fetchAll();
    $byLevel = q("SELECT level_reached AS k, COUNT(*) AS n FROM runs WHERE $E GROUP BY level_reached ORDER BY level_reached")->fetchAll();
    $byCause = q("SELECT cause AS k, COUNT(*) AS n FROM runs WHERE $G AND cause IS NOT NULL AND cause <> '' GROUP BY cause ORDER BY n DESC")->fetchAll();
    $byDevice = q("SELECT device AS k, COUNT(*) AS n FROM visits GROUP BY device ORDER BY n DESC")->fetchAll();
    $byLang = q("SELECT lang AS k, COUNT(*) AS n FROM visits GROUP BY lang ORDER BY n DESC")->fetchAll();
    $bySource = q("SELECT source AS k, COUNT(*) AS n FROM visits GROUP BY source ORDER BY n DESC LIMIT 12")->fetchAll();

    // andamento per giorno e fascia oraria
    $from = $today - ($days - 1) * 86400;
    $dayExpr = fn (string $col) => sql_idiv("$col + $off", 86400);
    $series = function (string $sql, array $a) { $o = []; foreach (q($sql, $a)->fetchAll() as $r) $o[(int) $r['d']] = (int) $r['n']; return $o; };
    $vDay = $series('SELECT ' . $dayExpr('created_at') . ' AS d, COUNT(*) AS n FROM visits WHERE created_at >= ? GROUP BY d', [$from]);
    $uDay = $series('SELECT ' . $dayExpr('created_at') . ' AS d, COUNT(DISTINCT ip_hash) AS n FROM visits WHERE created_at >= ? GROUP BY d', [$from]);
    $rDay = $series('SELECT ' . $dayExpr('started_at') . " AS d, COUNT(*) AS n FROM runs WHERE $G AND started_at >= ? GROUP BY d", [$from]);
    $hDay = $series('SELECT ' . $dayExpr('started_at') . " AS d, COALESCE(SUM(duration_ms), 0) / 60000 AS n FROM runs WHERE $E AND started_at >= ? GROUP BY d", [$from]);
    $hourly = $series('SELECT ' . sql_idiv("(started_at + $off) % 86400", 3600) . " AS d, COUNT(*) AS n FROM runs WHERE $G GROUP BY d", []);

    $causeNames = ['pit' => 'Caduto in una buca', 'time' => 'Tempo scaduto', 'zombie' => 'Zombie', 'bat' => 'Pipistrello', 'pumpkin' => 'Zucca', 'ghost' => 'Fantasma', 'boss' => 'Mazapegùl', 'enemy' => 'Nemico',
        'river' => 'Caduto nel Savio', 'fisher' => 'Pescatore scheletro', 'owl' => 'Civetta', 'eel' => 'Anguilla fantasma',
        'washer' => 'Lavandaia spettro', 'wolf' => 'Lupo mannaro', 'book' => 'Libro volante', 'azdora' => 'Azdora indemoniata',
        'sea' => 'Caduto in mare', 'wave' => 'Onda sul molo', 'crab' => 'Granchio scheletro', 'gull' => 'Gabbiano', 'jelly' => 'Medusa fantasma',
        'sailor' => 'Marinaio scheletro', 'rat' => 'Topo di stiva', 'octopus' => 'Piovra del Porto Canale', 'count' => 'Conte Vampiro'];
    $kitNames = ['home' => 'Casa (bianca)', 'away' => 'Trasferta', 'third' => 'Terza maglia'];
    $deviceNames = ['mobile' => 'Telefono', 'tablet' => 'Tablet', 'desktop' => 'Computer', '' => 'Non rilevato'];
    $langNames = ['it' => 'Italiano', 'en' => 'Inglese', '' => 'Non rilevata'];
    $bars = function (array $rows, callable $label, bool $percent = false) {
        $max = max(1, ...array_map(fn ($r) => (int) $r['n'], $rows ?: [['n' => 1]]));
        $tot = max(1, array_sum(array_map(fn ($r) => (int) $r['n'], $rows)));
        echo '<table>';
        foreach ($rows as $r) {
            $w = round((int) $r['n'] / $max * 100);
            $val = number_format((int) $r['n'], 0, ',', '.') . ($percent ? ' <span class="muted">' . round((int) $r['n'] / $tot * 100) . '%</span>' : '');
            echo '<tr><td style="width:38%">' . h($label($r['k'])) . '</td><td><div class="bar"><i style="width:' . $w . '%"></i></div></td><td class="num" style="width:110px">' . $val . '</td></tr>';
        }
        if (!$rows) echo '<tr><td class="muted">Ancora nessun dato.</td></tr>';
        echo '</table>';
    };
    // grafico a colonne (una o due serie), senza librerie esterne
    $columns = function (array $keys, array $labels, array $a, ?array $b = null, string $unit = '') {
        $max = max(1, ...array_map(fn ($k) => max($a[$k] ?? 0, $b[$k] ?? 0), $keys));
        echo '<div class="cols">';
        foreach ($keys as $i => $k) {
            $va = $a[$k] ?? 0; $vb = $b !== null ? ($b[$k] ?? 0) : null;
            $tip = number_format($va, 0, ',', '.') . $unit . ($vb !== null ? ' / ' . number_format($vb, 0, ',', '.') : '');
            echo '<div class="col" title="' . h($labels[$i] . ': ' . $tip) . '"><div class="stack">';
            echo '<i style="height:' . round($va / $max * 100) . '%"></i>';
            if ($vb !== null) echo '<i class="b" style="height:' . round($vb / $max * 100) . '%"></i>';
            echo '</div><span>' . h($labels[$i]) . '</span></div>';
        }
        echo '</div>';
    };
    $dayKeys = []; $dayLabels = [];
    for ($t = $from; $t <= $today; $t += 86400) { $dayKeys[] = intdiv($t + $off, 86400); $dayLabels[] = date('d/m', $t); }
    $stat = fn ($v, $label, $sub = '') => '<div class="card stat"><b>' . $v . '</b><span>' . $label . '</span>' . ($sub ? '<small>' . $sub . '</small>' : '') . '</div>';
    ?>
    <style>
      .muted { color:var(--muted); } .stat small { display:block; color:var(--muted); font-size:12px; margin-top:2px; }
      .cols { display:flex; align-items:flex-end; gap:3px; height:160px; padding-top:8px; }
      .col { flex:1; display:flex; flex-direction:column; align-items:center; height:100%; min-width:0; }
      .col .stack { flex:1; width:100%; display:flex; align-items:flex-end; justify-content:center; gap:1px; }
      .col .stack i { display:block; width:45%; background:var(--orange); border-radius:2px 2px 0 0; min-height:1px; }
      .col .stack i.b { background:var(--gold); }
      .col span { font-size:10px; color:var(--muted); margin-top:4px; white-space:nowrap; }
      .legend { display:flex; gap:14px; font-size:13px; color:var(--muted); margin-bottom:6px; }
      .legend i { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:5px; vertical-align:-1px; background:var(--orange); }
      .legend i.b { background:var(--gold); }
      .two { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; }
      .two .card { margin:0; } .two h2 { margin-top:0; }
      @media (max-width:640px) { .col span { display:none; } }
    </style>
    <h1>Statistiche</h1>
    <p class="lead">Dati anonimi: nessun indirizzo IP salvato in chiaro, nessun cookie. "Unici" vuol dire dispositivi/reti diversi, quindi è una stima. Le partite in modalità prova (trucco DAIBURDEL) sono escluse.</p>

    <h2>Accessi</h2>
    <div class="grid">
      <?= $stat($n($visits), 'accessi totali') ?>
      <?= $stat($n($uniq), 'accessi unici') ?>
      <?= $stat($n($visitsToday), 'accessi oggi', $n($uniqToday) . ' unici') ?>
      <?= $stat($pct($visitorsWhoPlayed, $uniq), 'di chi entra gioca', 'almeno una partita') ?>
    </div>

    <h2>Partite</h2>
    <div class="grid">
      <?= $stat($n($runs), 'partite giocate', $n($runsToday) . ' oggi') ?>
      <?= $stat($n($playersAll), 'giocatori diversi', number_format($perPlayer, 1, ',', '.') . ' partite a testa') ?>
      <?= $stat($n(floor($hours)) . ' h ' . sprintf('%02d', (int) round(($hours - floor($hours)) * 60)), 'ore di gioco in tutto', 'sulle partite concluse') ?>
      <?= $stat($fmtDur($ended ? (int) ($totMs / $ended) : 0), 'durata media', 'più lunga ' . $fmtDur($maxMs)) ?>
      <?= $stat($n($cleared), 'livelli completati', $pct($cleared, $ended) . ' delle partite') ?>
      <?= $stat($n($avgScore), 'punteggio medio', 'record ' . $n($best)) ?>
      <?= $stat($n($names), 'nomi in classifica') ?>
      <?= $stat($n($unlocks), 'sblocchi di Tatanka') ?>
    </div>

    <h2>In campo</h2>
    <div class="grid">
      <?= $stat($n($sum['kills']), 'nemici sconfitti', $ended ? number_format($sum['kills'] / $ended, 1, ',', '.') . ' a partita' : '') ?>
      <?= $stat($n($sum['k_boss']), 'berretti rubati', 'Mazapegùl sconfitti') ?>
      <?= $stat($n($sum['shots']), 'palloni calciati', 'precisione ' . $pct((int) $sum['hits'], (int) $sum['shots'])) ?>
      <?= $stat($n($sum['deaths']), 'vite perse') ?>
      <?= $stat($n($sum['boosts']), 'boost attivati', 'cavallucci d\'oro presi') ?>
      <?= $stat($n($sum['pumpkins']), 'zucche raccolte') ?>
      <?= $stat($n($sum['crates']), 'casse distrutte') ?>
      <?= $stat($n($tests), 'partite di prova', 'con il trucco attivo') ?>
    </div>

    <h2>Ultimi <?= $days ?> giorni</h2>
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <div class="legend"><span><i></i>accessi</span><span><i class="b"></i>accessi unici</span></div>
        <div class="row"><?php foreach ([7, 14, 30, 60] as $d): ?><a class="btn <?= $d === $days ? '' : 'ghost' ?>" style="padding:3px 9px;font-size:13px;<?= $d === $days ? '' : 'background:transparent;color:var(--text);border:1px solid var(--line)' ?>" href="?p=stats&days=<?= $d ?>"><?= $d ?> gg</a><?php endforeach; ?></div>
      </div>
      <?php $columns($dayKeys, $dayLabels, $vDay, $uDay); ?>
    </div>
    <div class="card">
      <div class="legend"><span><i></i>partite</span><span><i class="b"></i>minuti di gioco</span></div>
      <?php $columns($dayKeys, $dayLabels, $rDay, $hDay); ?>
    </div>
    <div class="card">
      <div class="legend"><span><i></i>partite per fascia oraria (tutto il periodo)</span></div>
      <?php $columns(range(0, 23), array_map(fn ($h) => sprintf('%02d', $h), range(0, 23)), $hourly); ?>
    </div>

    <div class="two">
      <div class="card"><h2>Personaggio scelto</h2><?php $bars($byHero, fn ($v) => $heroNames[$v] ?? $v, true); ?></div>
      <div class="card"><h2>Punteggio medio per personaggio</h2><?php $bars($heroScore, fn ($v) => $heroNames[$v] ?? $v); ?></div>
      <div class="card"><h2>Maglia</h2><?php $bars($byKit, fn ($v) => $kitNames[$v] ?? $v, true); ?></div>
      <div class="card"><h2>Nemici sconfitti</h2><?php $bars(array_values(array_filter([
          ['k' => 'Zombie', 'n' => (int) $sum['k_zombie']], ['k' => 'Pipistrelli', 'n' => (int) $sum['k_bat']],
          ['k' => 'Zucche', 'n' => (int) $sum['k_pumpkin']], ['k' => 'Fantasmi', 'n' => (int) $sum['k_ghost']],
          ['k' => 'Mazapegùl', 'n' => (int) $sum['k_boss']],
          ['k' => 'Pescatori scheletro', 'n' => (int) $sum['k_fisher']], ['k' => 'Civette', 'n' => (int) $sum['k_owl']],
          ['k' => 'Anguille fantasma', 'n' => (int) $sum['k_eel']], ['k' => 'Lavandaie spettro', 'n' => (int) $sum['k_washer']],
          ['k' => 'Lupi mannari', 'n' => (int) $sum['k_wolf']], ['k' => 'Libri volanti', 'n' => (int) $sum['k_book']],
          ['k' => 'Azdore liberate', 'n' => (int) $sum['k_azdora']],
          ['k' => 'Granchi scheletro', 'n' => (int) $sum['k_crab']], ['k' => 'Gabbiani', 'n' => (int) $sum['k_gull']],
          ['k' => 'Meduse fantasma', 'n' => (int) $sum['k_jelly']], ['k' => 'Marinai scheletro', 'n' => (int) $sum['k_sailor']],
          ['k' => 'Topi di stiva', 'n' => (int) $sum['k_rat']], ['k' => 'Piovre sconfitte', 'n' => (int) $sum['k_octopus']],
          ['k' => 'Conti sconfitti (Petrosino libero)', 'n' => (int) $sum['k_count']]], fn ($r) => $r['n'] > 0)), fn ($v) => $v, true); ?></div>
      <div class="card"><h2>Livello raggiunto</h2><?php $bars($byLevel, fn ($v) => 'Livello ' . $v, true); ?></div>
      <div class="card"><h2>Come si muore</h2><?php $bars($byCause, fn ($v) => $causeNames[$v] ?? $v, true); ?></div>
      <div class="card"><h2>Dispositivo</h2><?php $bars($byDevice, fn ($v) => $deviceNames[$v] ?? $v, true); ?></div>
      <div class="card"><h2>Lingua</h2><?php $bars($byLang, fn ($v) => $langNames[$v] ?? $v, true); ?></div>
      <div class="card"><h2>Da dove arrivano</h2><?php $bars($bySource, fn ($v) => $v === '' ? 'Diretto / non rilevato' : $v, true); ?>
        <p class="muted" style="font-size:13px;margin:8px 0 0">Per sapere quale post funziona meglio, aggiungi ai link <code>?utm_source=instagram</code> (o newsletter, facebook…).</p></div>
    </div>
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
    $pend = (int) $r['hidden'] === 2;
    $rank = ($hidden || $pend) ? '–' : (string) (1 + (int) q('SELECT COUNT(*) FROM scores WHERE hidden = 0 AND (score > ? OR (score = ? AND id < ?))', [$r['score'], $r['score'], $r['id']])->fetchColumn());
  ?>
  <tr class="<?= $hidden ? 'hidden' : ($pend ? 'pending' : '') ?>">
    <td class="num"><?= $rank ?></td>
    <td><b><?= h($r['nickname']) ?></b><?= $pend ? ' <a href="?p=review" class="badge next" style="text-decoration:none">da verificare</a>' : '' ?></td>
    <td class="num"><?= number_format((int) $r['score'], 0, ',', '.') ?></td>
    <td class="opt"><?= h($heroNames[$r['hero']] ?? $r['hero']) ?></td>
    <td class="opt"><?= date('d/m H:i', (int) $r['created_at']) ?></td>
    <td><div class="row">
      <?php $form = fn ($action, $label, $cls = 'ghost small', $confirm = '') => '<form method="post" class="inline"' . ($confirm ? ' onsubmit="return confirm(\'' . $confirm . '\')"' : '') . '>' . csrf_field() . '<input type="hidden" name="action" value="' . $action . '"><input type="hidden" name="id" value="' . (int) $r['id'] . '"><input type="hidden" name="back" value="' . h($back) . '"><button class="' . $cls . '">' . $label . '</button></form>'; ?>
      <?= $pend ? $form('approve', 'Approva', 'small') : ($hidden ? $form('show', 'Ripristina') : $form('hide', 'Nascondi')) ?>
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

<h2 id="reset" style="color:var(--red)">Azzera la classifica</h2>
<div class="card" style="border-color:var(--red)">
  <p style="margin-top:0">Per ripartire da zero dopo il periodo di prova: cancella <b>tutti</b> i punteggi della classifica (adesso sono <?= $total ?>). Non si può annullare.</p>
  <p style="color:var(--muted);font-size:13px">Restano: parole magiche, filtro dei nomi, nomi bannati, cookie policy, manutenzione e il tuo accesso.</p>
  <form method="post" onsubmit="return confirm('Sei proprio sicuro? Tutti i punteggi verranno cancellati per sempre e non si possono recuperare.') && (!this.with_stats.checked || confirm('Cancelli anche tutte le statistiche (partite, accessi, sblocchi)? Anche questo non si può annullare.'))">
    <?= csrf_field() ?><input type="hidden" name="action" value="reset"><input type="hidden" name="back" value="?p=scores">
    <p><label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><input type="checkbox" name="with_stats" value="1" style="width:20px;height:20px;margin-top:2px">
      <span>Cancella anche le <b>statistiche</b> (partite giocate, accessi, sblocchi di Tatanka): utile se i numeri del periodo di prova falserebbero quelli veri.</span></label></p>
    <div class="row">
      <label>Per confermare scrivi <b>RESET</b>: <input type="text" name="confirm_word" autocomplete="off" style="width:120px"></label>
      <button class="danger">Azzera la classifica</button>
    </div>
  </form>
</div>
<?php
page_foot();
