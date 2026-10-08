<?php
// configurazione SOLO per i test in locale (SQLite)
return [
    'db_dsn' => 'sqlite:' . __DIR__ . '/test.sqlite',
    'db_user' => null, 'db_pass' => null,
    'salt' => 'test-salt', 'setup_key' => 'test-key-123',
    'timezone' => 'Europe/Rome', 'leaderboard_size' => 100, 'unlock_attempts' => 8,
];
