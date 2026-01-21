<?php
header('Content-Type: application/json');

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

$sessionId = $input['sessionId'] ?? null;
$command = $input['command'] ?? null;
$timestamp = $input['timestamp'] ?? date('c');

if (!$sessionId || !$command) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing sessionId or command']);
    exit;
}

// Sanitize sessionId to prevent directory traversal
$sessionId = preg_replace('/[^a-zA-Z0-9_-]/', '', $sessionId);

// Logs directory (outside web root for security)
$logsDir = __DIR__ . '/../logs';

if (!is_dir($logsDir)) {
    mkdir($logsDir, 0750, true);
}

$logFile = $logsDir . '/session_' . $sessionId . '.txt';
$logEntry = "[{$timestamp}] {$command}\n";

if (file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX) !== false) {
    echo json_encode(['success' => true]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to write log']);
}
