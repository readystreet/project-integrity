/* ============================================================================
   PROJECT INTEGRITY — Core SPA Application
   app.js — Routing, State, Data, Rendering, and Interactions
   ============================================================================
   Single-page application for C-Suite financial controls remediation.
   All API calls routed through api/airtable-proxy.php.
   Hash-based routing: #dashboard, #workstream/{name}, #task/{recordId}
   ============================================================================ */

'use strict';

/* --------------------------------------------------------------------------
   CONSTANTS
   -------------------------------------------------------------------------- */
const WORKSTREAMS = [
    'Record to Report',
    'Order to Cash',
    'Technology & ERP Systems',
    'Internal Audit',
    'Technical Accounting & Policy',
    'SEC Reporting & Disclosure'
];

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Blocked', 'Complete', 'Deferred'];
const PRIORITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low'];

const STATUS_CSS_MAP = {
    'Not Started':  'not-started',
    'In Progress':  'in-progress',
    'Blocked':      'blocked',
    'Complete':     'complete',
    'Deferred':     'deferred'
};

const PRIORITY_CSS_MAP = {
    'Critical': 'critical',
    'High':     'high',
    'Medium':   'medium',
    'Low':      'low'
};

const STATUS_ICONS = {
    'Not Started':  '&#9675;',
    'In Progress':  '&#9684;',
    'Blocked':      '&#9888;',
    'Complete':     '&#10003;',
    'Deferred':     '&#8634;'
};

const WORKSTREAM_ICONS = {
    'Record to Report':              '&#128202;',
    'Order to Cash':                 '&#128176;',
    'Technology & ERP Systems':      '&#128187;',
    'Internal Audit':                '&#128269;',
    'Technical Accounting & Policy': '&#128209;',
    'SEC Reporting & Disclosure':    '&#128220;'
};

/* --------------------------------------------------------------------------
   STATE
   -------------------------------------------------------------------------- */
const State = {
    tasks: [],
    settings: {},
    currentView: 'dashboard',
    currentWorkstream: null,
    currentTaskId: null,
    isLoading: false,
    sidebarOpen: false,
    openStatusDropdown: null,      // recordId of currently open status dropdown
    dragState: {
        sourceId: null,
        sourceGroup: null,
        dragOverId: null
    }
};


/* --------------------------------------------------------------------------
   API HELPER
   -------------------------------------------------------------------------- */
const API = {
    BASE: 'api/airtable-proxy.php',

    /**
     * Core request method. All CRUD flows go through here.
     * @param {string} action  - list | get | create | update | delete
     * @param {Object} params  - Additional POST body parameters
     * @returns {Promise<Object>} Parsed response data
     */
    async request(action, params = {}) {
        State.isLoading = true;
        updateLoadingIndicator(true);

        try {
            const response = await fetch(API.BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...params })
            });

            const data = await response.json();

            if (!response.ok) {
                const message = data.error || 'An unexpected error occurred.';
                throw new Error(message);
            }

            return data;
        } catch (err) {
            console.error('[API Error]', action, params, err);
            showToast(err.message || 'Network error. Please try again.', 'error');
            throw err;
        } finally {
            State.isLoading = false;
            updateLoadingIndicator(false);
        }
    },

    /**
     * List tasks with optional filters, sorting, and pagination.
     */
    async listTasks(filters = {}) {
        const params = {
            table: 'Tasks',
            sort: filters.sort || [{ field: 'Sort Order', direction: 'asc' }]
        };
        if (filters.filterByFormula) params.filterByFormula = filters.filterByFormula;
        if (filters.maxRecords) params.maxRecords = filters.maxRecords;
        if (filters.offset) params.offset = filters.offset;

        const data = await API.request('list', params);
        return data;
    },

    /**
     * Fetch all tasks across all pages (handles Airtable pagination).
     */
    async listAllTasks() {
        let allRecords = [];
        let offset = null;

        do {
            const filters = {};
            if (offset) filters.offset = offset;
            const data = await API.listTasks(filters);
            allRecords = allRecords.concat(data.records || []);
            offset = data.offset || null;
        } while (offset);

        return allRecords;
    },

    /**
     * Fetch a single task by record ID.
     */
    async getTask(recordId) {
        return API.request('get', { table: 'Tasks', recordId });
    },

    /**
     * Create a new task with provided fields.
     */
    async createTask(fields) {
        return API.request('create', { table: 'Tasks', fields });
    },

    /**
     * Update an existing task's fields.
     */
    async updateTask(recordId, fields) {
        return API.request('update', { table: 'Tasks', recordId, fields });
    },

    /**
     * Delete a task by record ID.
     */
    async deleteTask(recordId) {
        return API.request('delete', { table: 'Tasks', recordId });
    },

    /**
     * Fetch project settings from the Project Settings table.
     */
    async getSettings() {
        const data = await API.request('list', { table: 'Project Settings' });
        const settings = {};
        if (data.records) {
            data.records.forEach(function(rec) {
                const name = rec.fields['Setting Name'];
                const value = rec.fields['Setting Value'];
                if (name) {
                    // Normalize keys: "RAG Green Threshold" -> "RAG_Green_Threshold"
                    var key = name.replace(/\s+/g, '_');
                    settings[key] = value;
                }
            });
        }
        return settings;
    }
};


/* --------------------------------------------------------------------------
   EXPORT STUBS
   -------------------------------------------------------------------------- */
const ExportAPI = {
    BASE: 'api/onedrive-proxy.php',

    async request(action) {
        try {
            const response = await fetch(ExportAPI.BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            const data = await response.json();
            if (data.status === 'stub') {
                showToast(data.message || 'This feature is coming in Phase 3.', 'info');
            }
            return data;
        } catch (err) {
            console.error('[Export Error]', err);
            showToast('Export request failed.', 'error');
        }
    },

    exportCSV()      { return ExportAPI.request('export-csv'); },
    exportPDF()      { return ExportAPI.request('export-pdf'); },
    saveToOneDrive() { return ExportAPI.request('save-onedrive'); }
};


/* --------------------------------------------------------------------------
   ROUTER
   -------------------------------------------------------------------------- */
const Router = {
    /**
     * Parse the current hash into a route object.
     * @returns {{ view: string, param: string|null }}
     */
    parse() {
        const hash = window.location.hash.replace(/^#\/?/, '');

        if (!hash || hash === 'dashboard') {
            return { view: 'dashboard', param: null };
        }

        if (hash.startsWith('workstream/')) {
            const name = decodeURIComponent(hash.replace('workstream/', ''));
            return { view: 'workstream', param: name };
        }

        if (hash.startsWith('task/')) {
            const id = hash.replace('task/', '');
            return { view: 'task', param: id };
        }

        // Fallback
        return { view: 'dashboard', param: null };
    },

    /**
     * Navigate to a hash without triggering a full reload.
     */
    navigate(hash) {
        window.location.hash = hash;
    },

    /**
     * Handle route changes.
     */
    async handleRoute() {
        const route = Router.parse();
        State.currentView = route.view;

        // Close sidebar on mobile after navigation
        closeSidebar();
        closeAllDropdowns();

        switch (route.view) {
            case 'dashboard':
                State.currentWorkstream = null;
                State.currentTaskId = null;
                await renderDashboard();
                break;
            case 'workstream':
                State.currentWorkstream = route.param;
                State.currentTaskId = null;
                await renderWorkstream(route.param);
                break;
            case 'task':
                State.currentTaskId = route.param;
                await renderTaskDetail(route.param);
                break;
            default:
                State.currentWorkstream = null;
                State.currentTaskId = null;
                await renderDashboard();
        }

        updateSidebarActiveState();
        updateBreadcrumb();
        updateHeaderTitle();
    },

    /**
     * Initialize the router by binding hashchange and running the first route.
     */
    init() {
        window.addEventListener('hashchange', function() {
            Router.handleRoute();
        });
    }
};


/* --------------------------------------------------------------------------
   UTILITY FUNCTIONS
   -------------------------------------------------------------------------- */

/**
 * Get a task field value safely.
 */
function getField(task, fieldName, fallback) {
    if (fallback === undefined) fallback = '';
    if (!task || !task.fields) return fallback;
    var val = task.fields[fieldName];
    return (val !== undefined && val !== null) ? val : fallback;
}

/**
 * Format a date string for display. Returns "MMM DD, YYYY" or the original.
 */
function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        var d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d.getTime())) return dateStr;
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    } catch (e) {
        return dateStr;
    }
}

/**
 * Check if a date string is before today.
 */
function isOverdue(dateStr) {
    if (!dateStr) return false;
    var d = new Date(dateStr + 'T00:00:00');
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
}

/**
 * Check if a date is within the next N days.
 */
function isDueWithinDays(dateStr, days) {
    if (!dateStr) return false;
    var d = new Date(dateStr + 'T00:00:00');
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var future = new Date(today);
    future.setDate(future.getDate() + days);
    return d >= today && d <= future;
}

/**
 * Convert a status string to its CSS class suffix.
 */
function statusCssClass(status) {
    return STATUS_CSS_MAP[status] || 'not-started';
}

/**
 * Convert a priority string to its CSS class suffix.
 */
function priorityCssClass(priority) {
    return PRIORITY_CSS_MAP[priority] || 'medium';
}

