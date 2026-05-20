<?php
/**
 * proxy.php - CORS-free URL status checker with dynamic domain whitelist
 * Timeout 10s for faster failure.
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

if (isset($_GET['delay']) && is_numeric($_GET['delay'])) {
    usleep(min((int)$_GET['delay'], 10000000));
}

$timeout = 10;  // Reduced from 15 to 10 seconds
$userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0';

function fetchFull($url, $timeout) {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 10,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_USERAGENT => $GLOBALS['userAgent'],
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HEADER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_HTTPHEADER => [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language: es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
            'Connection: keep-alive'
        ]
    ]);
    $response = curl_exec($ch);
    $info = curl_getinfo($ch);
    $error = curl_error($ch);
    $headerSize = $info['header_size'];
    $headers = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);
    curl_close($ch);
    return [
        'status'  => $error ? 0 : $info['http_code'],
        'finalUrl' => $error ? $url : $info['url'],
        'headers' => $headers,
        'body'    => $body,
        'error'   => $error
    ];
}

$head = fetchFull($url, $timeout);
$statusCode = $head['status'];
$finalUrl = $head['finalUrl'];

if ($statusCode >= 200 && $statusCode < 300 && !$head['error']) {
    $get = fetchFull($url, $timeout);
    if ($get['status'] >= 200 && $get['status'] < 300) {
        $body = $get['body'];
        $headers = $get['headers'];

        // Manual decompression
        if (preg_match('/Content-Encoding:\s*(gzip|deflate)/i', $headers, $matches)) {
            $encoding = strtolower($matches[1]);
            if ($encoding === 'gzip') {
                $body = @gzdecode($body);
            } elseif ($encoding === 'deflate') {
                $body = @gzuncompress($body);
            }
            if ($body === false) {
                $body = $get['body'];
            }
        }

        $bodySample = substr($body, 0, 5000);
        $lower = strtolower($bodySample);

        // Detect filters like Anubis → status 460 (Filtered)
        if (strpos($lower, 'validating your request') !== false ||
            strpos($lower, 'anubis') !== false ||
            strpos($lower, 'within.website') !== false ||
            strpos($lower, 'please wait while we verify') !== false ||
            strpos($lower, 'checking your browser') !== false) {
            $statusCode = 460;
        }
        // Soft 404 detection (only if not filtered)
        elseif ($statusCode == 200) {
            $patterns = [
                '404 not found',
                'not found</title>',
                '<title>404 not found</title>',
                '<title>page not found</title>',
                'the requested url was not found on this server',
                'the page you requested was not found',
                '<!doctype html public "-//ietf//dtd html 2.0//en">',
                'http/1.1 404 not found',
                'status 404',
                'we couldn\'t find the page'
            ];
            $is404 = false;
            foreach ($patterns as $pattern) {
                if (strpos($lower, $pattern) !== false) {
                    $is404 = true;
                    break;
                }
            }
            if (!$is404 && strlen($body) < 1000 && preg_match('/404|not found/i', $body)) {
                $is404 = true;
            }
            if ($is404) {
                $statusCode = 404;
            }
        }
    }
}

header('Content-Type: application/json');
echo json_encode([
    'url' => $url,
    'status' => $statusCode,
    'finalUrl' => $finalUrl,
    'error' => $head['error'] ?: null
]);
