<?php
// Installazione guidata: crea le tabelle del database e l'unico account admin.
// Funziona una sola volta: quando l'admin esiste, questa pagina non fa più nulla.
declare(strict_types=1);
require __DIR__ . '/_layout.php';
admin_session();
gng_config();

try {
    ensure_schema();
} catch (Throwable $e) {
    page_head('Installazione', false);
    echo '<div class="card"><h1>Database non raggiungibile</h1><p class="lead">Controlla i dati di accesso al database in config.php.</p></div>';
    page_foot(); exit;
}

if ((int) q('SELECT COUNT(*) FROM admins')->fetchColumn() > 0) {
    http_response_code(404);
    page_head('Installazione', false);
    echo '<div class="card"><h1>Installazione già completata</h1><p class="lead"><a class="btn" href="./">Vai al pannello</a></p></div>';
    page_foot(); exit;
}

$error = null;
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    csrf_check();
    $key = (string) ($_POST['setup_key'] ?? '');
    $user = trim((string) ($_POST['username'] ?? ''));
    $pass = (string) ($_POST['password'] ?? '');
    $cfgKey = (string) (gng_config()['setup_key'] ?? '');
    if ($cfgKey === '' || str_starts_with($cfgKey, 'CAMBIA') || !hash_equals($cfgKey, $key)) $error = 'Chiave di installazione errata (o ancora quella di esempio in config.php).';
    elseif (!preg_match('/^[A-Za-z0-9_.\-]{3,40}$/', $user)) $error = 'Utente: da 3 a 40 caratteri, solo lettere, numeri, punto, trattino.';
    elseif (strlen($pass) < 12) $error = 'La password deve avere almeno 12 caratteri.';
    else {
        q('INSERT INTO admins (username, pass_hash, created_at) VALUES (?, ?, ?)', [$user, password_hash($pass, PASSWORD_DEFAULT), time()]);
        flash('Account creato. Ora puoi entrare.');
        header('Location: ./'); exit;
    }
}

page_head('Installazione', false);
?>
<div class="card" style="max-width:440px;margin:60px auto">
  <h1>Installazione</h1>
  <p class="lead">Le tabelle del database sono pronte. Crea l'account amministratore: è uno solo, e dopo questo passaggio la pagina si disattiva.</p>
  <?php if ($error): ?><div class="flash err"><?= h($error) ?></div><?php endif; ?>
  <form method="post">
    <?= csrf_field() ?>
    <p><input type="password" name="setup_key" placeholder="Chiave di installazione (setup_key in config.php)" required style="width:100%"></p>
    <p><input type="text" name="username" placeholder="Utente" required style="width:100%" autocomplete="username"></p>
    <p><input type="password" name="password" placeholder="Password (almeno 12 caratteri)" required minlength="12" style="width:100%" autocomplete="new-password"></p>
    <button style="width:100%">Crea account</button>
  </form>
</div>
<?php page_foot();