/**
 * Get initials from a name string (e.g., "John Doe" -> "JD").
 */
function getInitials(name) {
    if (!name) return '?';
    return name.split(/\s+/).map(function(w) { return w.charAt(0); }).join('').toUpperCase().substring(0, 2);
}

/**
 * Sanitize HTML to prevent XSS. Replaces angle brackets and quotes.
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Encode a workstream name for use in a URL hash.
 */
function encodeWorkstream(name) {
    return encodeURIComponent(name);
}

/**
 * Short numeric formatter (e.g., 100 -> 100, could be extended).
 */
function formatPercent(num) {
    return Math.round(num) + '%';
}


/* --------------------------------------------------------------------------
   TOAST NOTIFICATIONS
   -------------------------------------------------------------------------- */

/**
 * Show a toast notification.
 * @param {string} message  - The message text
 * @param {string} type     - success | error | warning | info
 * @param {number} duration - Auto-dismiss time in ms (default 4000)
 */
function showToast(message, type, duration) {
    if (!type) type = 'success';
    if (!duration) duration = 4000;

    var container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    var iconSvg = '';
    var title = '';
    switch (type) {
        case 'success':
            title = 'Success';
            iconSvg = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 18a8 8 0 100-16 8 8 0 000 16z" fill="currentColor" opacity="0.15"/><path d="M7 10l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            break;
        case 'error':
            title = 'Error';
            iconSvg = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 18a8 8 0 100-16 8 8 0 000 16z" fill="currentColor" opacity="0.15"/><path d="M13 7l-6 6M7 7l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
            break;
        case 'warning':
            title = 'Warning';
            iconSvg = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 18a8 8 0 100-16 8 8 0 000 16z" fill="currentColor" opacity="0.15"/><path d="M10 7v3M10 13h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
            break;
        case 'info':
            title = 'Info';
            iconSvg = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 18a8 8 0 100-16 8 8 0 000 16z" fill="currentColor" opacity="0.15"/><path d="M10 9v4M10 7h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
            break;
    }

    var toast = document.createElement('div');
    toast.className = 'toast toast--' + type;
    toast.style.position = 'relative';
    toast.innerHTML =
        '<div class="toast-icon">' + iconSvg + '</div>' +
        '<div class="toast-content">' +
            '<div class="toast-title">' + escapeHtml(title) + '</div>' +
            '<div class="toast-message">' + escapeHtml(message) + '</div>' +
        '</div>' +
        '<button class="toast-close" data-action="close-toast">&times;</button>' +
        '<div class="toast-progress"></div>';

    container.appendChild(toast);

    // Close handler
    toast.querySelector('[data-action="close-toast"]').addEventListener('click', function() {
        dismissToast(toast);
    });

    // Auto-dismiss
    var timer = setTimeout(function() { dismissToast(toast); }, duration);
    toast._timer = timer;
}

function dismissToast(toast) {
    if (toast._dismissed) return;
    toast._dismissed = true;
    clearTimeout(toast._timer);
    toast.classList.add('dismissing');
    toast.addEventListener('animationend', function() {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    });
}


/* --------------------------------------------------------------------------
   LOADING INDICATOR
   -------------------------------------------------------------------------- */

function updateLoadingIndicator(show) {
    var overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

function showInlineLoading(targetEl) {
    if (!targetEl) return;
    var spinner = document.createElement('span');
    spinner.className = 'spinner spinner--sm';
    spinner.style.marginLeft = '8px';
    spinner.setAttribute('data-inline-spinner', 'true');
    targetEl.appendChild(spinner);
    targetEl.disabled = true;
}

function hideInlineLoading(targetEl) {
    if (!targetEl) return;
    var spinner = targetEl.querySelector('[data-inline-spinner]');
    if (spinner) spinner.remove();
    targetEl.disabled = false;
}


/* --------------------------------------------------------------------------
   SIDEBAR
   -------------------------------------------------------------------------- */

function buildSidebar() {
    var nav = document.getElementById('sidebar-nav');
    if (!nav) return;

    var html = '';

    // Dashboard link
    html += '<a href="#dashboard" class="sidebar-nav-item" data-view="dashboard">';
    html += '  <span class="sidebar-nav-item-icon">&#128202;</span>';
    html += '  <span class="sidebar-nav-item-label">Dashboard</span>';
    html += '</a>';

    // Section label
    html += '<div class="sidebar-section-label">Workstreams</div>';

    // Workstream groups
    WORKSTREAMS.forEach(function(ws) {
        var wsSlug = encodeWorkstream(ws);
        var taskCount = State.tasks.filter(function(t) { return getField(t, 'Workstream') === ws; }).length;
        var groups = getProjectGroupsForWorkstream(ws);

        html += '<div class="sidebar-group" data-workstream="' + escapeHtml(ws) + '">';

        // Toggle button
        html += '<button class="sidebar-group-toggle" data-action="toggle-ws-group" data-workstream="' + escapeHtml(ws) + '">';
        html += '  <span class="sidebar-nav-item-icon">' + (WORKSTREAM_ICONS[ws] || '&#128196;') + '</span>';
        html += '  <span class="sidebar-nav-item-label">' + escapeHtml(ws) + '</span>';
        html += '  <span class="sidebar-nav-item-badge">' + taskCount + '</span>';
        html += '  <span class="sidebar-group-chevron">&#9654;</span>';
        html += '</button>';

        // Collapsible sub-items
        html += '<div class="sidebar-group-items">';

        // Link to the full workstream view
        html += '<a href="#workstream/' + wsSlug + '" class="sidebar-nav-item" data-view="workstream" data-workstream="' + escapeHtml(ws) + '">';
        html += '  <span class="sidebar-nav-item-label">All Tasks</span>';
        html += '</a>';

        // Project group sub-links
        groups.forEach(function(group) {
            html += '<a href="#workstream/' + wsSlug + '" class="sidebar-nav-item" data-view="workstream" data-workstream="' + escapeHtml(ws) + '" data-group="' + escapeHtml(group) + '">';
            html += '  <span class="sidebar-nav-item-label">' + escapeHtml(group) + '</span>';
            html += '</a>';
        });

        html += '</div>'; // .sidebar-group-items
        html += '</div>'; // .sidebar-group
    });

    nav.innerHTML = html;
}

function getProjectGroupsForWorkstream(workstreamName) {
    var groups = {};
    State.tasks.forEach(function(t) {
        if (getField(t, 'Workstream') === workstreamName) {
            var g = getField(t, 'Project Group');
            if (g) groups[g] = true;
        }
    });
    return Object.keys(groups).sort();
}

function updateSidebarActiveState() {
    var navItems = document.querySelectorAll('.sidebar-nav-item');
    navItems.forEach(function(item) {
        item.classList.remove('active');
    });

    var groupToggles = document.querySelectorAll('.sidebar-group-toggle');
    groupToggles.forEach(function(toggle) {
        toggle.classList.remove('active');
    });

    if (State.currentView === 'dashboard') {
        var dashItem = document.querySelector('[data-view="dashboard"]');
        if (dashItem) dashItem.classList.add('active');
    } else if (State.currentView === 'workstream' && State.currentWorkstream) {
        // Highlight the workstream toggle
        var toggle = document.querySelector('.sidebar-group-toggle[data-workstream="' + State.currentWorkstream + '"]');
        if (toggle) toggle.classList.add('active');

        // Expand that group
        var group = document.querySelector('.sidebar-group[data-workstream="' + State.currentWorkstream + '"]');
        if (group) group.classList.add('open');

        // Highlight "All Tasks" link
        var allLink = document.querySelector('.sidebar-nav-item[data-view="workstream"][data-workstream="' + State.currentWorkstream + '"]:not([data-group])');
        if (allLink) allLink.classList.add('active');
    } else if (State.currentView === 'task' && State.currentTaskId) {
        // Find the workstream of the current task and highlight it
        var task = State.tasks.find(function(t) { return t.id === State.currentTaskId; });
        if (task) {
            var ws = getField(task, 'Workstream');
            if (ws) {
                var wsToggle = document.querySelector('.sidebar-group-toggle[data-workstream="' + ws + '"]');
                if (wsToggle) wsToggle.classList.add('active');
                var wsGroup = document.querySelector('.sidebar-group[data-workstream="' + ws + '"]');
                if (wsGroup) wsGroup.classList.add('open');
            }
        }
    }
}

function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;

    State.sidebarOpen = !State.sidebarOpen;

    if (State.sidebarOpen) {
        sidebar.classList.add('open');
        if (overlay) overlay.style.opacity = '1';
    } else {
        sidebar.classList.remove('open');
        if (overlay) overlay.style.opacity = '0';
    }
}

function closeSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');
    State.sidebarOpen = false;
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.style.opacity = '0';
}


/* --------------------------------------------------------------------------
   BREADCRUMB
   -------------------------------------------------------------------------- */

