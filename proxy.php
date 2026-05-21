<?php
/**
 * proxy.php - CORS-free URL status checker with dynamic domain whitelist
 * Optimized: single GET request, no body analysis, 5s timeout.
 */
session_start();

$allowedDomains = [
    'analisi.cat', 'revistes.uab.cat', 'atheneadigital.net', 'dag.revista.uab.cat',
    'derechoygenero.uab.es', 'educar.uab.cat', 'elcvia.cvc.uab.cat', 'ensciencias.uab.cat',
    'papers.uab.cat', 'quadernsdepsicologia.cat', 'questionespublicitarias.es',
    'scriptum.uab.cat', 'studiaaurea.com', 'precarietat.net', 'cory-revistes.precarietat.net',
    'cory-athenea.precarietat.net', 'testdrive.publicknowledgeproject.org', 'publicknowledgeproject.org',
    'ojs33.testdrive.publicknowledgeproject.org'
];

if (!isset($_SESSION['allowedDomains'])) {
    $_SESSION['allowedDomains'] = $allowedDomains;
}

// Handle dynamic domain addition
if ($_SERVER['REQUEST_METHOD'] === 'HEAD' && isset($_GET['add_domain'])) {
    $newDomain = trim($_GET['add_domain']);
    if (!empty($newDomain) && !in_array($newDomain, $_SESSION['allowedDomains'])) {
        $_SESSION['allowedDomains'][] = $newDomain;
    }
    http_response_code(200);
    exit;
}

// Status endpoint (for future use, not used now)
if (isset($_GET['status'])) {
    header('Content-Type: application/json');
    echo json_encode(['active_requests' => 0]);
    exit;
}

if (!isset($_GET['url']) || empty($_GET['url'])) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Missing url parameter']);
    exit;
}

$url = $_GET['url'];
if (!filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid URL format']);
    exit;
}

$host = parse_url($url, PHP_URL_HOST);
$allowed = false;
foreach ($_SESSION['allowedDomains'] as $domain) {
    if ($host === $domain || str_ends_with($host, '.' . $domain)) {
        $allowed = true;
        break;
    }
}
if (!$allowed) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Domain not allowed: ' . $host]);
    exit;
}

// Optional artificial delay (for external testing)
if (isset($_GET['delay']) && is_numeric($_GET['delay'])) {
    usleep(min((int)$_GET['delay'], 5000000));
}

// Timeout reduced to 5 seconds for faster tests
$timeout = 5;
$userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0';

// Single request: follow redirects, return final status code, no body download if not needed
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $url,
    CURLOPT_NOBODY => false,           // We still want headers and possibly small body for detection
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 5,            // Reduce max redirects
    CURLOPT_TIMEOUT => $timeout,
    CURLOPT_USERAGENT => $userAgent,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
    CURLOPT_HEADER => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_ENCODING => '',
    CURLOPT_HTTPHEADER => [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language: en-US,en;q=0.5',
        'Connection: close'              // Avoid keep-alive overhead
    ]
]);

$response = curl_exec($ch);
$info = curl_getinfo($ch);
$error = curl_error($ch);
$headerSize = $info['header_size'];
$headers = substr($response, 0, $headerSize);
$body = substr($response, $headerSize);
curl_close($ch);

if ($error) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'cURL error: ' . $error]);
    exit;
}

$statusCode = $info['http_code'];

// Quick soft 404 detection only for 200 responses (check first 2KB)
if ($statusCode == 200) {
    $sample = substr($body, 0, 2048);
    $lower = strtolower($sample);
    $soft404Patterns = [
        '404 not found', 'not found</title>', '<title>404', 'page not found',
        'the requested url was not found', 'status 404', 'we couldn\'t find'
    ];
    $isSoft404 = false;
    foreach ($soft404Patterns as $pattern) {
        if (strpos($lower, $pattern) !== false) {
            $isSoft404 = true;
            break;
        }
    }
    if ($isSoft404) {
        $statusCode = 404;
    }
    // Optional: detect filters (like Anubis) – keep lightweight
    if (strpos($lower, 'validating your request') !== false ||
        strpos($lower, 'anubis') !== false ||
        strpos($lower, 'please wait while we verify') !== false) {
        $statusCode = 460;
    }
}

header('Content-Type: application/json');
echo json_encode([
    'url' => $url,
    'status' => $statusCode,
    'finalUrl' => $info['url'],
    'error' => null
]);
