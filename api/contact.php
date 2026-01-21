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

// Required fields
$required = ['name', 'email', 'service', 'urgency', 'message', 'contact_method'];
foreach ($required as $field) {
    if (empty($input[$field])) {
        http_response_code(400);
        echo json_encode(['error' => "Missing required field: {$field}"]);
        exit;
    }
}

// Sanitize inputs
$name = htmlspecialchars($input['name'], ENT_QUOTES, 'UTF-8');
$email = filter_var($input['email'], FILTER_SANITIZE_EMAIL);
$phone = isset($input['phone']) ? htmlspecialchars($input['phone'], ENT_QUOTES, 'UTF-8') : 'Not provided';
$service = htmlspecialchars($input['service'], ENT_QUOTES, 'UTF-8');
$urgency = htmlspecialchars($input['urgency'], ENT_QUOTES, 'UTF-8');
$message = htmlspecialchars($input['message'], ENT_QUOTES, 'UTF-8');
$contact_method = htmlspecialchars($input['contact_method'], ENT_QUOTES, 'UTF-8');
$timestamp = $input['timestamp'] ?? date('c');

// Validate email
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid email address']);
    exit;
}

// Save to file (you'll configure email later)
$contactsDir = __DIR__ . '/../contacts';
if (!is_dir($contactsDir)) {
    mkdir($contactsDir, 0750, true);
}

$contactId = date('Ymd_His') . '_' . substr(md5($email), 0, 8);
$contactFile = $contactsDir . '/contact_' . $contactId . '.txt';

$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'Unknown';
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';

$contactContent = <<<EOT
=== CONTACT REQUEST ===
Timestamp: {$timestamp}
Contact ID: {$contactId}

NAME: {$name}
EMAIL: {$email}
PHONE: {$phone}
SERVICE: {$service}
URGENCY: {$urgency}
PREFERRED CONTACT: {$contact_method}

MESSAGE:
{$message}

IP: {$ip}
User-Agent: {$userAgent}
========================

EOT;

if (file_put_contents($contactFile, $contactContent, LOCK_EX) !== false) {

    // TODO: Configure email sending
    // Uncomment and configure this section once email is set up
    /*
    $to = 'your-email@example.com';
    $subject = "New Contact Request: {$service} ({$urgency})";
    $headers = "From: noreply@trusik.com\r\n";
    $headers .= "Reply-To: {$email}\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

    mail($to, $subject, $contactContent, $headers);
    */

    echo json_encode(['success' => true, 'id' => $contactId]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save contact request']);
}
