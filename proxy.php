<?php
/**
 * proxy.php - CORS-free URL status checker with dynamic domain whitelist
 * Timeout of 10 seconds to avoid false positives.
 */
session_start();

// Initial allowed domains (base list)
$allowedDomains = [
    'analisi.cat', 'revistes.uab.cat', 'atheneadigital.net', 'dag.revista.uab.cat',
    'derechoygenero.uab.es', 'educar.uab.cat', 'elcvia.cvc.uab.cat', 'ensciencias.uab.cat',
    'papers.uab.cat', 'quadernsdepsicologia.cat', 'questionespublicitarias.es',
    'scriptum.uab.cat', 'studiaaurea.com', 'precarietat.net', 'cory-revistes.precarietat.net',
    'cory-athenea.precarietat.net', 'testdrive.publicknowledgeproject.org', 'publicknowledgeproject.org'
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

// Optional delay (in microseconds) - deshabilitado por defecto
if (isset($_GET['delay']) && is_numeric($_GET['delay'])) {
    $delay = intval($_GET['delay']);
    if ($delay > 0 && $delay <= 10000000) {
        usleep($delay);
    }
}

$timeout = 10;
$ch = curl_init();

// Configuración base
curl_setopt_array($ch, [
    CURLOPT_URL => $url,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 10,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => $timeout,
    CURLOPT_HEADER => true,          // Necesario para obtener el código de estado
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
    CURLOPT_HTTPHEADER => [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language: es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding: gzip, deflate, br',
        'Connection: keep-alive',
        'Upgrade-Insecure-Requests: 1',
    ],
]);

// Primero, intentamos con GET (más fiable que HEAD)
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'GET');
curl_setopt($ch, CURLOPT_NOBODY, false);    // No queremos solo el cuerpo, queremos la respuesta completa

$response = curl_exec($ch);
$info = curl_getinfo($ch);
$error = curl_error($ch);

// Si GET falla o da un código poco fiable (ej. 405 Method Not Allowed), reintentamos con HEAD
if ($error || $info['http_code'] === 405 || $info['http_code'] === 0) {
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'HEAD');
    curl_setopt($ch, CURLOPT_NOBODY, true);
    $response = curl_exec($ch);
    $info = curl_getinfo($ch);
    $error = curl_error($ch);
}

curl_close($ch);

if ($error) {
    $statusCode = 0;
    $finalUrl = $url;
} else {
    $statusCode = $info['http_code'];
    $finalUrl = $info['url'];
    
    // Detección de páginas de error 404 basada en el contenido
    if ($statusCode >= 200 && $statusCode < 300) {
        $lowerResponse = strtolower($response);
        $notFoundPatterns = [
            '404 not found',
            'page not found',
            'the requested url was not found on this server',
            '<title>404',
            'error 404',
            'not found</title>',
            'the page you requested was not found'
        ];
        
        $isNotFound = false;
        foreach ($notFoundPatterns as $pattern) {
            if (strpos($lowerResponse, $pattern) !== false) {
                $isNotFound = true;
                break;
            }
        }
        
        // Si el contenido es muy corto (menos de 100 caracteres) y parece un error
        if (strlen($response) < 100 && preg_match('/404|not found/i', $response)) {
            $isNotFound = true;
        }
        
        if ($isNotFound) {
            $statusCode = 404;
        }
    }
}

header('Content-Type: application/json');
echo json_encode([
    'url' => $url,
    'status' => $statusCode,
    'finalUrl' => $finalUrl,
    'error' => $error ?: null
]);
