<?php
header('Content-Type: application/json');

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Generate unique session ID
$sessionId = base_convert(time(), 10, 36) . bin2hex(random_bytes(8));

// Logs directory
$logsDir = __DIR__ . '/../logs';

if (!is_dir($logsDir)) {
    mkdir($logsDir, 0750, true);
}

$logFile = $logsDir . '/session_' . $sessionId . '.txt';

// Create session header
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'Unknown';
$timestamp = date('c');

$header = "=== Session Started: {$timestamp} ===\n";
$header .= "User-Agent: {$userAgent}\n";
$header .= "IP: {$ip}\n";
$header .= str_repeat('=', 50) . "\n\n";

if (file_put_contents($logFile, $header, LOCK_EX) !== false) {
    echo json_encode(['sessionId' => $sessionId]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to create session']);
}
