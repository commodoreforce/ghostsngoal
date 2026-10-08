<?php
// GHOSTS 'N GOALS — configurazione del server.
// 1. Copia questo file come "config.php" nella stessa cartella (la radice del sito).
// 2. Compila i dati del database MySQL creato su Serverplan.
// 3. Cambia "salt" e "setup_key" con due stringhe lunghe e casuali.
// 4. Apri /admin/setup.php e crea l'account amministratore.
// config.php NON va mai caricato sul repository GitHub.

return [
    'db_dsn'   => 'mysql:host=localhost;dbname=NOME_DATABASE;charset=utf8mb4',
    'db_user'  => 'UTENTE_DATABASE',
    'db_pass'  => 'PASSWORD_DATABASE',

    // stringa segreta usata per rendere anonimi gli indirizzi IP (mai salvati in chiaro)
    'salt'      => 'CAMBIA-CON-UNA-STRINGA-LUNGA-E-CASUALE',

    // chiave richiesta una sola volta da /admin/setup.php per creare l'amministratore
    'setup_key' => 'CAMBIA-ANCHE-QUESTA',

    'timezone'  => 'Europe/Rome',

    // quanti punteggi tiene la classifica pubblica
    'leaderboard_size' => 100,

    // sblocco di Hubner: tentativi massimi per dispositivo ogni 10 minuti
    'unlock_attempts' => 8,
];