function updateBreadcrumb() {
    var el = document.getElementById('breadcrumb');
    if (!el) return;

    var items = [{ label: 'Project Integrity', href: '#dashboard' }];

    if (State.currentView === 'dashboard') {
        items.push({ label: 'Dashboard', href: null });
    } else if (State.currentView === 'workstream' && State.currentWorkstream) {
        items.push({ label: State.currentWorkstream, href: null });
    } else if (State.currentView === 'task' && State.currentTaskId) {
        var task = State.tasks.find(function(t) { return t.id === State.currentTaskId; });
        var ws = task ? getField(task, 'Workstream') : null;
        if (ws) {
            items.push({ label: ws, href: '#workstream/' + encodeWorkstream(ws) });
        }
        var taskTitle = task ? getField(task, 'Title', 'Task Detail') : 'Task Detail';
        items.push({ label: taskTitle, href: null });
    }

    var html = '';
    items.forEach(function(item, i) {
        if (i > 0) {
            html += '<span class="breadcrumb-separator">/</span>';
        }
        if (item.href) {
            html += '<a href="' + item.href + '" class="breadcrumb-item">' + escapeHtml(item.label) + '</a>';
        } else {
            html += '<span class="breadcrumb-item">' + escapeHtml(item.label) + '</span>';
        }
    });

    el.innerHTML = html;
}


/* --------------------------------------------------------------------------
   HEADER
   -------------------------------------------------------------------------- */

function updateHeaderTitle() {
    var el = document.getElementById('header-title');
    if (!el) return;

    switch (State.currentView) {
        case 'dashboard':
            el.textContent = 'Dashboard';
            break;
        case 'workstream':
            el.textContent = State.currentWorkstream || 'Workstream';
            break;
        case 'task':
            var task = State.tasks.find(function(t) { return t.id === State.currentTaskId; });
            el.textContent = task ? getField(task, 'Title', 'Task Detail') : 'Task Detail';
            break;
        default:
            el.textContent = 'Dashboard';
    }
}


/* --------------------------------------------------------------------------
   DASHBOARD RENDERING
   -------------------------------------------------------------------------- */

async function renderDashboard() {
    var mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    // Show skeleton while loading if tasks not yet loaded
    if (State.tasks.length === 0 && !State.isLoading) {
        try {
            State.tasks = await API.listAllTasks();
            buildSidebar();
        } catch (e) {
            // Error toast already shown by API
        }
    }

    var tasks = State.tasks;
    var total = tasks.length;

    // Compute metrics
    var completedCount = 0;
    var inProgressCount = 0;
    var blockedCount = 0;
    var overdueCount = 0;
    var overdueTasks = [];
    var dueSoonTasks = [];

    tasks.forEach(function(t) {
        var status = getField(t, 'Status');
        var dueDate = getField(t, 'Due Date');

        if (status === 'Complete') completedCount++;
        if (status === 'In Progress') inProgressCount++;
        if (status === 'Blocked') blockedCount++;
        if (status !== 'Complete' && dueDate && isOverdue(dueDate)) {
            overdueCount++;
            overdueTasks.push(t);
        }
        if (status !== 'Complete' && dueDate && isDueWithinDays(dueDate, 7) && !isOverdue(dueDate)) {
            dueSoonTasks.push(t);
        }
    });

    // RAG calculation
    var ragGreenThreshold = parseFloat(State.settings.RAG_Green_Threshold) || 20;
    var ragRedThreshold = parseFloat(State.settings.RAG_Red_Threshold) || 40;
    var blockedOrOverduePct = total > 0 ? ((blockedCount + overdueCount) / total) * 100 : 0;
    var ragStatus = 'green';
    var ragLabel = 'On Track';
    if (blockedOrOverduePct > ragRedThreshold) {
        ragStatus = 'red';
        ragLabel = 'At Risk';
    } else if (blockedOrOverduePct >= ragGreenThreshold) {
        ragStatus = 'amber';
        ragLabel = 'Needs Attention';
    }

    // Per-workstream completion
    var wsMetrics = {};
    WORKSTREAMS.forEach(function(ws) {
        var wsTasks = tasks.filter(function(t) { return getField(t, 'Workstream') === ws; });
        var wsComplete = wsTasks.filter(function(t) { return getField(t, 'Status') === 'Complete'; }).length;
        wsMetrics[ws] = {
            total: wsTasks.length,
            complete: wsComplete,
            pct: wsTasks.length > 0 ? Math.round((wsComplete / wsTasks.length) * 100) : 0
        };
    });

    // Build dashboard HTML
    var html = '';

    // Page header
    html += '<div class="page-header">';
    html += '  <div>';
    html += '    <h1 class="page-title">Remediation Dashboard</h1>';
    html += '    <p class="page-subtitle">Overview of financial controls remediation progress</p>';
    html += '  </div>';
    html += '  <div class="page-actions">';
    html += '    <div class="rag-indicator rag-indicator--' + ragStatus + '">';
    html += '      <span class="rag-indicator-dot"></span>';
    html += '      <span class="rag-indicator-label">' + escapeHtml(ragLabel) + '</span>';
    html += '    </div>';
    html += '    <button class="btn btn-secondary btn--sm" data-action="export-csv">Export CSV</button>';
    html += '    <button class="btn btn-secondary btn--sm" data-action="export-pdf">Export PDF</button>';
    html += '    <button class="btn btn-primary btn--sm" data-action="export-onedrive">Save to OneDrive</button>';
    html += '  </div>';
    html += '</div>';

    // Stat cards
    html += '<div class="stat-cards-grid">';

    // Total tasks
    html += buildStatCard('Total Tasks', total, 'info',
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>',
        total > 0 ? formatPercent(completedCount / total * 100) + ' complete' : '');

    // Completed
    html += buildStatCard('Completed', completedCount, 'success',
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        total > 0 ? formatPercent(completedCount / total * 100) + ' of total' : '');

    // In Progress
    html += buildStatCard('In Progress', inProgressCount, 'info',
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        '');

    // Blocked
    html += buildStatCard('Blocked', blockedCount, 'warning',
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        overdueCount > 0 ? overdueCount + ' overdue' : '');

    html += '</div>'; // .stat-cards-grid

    // Two-column layout: Workstream progress | Overdue/Due soon
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-5);margin-bottom:var(--space-6);">';

    // Workstream progress panel
    html += '<div class="card">';
    html += '  <div class="card-header">';
    html += '    <span class="card-title">Workstream Progress</span>';
    html += '    <span class="rag-badge rag-badge--' + ragStatus + '">';
    html += '      <span class="rag-indicator-dot" style="width:8px;height:8px;"></span>';
    html += '      ' + escapeHtml(ragLabel);
    html += '    </span>';
    html += '  </div>';
    html += '  <div class="card-body">';

    if (total === 0) {
        html += renderEmptyState('No tasks yet', 'Task data will appear once the task plan is seeded.', '&#128203;');
    } else {
        WORKSTREAMS.forEach(function(ws) {
            var m = wsMetrics[ws];
            html += '<div style="margin-bottom:var(--space-5);">';
            html += '  <div class="progress-label">';
            html += '    <a href="#workstream/' + encodeWorkstream(ws) + '" class="progress-label-text" style="text-decoration:none;cursor:pointer;">' + escapeHtml(ws) + '</a>';
            html += '    <span class="progress-label-value">' + m.complete + '/' + m.total + ' (' + m.pct + '%)</span>';
            html += '  </div>';
            html += '  <div class="progress-bar">';
            html += '    <div class="progress-bar-fill' + (m.pct === 100 ? ' progress-bar-fill--success' : '') + '" style="width:' + m.pct + '%;"></div>';
            html += '  </div>';
            html += '</div>';
        });
    }

    html += '  </div>'; // .card-body
    html += '</div>'; // .card

    // Right column: Overdue + Due soon
    html += '<div style="display:flex;flex-direction:column;gap:var(--space-5);">';

    // Overdue tasks
    html += '<div class="card" style="flex:1;">';
    html += '  <div class="card-header">';
    html += '    <span class="card-title" style="color:var(--color-danger);">Overdue Tasks</span>';
    html += '    <span class="badge badge--blocked" style="font-size:11px;">' + overdueTasks.length + '</span>';
    html += '  </div>';
    html += '  <div class="card-body" style="max-height:240px;overflow-y:auto;">';
    if (overdueTasks.length === 0) {
        html += '<div style="text-align:center;color:var(--color-text-tertiary);padding:var(--space-6) 0;font-size:var(--font-size-sm);">No overdue tasks</div>';
    } else {
        overdueTasks.forEach(function(t) {
            html += renderMiniTaskItem(t, true);
        });
    }
    html += '  </div>'; // .card-body
    html += '</div>'; // .card

    // Due in 7 days
    html += '<div class="card" style="flex:1;">';
    html += '  <div class="card-header">';
    html += '    <span class="card-title">Due in 7 Days</span>';
    html += '    <span class="badge badge--in-progress" style="font-size:11px;">' + dueSoonTasks.length + '</span>';
    html += '  </div>';
    html += '  <div class="card-body" style="max-height:240px;overflow-y:auto;">';
    if (dueSoonTasks.length === 0) {
        html += '<div style="text-align:center;color:var(--color-text-tertiary);padding:var(--space-6) 0;font-size:var(--font-size-sm);">No upcoming deadlines</div>';
    } else {
        // Group by workstream
        var dueSoonByWs = {};
        dueSoonTasks.forEach(function(t) {
            var ws = getField(t, 'Workstream', 'Uncategorized');
            if (!dueSoonByWs[ws]) dueSoonByWs[ws] = [];
            dueSoonByWs[ws].push(t);
        });
        Object.keys(dueSoonByWs).sort().forEach(function(ws) {
            html += '<div style="font-size:var(--font-size-xs);font-weight:600;color:var(--color-text-secondary);margin-bottom:var(--space-2);margin-top:var(--space-3);text-transform:uppercase;letter-spacing:0.05em;">' + escapeHtml(ws) + '</div>';
            dueSoonByWs[ws].forEach(function(t) {
                html += renderMiniTaskItem(t, false);
            });
        });
    }
    html += '  </div>'; // .card-body
    html += '</div>'; // .card

    html += '</div>'; // right column
    html += '</div>'; // two-column grid

    mainContent.innerHTML = html;
}

