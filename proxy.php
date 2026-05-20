<?php
/**
 * proxy.php - CORS-free URL status checker with dynamic domain whitelist
 * Timeout of 10 seconds to avoid false positives.
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

// Optional delay (in microseconds) - deshabilitado por defecto
if (isset($_GET['delay']) && is_numeric($_GET['delay'])) {
    $delay = intval($_GET['delay']);
    if ($delay > 0 && $delay <= 10000000) {
        usleep($delay);
    }
}

/**
 * Obtiene el código de estado HTTP y el contenido de la respuesta para una URL.
 * Realiza una petición GET para obtener el cuerpo y permite detectar errores 404.
 */
function getBody($url) {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 10,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
        CURLOPT_HTTPHEADER => [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language: es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
            'Accept-Encoding: gzip, deflate, br',
            'Connection: keep-alive',
            'Upgrade-Insecure-Requests: 1',
        ],
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false
    ]);
    
    $response = curl_exec($ch);
    $info = curl_getinfo($ch);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) return ['status' => 0, 'body' => ''];
    return ['status' => $info['http_code'], 'body' => $response];
}

$result = getBody($url);
$statusCode = $result['status'];
$finalUrl = $url; // URL final tras redirecciones
$body = $result['body'];

if ($statusCode >= 200 && $statusCode < 300) {
    $lowerBody = strtolower($body);
    
    // Patrones de error 404 a buscar en el contenido
    $notFoundPatterns = [
        '404 not found',
        '404 page not found',
        'not found',
        'page not found',
        'the requested url was not found on this server',
        'the requested page was not found',
        'the page you requested was not found',
        'the page you requested could not be found',
        'the requested resource was not found',
        'we couldn\'t find the page you requested',
        'the content you requested could not be found',
        'cannot find the requested page',
        'no page exists',
        'no se encontró la página',
        'página no encontrada',
        '<title>404',
        '<title>page not found',
        'error 404',
        'not found</title>',
        'pkp_structure',
        'the requested page does not exist',
        'invalid request',
        'the page you are looking for might have been removed',
        'the page you are looking for cannot be found'
    ];
    
    $isNotFound = false;
    foreach ($notFoundPatterns as $pattern) {
        if (strpos($lowerBody, $pattern) !== false) {
            $isNotFound = true;
            break;
        }
    }
    
    // Si el contenido es muy corto y parece un error
    if (!$isNotFound && strlen($body) < 200 && preg_match('/404|not found|error/i', $body)) {
        $isNotFound = true;
    }
    
    // Si el título contiene palabras clave de error
    if (!$isNotFound && preg_match('/<title[^>]*>.*?(404|not found|page not found).*?<\/title>/i', $body)) {
        $isNotFound = true;
    }
    
    if ($isNotFound) {
        $statusCode = 404;
    }
}

header('Content-Type: application/json');
echo json_encode([
    'url' => $url,
    'status' => $statusCode,
    'finalUrl' => $finalUrl,
    'error' => null
]);
