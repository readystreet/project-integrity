<?php
/**
 * Project Integrity — Claude AI Proxy (STUB — Phase 1)
 *
 * This file is a placeholder for the Phase 3 AI Expert Advisory feature.
 * In Phase 3 this proxy will:
 *   - Accept a conversation history and user prompt
 *   - Forward the request to the Anthropic Messages API
 *   - Stream or return the assistant response
 *   - Persist the exchange to the Chat History table
 *
 * For now it returns a static notice so the front-end can wire up the
 * chat UI without a live LLM backend.
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

// ── Read request body (validated but unused in Phase 1) ─────────────────
$body = json_decode(file_get_contents('php://input'), true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON in request body.']);
    exit;
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 3 IMPLEMENTATION AREA — START
// ═══════════════════════════════════════════════════════════════════════
//
// TODO (Phase 3): Replace the stub response below with:
//
// 1. Extract 'messages' array and 'system' prompt from $body
// 2. Validate message structure and token limits
// 3. Build Anthropic Messages API request:
//      POST https://api.anthropic.com/v1/messages
//      Headers:
//        x-api-key: $config['claude_api_key']
//        anthropic-version: 2023-06-01
//        content-type: application/json
//      Body:
//        model, max_tokens, system, messages
// 4. Execute cURL request to Anthropic
// 5. Parse and return assistant response
// 6. Persist chat exchange to Airtable "Chat History" table
// 7. Handle rate limits, errors, and token budget
//
// ═══════════════════════════════════════════════════════════════════════
// PHASE 3 IMPLEMENTATION AREA — END
// ═══════════════════════════════════════════════════════════════════════

// ── Stub response ───────────────────────────────────────────────────────
http_response_code(200);
echo json_encode([
    'role'    => 'assistant',
    'content' => 'AI Expert advisory will be available in Phase 3. This feature is currently under development.',
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
exit;