function buildStatCard(label, value, variant, iconSvg, trendText) {
    var variantClass = variant ? ' stat-card--' + variant : '';
    var html = '<div class="stat-card' + variantClass + '">';
    html += '  <div class="stat-card-content">';
    html += '    <span class="stat-card-value">' + value + '</span>';
    html += '    <span class="stat-card-label">' + escapeHtml(label) + '</span>';
    if (trendText) {
        html += '    <span class="stat-card-trend">' + escapeHtml(trendText) + '</span>';
    }
    html += '  </div>';
    html += '  <div class="stat-card-icon">' + iconSvg + '</div>';
    html += '</div>';
    return html;
}

function renderMiniTaskItem(task, showOverdueStyle) {
    var title = getField(task, 'Title');
    var dueDate = getField(task, 'Due Date');
    var status = getField(task, 'Status');
    var priority = getField(task, 'Priority');
    var dueDateClass = showOverdueStyle ? 'color:var(--color-danger);font-weight:600;' : '';

    var html = '<a href="#task/' + task.id + '" style="display:flex;align-items:center;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--color-border-light);text-decoration:none;gap:var(--space-3);">';
    html += '  <div style="flex:1;min-width:0;">';
    html += '    <div style="font-size:var(--font-size-sm);font-weight:500;color:var(--color-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(title) + '</div>';
    html += '    <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);margin-top:2px;' + dueDateClass + '">' + formatDate(dueDate) + '</div>';
    html += '  </div>';
    html += '  <span class="badge badge--' + statusCssClass(status) + '">' + escapeHtml(status) + '</span>';
    html += '</a>';
    return html;
}

function renderEmptyState(title, text, icon) {
    return '<div class="empty-state">' +
        '<div class="empty-state-icon">' + (icon || '&#128203;') + '</div>' +
        '<div class="empty-state-title">' + escapeHtml(title) + '</div>' +
        '<div class="empty-state-text">' + escapeHtml(text) + '</div>' +
    '</div>';
}


/* --------------------------------------------------------------------------
   WORKSTREAM VIEW RENDERING
   -------------------------------------------------------------------------- */

async function renderWorkstream(workstreamName) {
    var mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    // Ensure tasks are loaded
    if (State.tasks.length === 0 && !State.isLoading) {
        try {
            State.tasks = await API.listAllTasks();
            buildSidebar();
        } catch (e) {
            return;
        }
    }

    // Filter tasks for this workstream
    var wsTasks = State.tasks.filter(function(t) {
        return getField(t, 'Workstream') === workstreamName;
    });

    // Group by Project Group
    var groups = {};
    wsTasks.forEach(function(t) {
        var group = getField(t, 'Project Group', 'Ungrouped');
        if (!groups[group]) groups[group] = [];
        groups[group].push(t);
    });

    // Sort groups alphabetically, tasks within each by Sort Order
    var sortedGroupNames = Object.keys(groups).sort();
    sortedGroupNames.forEach(function(gName) {
        groups[gName].sort(function(a, b) {
            var aSort = parseInt(getField(a, 'Sort Order', '999'), 10);
            var bSort = parseInt(getField(b, 'Sort Order', '999'), 10);
            return aSort - bSort;
        });
    });

    // Compute workstream stats
    var wsTotal = wsTasks.length;
    var wsComplete = wsTasks.filter(function(t) { return getField(t, 'Status') === 'Complete'; }).length;
    var wsPct = wsTotal > 0 ? Math.round((wsComplete / wsTotal) * 100) : 0;

    // Build HTML
    var html = '';

    // Page header
    html += '<div class="page-header">';
    html += '  <div>';
    html += '    <h1 class="page-title">' + escapeHtml(workstreamName) + '</h1>';
    html += '    <p class="page-subtitle">' + wsComplete + ' of ' + wsTotal + ' tasks complete (' + wsPct + '%)</p>';
    html += '  </div>';
    html += '  <div class="page-actions">';
    html += '    <button class="btn btn-primary" data-action="add-task" data-workstream="' + escapeHtml(workstreamName) + '">';
    html += '      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>';
    html += '      Add Task';
    html += '    </button>';
    html += '  </div>';
    html += '</div>';

    // Progress bar for this workstream
    html += '<div style="margin-bottom:var(--space-6);">';
    html += '  <div class="progress-bar progress-bar--lg">';
    html += '    <div class="progress-bar-fill' + (wsPct === 100 ? ' progress-bar-fill--success' : '') + '" style="width:' + wsPct + '%;"></div>';
    html += '  </div>';
    html += '</div>';

    // Empty state
    if (wsTotal === 0) {
        html += renderEmptyState(
            'No tasks loaded yet',
            'Task plan will be seeded in Phase 2.',
            '&#128203;'
        );
        mainContent.innerHTML = html;
        return;
    }

    // Render each group
    sortedGroupNames.forEach(function(groupName) {
        var groupTasks = groups[groupName];

        html += '<div class="task-group" data-group="' + escapeHtml(groupName) + '" style="margin-bottom:var(--space-6);">';

        // Group header
        html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4);">';
        html += '  <h2 style="font-size:var(--font-size-md);font-weight:var(--font-weight-semibold);color:var(--color-text-inverse);">' + escapeHtml(groupName) + '</h2>';
        html += '  <span style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);">' + groupTasks.length + ' task' + (groupTasks.length !== 1 ? 's' : '') + '</span>';
        html += '</div>';

        // Task cards
        html += '<div class="task-cards-grid" data-drop-zone="' + escapeHtml(groupName) + '">';
        groupTasks.forEach(function(task) {
            html += renderTaskCard(task);
        });
        html += '</div>';

        html += '</div>'; // .task-group
    });

    // Floating add button (mobile)
    html += '<button class="btn btn-primary btn-icon" data-action="add-task" data-workstream="' + escapeHtml(workstreamName) + '" ';
    html += 'style="position:fixed;bottom:var(--space-6);right:var(--space-6);width:56px;height:56px;border-radius:var(--radius-full);box-shadow:var(--shadow-lg);font-size:var(--font-size-2xl);z-index:50;display:none;" id="fab-add-task">';
    html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    html += '</button>';

    mainContent.innerHTML = html;

    // Show FAB on mobile
    if (window.innerWidth < 768) {
        var fab = document.getElementById('fab-add-task');
        if (fab) fab.style.display = 'flex';
    }
}

function renderTaskCard(task) {
    var id = task.id;
    var title = getField(task, 'Title');
    var description = getField(task, 'Description');
    var status = getField(task, 'Status', 'Not Started');
    var priority = getField(task, 'Priority', 'Medium');
    var owner = getField(task, 'Owner');
    var dueDate = getField(task, 'Due Date');
    var group = getField(task, 'Project Group');
    var overdue = status !== 'Complete' && dueDate && isOverdue(dueDate);

    var html = '';
    html += '<div class="task-card task-card--draggable" data-task-id="' + id + '" data-group="' + escapeHtml(group) + '" draggable="true">';

    // Drag handle
    html += '  <div class="drag-handle" title="Drag to reorder"></div>';

    // Card content wrapper
    html += '  <div class="task-card-content">';

    // Header: title + badges
    html += '    <div class="task-card-header">';
    html += '      <a href="#task/' + id + '" class="task-card-title" style="text-decoration:none;color:inherit;">' + escapeHtml(title) + '</a>';
    html += '      <div class="task-card-badges">';

    // Status badge (clickable for inline edit)
    html += '        <span class="badge badge--' + statusCssClass(status) + '" data-action="status-dropdown" data-task-id="' + id + '" style="cursor:pointer;" title="Click to change status">' + escapeHtml(status) + '</span>';

    // Priority badge
    html += '        <span class="badge-priority badge-priority--' + priorityCssClass(priority) + '">';
    html += '          <span class="badge-priority-dot"></span>';
    html += '          ' + escapeHtml(priority);
    html += '        </span>';

    html += '      </div>'; // .task-card-badges
    html += '    </div>'; // .task-card-header

    // Description (truncated)
    if (description) {
        var truncated = description.length > 120 ? description.substring(0, 120) + '...' : description;
        html += '    <div class="task-card-body">' + escapeHtml(truncated) + '</div>';
    }

    // Meta row: owner, due date, edit, delete
    html += '    <div class="task-card-meta">';

    // Owner
    if (owner) {
        html += '      <div class="task-card-meta-item">';
        html += '        <span class="task-card-owner-avatar">' + getInitials(owner) + '</span>';
        html += '        <span>' + escapeHtml(owner) + '</span>';
        html += '      </div>';
    }

    // Due date
    if (dueDate) {
        html += '      <div class="task-card-meta-item" style="' + (overdue ? 'color:var(--color-danger);font-weight:600;' : '') + '">';
        html += '        <span class="task-card-meta-item-icon">';
        html += '          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="2" width="11" height="10" rx="1.5"/><line x1="1.5" y1="5" x2="12.5" y2="5"/><line x1="4.5" y1="1" x2="4.5" y2="3"/><line x1="9.5" y1="1" x2="9.5" y2="3"/></svg>';
        html += '        </span>';
        html += '        <span>' + formatDate(dueDate) + (overdue ? ' (Overdue)' : '') + '</span>';
        html += '      </div>';
    }

    // Spacer to push action buttons right
    html += '      <div style="flex:1;"></div>';

    // Edit button
    html += '      <button class="btn btn-ghost btn--sm btn-icon btn-icon--sm" data-action="edit-task" data-task-id="' + id + '" title="Edit task">';
    html += '        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 1.5l2.5 2.5L4.5 12H2v-2.5L10 1.5z"/></svg>';
    html += '      </button>';

    // Delete button
    html += '      <button class="btn btn-ghost btn--sm btn-icon btn-icon--sm" data-action="delete-task" data-task-id="' + id + '" title="Delete task" style="color:var(--color-danger);">';
    html += '        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3.5h10M5.5 3.5V2a1 1 0 011-1h1a1 1 0 011 1v1.5M11 3.5V12a1 1 0 01-1 1H4a1 1 0 01-1-1V3.5"/></svg>';
    html += '      </button>';

    html += '    </div>'; // .task-card-meta

    html += '  </div>'; // .task-card-content
    html += '</div>'; // .task-card

    return html;
}


