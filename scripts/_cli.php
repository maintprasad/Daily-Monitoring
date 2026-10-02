<?php
declare(strict_types=1);

// Helper bersama untuk skrip CLI.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

/** @return array<string, string|bool> */
function cli_args(array $argv): array
{
    $args = [];
    foreach (array_slice($argv, 1) as $arg) {
        if (preg_match('~^--([a-z0-9-]+)(?:=(.*))?$~i', $arg, $m)) {
            $args[$m[1]] = $m[2] ?? true;
        }
    }
    return $args;
}

$GLOBALS['cliArgs'] = cli_args($argv);
if (is_string($GLOBALS['cliArgs']['env'] ?? null)) {
    $envFile = $GLOBALS['cliArgs']['env'];
    if (!preg_match('~^([a-zA-Z]:)?[\\\\/]~', $envFile)) {
        $envFile = dirname(__DIR__) . '/' . $envFile;
    }
    if (!is_file($envFile)) {
        fwrite(STDERR, "File env tidak ditemukan: $envFile\n");
        exit(1);
    }
    define('APP_ENV_FILE', $envFile);
}

require dirname(__DIR__) . '/api/_lib/bootstrap.php';

function out(string $msg): void
{
    echo $msg, PHP_EOL;
}
