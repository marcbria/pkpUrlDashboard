<?php
/**
 * proxy.php - CORS-free URL status checker with dynamic domain whitelist
 * Timeout of 15 seconds to avoid false positives.
 * Uses HEAD request first, then GET with Range to detect 404 pages.
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

// Main URL check
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

// Optional delay (in microseconds)
if (isset($_GET['delay']) && is_numeric($_GET['delay'])) {
    $delay = intval($_GET['delay']);
    if ($delay > 0 && $delay <= 10000000) {
        usleep($delay);
    }
}

$timeout = 15;
$userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0';

/**
 * Realiza una petición HTTP con método configurable y opción de rango.
 */
function fetchUrl($url, $method = 'HEAD', $range = null, $timeout = 15) {
    $ch = curl_init();
    $options = [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 10,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_USERAGENT => $GLOBALS['userAgent'],
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HTTPHEADER => [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language: es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
            'Accept-Encoding: gzip, deflate, br',
            'Connection: keep-alive'
        ]
    ];
    if ($method === 'HEAD') {
        $options[CURLOPT_NOBODY] = true;
        $options[CURLOPT_CUSTOMREQUEST] = 'HEAD';
    } else {
        $options[CURLOPT_NOBODY] = false;
        $options[CURLOPT_CUSTOMREQUEST] = 'GET';
        if ($range) {
            $options[CURLOPT_HTTPHEADER][] = "Range: bytes=$range";
        }
    }
    curl_setopt_array($ch, $options);
    $response = curl_exec($ch);
    $info = curl_getinfo($ch);
    $error = curl_error($ch);
    curl_close($ch);
    return ['response' => $response, 'info' => $info, 'error' => $error];
}

// 1. Hacemos HEAD para obtener código y URL final rápidamente
$head = fetchUrl($url, 'HEAD', null, $timeout);
$statusCode = $head['error'] ? 0 : $head['info']['http_code'];
$finalUrl = $head['error'] ? $url : $head['info']['url'];

// 2. Si el código es 200, hacemos GET con rango para ver si es una página de error 404
if ($statusCode >= 200 && $statusCode < 300 && !$head['error']) {
    $get = fetchUrl($url, 'GET', '0-5000', $timeout);
    if (!$get['error'] && $get['info']['http_code'] == 200) {
        $body = $get['response'];
        $lowerBody = strtolower($body);
        
        // Patrones de error 404 muy específicos (incluye el de la demo PKP)
        $patterns = [
            '404 not found',
            'not found</title>',
            '<title>404 not found</title>',
            '<title>page not found</title>',
            'the requested url was not found on this server',
            'the page you requested was not found',
            '<!doctype html public "-//ietf//dtd html 2.0//en">',  // Patrón exacto de la demo
            'http/1.1 404 not found',
            'status 404'
        ];
        $is404 = false;
        foreach ($patterns as $pattern) {
            if (strpos($lowerBody, $pattern) !== false) {
                $is404 = true;
                break;
            }
        }
        
        // Si el contenido es muy corto y contiene "404" o "not found"
        if (!$is404 && strlen($body) < 500 && preg_match('/404|not found/i', $body)) {
            $is404 = true;
        }
        
        if ($is404) {
            $statusCode = 404;
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