/* --------------------------------------------------------------------------
   TASK DETAIL VIEW
   -------------------------------------------------------------------------- */

async function renderTaskDetail(recordId) {
    var mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    var task = State.tasks.find(function(t) { return t.id === recordId; });

    // If not in cache, fetch it
    if (!task) {
        try {
            task = await API.getTask(recordId);
        } catch (e) {
            mainContent.innerHTML = renderEmptyState('Task not found', 'The requested task could not be loaded.', '&#128533;');
            return;
        }
    }

    var title = getField(task, 'Title');
    var description = getField(task, 'Description');
    var workstream = getField(task, 'Workstream');
    var group = getField(task, 'Project Group');
    var status = getField(task, 'Status', 'Not Started');
    var priority = getField(task, 'Priority', 'Medium');
    var owner = getField(task, 'Owner');
    var dueDate = getField(task, 'Due Date');
    var notes = getField(task, 'Notes');
    var sortOrder = getField(task, 'Sort Order');

    var html = '';

    // Page header
    html += '<div class="page-header">';
    html += '  <div>';
    html += '    <h1 class="page-title">' + escapeHtml(title) + '</h1>';
    html += '    <p class="page-subtitle">' + escapeHtml(workstream) + (group ? ' / ' + escapeHtml(group) : '') + '</p>';
    html += '  </div>';
    html += '  <div class="page-actions">';
    if (workstream) {
        html += '    <a href="#workstream/' + encodeWorkstream(workstream) + '" class="btn btn-secondary">Back to Workstream</a>';
    }
    html += '  </div>';
    html += '</div>';

    // Two-column layout: form left, AI placeholder right
    html += '<div style="display:grid;grid-template-columns:1fr 380px;gap:var(--space-6);">';

    // Left column: task detail form
    html += '<div class="card">';
    html += '  <div class="card-header">';
    html += '    <span class="card-title">Task Details</span>';
    html += '    <span class="badge badge--' + statusCssClass(status) + '">' + escapeHtml(status) + '</span>';
    html += '  </div>';
    html += '  <div class="card-body">';
    html += '    <form id="task-detail-form" data-task-id="' + task.id + '">';

    // Title
    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="td-title">Title</label>';
    html += '        <input type="text" id="td-title" name="Title" class="form-input" value="' + escapeHtml(title) + '">';
    html += '      </div>';

    // Description
    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="td-description">Description</label>';
    html += '        <textarea id="td-description" name="Description" class="form-textarea">' + escapeHtml(description) + '</textarea>';
    html += '      </div>';

    // Two-col: Workstream + Project Group
    html += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">';

    html += '        <div class="form-group">';
    html += '          <label class="form-label" for="td-workstream">Workstream</label>';
    html += '          <select id="td-workstream" name="Workstream" class="form-select">';
    WORKSTREAMS.forEach(function(ws) {
        html += '            <option value="' + escapeHtml(ws) + '"' + (ws === workstream ? ' selected' : '') + '>' + escapeHtml(ws) + '</option>';
    });
    html += '          </select>';
    html += '        </div>';

    html += '        <div class="form-group">';
    html += '          <label class="form-label" for="td-group">Project Group</label>';
    html += '          <input type="text" id="td-group" name="Project Group" class="form-input" value="' + escapeHtml(group) + '">';
    html += '        </div>';

    html += '      </div>';

    // Two-col: Status + Priority
    html += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">';

    html += '        <div class="form-group">';
    html += '          <label class="form-label" for="td-status">Status</label>';
    html += '          <select id="td-status" name="Status" class="form-select">';
    STATUS_OPTIONS.forEach(function(s) {
        html += '            <option value="' + escapeHtml(s) + '"' + (s === status ? ' selected' : '') + '>' + escapeHtml(s) + '</option>';
    });
    html += '          </select>';
    html += '        </div>';

    html += '        <div class="form-group">';
    html += '          <label class="form-label" for="td-priority">Priority</label>';
    html += '          <select id="td-priority" name="Priority" class="form-select">';
    PRIORITY_OPTIONS.forEach(function(p) {
        html += '            <option value="' + escapeHtml(p) + '"' + (p === priority ? ' selected' : '') + '>' + escapeHtml(p) + '</option>';
    });
    html += '          </select>';
    html += '        </div>';

    html += '      </div>';

    // Two-col: Owner + Due Date
    html += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">';

    html += '        <div class="form-group">';
    html += '          <label class="form-label" for="td-owner">Owner</label>';
    html += '          <input type="text" id="td-owner" name="Owner" class="form-input" value="' + escapeHtml(owner) + '">';
    html += '        </div>';

    html += '        <div class="form-group">';
    html += '          <label class="form-label" for="td-due-date">Due Date</label>';
    html += '          <input type="date" id="td-due-date" name="Due Date" class="form-input" value="' + escapeHtml(dueDate) + '">';
    html += '        </div>';

    html += '      </div>';

    // Notes
    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="td-notes">Notes <span class="form-label-optional">(optional)</span></label>';
    html += '        <textarea id="td-notes" name="Notes" class="form-textarea" style="min-height:80px;">' + escapeHtml(notes) + '</textarea>';
    html += '      </div>';

    // Sort Order (hidden-ish, small input)
    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="td-sort-order">Sort Order <span class="form-label-optional">(numeric)</span></label>';
    html += '        <input type="number" id="td-sort-order" name="Sort Order" class="form-input" value="' + escapeHtml(String(sortOrder)) + '" style="max-width:120px;">';
    html += '      </div>';

    html += '    </form>';
    html += '  </div>'; // .card-body

    // Card footer with action buttons
    html += '  <div class="card-footer" style="display:flex;justify-content:flex-end;gap:var(--space-3);">';
    if (workstream) {
        html += '    <a href="#workstream/' + encodeWorkstream(workstream) + '" class="btn btn-secondary">Cancel</a>';
    } else {
        html += '    <a href="#dashboard" class="btn btn-secondary">Cancel</a>';
    }
    html += '    <button class="btn btn-primary" data-action="save-task-detail" data-task-id="' + task.id + '">Save Changes</button>';
    html += '  </div>';

    html += '</div>'; // .card

    // Right column: AI chat placeholder
    html += '<div class="card" style="align-self:start;">';
    html += '  <div class="card-header">';
    html += '    <span class="card-title">AI Expert Chat</span>';
    html += '  </div>';
    html += '  <div class="card-body">';
    html += renderEmptyState(
        'Coming in Phase 3',
        'AI-powered remediation guidance will be available here in a future release.',
        '&#129302;'
    );
    html += '  </div>';
    html += '</div>';

    html += '</div>'; // two-column grid

    mainContent.innerHTML = html;
}


/* --------------------------------------------------------------------------
   INLINE STATUS DROPDOWN
   -------------------------------------------------------------------------- */

