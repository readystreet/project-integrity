<?php
/**
 * Project Integrity — OneDrive Export Proxy (STUB — Phase 1)
 *
 * This file is a placeholder for the Phase 3 export features.
 * In Phase 3 this proxy will:
 *   - export-csv:     Generate a CSV from task data and upload to OneDrive
 *   - export-pdf:     Render a compliance report PDF and upload to OneDrive
 *   - save-onedrive:  Save an arbitrary document to the project's OneDrive folder
 *
 * For now it returns a static notice so the front-end can wire up export
 * buttons without a live OneDrive backend.
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

// ── Config (loaded but unused in Phase 1) ───────────────────────────────
$config = require __DIR__ . '/config.php';

// ── Only POST allowed ───────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Only POST requests are accepted.']);
    exit;
}

// ── Read request body ───────────────────────────────────────────────────
$body = json_decode(file_get_contents('php://input'), true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON in request body.']);
    exit;
}

$action = $body['action'] ?? '';
$allowedActions = ['export-csv', 'export-pdf', 'save-onedrive'];

if (empty($action) || !in_array($action, $allowedActions, true)) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Invalid or missing action. Allowed: ' . implode(', ', $allowedActions),
    ]);
    exit;
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 3 IMPLEMENTATION AREA — START
// ═══════════════════════════════════════════════════════════════════════
//
// TODO (Phase 3): Replace the stub response below with action handlers.
//
// --- export-csv ---
// 1. Receive task filter criteria from $body
// 2. Fetch matching records from Airtable Tasks table
// 3. Format as CSV in memory (fputcsv to php://temp)
// 4. Authenticate with Microsoft Graph API using OAuth2 client credentials:
//      POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
//      client_id, client_secret, scope=https://graph.microsoft.com/.default
// 5. Upload CSV to OneDrive via:
//      PUT https://graph.microsoft.com/v1.0/me/drive/root:/Apps/ReadyStreet App Connector/{folder}/{filename}:/content
// 6. Return download URL
//
// --- export-pdf ---
// 1. Receive report parameters from $body
// 2. Fetch data from Airtable
// 3. Generate PDF using TCPDF or FPDI library
// 4. Upload PDF to OneDrive (same flow as CSV)
// 5. Return download URL
//
// --- save-onedrive ---
// 1. Receive file content or path from $body
// 2. Authenticate with Microsoft Graph
// 3. Upload to OneDrive
// 4. Return download URL
//
// Remember: OneDrive path-based access is more reliable:
//   approot:/{folder}/path:/content
// Retry 423 Locked errors up to 5 times with 3s delay.
//
// ═══════════════════════════════════════════════════════════════════════
// PHASE 3 IMPLEMENTATION AREA — END
// ═══════════════════════════════════════════════════════════════════════

// ── Stub response ───────────────────────────────────────────────────────
http_response_code(200);
echo json_encode([
    'status'  => 'stub',
    'action'  => $action,
    'message' => 'Export functionality will be available in Phase 3.',
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
exit;
