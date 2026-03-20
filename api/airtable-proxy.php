<?php
/**
 * Project Integrity — Airtable API Proxy
 *
 * Handles all Airtable CRUD operations for the front-end.
 * Supported tables: Tasks, Chat History, Project Settings
 * Base ID: appjXNMpeqZAsZFr4
 *
 * Accepts POST with JSON body:
 *   action          — list | get | create | update | delete
 *   table           — Airtable table name
 *   recordId        — record ID (get, update, delete)
 *   fields          — field data object (create, update)
 *   filterByFormula — Airtable formula string (list)
 *   sort            — array of {field, direction} objects (list)
 *   maxRecords      — integer limit (list)
 *   offset          — pagination cursor string (list)
 */

// ── CORS ────────────────────────────────────────────────────────────────
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Config ──────────────────────────────────────────────────────────────
$config = require __DIR__ . '/config.php';

$apiKey = $config['airtable_api_key'] ?? '';
$baseId = $config['airtable_base_id'] ?? '';

if (empty($apiKey) || empty($baseId)) {
    logError('Missing Airtable credentials in config.php');
    respond(500, ['error' => 'Server configuration error.']);
}

// ── Allowed tables (whitelist) ──────────────────────────────────────────
$allowedTables = ['Tasks', 'Chat History', 'Project Settings'];

// ── Read request ────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['error' => 'Only POST requests are accepted.']);
}

$body = json_decode(file_get_contents('php://input'), true);

if (json_last_error() !== JSON_ERROR_NONE) {
    respond(400, ['error' => 'Invalid JSON in request body.']);
}

$action   = $body['action']          ?? '';
$table    = $body['table']           ?? '';
$recordId = $body['recordId']        ?? '';
$fields   = $body['fields']          ?? [];
$filter   = $body['filterByFormula'] ?? '';
$sort     = $body['sort']            ?? [];
$max      = $body['maxRecords']      ?? null;
$offset   = $body['offset']         ?? '';

// Validate table name
if (empty($table) || !in_array($table, $allowedTables, true)) {
    respond(400, ['error' => 'Invalid or missing table name. Allowed: ' . implode(', ', $allowedTables)]);
}

// ── Route action ────────────────────────────────────────────────────────
$encodedTable = rawurlencode($table);
$baseUrl = "https://api.airtable.com/v0/{$baseId}/{$encodedTable}";

switch ($action) {
    case 'list':
        $params = [];
        if (!empty($filter))  $params['filterByFormula'] = $filter;
        if (!empty($max))     $params['maxRecords']      = (int) $max;
        if (!empty($offset))  $params['offset']          = $offset;

        // Sort: array of {field, direction}
        if (!empty($sort) && is_array($sort)) {
            foreach ($sort as $i => $s) {
                if (isset($s['field'])) {
                    $params["sort[{$i}][field]"]     = $s['field'];
                    $params["sort[{$i}][direction]"] = $s['direction'] ?? 'asc';
                }
            }
        }

        $url = $baseUrl . '?' . http_build_query($params);
        $result = airtableRequest('GET', $url, $apiKey);
        break;

    case 'get':
        if (empty($recordId)) {
            respond(400, ['error' => 'recordId is required for get action.']);
        }
        $url = $baseUrl . '/' . rawurlencode($recordId);
        $result = airtableRequest('GET', $url, $apiKey);
        break;

    case 'create':
        if (empty($fields)) {
            respond(400, ['error' => 'fields object is required for create action.']);
        }
        $payload = json_encode(['fields' => $fields]);
        $result  = airtableRequest('POST', $baseUrl, $apiKey, $payload);
        break;

    case 'update':
        if (empty($recordId)) {
            respond(400, ['error' => 'recordId is required for update action.']);
        }
        if (empty($fields)) {
            respond(400, ['error' => 'fields object is required for update action.']);
        }
        $url     = $baseUrl . '/' . rawurlencode($recordId);
        $payload = json_encode(['fields' => $fields]);
        $result  = airtableRequest('PATCH', $url, $apiKey, $payload);
        break;

    case 'delete':
        if (empty($recordId)) {
            respond(400, ['error' => 'recordId is required for delete action.']);
        }
        $url    = $baseUrl . '/' . rawurlencode($recordId);
        $result = airtableRequest('DELETE', $url, $apiKey);
        break;

    default:
        respond(400, ['error' => 'Invalid action. Supported: list, get, create, update, delete.']);
}

// ── Return result ───────────────────────────────────────────────────────
if ($result['httpCode'] >= 200 && $result['httpCode'] < 300) {
    respond($result['httpCode'], $result['body']);
} else {
    // Log the full error but return a sanitised message
    logError("Airtable API error [{$result['httpCode']}]: " . json_encode($result['body']));
    $clientMsg = $result['body']['error']['message'] ?? 'Airtable request failed.';
    respond($result['httpCode'], ['error' => $clientMsg]);
}

// ═══════════════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════════════

/**
 * Execute a cURL request against the Airtable API.
 */
function airtableRequest(string $method, string $url, string $apiKey, ?string $payload = null): array
{
    $ch = curl_init();

    $headers = [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json',
    ];

    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_CUSTOMREQUEST  => $method,
    ]);

    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        logError("cURL error: {$curlErr}");
        return ['httpCode' => 502, 'body' => ['error' => 'Upstream request failed.']];
    }

    $decoded = json_decode($response, true);
    if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
        logError("Non-JSON response from Airtable: {$response}");
        return ['httpCode' => 502, 'body' => ['error' => 'Invalid upstream response.']];
    }

    return ['httpCode' => $httpCode, 'body' => $decoded];
}

/**
 * Send a JSON response and terminate.
 */
function respond(int $statusCode, array $data): void
{
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Append an entry to the local errors log.
 */
function logError(string $message): void
{
    $timestamp = date('Y-m-d H:i:s');
    $line = "[{$timestamp}] {$message}" . PHP_EOL;
    @file_put_contents(__DIR__ . '/errors.log', $line, FILE_APPEND | LOCK_EX);
}