function showStatusDropdown(badgeEl, taskId) {
    closeAllDropdowns();

    var task = State.tasks.find(function(t) { return t.id === taskId; });
    var currentStatus = task ? getField(task, 'Status', 'Not Started') : 'Not Started';

    // Create dropdown
    var dropdown = document.createElement('div');
    dropdown.className = 'dropdown-menu';
    dropdown.id = 'status-dropdown-' + taskId;
    dropdown.style.position = 'absolute';
    dropdown.style.zIndex = '60';
    dropdown.style.opacity = '1';
    dropdown.style.visibility = 'visible';
    dropdown.style.transform = 'translateY(0)';

    STATUS_OPTIONS.forEach(function(statusOpt) {
        var item = document.createElement('button');
        item.className = 'dropdown-item';
        item.setAttribute('data-action', 'set-status');
        item.setAttribute('data-task-id', taskId);
        item.setAttribute('data-status', statusOpt);

        var dotColor = '';
        switch (statusOpt) {
            case 'Not Started': dotColor = 'var(--color-status-not-started-bg)'; break;
            case 'In Progress': dotColor = 'var(--color-status-in-progress-bg)'; break;
            case 'Blocked':     dotColor = 'var(--color-status-blocked-bg)'; break;
            case 'Complete':    dotColor = 'var(--color-status-complete-bg)'; break;
            case 'Deferred':    dotColor = 'var(--color-status-deferred-bg)'; break;
        }

        item.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + dotColor + ';"></span> ' +
            escapeHtml(statusOpt) +
            (statusOpt === currentStatus ? ' <span style="margin-left:auto;opacity:0.5;">&#10003;</span>' : '');

        dropdown.appendChild(item);
    });

    // Position near the badge
    badgeEl.style.position = 'relative';
    badgeEl.appendChild(dropdown);

    State.openStatusDropdown = taskId;
}

function closeAllDropdowns() {
    var existing = document.querySelectorAll('.dropdown-menu[id^="status-dropdown-"]');
    existing.forEach(function(el) {
        if (el.parentNode) el.parentNode.removeChild(el);
    });
    State.openStatusDropdown = null;
}

async function handleStatusChange(taskId, newStatus) {
    closeAllDropdowns();

    // Optimistic update in the UI
    var badgeEl = document.querySelector('.badge[data-task-id="' + taskId + '"]');
    if (badgeEl) {
        badgeEl.className = 'badge badge--' + statusCssClass(newStatus);
        badgeEl.setAttribute('data-action', 'status-dropdown');
        badgeEl.setAttribute('data-task-id', taskId);
        badgeEl.style.cursor = 'pointer';
        badgeEl.title = 'Click to change status';
        badgeEl.textContent = newStatus;
    }

    // Update local state
    var task = State.tasks.find(function(t) { return t.id === taskId; });
    if (task) {
        task.fields.Status = newStatus;
    }

    // Persist to Airtable
    try {
        await API.updateTask(taskId, { Status: newStatus });
        showToast('Status updated to "' + newStatus + '".', 'success');
    } catch (e) {
        // Revert optimistic update
        if (task) {
            var oldStatus = getField(task, 'Status', 'Not Started');
            if (badgeEl) {
                badgeEl.className = 'badge badge--' + statusCssClass(oldStatus);
                badgeEl.textContent = oldStatus;
            }
        }
    }
}


/* --------------------------------------------------------------------------
   MODALS — Add / Edit / Delete Task
   -------------------------------------------------------------------------- */

function getModalOverlay() {
    var overlay = document.getElementById('modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'modal-overlay';
        overlay.className = 'modal-overlay';
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeModal();
        });
        document.body.appendChild(overlay);
    }
    return overlay;
}

function openModal(html, size) {
    var overlay = getModalOverlay();
    var sizeClass = size ? ' modal--' + size : '';
    overlay.innerHTML = '<div class="modal' + sizeClass + '">' + html + '</div>';
    // Trigger reflow then add active class
    overlay.offsetHeight; // force reflow
    overlay.classList.add('active');

    // Focus first input
    setTimeout(function() {
        var firstInput = overlay.querySelector('input, select, textarea');
        if (firstInput) firstInput.focus();
    }, 100);
}

function closeModal() {
    var overlay = document.getElementById('modal-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        // Clear contents after transition
        setTimeout(function() {
            overlay.innerHTML = '';
        }, 300);
    }
}

/**
 * Open the Add Task modal.
 */
function openAddTaskModal(preselectedWorkstream) {
    var html = '';
    html += '<div class="modal-header">';
    html += '  <span class="modal-title">Add New Task</span>';
    html += '  <button class="modal-close" data-action="close-modal">&times;</button>';
    html += '</div>';
    html += '<div class="modal-body">';
    html += '  <form id="modal-task-form">';

    // Title
    html += '    <div class="form-group">';
    html += '      <label class="form-label" for="mf-title">Title</label>';
    html += '      <input type="text" id="mf-title" name="Title" class="form-input" placeholder="Enter task title" required>';
    html += '    </div>';

    // Description
    html += '    <div class="form-group">';
    html += '      <label class="form-label" for="mf-description">Description <span class="form-label-optional">(optional)</span></label>';
    html += '      <textarea id="mf-description" name="Description" class="form-textarea" placeholder="Describe this task..."></textarea>';
    html += '    </div>';

    // Two-col: Workstream + Project Group
    html += '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">';
    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="mf-workstream">Workstream</label>';
    html += '        <select id="mf-workstream" name="Workstream" class="form-select">';
    WORKSTREAMS.forEach(function(ws) {
        html += '          <option value="' + escapeHtml(ws) + '"' + (ws === preselectedWorkstream ? ' selected' : '') + '>' + escapeHtml(ws) + '</option>';
    });
    html += '        </select>';
    html += '      </div>';

    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="mf-group">Project Group</label>';
    html += '        <input type="text" id="mf-group" name="Project Group" class="form-input" placeholder="e.g., Close Process">';
    html += '      </div>';
    html += '    </div>';

    // Two-col: Status + Priority
    html += '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">';
    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="mf-status">Status</label>';
    html += '        <select id="mf-status" name="Status" class="form-select">';
    STATUS_OPTIONS.forEach(function(s) {
        html += '          <option value="' + escapeHtml(s) + '"' + (s === 'Not Started' ? ' selected' : '') + '>' + escapeHtml(s) + '</option>';
    });
    html += '        </select>';
    html += '      </div>';

    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="mf-priority">Priority</label>';
    html += '        <select id="mf-priority" name="Priority" class="form-select">';
    PRIORITY_OPTIONS.forEach(function(p) {
        html += '          <option value="' + escapeHtml(p) + '"' + (p === 'Medium' ? ' selected' : '') + '>' + escapeHtml(p) + '</option>';
    });
    html += '        </select>';
    html += '      </div>';
    html += '    </div>';

    // Two-col: Owner + Due Date
    html += '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">';
    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="mf-owner">Owner <span class="form-label-optional">(optional)</span></label>';
    html += '        <input type="text" id="mf-owner" name="Owner" class="form-input" placeholder="e.g., John Smith">';
    html += '      </div>';

    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="mf-due-date">Due Date <span class="form-label-optional">(optional)</span></label>';
    html += '        <input type="date" id="mf-due-date" name="Due Date" class="form-input">';
    html += '      </div>';
    html += '    </div>';

    html += '  </form>';
    html += '</div>';
    html += '<div class="modal-footer">';
    html += '  <button class="btn btn-secondary" data-action="close-modal">Cancel</button>';
    html += '  <button class="btn btn-primary" data-action="save-new-task">Save Task</button>';
    html += '</div>';

    openModal(html);
}

/**
 * Open the Edit Task modal pre-populated with existing data.
 */
function openEditTaskModal(taskId) {
    var task = State.tasks.find(function(t) { return t.id === taskId; });
    if (!task) {
        showToast('Task not found.', 'error');
        return;
    }

    var title = getField(task, 'Title');
    var description = getField(task, 'Description');
    var workstream = getField(task, 'Workstream');
    var group = getField(task, 'Project Group');
    var status = getField(task, 'Status', 'Not Started');
    var priority = getField(task, 'Priority', 'Medium');
    var owner = getField(task, 'Owner');
    var dueDate = getField(task, 'Due Date');

    var html = '';
    html += '<div class="modal-header">';
    html += '  <span class="modal-title">Edit Task</span>';
    html += '  <button class="modal-close" data-action="close-modal">&times;</button>';
    html += '</div>';
    html += '<div class="modal-body">';
    html += '  <form id="modal-task-form" data-task-id="' + taskId + '">';

    // Title
    html += '    <div class="form-group">';
    html += '      <label class="form-label" for="mf-title">Title</label>';
    html += '      <input type="text" id="mf-title" name="Title" class="form-input" value="' + escapeHtml(title) + '" required>';
    html += '    </div>';

    // Description
    html += '    <div class="form-group">';
    html += '      <label class="form-label" for="mf-description">Description</label>';
    html += '      <textarea id="mf-description" name="Description" class="form-textarea">' + escapeHtml(description) + '</textarea>';
    html += '    </div>';

    // Two-col: Workstream + Project Group
    html += '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">';
    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="mf-workstream">Workstream</label>';
    html += '        <select id="mf-workstream" name="Workstream" class="form-select">';
    WORKSTREAMS.forEach(function(ws) {
        html += '          <option value="' + escapeHtml(ws) + '"' + (ws === workstream ? ' selected' : '') + '>' + escapeHtml(ws) + '</option>';
    });
    html += '        </select>';
    html += '      </div>';

    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="mf-group">Project Group</label>';
    html += '        <input type="text" id="mf-group" name="Project Group" class="form-input" value="' + escapeHtml(group) + '">';
    html += '      </div>';
    html += '    </div>';

    // Two-col: Status + Priority
    html += '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">';
    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="mf-status">Status</label>';
    html += '        <select id="mf-status" name="Status" class="form-select">';
    STATUS_OPTIONS.forEach(function(s) {
        html += '          <option value="' + escapeHtml(s) + '"' + (s === status ? ' selected' : '') + '>' + escapeHtml(s) + '</option>';
    });
    html += '        </select>';
    html += '      </div>';

    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="mf-priority">Priority</label>';
    html += '        <select id="mf-priority" name="Priority" class="form-select">';
    PRIORITY_OPTIONS.forEach(function(p) {
        html += '          <option value="' + escapeHtml(p) + '"' + (p === priority ? ' selected' : '') + '>' + escapeHtml(p) + '</option>';
    });
    html += '        </select>';
    html += '      </div>';
    html += '    </div>';

    // Two-col: Owner + Due Date
    html += '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">';
    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="mf-owner">Owner</label>';
    html += '        <input type="text" id="mf-owner" name="Owner" class="form-input" value="' + escapeHtml(owner) + '">';
    html += '      </div>';

    html += '      <div class="form-group">';
    html += '        <label class="form-label" for="mf-due-date">Due Date</label>';
    html += '        <input type="date" id="mf-due-date" name="Due Date" class="form-input" value="' + escapeHtml(dueDate) + '">';
    html += '      </div>';
    html += '    </div>';

    html += '  </form>';
    html += '</div>';
    html += '<div class="modal-footer">';
    html += '  <button class="btn btn-secondary" data-action="close-modal">Cancel</button>';
    html += '  <button class="btn btn-primary" data-action="save-edit-task" data-task-id="' + taskId + '">Save Changes</button>';
    html += '</div>';

    openModal(html);
}

