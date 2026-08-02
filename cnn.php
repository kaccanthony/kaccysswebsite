<?php
/**
 * Supabase (Postgres) connection, via PDO's pgsql driver.
 * Replaces the old mysqli_connect() call — requires the php-pgsql / pdo_pgsql
 * extension to be enabled on your host.
 *
 * $conn is a PDO instance. Use $conn->prepare(...) / ->execute([...]) in place
 * of mysqli_prepare()/mysqli_stmt_bind_param()/mysqli_stmt_execute().
 */

require_once __DIR__ . '/config.php';

try {
    $dsn = sprintf(
        'pgsql:host=%s;port=%s;dbname=%s;sslmode=require',
        DB_HOST,
        DB_PORT,
        DB_NAME
    );

    $conn = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    error_log('Supabase connection failed: ' . $e->getMessage());
    http_response_code(500);
    die('Failed to connect to the database.');
}