<?php
declare(strict_types=1);

define('APP_ROOT', dirname(__DIR__, 2));

require __DIR__ . '/Env.php';
require __DIR__ . '/Http.php';
require __DIR__ . '/Database.php';
require __DIR__ . '/SqliteDriver.php';
require __DIR__ . '/TursoDriver.php';
require __DIR__ . '/Schema.php';
require __DIR__ . '/Auth.php';
require __DIR__ . '/UserRepository.php';
require __DIR__ . '/SyncRepository.php';

// Skrip CLI bisa memilih file env lain (mis. .env.turso) lewat konstanta APP_ENV_FILE.
// File yang dimuat lebih dulu menang, karena Env::load() tidak menimpa nilai yang sudah ada.
if (defined('APP_ENV_FILE')) {
    Env::load(APP_ENV_FILE);
}
Env::load(APP_ROOT . '/.env');
date_default_timezone_set(Env::get('APP_TIMEZONE', 'Asia/Jakarta'));