/**
 * Open a delete confirmation modal.
 */
function openDeleteConfirmModal(taskId) {
    var task = State.tasks.find(function(t) { return t.id === taskId; });
    var title = task ? getField(task, 'Title', 'this task') : 'this task';

    var html = '';
    html += '<div class="modal-header">';
    html += '  <span class="modal-title">Delete Task</span>';
    html += '  <button class="modal-close" data-action="close-modal">&times;</button>';
    html += '</div>';
    html += '<div class="modal-body">';
    html += '  <p style="font-size:var(--font-size-base);color:var(--color-text-secondary);line-height:var(--line-height-relaxed);">';
    html += '    Are you sure you want to delete <strong>' + escapeHtml(title) + '</strong>? This action cannot be undone.';
    html += '  </p>';
    html += '</div>';
    html += '<div class="modal-footer">';
    html += '  <button class="btn btn-secondary" data-action="close-modal">Cancel</button>';
    html += '  <button class="btn btn-danger" data-action="confirm-delete-task" data-task-id="' + taskId + '">Delete</button>';
    html += '</div>';

    openModal(html);
}

/**
 * Collect form data from the modal task form.
 */
function collectModalFormData() {
    var form = document.getElementById('modal-task-form');
    if (!form) return null;

    var fields = {};
    var title = form.querySelector('[name="Title"]');
    if (title && title.value.trim()) fields.Title = title.value.trim();

    var description = form.querySelector('[name="Description"]');
    if (description && description.value.trim()) fields.Description = description.value.trim();

    var workstream = form.querySelector('[name="Workstream"]');
    if (workstream) fields.Workstream = workstream.value;

    var group = form.querySelector('[name="Project Group"]');
    if (group && group.value.trim()) fields['Project Group'] = group.value.trim();

    var status = form.querySelector('[name="Status"]');
    if (status) fields.Status = status.value;

    var priority = form.querySelector('[name="Priority"]');
    if (priority) fields.Priority = priority.value;

    var owner = form.querySelector('[name="Owner"]');
    if (owner && owner.value.trim()) fields.Owner = owner.value.trim();

    var dueDate = form.querySelector('[name="Due Date"]');
    if (dueDate && dueDate.value) fields['Due Date'] = dueDate.value;

    return fields;
}

/**
 * Collect form data from the task detail form.
 */
function collectDetailFormData() {
    var form = document.getElementById('task-detail-form');
    if (!form) return null;

    var fields = {};

    var title = form.querySelector('[name="Title"]');
    if (title) fields.Title = title.value.trim();

    var description = form.querySelector('[name="Description"]');
    if (description) fields.Description = description.value.trim();

    var workstream = form.querySelector('[name="Workstream"]');
    if (workstream) fields.Workstream = workstream.value;

    var group = form.querySelector('[name="Project Group"]');
    if (group) fields['Project Group'] = group.value.trim();

    var status = form.querySelector('[name="Status"]');
    if (status) fields.Status = status.value;

    var priority = form.querySelector('[name="Priority"]');
    if (priority) fields.Priority = priority.value;

    var owner = form.querySelector('[name="Owner"]');
    if (owner) fields.Owner = owner.value.trim();

    var dueDate = form.querySelector('[name="Due Date"]');
    if (dueDate) fields['Due Date'] = dueDate.value;

    var notes = form.querySelector('[name="Notes"]');
    if (notes) fields.Notes = notes.value.trim();

    var sortOrder = form.querySelector('[name="Sort Order"]');
    if (sortOrder && sortOrder.value !== '') fields['Sort Order'] = parseInt(sortOrder.value, 10);

    return fields;
}

/**
 * Handle saving a new task from the Add modal.
 */
async function handleSaveNewTask(btn) {
    var fields = collectModalFormData();
    if (!fields || !fields.Title) {
        showToast('Task title is required.', 'warning');
        return;
    }

    showInlineLoading(btn);

    try {
        var result = await API.createTask(fields);
        // Add to local state
        State.tasks.push(result);
        buildSidebar();
        closeModal();
        showToast('Task created successfully.', 'success');
        // Refresh the current view
        await Router.handleRoute();
    } catch (e) {
        // Error toast already shown
    } finally {
        hideInlineLoading(btn);
    }
}

/**
 * Handle saving edits from the Edit modal.
 */
async function handleSaveEditTask(btn, taskId) {
    var fields = collectModalFormData();
    if (!fields || !fields.Title) {
        showToast('Task title is required.', 'warning');
        return;
    }

    showInlineLoading(btn);

    try {
        var result = await API.updateTask(taskId, fields);
        // Update local state
        var idx = State.tasks.findIndex(function(t) { return t.id === taskId; });
        if (idx >= 0) {
            State.tasks[idx] = result;
        }
        buildSidebar();
        closeModal();
        showToast('Task updated successfully.', 'success');
        await Router.handleRoute();
    } catch (e) {
        // Error toast already shown
    } finally {
        hideInlineLoading(btn);
    }
}

/**
 * Handle task deletion after confirmation.
 */
async function handleDeleteTask(btn, taskId) {
    showInlineLoading(btn);

    try {
        await API.deleteTask(taskId);
        // Remove from local state
        State.tasks = State.tasks.filter(function(t) { return t.id !== taskId; });
        buildSidebar();
        closeModal();
        showToast('Task deleted.', 'success');
        await Router.handleRoute();
    } catch (e) {
        // Error toast already shown
    } finally {
        hideInlineLoading(btn);
    }
}

/**
 * Handle saving from the task detail view form.
 */
async function handleSaveTaskDetail(btn, taskId) {
    var fields = collectDetailFormData();
    if (!fields || !fields.Title) {
        showToast('Task title is required.', 'warning');
        return;
    }

    showInlineLoading(btn);

    try {
        var result = await API.updateTask(taskId, fields);
        var idx = State.tasks.findIndex(function(t) { return t.id === taskId; });
        if (idx >= 0) {
            State.tasks[idx] = result;
        }
        buildSidebar();
        showToast('Task saved successfully.', 'success');
        // Re-render the detail view with updated data
        await renderTaskDetail(taskId);
    } catch (e) {
        // Error toast already shown
    } finally {
        hideInlineLoading(btn);
    }
}


/* --------------------------------------------------------------------------
   DRAG AND DROP
   -------------------------------------------------------------------------- */

function initDragAndDrop() {
    document.addEventListener('dragstart', function(e) {
        var card = e.target.closest('.task-card[draggable="true"]');
        if (!card) return;

        var taskId = card.getAttribute('data-task-id');
        var group = card.getAttribute('data-group');

        State.dragState.sourceId = taskId;
        State.dragState.sourceGroup = group;

        card.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', taskId);
    });

    document.addEventListener('dragend', function(e) {
        var card = e.target.closest('.task-card[draggable="true"]');
        if (card) card.style.opacity = '1';

        State.dragState.sourceId = null;
        State.dragState.sourceGroup = null;
        State.dragState.dragOverId = null;

        // Remove all drag-over styling
        document.querySelectorAll('.task-card').forEach(function(c) {
            c.style.borderTop = '';
            c.style.borderBottom = '';
        });
    });

    document.addEventListener('dragover', function(e) {
        var card = e.target.closest('.task-card[draggable="true"]');
        if (!card) return;

        var targetGroup = card.getAttribute('data-group');
        // Only allow drops within the same project group
        if (targetGroup !== State.dragState.sourceGroup) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // Highlight drop position
        var rect = card.getBoundingClientRect();
        var midY = rect.top + rect.height / 2;

        document.querySelectorAll('.task-card').forEach(function(c) {
            c.style.borderTop = '';
            c.style.borderBottom = '';
        });

        if (e.clientY < midY) {
            card.style.borderTop = '3px solid var(--color-primary)';
        } else {
            card.style.borderBottom = '3px solid var(--color-primary)';
        }

        State.dragState.dragOverId = card.getAttribute('data-task-id');
    });

    document.addEventListener('drop', function(e) {
        e.preventDefault();

        var card = e.target.closest('.task-card[draggable="true"]');
        if (!card) return;

        var targetGroup = card.getAttribute('data-group');
        if (targetGroup !== State.dragState.sourceGroup) return;

        var sourceId = State.dragState.sourceId;
        var targetId = card.getAttribute('data-task-id');
        if (sourceId === targetId) return;

        // Determine insertion position
        var rect = card.getBoundingClientRect();
        var insertBefore = e.clientY < (rect.top + rect.height / 2);

        // Reorder in state
        reorderTasksInGroup(sourceId, targetId, targetGroup, insertBefore);
    });
}

