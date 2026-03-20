# Project Integrity

A financial controls assessment and project management platform with embedded AI expert guidance, built for a restatement-driven accounting remediation engagement.

## Phase 1 — Application Shell

This is Phase 1 of a 3-phase build. All UI components, navigation, and Airtable integration are functional. AI features and export functionality are scaffolded with placeholder states.

## Architecture

- **Frontend**: Static HTML, CSS, vanilla JavaScript (SPA)
- **API Proxy**: PHP scripts on Bluehost (no API keys exposed client-side)
- **Database**: Airtable
- **Hosting**: Bluehost shared hosting

## File Structure

```
├── index.html               # Main SPA entry point
├── css/
│   └── styles.css           # Complete stylesheet (2600+ lines)
├── js/
│   └── app.js               # Application logic — routing, rendering, CRUD
├── api/
│   ├── airtable-proxy.php   # Airtable REST API proxy (all CRUD)
│   ├── claude-proxy.php     # AI advisory proxy (Phase 3 stub)
│   ├── onedrive-proxy.php   # Export proxy (Phase 3 stub)
│   ├── config.example.php   # Credential template
│   └── config.php           # [NOT IN REPO] Actual credentials
├── .gitignore
├── .deploy_slug
└── README.md
```

## Deployment to Bluehost

### 1. Upload Files

Upload the entire `src/` contents to your Bluehost public directory:
```
/public_html/project-integrity/
```

### 2. Create config.php

Copy `api/config.example.php` to `api/config.php` on the server and fill in credentials:

```php
<?php
return [
    'airtable_api_key'      => 'pat...',
    'airtable_base_id'      => 'appjXNMpeqZAsZFr4',
    'claude_api_key'        => 'sk-ant-...',       // Phase 3
    'onedrive_client_id'    => '...',              // Phase 3
    'onedrive_client_secret'=> '...',              // Phase 3
];
```

### 3. Verify PHP

Ensure PHP 7.4+ is available with cURL extension enabled (standard on Bluehost).

### 4. Test

Navigate to `https://yourdomain.com/project-integrity/` and verify:
- Dashboard loads with zero-state metrics
- All 6 workstream views load with empty state placeholders
- Add Task modal opens and saves to Airtable
- Sidebar navigation works
- Mobile responsive layout works

## Environment Variables

| Variable | Description |
|----------|-------------|
| `airtable_api_key` | Airtable Personal Access Token |
| `airtable_base_id` | Airtable Base ID: `appjXNMpeqZAsZFr4` |
| `claude_api_key` | Anthropic API key (Phase 3) |
| `onedrive_client_id` | Azure App Client ID (Phase 3) |
| `onedrive_client_secret` | Azure App Client Secret (Phase 3) |

## Airtable Schema

**Base ID**: `appjXNMpeqZAsZFr4`

### Tasks Table
Title, Description, Workstream (6 options), Project Group, Status (5 options), Priority (4 options), Owner, Due Date, Notes, Sort Order

### Chat History Table
Content, Role (user/assistant), Task (linked to Tasks)

### Project Settings Table
Setting Name, Setting Value — pre-populated with RAG thresholds

## Phase Roadmap

- **Phase 1** (current): Application shell, all UI, Airtable CRUD
- **Phase 2**: Seed 300+ expert-level tasks across all workstreams
- **Phase 3**: Claude AI chat per task, CSV/PDF export, OneDrive integration
