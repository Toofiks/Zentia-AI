// --- Scroll Reveal Animation ---
const revealElements = document.querySelectorAll('.reveal');

const revealCallback = (entries, observer) => {
  entries.forEach(entry => {
    if(entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
};

const revealObserver = new IntersectionObserver(revealCallback, {
  threshold: 0.1
});

revealElements.forEach(el => {
  revealObserver.observe(el);
});

// --- AUTH & SUPABASE SETUP ---
let supabaseClient = null;
let currentUser = null;
let currentUserPlan = 'free';

if (typeof supabase !== 'undefined') {
    const { createClient } = supabase;
    // Replace with your actual Supabase credentials if needed
    const supabaseUrl = 'https://ovhpsbndyqexmueuivay.supabase.co';
    const supabaseKey = 'YOUR_ANON_KEY'; 
    // Wait, the client is usually initialized at the top or provided by script tag.
}

// Global data store
let agents = [];
let leads = [];
let users_list = [];

// Dashboard Loading State
let dashboardLoading = false;

async function authenticatedFetch(url, options = {}) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return fetch(url, options);

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${session.access_token}`
    };
    return fetch(url, { ...options, headers });
}

async function safeJson(res) {
    try { return await res.json(); } catch(e) { return null; }
}

async function refreshDashboardData() {
    if (!currentUser || dashboardLoading) return;
    dashboardLoading = true;

    try {
        const [agentsRes, leadsRes, usersRes] = await Promise.all([
            authenticatedFetch('/api/agents'),
            authenticatedFetch('/api/leads'),
            authenticatedFetch('/api/users')
        ]);

        if (agentsRes.ok) agents = await safeJson(agentsRes);
        if (leadsRes.ok) leads = await safeJson(leadsRes);
        if (usersRes.ok) users_list = await safeJson(usersRes);

        renderAgents();
        renderInboxLeads();
        updateUserFilters();
        renderUsersTable();
        updateDashboardCards();
        populateAnalyticsAgentFilter();
        
        if (window.activeView === 'analytics') updateAnalyticsChart();

    } catch (e) { console.error('Refresh Error:', e); }
    finally { dashboardLoading = false; }
}

function updateDashboardCards() {
    const totalTokensEl = document.getElementById('dash-total-tokens');
    const totalLeadsEl = document.getElementById('dash-total-leads');
    const activeAgentsEl = document.getElementById('dash-active-agents');
    const uniqueUsersEl = document.getElementById('dash-unique-users');

    if (totalTokensEl) {
        const total = agents.reduce((acc, a) => acc + (a.tokensUsed || 0), 0);
        totalTokensEl.textContent = total.toLocaleString();
    }
    if (totalLeadsEl) {
        totalLeadsEl.textContent = leads.length;
    }
    if (activeAgentsEl) {
        activeAgentsEl.textContent = agents.filter(a => a.isActive).length;
    }
    if (uniqueUsersEl) {
        uniqueUsersEl.textContent = users_list.length;
    }
}

// --- TEAM ACCESS LOGIC ---
async function loadTeamManagers(agentId) {
    const list = document.getElementById('team-managers-list');
    if (!list) return;
    list.innerHTML = 'Loading...';
    if (!agentId) { list.innerHTML = 'Save agent first.'; return; }

    try {
        const res = await authenticatedFetch(`/api/agents/${agentId}/managers`);
        if (res.ok) {
            const managers = await safeJson(res);
            list.innerHTML = (managers || []).map(m => `
                <div class="manager-item">
                    <span>${m.email}</span>
                    <button onclick="deleteManager('${m.id}', '${agentId}')">Remove</button>
                </div>
            `).join('') || 'No managers.';
        } else { list.innerHTML = 'Failed to load team members.'; }
    } catch(e) { list.innerHTML = 'Error loading members.'; }
}

window.deleteManager = async (managerId, agentId) => {
    if (!confirm('Remove?')) return;
    const res = await authenticatedFetch(`/api/agents/${agentId}/managers/${managerId}`, { method: 'DELETE' });
    if (res.ok) loadTeamManagers(agentId);
};

// --- KNOWLEDGE BASE LOGIC ---
async function loadKnowledgeBase(agentId) {
    const list = document.getElementById('kb-file-list');
    if (!list) return;
    list.innerHTML = 'Loading...';
    if (!agentId) { list.innerHTML = 'Save agent first.'; return; }

    try {
        const res = await authenticatedFetch(`/api/knowledge/${agentId}`);
        if (res.ok) {
            const files = await safeJson(res);
            list.innerHTML = (files || []).map(f => `
                <div class="kb-item">
                    <span>${f.filename}</span>
                    <button onclick="deleteKbFile('${f.id}', '${agentId}')">Delete</button>
                </div>
            `).join('') || 'No files.';
        } else { list.innerHTML = 'Failed to load files.'; }
    } catch(e) { list.innerHTML = 'Error loading files.'; }
}

window.deleteKbFile = async (id, agentId) => {
    if (!confirm('Delete?')) return;
    const res = await authenticatedFetch(`/api/knowledge/${id}`, { method: 'DELETE' });
    if (res.ok) loadKnowledgeBase(agentId);
};

// ... REST OF SCRIPT.JS (Omitted for space, I'll merge carefully)