async function reorderTasksInGroup(sourceId, targetId, group, insertBefore) {
    // Get all tasks in this group, sorted by current Sort Order
    var groupTasks = State.tasks.filter(function(t) {
        return getField(t, 'Project Group') === group;
    }).sort(function(a, b) {
        return (parseInt(getField(a, 'Sort Order', '999'), 10)) - (parseInt(getField(b, 'Sort Order', '999'), 10));
    });

    // Remove source from array
    var sourceTask = null;
    var newOrder = [];
    groupTasks.forEach(function(t) {
        if (t.id === sourceId) {
            sourceTask = t;
        } else {
            newOrder.push(t);
        }
    });

    if (!sourceTask) return;

    // Find target index in new array
    var targetIdx = newOrder.findIndex(function(t) { return t.id === targetId; });
    if (targetIdx === -1) return;

    // Insert source at the right position
    if (insertBefore) {
        newOrder.splice(targetIdx, 0, sourceTask);
    } else {
        newOrder.splice(targetIdx + 1, 0, sourceTask);
    }

    // Assign new Sort Order values (multiples of 10 for future insertions)
    var updates = [];
    newOrder.forEach(function(t, i) {
        var newSortOrder = (i + 1) * 10;
        t.fields['Sort Order'] = newSortOrder;
        updates.push({ id: t.id, sortOrder: newSortOrder });
    });

    // Re-render the current view immediately
    if (State.currentView === 'workstream' && State.currentWorkstream) {
        await renderWorkstream(State.currentWorkstream);
    }

    // Batch update to Airtable (fire and forget for snappy UX, with error handling)
    var updatePromises = updates.map(function(u) {
        return API.updateTask(u.id, { 'Sort Order': u.sortOrder }).catch(function(err) {
            console.error('[Drag Reorder] Failed to update sort order for', u.id, err);
        });
    });

    try {
        await Promise.all(updatePromises);
    } catch (e) {
        showToast('Some sort order updates may have failed.', 'warning');
    }
}


/* --------------------------------------------------------------------------
   EVENT DELEGATION
   -------------------------------------------------------------------------- */

function initEventDelegation() {
    document.addEventListener('click', function(e) {
        var target = e.target;

        // Find the closest element with a data-action attribute
        var actionEl = target.closest('[data-action]');
        if (!actionEl) {
            // If clicking outside a status dropdown, close it
            if (State.openStatusDropdown && !target.closest('.dropdown-menu')) {
                closeAllDropdowns();
            }
            return;
        }

        var action = actionEl.getAttribute('data-action');
        var taskId = actionEl.getAttribute('data-task-id');
        var workstream = actionEl.getAttribute('data-workstream');
        var statusValue = actionEl.getAttribute('data-status');

        switch (action) {
            case 'toggle-sidebar':
                e.preventDefault();
                toggleSidebar();
                break;

            case 'toggle-ws-group':
                e.preventDefault();
                var groupEl = actionEl.closest('.sidebar-group');
                if (groupEl) {
                    groupEl.classList.toggle('open');
                }
                // Navigate to the workstream
                if (workstream) {
                    Router.navigate('workstream/' + encodeWorkstream(workstream));
                }
                break;

            case 'status-dropdown':
                e.preventDefault();
                e.stopPropagation();
                if (State.openStatusDropdown === taskId) {
                    closeAllDropdowns();
                } else {
                    showStatusDropdown(actionEl, taskId);
                }
                break;

            case 'set-status':
                e.preventDefault();
                e.stopPropagation();
                if (taskId && statusValue) {
                    handleStatusChange(taskId, statusValue);
                }
                break;

            case 'add-task':
                e.preventDefault();
                openAddTaskModal(workstream || State.currentWorkstream || WORKSTREAMS[0]);
                break;

            case 'edit-task':
                e.preventDefault();
                e.stopPropagation();
                if (taskId) openEditTaskModal(taskId);
                break;

            case 'delete-task':
                e.preventDefault();
                e.stopPropagation();
                if (taskId) openDeleteConfirmModal(taskId);
                break;

            case 'save-new-task':
                e.preventDefault();
                handleSaveNewTask(actionEl);
                break;

            case 'save-edit-task':
                e.preventDefault();
                handleSaveEditTask(actionEl, taskId);
                break;

            case 'confirm-delete-task':
                e.preventDefault();
                handleDeleteTask(actionEl, taskId);
                break;

            case 'save-task-detail':
                e.preventDefault();
                handleSaveTaskDetail(actionEl, taskId);
                break;

            case 'close-modal':
                e.preventDefault();
                closeModal();
                break;

            case 'close-toast':
                e.preventDefault();
                var toast = actionEl.closest('.toast');
                if (toast) dismissToast(toast);
                break;

            case 'export-csv':
                e.preventDefault();
                ExportAPI.exportCSV();
                break;

            case 'export-pdf':
                e.preventDefault();
                ExportAPI.exportPDF();
                break;

            case 'export-onedrive':
                e.preventDefault();
                ExportAPI.saveToOneDrive();
                break;
        }
    });

    // Close dropdowns on Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllDropdowns();
            closeModal();
        }
    });

    // Close sidebar overlay on click
    var sidebarOverlay = document.getElementById('sidebar-overlay');
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', function() {
            closeSidebar();
        });
    }
}


/* --------------------------------------------------------------------------
   HEADER SEARCH (client-side filter)
   -------------------------------------------------------------------------- */

function initSearch() {
    var searchInput = document.getElementById('header-search-input');
    if (!searchInput) return;

    var debounceTimer = null;

    searchInput.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
            var query = searchInput.value.trim().toLowerCase();
            if (!query) {
                // Reset — re-render current view with full data
                Router.handleRoute();
                return;
            }

            // Simple client-side search: filter tasks by title, description, owner, workstream
            var results = State.tasks.filter(function(t) {
                var title = getField(t, 'Title', '').toLowerCase();
                var desc = getField(t, 'Description', '').toLowerCase();
                var owner = getField(t, 'Owner', '').toLowerCase();
                var ws = getField(t, 'Workstream', '').toLowerCase();
                return title.indexOf(query) !== -1 ||
                       desc.indexOf(query) !== -1 ||
                       owner.indexOf(query) !== -1 ||
                       ws.indexOf(query) !== -1;
            });

            renderSearchResults(results, query);
        }, 300);
    });
}

function renderSearchResults(results, query) {
    var mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    var html = '';
    html += '<div class="page-header">';
    html += '  <div>';
    html += '    <h1 class="page-title">Search Results</h1>';
    html += '    <p class="page-subtitle">' + results.length + ' task' + (results.length !== 1 ? 's' : '') + ' matching "' + escapeHtml(query) + '"</p>';
    html += '  </div>';
    html += '</div>';

    if (results.length === 0) {
        html += renderEmptyState('No results found', 'Try different search terms.', '&#128269;');
    } else {
        html += '<div class="task-cards-grid">';
        results.forEach(function(task) {
            html += renderTaskCard(task);
        });
        html += '</div>';
    }

    mainContent.innerHTML = html;
}


/* --------------------------------------------------------------------------
   RESPONSIVE HELPERS
   -------------------------------------------------------------------------- */

function initResponsive() {
    // Show/hide FAB on resize
    window.addEventListener('resize', function() {
        var fab = document.getElementById('fab-add-task');
        if (fab) {
            fab.style.display = window.innerWidth < 768 ? 'flex' : 'none';
        }
    });
}


/* --------------------------------------------------------------------------
   INITIALIZATION
   -------------------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', async function() {
    // 1. Show loading overlay
    updateLoadingIndicator(true);

    try {
        // 2. Fetch settings from Airtable
        try {
            State.settings = await API.getSettings();
        } catch (e) {
            console.warn('[Init] Could not load settings, using defaults.');
        }

        // 3. Fetch all tasks from Airtable
        try {
            State.tasks = await API.listAllTasks();
        } catch (e) {
            console.warn('[Init] Could not load tasks.');
            State.tasks = [];
        }

        // 4. Build sidebar navigation
        buildSidebar();

        // 5. Initialize router and render the current view
        Router.init();
        await Router.handleRoute();

        // 6. Set up event delegation
        initEventDelegation();
        initDragAndDrop();
        initSearch();
        initResponsive();

    } catch (e) {
        console.error('[Init] Fatal initialization error:', e);
        showToast('Failed to initialize application. Please refresh.', 'error');
    } finally {
        // 7. Hide loading overlay
        updateLoadingIndicator(false);
    }
});
