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
  threshold: 0.1,
  rootMargin: "0px 0px -50px 0px"
});

revealElements.forEach(el => revealObserver.observe(el));

// --- Nav Scroll Effect ---
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
  if (window.scrollY > 10) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }
});

// --- Interactive Background & Cursor Glow ---
const bgGrid = document.querySelector('.interactive-bg');
const cursorGlow = document.querySelector('.cursor-glow');
const blob1 = document.querySelector('.blob-1');
const blob2 = document.querySelector('.blob-2');
const starsContainer = document.querySelector('.stars-container');

// Generate Stars
const numStars = 50;
if (starsContainer) {
  for (let i = 0; i < numStars; i++) {
    const star = document.createElement('div');
    star.classList.add('star');
    // Classic 4-pointed sparkle star path
    star.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.5 9.5L22 12L14.5 14.5L12 24L9.5 14.5L2 12L9.5 9.5Z"></path></svg>`;
    
    // Size between 4px and 10px
    const size = Math.random() * 6 + 4;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    
    // Random position
    star.style.left = `${Math.random() * 100}vw`;
    star.style.top = `${Math.random() * 100}vh`;
    
    // Very low opacity for subtle look
    star.style.opacity = Math.random() * 0.15 + 0.05;
    
    // Parallax speed attribute
    star.dataset.speed = Math.random() * 0.5 + 0.1;
    
    starsContainer.appendChild(star);
  }
}
const stars = document.querySelectorAll('.star');

let targetX = window.innerWidth / 2;
let targetY = window.innerHeight / 2;
let currentX = targetX;
let currentY = targetY;

document.addEventListener('mousemove', (e) => {
  targetX = e.clientX;
  targetY = e.clientY;
});

function animateBackground() {
  currentX += (targetX - currentX) * 0.08;
  currentY += (targetY - currentY) * 0.08;
  
  if (cursorGlow) {
    cursorGlow.style.transform = `translate(${currentX}px, ${currentY}px) translate(-50%, -50%)`;
  }
  
  const moveX = (window.innerWidth / 2 - currentX) * 0.05;
  const moveY = (window.innerHeight / 2 - currentY) * 0.05;
  
  if (bgGrid) {
    bgGrid.style.transform = `translate(${moveX * 0.5}px, ${moveY * 0.5}px)`;
  }
  
  if (blob1) {
    blob1.style.transform = `translate(${moveX}px, ${moveY}px)`;
  }
  
  if (blob2) {
    blob2.style.transform = `translate(${-moveX * 0.8}px, ${-moveY * 0.8}px)`;
  }
  
  stars.forEach(star => {
    const speed = parseFloat(star.dataset.speed);
    star.style.transform = `translate(${moveX * speed}px, ${moveY * speed}px)`;
  });
  
  requestAnimationFrame(animateBackground);
}
animateBackground();

// --- Subtle Tilt Effect for Cards ---
const tiltElements = document.querySelectorAll('.bento-card, .hero-mockup');

tiltElements.forEach(el => {
  el.addEventListener('mousemove', (e) => {
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Very subtle tilt
    const tiltX = ((y - centerY) / centerY) * -3; 
    const tiltY = ((x - centerX) / centerX) * 3;
    
    el.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-4px)`;
  });
  
  el.addEventListener('mouseleave', () => {
    el.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)`;
  });
});

// --- FAQ Accordion ---
const faqItems = document.querySelectorAll('.faq-item');

faqItems.forEach(item => {
  const question = item.querySelector('.faq-question');
  const answer = item.querySelector('.faq-answer');
  
  question.addEventListener('click', () => {
    const isActive = item.classList.contains('active');
    
    // Close all other items
    faqItems.forEach(otherItem => {
      otherItem.classList.remove('active');
      const otherAnswer = otherItem.querySelector('.faq-answer');
      if (otherAnswer) otherAnswer.style.maxHeight = null;
    });
    
    // Toggle current item
    if (!isActive) {
      item.classList.add('active');
      answer.style.maxHeight = answer.scrollHeight + "px";
    } else {
      answer.style.maxHeight = null;
    }
  });
});

// --- Smooth Scrolling for Anchor Links ---
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#' || !document.querySelector(targetId)) return;
        
        e.preventDefault();
        document.querySelector(targetId).scrollIntoView({
            behavior: 'smooth'
        });
    });
});

// --- Supabase Authentication Logic ---

// REPLACE THESE with your actual Supabase credentials
const SUPABASE_URL = 'https://keqrwmlmrhzikafpjhmp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlcXJ3bWxtcmh6aWthZnBqaG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0ODE3NDksImV4cCI6MjA5NDA1Nzc0OX0.OvQjIOa3OUaixDiu1jc62hsKgmPwDoaEKqQzn7D1QRg';

let supabaseClient = null;

if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// --- Dashboard Functionality ---

let currentSession = null;

async function authenticatedFetch(url, options = {}) {
    if (!supabaseClient) {
        console.warn('Supabase client not initialized, using basic fetch');
        return fetch(url, options);
    }

    try {
        // Try to use cached session first for speed, then refresh if needed
        if (!currentSession) {
            const { data } = await supabaseClient.auth.getSession();
            currentSession = data.session;
        }

        const token = currentSession?.access_token;
        const headers = new Headers(options.headers || {});

        if (token) {
            headers.set('Authorization', 'Bearer ' + token);
        }

        let response = await fetch(url, { ...options, headers });

        // If 401, token might be expired, refresh once
        if (response.status === 401) {
            const { data } = await supabaseClient.auth.refreshSession();
            currentSession = data.session;
            if (currentSession?.access_token) {
                headers.set('Authorization', 'Bearer ' + currentSession.access_token);
                response = await fetch(url, { ...options, headers });
            }
        }

        return response;
    } catch (e) {
        console.error('authenticatedFetch error:', e);
        throw e;
    }
}

async function safeJson(response) {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return await response.json();
    } else {
        const text = await response.text();
        return { error: "Server error" };
    }
}


// Agent State Management
let agents = [];
let leads = [];
let dashboardLoading = false;

async function refreshDashboardData() {
    if (!currentUser || dashboardLoading) return;

    try {
        // Fetch agents and leads in parallel for speed
        const [agentsRes, leadsRes] = await Promise.all([
            authenticatedFetch('/api/agents'),
            authenticatedFetch('/api/leads')
        ]);

        if (agentsRes.ok) {
            agents = await safeJson(agentsRes);
            renderAgents();
            populateAnalyticsAgentFilter();
            if (window.activeView === 'analytics') updateAnalyticsChart();

            if (agents.length === 0 && !window.onboardingShown) {
                window.onboardingShown = true;
                checkAndShowOnboarding(agents);
            }
        }

        if (leadsRes.ok) {
            const newLeads = await safeJson(leadsRes);

            // Notification Logic
            if (Notification.permission === 'granted' && leads.length > 0) {
                newLeads.forEach(lead => {
                    const oldCount = leads.find(l => l.chatId === lead.chatId)?.history.length || 0;
                    const count = lead.history.length;
                    const lastMsg = lead.history[count - 1];
                    if (count > oldCount && lastMsg && lastMsg.role === 'user') {
                        new Notification(`New message from ${lead.username || 'User'}`, { body: lastMsg.content });
                    }
                });
            }

            leads = newLeads;
            renderInboxLeads();
            if (selectedLeadId) updateChatHistory(selectedLeadId);
            if (window.activeView === 'analytics') updateAnalyticsChart();
        }
    } catch (e) {
        console.error('Data refresh failed:', e);
    }
}

// Initial fetch is now handled by auth state change
let dashboardPollInterval = null;

function startDashboardPolling() {
    if (dashboardPollInterval) clearInterval(dashboardPollInterval);
    refreshDashboardData(); // Initial call
    dashboardPollInterval = setInterval(refreshDashboardData, 8000); // 8s poll is enough
}

function stopDashboardPolling() {
    if (dashboardPollInterval) {
        clearInterval(dashboardPollInterval);
        dashboardPollInterval = null;
    }
}

// Render Agents
const activeAgentsList = document.getElementById('active-agents-list');
const agentsGridContainer = document.getElementById('agents-grid-container');
const dashTotalTokens = document.getElementById('dash-total-tokens');
const dashActiveAgents = document.getElementById('dash-active-agents');
const dashUniqueUsers = document.getElementById('dash-unique-users');
const dashTotalLeads = document.getElementById('dash-total-leads');

function renderAgents() {
    // 1. Render Dashboard Compact List
    if (activeAgentsList) {
        activeAgentsList.innerHTML = '';
        if (agents.length === 0) {
            activeAgentsList.innerHTML = '<p style="color: var(--fg-muted); font-size: 0.875rem;">No agents created yet.</p>';
        } else {
            agents.forEach(agent => {
                const statusClass = agent.isActive ? 'running' : 'idle';
                const statusText = agent.isActive ? 'Running • Listening' : 'Idle';
                const activeClass = agent.isActive ? 'active' : '';
                const isOwner = currentUser && agent.user_id === currentUser.id;

                const item = document.createElement('div');
                item.className = 'agent-item';
                item.innerHTML = `
                    <div class="agent-avatar" style="background: var(--accent);">${agent.name.charAt(0).toUpperCase()}</div>
                    <div class="agent-info">
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <p class="name">${agent.name}</p>
                            ${!isOwner ? '<span style="font-size: 0.65rem; padding: 0.1rem 0.4rem; background: rgba(139, 92, 246, 0.1); color: #8b5cf6; border-radius: 10px; border: 1px solid rgba(139, 92, 246, 0.2);">Team</span>' : ''}
                        </div>
                        <p class="status ${statusClass}">${statusText}</p>
                    </div>
                    <div class="agent-toggle ${activeClass}" data-id="${agent.id}"></div>
                `;
                activeAgentsList.appendChild(item);
            });
        }
    }

    // 2. Render Full Agents Grid
    if (agentsGridContainer) {
        agentsGridContainer.innerHTML = '';
        if (agents.length === 0) {
            agentsGridContainer.innerHTML = '<p style="color: var(--fg-muted); font-size: 1rem;">You have no AI agents. Click "+ New Agent" to deploy one.</p>';
        } else {
            agents.forEach(agent => {
                const activeClass = agent.isActive ? 'active' : '';
                const isOwner = currentUser && agent.user_id === currentUser.id;

                const card = document.createElement('div');
                card.className = 'agent-card';
                card.innerHTML = `
                    <div class="agent-card-header">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div class="agent-avatar" style="background: var(--accent); color: #fff;">${agent.name.charAt(0).toUpperCase()}</div>
                            ${!isOwner ? '<span style="font-size: 0.7rem; padding: 0.2rem 0.6rem; background: rgba(139, 92, 246, 0.1); color: #8b5cf6; border-radius: 12px; border: 1px solid rgba(139, 92, 246, 0.2); font-weight: 600;">Team Access</span>' : ''}
                        </div>
                        <div class="agent-toggle ${activeClass}" data-id="${agent.id}"></div>
                    </div>
                    <h3 style="margin: 1rem 0 0.25rem;">${agent.name}</h3>
                    <p style="color: var(--fg-muted); font-size: 0.875rem; margin-bottom: 0.5rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${agent.prompt}</p>
                    <p style="color: var(--fg-light); font-size: 0.75rem; margin-bottom: 1.5rem; font-family: monospace;">Model: ${agent.model}</p>

                    <div class="agent-metrics">
                        <div><span style="font-weight: 700;">${agent.tokensUsed || 0}</span><br><span style="font-size: 0.75rem; color: var(--fg-light);">Tokens</span></div>
                        <div><span style="font-weight: 700;">${agent.uniqueUsers || 0}</span><br><span style="font-size: 0.75rem; color: var(--fg-light);">Users</span></div>
                        <div><span style="font-weight: 700;">${agent.messagesSent || 0}</span><br><span style="font-size: 0.75rem; color: var(--fg-light);">Messages</span></div>
                    </div>
                    <div style="display: ${isOwner ? 'flex' : 'none'}; gap: 0.5rem; margin-top: 1.5rem;">
                        <button class="btn btn-secondary w-full edit-agent-btn" data-id="${agent.id}" style="padding: 0.4rem;">Edit</button>
                        <button class="btn btn-secondary w-full delete-agent-btn" data-id="${agent.id}" style="padding: 0.4rem; color: #ef4444;">Delete</button>
                    </div>
                `;
                agentsGridContainer.appendChild(card);
            });
        }
    }

    // Update overview stats
    if (dashTotalTokens && dashActiveAgents) {
        let totalTokens = agents.reduce((sum, a) => sum + (a.tokensUsed || 0), 0);
        let activeCount = agents.filter(a => a.isActive).length;
        let totalUniqueUsers = agents.reduce((sum, a) => sum + (a.uniqueUsers || 0), 0);

        dashTotalTokens.textContent = totalTokens.toLocaleString();
        dashActiveAgents.textContent = activeCount;
        if (dashUniqueUsers) dashUniqueUsers.textContent = totalUniqueUsers.toLocaleString();
        if (dashTotalLeads) dashTotalLeads.textContent = leads.length.toLocaleString();
    }

    // Update Billing UI in Settings
    const settingsAgentLimit = document.getElementById('settings-agent-limit');
    const settingsAgentProgress = document.getElementById('settings-agent-progress');

    if (settingsAgentLimit && settingsAgentProgress) {
        let limit = 1;
        if (currentUserPlan === 'pro') limit = 10;
        else if (currentUserPlan === 'starter') limit = 3;
        else if (currentUserPlan === 'enterprise') limit = 999;

        // Count ONLY owned agents
        const ownedAgents = agents.filter(a => currentUser && a.user_id === currentUser.id).length;

        settingsAgentLimit.textContent = `${ownedAgents} / ${limit === 999 ? 'Unlimited' : limit}`;
        const percent = limit === 999 ? 0 : Math.min((ownedAgents / limit) * 100, 100);
        settingsAgentProgress.style.width = `${percent}%`;
        settingsAgentProgress.style.background = (limit !== 999 && ownedAgents >= limit) ? '#ef4444' : '#8b5cf6';
    }
}

// Mobile Header Utilities
document.getElementById('mobile-settings-btn')?.addEventListener('click', () => {
    // Simulate click on the hidden settings link to reuse logic
    const settingsBtn = document.querySelector('.nav-view-btn[data-view="settings"]');
    if (settingsBtn) {
        settingsBtn.click();
        // Hide mobile back button if it was visible in inbox
        document.querySelector('.inbox-container')?.classList.remove('mobile-chat-active');
    }
});

// View Switching
const navViewBtns = document.querySelectorAll('.nav-view-btn');
const dashboardViews = document.querySelectorAll('.dashboard-view');
const viewTitle = document.getElementById('view-title');

let analyticsChartInstance = null;

const viewTitles = {
    'dashboard': 'Workspace',
    'agents': 'AI Agents',
    'analytics': 'Analytics',
    'users': 'User Interactions',
    'inbox': 'Inbox',
    'settings': 'Settings'
};

navViewBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        
        navViewBtns.forEach(b => b.classList.remove('active'));
        dashboardViews.forEach(v => v.classList.remove('active'));
        
        btn.classList.add('active');
        
        const targetViewId = btn.getAttribute('data-view');
        const targetView = document.getElementById(`view-${targetViewId}`);
        if (targetView) targetView.classList.add('active');
        
        if (viewTitle && viewTitles[targetViewId]) {
            viewTitle.textContent = viewTitles[targetViewId];
        }
        
        if (targetViewId === 'analytics') {
            updateAnalyticsChart();
        }
        if (targetViewId === 'inbox') {
            if (Notification.permission === 'default') {
                Notification.requestPermission();
            }
            fetchLeads();
        }
        if (targetViewId === 'users') {
            fetchUsers();
        }
    });
});

// Users Table Functionality
let users_list = [];
async function fetchUsers() {
    try {
        const response = await authenticatedFetch('/api/users');
        if (response.ok) {
            users_list = await safeJson(response);
            updateUserFilters();
            renderUsersTable();
        }
    } catch (e) { console.error('Failed to fetch users:', e); }
}

function updateUserFilters() {
    const agentFilter = document.getElementById('user-filter-agent');
    if (!agentFilter) return;
    
    const currentVal = agentFilter.value;
    const agentNames = [...new Set(users_list.map(u => u.agentName))];
    
    agentFilter.innerHTML = '<option value="all">All Agents</option>';
    agentNames.forEach(name => {
        if(name) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            agentFilter.appendChild(option);
        }
    });
    
    if (agentNames.includes(currentVal)) {
        agentFilter.value = currentVal;
    }
}

document.getElementById('user-filter-agent')?.addEventListener('change', renderUsersTable);
document.getElementById('user-filter-date')?.addEventListener('change', renderUsersTable);

function renderUsersTable() {
    const tableBody = document.getElementById('users-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    
    const agentFilterVal = document.getElementById('user-filter-agent')?.value || 'all';
    const dateFilterVal = document.getElementById('user-filter-date')?.value || 'all';
    
    const now = new Date();
    
    const filteredUsers = users_list.filter(u => {
        if (agentFilterVal !== 'all' && u.agentName !== agentFilterVal) return false;
        
        if (dateFilterVal !== 'all') {
            const userDate = new Date(u.lastActivity);
            if (dateFilterVal === 'today') {
                if (userDate.toDateString() !== now.toDateString()) return false;
            } else if (dateFilterVal === 'yesterday') {
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                if (userDate.toDateString() !== yesterday.toDateString()) return false;
            } else if (dateFilterVal === 'week') {
                const weekAgo = new Date(now);
                weekAgo.setDate(weekAgo.getDate() - 7);
                if (userDate < weekAgo) return false;
            }
        }
        return true;
    });

    if (filteredUsers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--fg-muted);">No users found matching filters.</td></tr>';
        return;
    }
    filteredUsers.forEach(u => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><a href="https://t.me/${u.username.replace('@', '')}" target="_blank" style="color: var(--fg-main); text-decoration: underline; font-weight: 600;">${u.username}</a></td>
            <td><code>${u.chatId}</code></td>
            <td>${u.agentName}</td>
            <td>${new Date(u.lastActivity).toLocaleString()}</td>
        `;
        tableBody.appendChild(row);
    });
}

// Inbox Functionality
let selectedLeadId = null;

const inboxSendBtn = document.querySelector('.inbox-input button');
const inboxInputField = document.querySelector('.inbox-input input');

if (inboxSendBtn && inboxInputField) {
    inboxSendBtn.onclick = async () => {
        const msg = inboxInputField.value.trim();
        if (!msg || !selectedLeadId) return;
        
        const lead = leads.find(l => l.chatId === selectedLeadId);
        if (!lead) return;

        try {
            const res = await authenticatedFetch(`/api/leads/${selectedLeadId}/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, agentId: lead.agentId })
            });
            if (res.ok) {
                inboxInputField.value = '';
                // Optimistically update history
                lead.history.push({ role: 'assistant', content: msg });
                selectLead(selectedLeadId);
            }
        } catch (e) { console.error('Failed to send message:', e); }
    };

    inboxInputField.onkeypress = (e) => {
        if (e.key === 'Enter') inboxSendBtn.click();
    };
}

window.sendQuickReply = async (msg) => {
    const inboxInputField = document.querySelector('.inbox-input input');
    const inboxSendBtn = document.querySelector('.inbox-input button');
    if (inboxInputField && inboxSendBtn) {
        inboxInputField.value = msg;
        inboxSendBtn.click();
    }
};

let lastSeenMessageCount = {};

async function fetchLeads() {
    try {
        const response = await authenticatedFetch('/api/leads');
        if (response.ok) {
            leads = await safeJson(response);
            
            // Notification Logic
            if (Notification.permission === 'granted') {
                leads.forEach(lead => {
                    const count = lead.history.length;
                    const lastMsg = lead.history[count - 1];
                    if (lastSeenMessageCount[lead.chatId] && lastSeenMessageCount[lead.chatId] < count && lastMsg && lastMsg.role === 'user') {
                        new Notification(`New message from ${lead.username || 'User'}`, { body: lastMsg.content });
                    }
                    lastSeenMessageCount[lead.chatId] = count;
                });
            }

            renderInboxLeads();
            if (selectedLeadId) {
                updateChatHistory(selectedLeadId);
            }
        }
    } catch (e) { console.error('Failed to fetch leads:', e); }
}

function updateChatHistory(chatId) {
    const lead = leads.find(l => l.chatId === chatId);
    if (!lead) return;

    const historyEl = document.getElementById('inbox-chat-history');
    const isAtBottom = historyEl.scrollHeight - historyEl.scrollTop <= historyEl.clientHeight + 10;

    // Check if length is same, don't redraw everything to avoid flicker
    if (historyEl.children.length === lead.history.filter(m => m.role !== 'system').length && historyEl.dataset.chatId === String(chatId)) {
        return; // No new messages
    }

    historyEl.innerHTML = '';
    historyEl.dataset.chatId = chatId;
    
    lead.history.forEach((msg, index) => {
        if (msg.role === 'system') return;
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${msg.role === 'assistant' ? 'bot' : 'user'}`;
        
        let contentHtml = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        // Clean up markdown for rendering
        contentHtml = contentHtml.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        contentHtml = contentHtml.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        if (msg.role === 'assistant') {
            bubble.innerHTML = `<span class="cemoji"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5Z"></path></svg></span>${contentHtml}`;
        } else {
            bubble.innerHTML = contentHtml;
        }

        historyEl.appendChild(bubble);
    });

    if (isAtBottom) {
        historyEl.scrollTop = historyEl.scrollHeight;
    }
}

// Confirmation Modal Logic
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmActionBtn = document.getElementById('confirm-action-btn');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
const confirmBackdrop = document.getElementById('confirm-backdrop');

function showConfirm(title, message, actionText = 'Delete', isDestructive = true) {
    return new Promise((resolve) => {
        if (!confirmModal) return resolve(false);
        
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmActionBtn.textContent = actionText;
        
        if (isDestructive) {
            confirmActionBtn.style.background = '#ef4444';
            confirmActionBtn.style.borderColor = '#ef4444';
        } else {
            confirmActionBtn.style.background = 'var(--accent)';
            confirmActionBtn.style.borderColor = 'var(--accent)';
        }

        const cleanup = () => {
            confirmModal.classList.remove('active');
            document.body.style.overflow = '';
            confirmActionBtn.onclick = null;
            confirmCancelBtn.onclick = null;
            confirmBackdrop.onclick = null;
        };

        confirmActionBtn.onclick = () => { cleanup(); resolve(true); };
        confirmCancelBtn.onclick = () => { cleanup(); resolve(false); };
        confirmBackdrop.onclick = () => { cleanup(); resolve(false); };

        confirmModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
}

function renderInboxLeads() {
    const listEl = document.getElementById('inbox-leads-list');
    if (!listEl) return;
    
    if (leads.length === 0) {
        listEl.innerHTML = '<p style="padding: 1.5rem; color: var(--fg-muted); font-size: 0.875rem; text-align: center;">No qualified leads yet.</p>';
        return;
    }

    // Only rebuild if length changed or we don't have the elements (simplified diffing)
    if (listEl.children.length === leads.length && listEl.querySelector('.inbox-item')) {
        // Just update active state and last message
        leads.forEach((lead, i) => {
            const item = listEl.children[i];
            if (item) {
                if (selectedLeadId === lead.chatId) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
                const p = item.querySelector('.inbox-item-content p');
                if (p) p.textContent = lead.lastMessage;
                
                const time = item.querySelector('.inbox-item-time');
                if (time) {
                    const d = new Date(lead.timestamp);
                    time.textContent = d.getHours() + ':' + d.getMinutes().toString().padStart(2, '0');
                }
            }
        });
        return;
    }

    listEl.innerHTML = '';
    leads.forEach(lead => {
        const isActive = selectedLeadId === lead.chatId ? 'active' : '';
        const item = document.createElement('div');
        item.className = `inbox-item ${isActive}`;
        
        const initial = lead.username ? lead.username.charAt(0).toUpperCase() : '?';
        const d = new Date(lead.timestamp);
        const timeStr = d.getHours() + ':' + d.getMinutes().toString().padStart(2, '0');
        
        item.innerHTML = `
            <div class="inbox-item-avatar">${initial}</div>
            <div class="inbox-item-content">
                <div class="inbox-item-header">
                    <h4>${lead.username}</h4>
                    <span class="inbox-item-time">${timeStr}</span>
                </div>
                <p>${lead.lastMessage}</p>
            </div>
        `;
        item.onclick = () => selectLead(lead.chatId);
        listEl.appendChild(item);
    });
}

function selectLead(chatId) {
    selectedLeadId = chatId;
    const lead = leads.find(l => l.chatId === chatId);
    if (!lead) return;

    // Show status selector and txt button
    const statusSelector = document.getElementById('inbox-status-selector');
    if (statusSelector) {
        statusSelector.style.display = 'block';
        statusSelector.value = lead.status || 'Interested';
        statusSelector.onchange = async () => {
            const newStatus = statusSelector.value;
            try {
                const res = await authenticatedFetch(`/api/leads/${chatId}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus, agentId: lead.agentId })
                });
                if (res.ok) {
                    showToast('Lead status updated', 'success');
                    fetchLeads();
                }
            } catch (e) { console.error('Failed to update status'); }
        };
    }

    const txtBtn = document.getElementById('export-chat-txt-btn');
    if (txtBtn) txtBtn.style.display = 'flex';
    
    // --- TAKEOVER LOGIC ---
    const takeoverBtn = document.getElementById('takeover-btn');
    if (takeoverBtn) {
        takeoverBtn.style.display = 'block';
        const lastDisabled = (lead.history || []).map(m => m.content).lastIndexOf('[AI_DISABLED]');
        const lastEnabled = (lead.history || []).map(m => m.content).lastIndexOf('[AI_ENABLED]');
        const aiDisabled = lastDisabled > lastEnabled;
        
        if (aiDisabled) {
            takeoverBtn.textContent = 'Resume AI';
            takeoverBtn.style.background = '#10b981';
            takeoverBtn.style.borderColor = '#10b981';
        } else {
            takeoverBtn.textContent = 'Pause AI';
            takeoverBtn.style.background = '#ef4444';
            takeoverBtn.style.borderColor = '#ef4444';
        }
        
        // Re-bind to prevent multiple listeners
        takeoverBtn.replaceWith(takeoverBtn.cloneNode(true));
        document.getElementById('takeover-btn').addEventListener('click', async () => {
            const btn = document.getElementById('takeover-btn');
            const willDisable = btn.textContent === 'Pause AI';
            btn.disabled = true;
            btn.textContent = 'Updating...';
            try {
                const response = await authenticatedFetch(`/api/leads/${lead.chatId}/ai-toggle`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ agentId: lead.agentId, aiDisabled: willDisable })
                });
                if (response.ok) {
                    showToast(`AI has been ${willDisable ? 'paused' : 'resumed'}.`, 'success');
                    
                    // Optimistic UI Update
                    if (willDisable) {
                        btn.textContent = 'Resume AI';
                        btn.style.background = '#10b981';
                        btn.style.borderColor = '#10b981';
                    } else {
                        btn.textContent = 'Pause AI';
                        btn.style.background = '#ef4444';
                        btn.style.borderColor = '#ef4444';
                    }
                    
                    // Update local history so it persists before fetch completes
                    if (!lead.history) lead.history = [];
                    lead.history.push({ role: 'system', content: willDisable ? '[AI_DISABLED]' : '[AI_ENABLED]' });
                    
                    refreshDashboardData(); // Refresh history immediately
                } else {
                    throw new Error('Failed to toggle AI');
                }
            } catch (e) {
                showToast(e.message, 'error');
                btn.textContent = willDisable ? 'Pause AI' : 'Resume AI'; // revert on error
            }
            btn.disabled = false;
        });
    }
    // --- END TAKEOVER LOGIC ---

    // Mobile UI Transition
    if (window.innerWidth <= 768) {
        document.querySelector('.inbox-container')?.classList.add('mobile-chat-active');
    }

    // Force full redraw of list to update active class
    const listEl = document.getElementById('inbox-leads-list');
    listEl.innerHTML = ''; 
    renderInboxLeads(); 

    document.getElementById('inbox-chat-title').textContent = lead.username;
    document.getElementById('inbox-chat-status').style.display = 'inline-block';
    
    // Handle White-label branding in inbox
    const brandingMsg = document.querySelector('.inbox-main .inbox-input input');
    if (brandingMsg) {
        if (lead.analytics?.removeBranding) {
            brandingMsg.placeholder = 'Type to intervene...';
        } else {
            brandingMsg.placeholder = 'AI is handling this conversation. Type to intervene...';
        }
    }
    
    const historyEl = document.getElementById('inbox-chat-history');
    historyEl.innerHTML = '';
    historyEl.dataset.chatId = chatId;
    
    // Call updateChatHistory to render messages with delete buttons
    updateChatHistory(chatId);
    
    // Slight delay to ensure DOM is painted before scrolling
    setTimeout(() => {
        historyEl.scrollTop = historyEl.scrollHeight;
    }, 10);
}

// Mobile Inbox Back Button
document.getElementById('inbox-back-btn')?.addEventListener('click', () => {
    document.querySelector('.inbox-container')?.classList.remove('mobile-chat-active');
});

// Interactive Elements via Event Delegation
document.body.addEventListener('click', async (e) => {
    // Logout handling for both buttons
    if (e.target.id === 'handle-logout' || e.target.classList.contains('logout-dashboard') || e.target.closest('.logout-dashboard')) {
        e.preventDefault();
        const { error } = await supabase.auth.signOut();
        if (!error) {
            window.location.reload();
        } else {
            showToast('Sign out failed: ' + error.message, 'error');
        }
        return;
    }

    // Agent Toggle
    if (e.target.classList.contains('agent-toggle')) {
        const toggle = e.target;
        const agentId = toggle.getAttribute('data-id');
        
        try {
            const res = await authenticatedFetch(`/api/agents/${agentId}/toggle`, { method: 'PUT' });
            if (res.ok) await refreshDashboardData();
        } catch (err) { console.error('Failed to toggle agent'); }
    }
    
    // Delete Agent
    if (e.target.classList.contains('delete-agent-btn')) {
        const agentId = e.target.getAttribute('data-id');
        const confirmed = await showConfirm(
            'Delete Agent?', 
            'Are you sure you want to completely delete this agent? It will be disconnected from Telegram and all settings will be lost.',
            'Delete'
        );
        if(confirmed) {
            try {
                const res = await authenticatedFetch(`/api/agents/${agentId}`, { method: 'DELETE' });
                if (res.ok) await refreshDashboardData();
            } catch (err) { console.error('Failed to delete agent'); }
        }
    }
    
    // Edit Agent
    if (e.target.classList.contains('edit-agent-btn')) {
        const agentId = e.target.getAttribute('data-id');
        const agent = agents.find(a => a.id === agentId);
        if (agent) {
            const isOwner = currentUser && agent.user_id === currentUser.id;
            
            document.getElementById('agent-modal-title').textContent = isOwner ? 'Edit AI Agent' : 'View AI Agent (Read Only)';
            document.getElementById('agent-submit-btn').textContent = isOwner ? 'Save Changes' : 'Close';
            document.getElementById('agent-submit-btn').style.display = isOwner ? 'block' : 'none';
            
            document.getElementById('agent-id').value = agent.id;
            document.getElementById('agent-name').value = agent.name;
            document.getElementById('agent-token').value = agent.token || '';
            document.getElementById('agent-token').required = false; 

            // Disable/Enable fields based on ownership
            const formFields = [
                'agent-name', 'agent-token', 'agent-model', 'agent-payment', 
                'agent-webhook', 'agent-gsheets', 'agent-whitelabel', 'agent-calendar',
                'wizard-goal', 'wizard-audience', 'wizard-tone', 'wizard-rules',
                'agent-prompt', 'wizard-template', 'new-manager-email', 'btn-add-manager'
            ];
            formFields.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = !isOwner;
            });
            
            // Handle model cards
            document.querySelectorAll('.model-card').forEach(c => {
                if (!isOwner) c.style.pointerEvents = 'none';
                else c.style.pointerEvents = 'auto';
            });

            // Update Model Selector UI
            const modelToSet = agent.model || 'gemini-2.5-flash';
            document.getElementById('agent-model').value = modelToSet;
            document.querySelectorAll('.model-card').forEach(c => c.classList.remove('active'));
            const activeCard = document.querySelector(`.model-card[data-model="${modelToSet}"]`);
            if (activeCard) activeCard.classList.add('active');

            document.getElementById('agent-payment').value = agent.payment || '';
            document.getElementById('agent-webhook').value = agent.webhookUrl || '';
            document.getElementById('agent-gsheets').value = agent.analytics?.googleSheetsUrl || '';
            document.getElementById('agent-whitelabel').checked = agent.analytics?.removeBranding || false;
            document.getElementById('agent-calendar').value = agent.analytics?.calendarUrl || '';
            document.getElementById('agent-prompt').value = agent.prompt || '';
            
            // Try to extract wizard parts from prompt
            let goal = "", audience = "", tone = "", rules = "";
            if (agent.prompt) {
                const parts = agent.prompt.split('\n');
                parts.forEach(p => {
                    if (p.startsWith('- Goal: ')) goal = p.replace('- Goal: ', '');
                    if (p.startsWith('- Target Audience: ')) audience = p.replace('- Target Audience: ', '');
                    if (p.startsWith('- Tone of Voice: ')) tone = p.replace('- Tone of Voice: ', '');
                    if (p.startsWith('- Strict Rules: ')) rules = p.replace('- Strict Rules: ', '');
                });
                if (!goal) goal = agent.prompt; // Fallback if old format
            }
            
            document.getElementById('wizard-goal').value = goal;
            document.getElementById('wizard-audience').value = audience;
            document.getElementById('wizard-tone').value = tone;
            document.getElementById('wizard-rules').value = rules;

            loadKnowledgeBase(agent.id);
            loadTeamManagers(agent.id);

            openAgentModal();
        }
    }
            });

            // Team Managers Logic
            async function loadTeamManagers(agentId) {
                const list = document.getElementById('team-managers-list');

                if (!list) return;

                list.innerHTML = '<div style="color: var(--fg-muted); font-size: 0.85rem;">Loading...</div>';

                if (!agentId) {
                    list.innerHTML = '<div style="color: var(--fg-muted); font-size: 0.85rem;">Save the agent first to add team members.</div>';
                    const addBtn = document.getElementById('btn-add-manager');
                    const emailInput = document.getElementById('new-manager-email');
                    if (addBtn) addBtn.disabled = true;
                    if (emailInput) emailInput.disabled = true;
                    return;
                }

                const addBtn = document.getElementById('btn-add-manager');
                const emailInput = document.getElementById('new-manager-email');
                if (addBtn) addBtn.disabled = false;
                if (emailInput) emailInput.disabled = false;

                try {
                    const res = await authenticatedFetch(`/api/agents/${agentId}/managers`);
                    if (res.ok) {
                        const managers = await safeJson(res);
                        if (managers.length === 0) {
                            list.innerHTML = '<div style="color: var(--fg-muted); font-size: 0.85rem;">No managers added yet. You are the only owner.</div>';
                        } else {
                            list.innerHTML = managers.map(m => `
                                <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-base); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-size: 0.85rem;">
                                    <span style="font-weight: 500; color: var(--fg-main);">${m.email}</span>
                                    <button type="button" class="btn btn-secondary" onclick="deleteManager('${m.id}', '${agentId}')" style="padding: 0.2rem 0.5rem; color: #ef4444; border-color: transparent;">Remove</button>
                                </div>
                            `).join('');
                        }
                    } else {
                        console.error('Failed to load managers. Status:', res.status);
                        list.innerHTML = '<div style="color: #ef4444; font-size: 0.85rem;">Failed to load team members.</div>';
                    }
                } catch (e) {
                    console.error('Failed to load managers:', e);
                    list.innerHTML = '<div style="color: #ef4444; font-size: 0.85rem;">Failed to load team members.</div>';
                }
            }

            window.deleteManager = async (managerId, agentId) => {
                const confirmed = await showConfirm(
                    'Remove manager?',
                    'Are you sure you want to remove this manager from the agent? They will no longer be able to reply to leads.'
                );
                if (!confirmed) return;
                try {
                    const res = await authenticatedFetch(`/api/agents/${agentId}/managers/${managerId}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast('Manager removed', 'success');
                        loadTeamManagers(agentId);
                    } else {
                        showToast('Failed to remove manager', 'error');
                    }
                } catch (e) {
                    showToast('Network error', 'error');
                }
            };

            document.getElementById('btn-add-manager')?.addEventListener('click', async () => {
                const emailInput = document.getElementById('new-manager-email');
                const email = emailInput.value.trim();
                const agentId = document.getElementById('agent-id').value;

                if (!email || !agentId) return;

                const btn = document.getElementById('btn-add-manager');
                btn.disabled = true;
                btn.textContent = '...';

                try {
                    const res = await authenticatedFetch(`/api/agents/${agentId}/managers`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });

                    if (res.ok) {
                        showToast('Manager added!', 'success');
                        emailInput.value = '';
                        loadTeamManagers(agentId);
                    } else {
                        const data = await safeJson(res);
                        showToast(data.error || 'Failed to add manager', 'error');
                    }
                } catch (e) {
                    showToast('Network error', 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Add';
                }
            });

            // Knowledge Base Logic
            async function loadKnowledgeBase(agentId) {
                const list = document.getElementById('kb-file-list');
                const uploadBtn = document.getElementById('btn-upload-kb');
                const statusText = document.getElementById('kb-upload-status');
                const fileInput = document.getElementById('kb-file-upload');

                if (!list) return;

                list.innerHTML = '<div style="color: var(--fg-muted); font-size: 0.85rem;">Loading...</div>';

                if (!agentId) {
                    list.innerHTML = '';
                    if (uploadBtn) uploadBtn.style.display = 'none';
                    if (fileInput) fileInput.disabled = true;
                    if (statusText) statusText.textContent = 'Save the agent first before uploading files.';
                    return;
                }

                if (fileInput) fileInput.disabled = false;
                if (statusText) statusText.textContent = '';

                try {
                    const res = await authenticatedFetch(`/api/knowledge/${agentId}`);
                    if (res.ok) {
                        const files = await safeJson(res);
                        if (files.length === 0) {
                            list.innerHTML = '<div style="color: var(--fg-muted); font-size: 0.85rem;">No files uploaded yet.</div>';
                        } else {
                            list.innerHTML = files.map(f => `
                                <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-base); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-size: 0.85rem;">
                                    <span style="font-weight: 500; color: var(--fg-main);">${f.filename}</span>
                                    <button type="button" class="btn btn-secondary" onclick="deleteKbFile('${f.id}', '${agentId}')" style="padding: 0.2rem 0.5rem; color: #ef4444; border-color: transparent;">Delete</button>
                                </div>
                            `).join('');
                        }
                    } else {
                        console.error('Failed to load KB. Status:', res.status);
                        list.innerHTML = '<div style="color: #ef4444; font-size: 0.85rem;">Failed to load files.</div>';
                    }
                } catch (e) {
                    console.error('Failed to load KB:', e);
                    list.innerHTML = '<div style="color: #ef4444; font-size: 0.85rem;">Failed to load files.</div>';
                }
            }

            window.deleteKbFile = async (fileId, agentId) => {
                if (!confirm('Delete this file from the Knowledge Base?')) return;
                try {
                    const res = await authenticatedFetch(`/api/knowledge/${fileId}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast('File deleted', 'success');
                        loadKnowledgeBase(agentId);
                    } else {
                        showToast('Failed to delete file', 'error');
                    }
                } catch (e) {
                    showToast('Network error', 'error');
                }
            };

            document.getElementById('kb-file-upload')?.addEventListener('change', (e) => {
                const file = e.target.files[0];
                const uploadBtn = document.getElementById('btn-upload-kb');
                const statusText = document.getElementById('kb-upload-status');
                const agentId = document.getElementById('agent-id').value;

                if (file && agentId) {
                    if (uploadBtn) uploadBtn.style.display = 'block';
                    if (statusText) statusText.textContent = `Selected: ${file.name}`;
                } else {
                    if (uploadBtn) uploadBtn.style.display = 'none';
                    if (agentId && statusText) statusText.textContent = '';
                }
            });

            document.getElementById('btn-upload-kb')?.addEventListener('click', async () => {
                const fileInput = document.getElementById('kb-file-upload');
                const file = fileInput.files[0];
                const agentId = document.getElementById('agent-id').value;
                const statusText = document.getElementById('kb-upload-status');
                const uploadBtn = document.getElementById('btn-upload-kb');

                if (!file || !agentId) return;

                statusText.textContent = 'Uploading and parsing...';
                uploadBtn.disabled = true;

                const formData = new FormData();
                formData.append('file', file);

                try {
                    const res = await authenticatedFetch(`/api/knowledge/${agentId}`, {
                        method: 'POST',
                        body: formData
                    });

                    if (res.ok) {
                        showToast('File added to Knowledge Base!', 'success');
                        fileInput.value = '';
                        uploadBtn.style.display = 'none';
                        statusText.textContent = '';
                        uploadBtn.disabled = false;
                        loadKnowledgeBase(agentId);
                    } else {
                        const data = await safeJson(res);
                        showToast(data.error || 'Upload failed', 'error');
                        statusText.textContent = 'Upload failed.';
                        uploadBtn.disabled = false;
                    }
                } catch (e) {
                    console.error('KB upload error:', e);
                    showToast('Network error during upload', 'error');
                    statusText.textContent = 'Network error.';
                    uploadBtn.disabled = false;
                }
            });
            // New/Edit Agent Modal
            const newAgentModal = document.getElementById('new-agent-modal');
            const openNewAgentBtn = document.getElementById('open-new-agent');
            const closeAgentModalBtn = document.getElementById('close-agent-modal');
            const newAgentBackdrop = document.getElementById('new-agent-backdrop');
            const newAgentForm = document.getElementById('new-agent-form');

            function openAgentModal() {
            if(newAgentModal) {
            newAgentModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            }
            }

            function closeAgentModal() {
            if(newAgentModal) {
            newAgentModal.classList.remove('active');
            document.body.style.overflow = '';
            newAgentForm.reset();
            document.getElementById('agent-id').value = '';
            document.getElementById('agent-token').required = true;
            document.getElementById('agent-modal-title').textContent = 'Create AI Agent';
            document.getElementById('agent-submit-btn').textContent = 'Deploy Agent';

            // Reset Model Selector
            document.getElementById('agent-model').value = 'gemini-2.5-flash';
            document.querySelectorAll('.model-card').forEach(c => c.classList.remove('active'));
            const defaultCard = document.querySelector('.model-card[data-model="gemini-2.5-flash"]');
            if (defaultCard) defaultCard.classList.add('active');

            // Reset KB UI
            document.getElementById('kb-file-list').innerHTML = '';
            document.getElementById('btn-upload-kb').style.display = 'none';
            document.getElementById('kb-upload-status').textContent = 'Save the agent first before uploading files.';
            document.getElementById('kb-file-upload').disabled = true;
            document.getElementById('kb-file-upload').value = '';
            }
            }
openNewAgentBtn?.addEventListener('click', () => {
    document.getElementById('agent-modal-title').textContent = 'Create AI Agent';
    document.getElementById('agent-submit-btn').textContent = 'Deploy Agent';
    document.getElementById('agent-id').value = '';
    document.getElementById('agent-token').required = true;
    newAgentForm.reset();
    openAgentModal();
});
closeAgentModalBtn?.addEventListener('click', closeAgentModal);
newAgentBackdrop?.addEventListener('click', closeAgentModal);

// Toast Notifications
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' 
        ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
        : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
        
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Reactive Cursor Logic ---
function updateMousePos(e, element) {
    const rect = element.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    element.style.setProperty('--mouse-x', `${x}%`);
    element.style.setProperty('--mouse-y', `${y}%`);
}

document.querySelectorAll('.btn-magic, .ai-prompt-wrapper').forEach(el => {
    el.addEventListener('mousemove', (e) => updateMousePos(e, el));
});

// Model Selector Logic
document.querySelectorAll('.model-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.model-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        document.getElementById('agent-model').value = card.getAttribute('data-model');
    });
});

// Enhance Prompt Button
const btnEnhancePrompt = document.getElementById('btn-enhance-prompt');
btnEnhancePrompt?.addEventListener('click', async () => {
    const goal = document.getElementById('wizard-goal').value;
    const audience = document.getElementById('wizard-audience').value;
    const tone = document.getElementById('wizard-tone').value;
    const rules = document.getElementById('wizard-rules').value;

    if (!goal || !audience || !tone) {
        showToast('Please fill in the primary goal, audience, and tone first.', 'error');
        return;
    }

    const promptContainer = document.getElementById('ai-prompt-container');
    const originalHTML = btnEnhancePrompt.innerHTML;
    
    // Clean text, remove emojis/stars
    btnEnhancePrompt.innerHTML = '<span class="btn-content">AI is thinking...</span>';
    btnEnhancePrompt.disabled = true;
    
    // Show shimmering border during processing
    promptContainer?.classList.add('active');
    btnEnhancePrompt.classList.add('active');

    try {
        const res = await authenticatedFetch('/api/tools/expand-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal, audience, tone, rules })
        });
        if (res.ok) {
            const data = await res.json();
            document.getElementById('agent-prompt').value = data.expandedPrompt;
            showToast('Prompt enhanced successfully!', 'success');
        } else {
            const data = await safeJson(res);
            if (data && data.error === 'API_KEY_MISSING') {
                showToast('API Key is missing. Redirecting to Settings...', 'error');
                closeAgentModal();
                const settingsBtn = document.querySelector('.nav-view-btn[data-view="settings"]');
                if (settingsBtn) {
                    settingsBtn.click();
                }
                const keyInput = document.getElementById('settings-openrouter-key');
                if (keyInput) {
                    keyInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    keyInput.style.outline = '3px solid #8b5cf6';
                    keyInput.style.boxShadow = '0 0 15px rgba(139, 92, 246, 0.6)';
                    keyInput.style.transition = 'outline 0.3s ease, box-shadow 0.3s ease';
                    keyInput.focus();
                    setTimeout(() => {
                        keyInput.style.outline = '';
                        keyInput.style.boxShadow = '';
                    }, 5000);
                }
            } else {
                showToast(data.message || data.error || 'Failed to connect to AI service.', 'error');
            }
        }
    } catch (e) {
        console.error('Failed to enhance prompt:', e);
        showToast('Failed to connect to AI service.', 'error');
    } finally {
        btnEnhancePrompt.innerHTML = originalHTML;
        btnEnhancePrompt.disabled = false;
        btnEnhancePrompt.classList.remove('active');
        setTimeout(() => promptContainer?.classList.remove('active'), 1500);
    }
});

newAgentForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('agent-id').value;
    const name = document.getElementById('agent-name').value;
    const tokenInput = document.getElementById('agent-token').value;
    const model = document.getElementById('agent-model').value;
    const payment = document.getElementById('agent-payment').value;
    const webhookUrl = document.getElementById('agent-webhook').value;
    const googleSheetsUrl = document.getElementById('agent-gsheets').value;
    const removeBranding = document.getElementById('agent-whitelabel').checked;
    const calendarUrl = document.getElementById('agent-calendar').value;
    
    const goal = document.getElementById('wizard-goal').value;
    const audience = document.getElementById('wizard-audience').value;
    const tone = document.getElementById('wizard-tone').value;
    const rules = document.getElementById('wizard-rules').value;
    
    const token = tokenInput ? tokenInput : undefined;

    const btn = document.getElementById('agent-submit-btn');
    btn.textContent = 'Deploying...';
    btn.disabled = true;
    
    // We strictly use whatever is in the agent-prompt textarea if it's not empty, 
    // BUT we rebuild it from wizard parts if it is empty to ensure they are synchronized.
    const promptTextarea = document.getElementById('agent-prompt');
    let finalPrompt = promptTextarea ? promptTextarea.value.trim() : '';
    if (!finalPrompt) {
        let compiledPrompt = `- Goal: ${goal}\n- Target Audience: ${audience}\n- Tone of Voice: ${tone}`;
        if (rules) {
            compiledPrompt += `\n- Strict Rules: ${rules}`;
        }
        if (promptTextarea) {
            promptTextarea.value = compiledPrompt;
        }
        finalPrompt = compiledPrompt;
    } 

    try {
        if (id) {
            await authenticatedFetch(`/api/agents/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, token, model, prompt: finalPrompt, payment, webhookUrl, googleSheetsUrl, removeBranding, calendarUrl })
            });
            showToast('Agent updated successfully!', 'success');
        } else {
            const res = await authenticatedFetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, token, model, prompt: finalPrompt, payment, webhookUrl, googleSheetsUrl, removeBranding, calendarUrl })
            });
            if (!res.ok) {
                const data = await safeJson(res);
                showToast(data.error || 'Failed to create bot. Check your Telegram Token.', 'error');
                btn.textContent = id ? 'Save Changes' : 'Deploy Agent';
                btn.disabled = false;
                return;
            }
            showToast('Agent deployed successfully!', 'success');
            
            // Mark onboarding as complete permanently
            if (supabaseClient && currentUser && !currentUser.user_metadata?.onboardingCompleted) {
                const { data } = await supabaseClient.auth.updateUser({
                    data: { onboardingCompleted: true }
                });
                if (data?.user) currentUser = data.user;
            }
        }
        await refreshDashboardData();
        closeAgentModal();
    } catch (err) {
        console.error('Error saving agent:', err);
        showToast(err.message || 'An error occurred. Make sure the backend server is running.', 'error');
    } finally {
        btn.textContent = id ? 'Save Changes' : 'Deploy Agent';
        btn.disabled = false;
    }
});

// Initialize & Update Chart.js for Analytics
const MODEL_INFO = {
    'gemini-3.1-pro-preview': { name: 'Gemini 3.1 Pro', costPer1M: 3.50 },
    'gemini-3-flash-preview': { name: 'Gemini 3 Flash', costPer1M: 0.10 },
    'gemini-2.5-pro': { name: 'Gemini 2.5 Pro', costPer1M: 3.50 },
    'gemini-2.5-flash': { name: 'Gemini 2.5 Flash', costPer1M: 0.075 }
};

document.getElementById('analytics-model-filter')?.addEventListener('change', () => {
    updateAnalyticsChart();
});

document.getElementById('analytics-agent-filter')?.addEventListener('change', () => {
    updateAnalyticsChart();
});

// Interactive Cost Breakdown
const costCardToggle = document.getElementById('cost-card-toggle');
const costBreakdownPanel = document.getElementById('cost-breakdown-panel');

costCardToggle?.addEventListener('click', (e) => {
    // Only toggle if we have a breakdown panel
    if (costBreakdownPanel) {
        const isVisible = costBreakdownPanel.style.display === 'block';
        costBreakdownPanel.style.display = isVisible ? 'none' : 'block';
    }
});

// Close panel when clicking outside
document.addEventListener('click', (e) => {
    if (costCardToggle && !costCardToggle.contains(e.target)) {
        if (costBreakdownPanel) costBreakdownPanel.style.display = 'none';
    }
});

function updateAnalyticsChart() {
    const ctx = document.getElementById('analyticsChart');
    if (!ctx) return;
    
    const filterSelect = document.getElementById('analytics-model-filter');
    const selectedModelFilter = filterSelect ? filterSelect.value : 'all';
    
    const agentFilterSelect = document.getElementById('analytics-agent-filter');
    const selectedAgentId = agentFilterSelect ? agentFilterSelect.value : 'all';
    
    // Calculate aggregate analytics
    const dailyTotals = {};
    let grandTotalTokens = 0;
    let totalCost = 0;
    let totalMsgs = 0;
    
    const costBreakdown = {};
    
    // Agent Info elements
    const infoPanel = document.getElementById('analytics-agent-info');
    const infoGSheets = document.getElementById('info-gsheets');
    const infoWebhook = document.getElementById('info-webhook');
    const infoBranding = document.getElementById('info-branding');

    let filteredAgents = agents;
    
    if (selectedAgentId !== 'all') {
        filteredAgents = agents.filter(a => a.id === selectedAgentId);
        if (infoPanel) {
            infoPanel.style.display = 'block';
            const agent = filteredAgents[0];
            if (agent) {
                infoGSheets.textContent = agent.analytics?.googleSheetsUrl || 'Not configured';
                infoWebhook.textContent = agent.webhookUrl || 'Not configured';
                infoBranding.textContent = agent.analytics?.removeBranding ? 'Branding Disabled (White-label)' : 'Zentia Branding Active';
                infoBranding.style.color = agent.analytics?.removeBranding ? '#10b981' : 'var(--fg-main)';
            }
        }
    } else {
        if (infoPanel) infoPanel.style.display = 'none';
        if (selectedModelFilter !== 'all') {
            filteredAgents = agents.filter(a => (a.model || 'gemini-1.5-flash') === selectedModelFilter);
        }
    }
    
    filteredAgents.forEach(agent => {
        const modelKey = agent.model || 'gemini-1.5-flash';
        const info = MODEL_INFO[modelKey] || MODEL_INFO['gemini-1.5-flash'] || { name: modelKey, costPer1M: 0.075 };
        
        // Further filter by model if we are in "All Agents" mode but a specific model is selected
        if (selectedAgentId === 'all' && selectedModelFilter !== 'all' && modelKey !== selectedModelFilter) return;

        grandTotalTokens += (agent.tokensUsed || 0);
        totalMsgs += (agent.messagesSent || 0);
        
        const agentCost = ((agent.tokensUsed || 0) / 1000000) * info.costPer1M;
        totalCost += agentCost;
        
        if (!costBreakdown[info.name]) costBreakdown[info.name] = 0;
        costBreakdown[info.name] += agentCost;
        
        if (agent.analytics) {
            Object.keys(agent.analytics).forEach(date => {
                // If the key is a date string like '2023-10-27'
                if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    dailyTotals[date] = (dailyTotals[date] || 0) + agent.analytics[date];
                }
            });
        }
    });
    
    // Update summary cards
    document.querySelectorAll('#view-analytics .stat-value')[0].textContent = grandTotalTokens.toLocaleString();
    document.querySelectorAll('#view-analytics .stat-value')[1].textContent = '$' + totalCost.toFixed(4);
    
    const msgsEl = document.getElementById('analytics-total-msgs');
    if (msgsEl) msgsEl.textContent = totalMsgs.toLocaleString();
    
    const leadsEl = document.getElementById('analytics-total-leads');
    if (leadsEl) leadsEl.textContent = leads.length.toLocaleString();
    
    const convRateEl = document.getElementById('analytics-conversion-rate');
    if (convRateEl) {
        // Calculate conversion rate: qualified leads / total unique users
        let totalUniqueUsers = new Set();
        agents.forEach(a => {
            // Apply filters to match total unique users for selected criteria
            const modelKey = a.model || 'gemini-2.5-flash';
            if (selectedAgentId !== 'all' && a.id !== selectedAgentId) return;
            if (selectedModelFilter !== 'all' && modelKey !== selectedModelFilter) return;

            if (a.uniqueUsers) {
                if (Array.isArray(a.uniqueUsers)) {
                    a.uniqueUsers.forEach(u => totalUniqueUsers.add(u));
                } else if (typeof a.uniqueUsers === 'number') {
                    // If uniqueUsers is just a count, we can't perfectly de-duplicate, but we add to total
                    for(let i=0; i<a.uniqueUsers; i++) totalUniqueUsers.add(`${a.id}_user_${i}`);
                }
            }
        });
        
        const userCount = totalUniqueUsers.size || 1; // avoid division by zero
        let rate = ((leads.length / userCount) * 100).toFixed(1);
        if (leads.length === 0) rate = "0.0";
        convRateEl.textContent = `${rate}% conversion rate`;
    }

    // Update model name display
    const modelNameEl = document.getElementById('cost-model-name');
    if (modelNameEl) {
        if (selectedModelFilter !== 'all') {
            const info = MODEL_INFO[selectedModelFilter] || { name: selectedModelFilter };
            modelNameEl.textContent = `Based on ${info.name}`;
            modelNameEl.style.display = 'inline-block';
        } else {
            modelNameEl.textContent = '';
            modelNameEl.style.display = 'none';
        }
    }
    
    // Update Cost Breakdown Panel
    if (costBreakdownPanel) {
        if (Object.keys(costBreakdown).length === 0) {
             costBreakdownPanel.innerHTML = '<div style="font-size: 0.875rem; color: var(--fg-muted);">No cost data available.</div>';
        } else {
             let html = '<h4 style="font-size: 0.875rem; margin-bottom: 0.75rem; color: var(--fg-main);">Cost Breakdown</h4>';
             Object.entries(costBreakdown).forEach(([name, cost]) => {
                 html += `
                     <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid var(--border-subtle); font-size: 0.875rem;">
                         <span style="color: var(--fg-muted);">${name}</span>
                         <span style="font-weight: 600; color: var(--fg-main);">$${cost.toFixed(4)}</span>
                     </div>
                 `;
             });
             costBreakdownPanel.innerHTML = html;
        }
    }

    // Format data for chart
    const dates = Object.keys(dailyTotals).sort();
    // If no data, provide dummy recent 7 days
    const labels = dates.length > 0 ? dates : [...Array(7)].map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6-i)); return d.toISOString().split('T')[0];
    });
    const dataPoints = dates.length > 0 ? dates.map(d => dailyTotals[d]) : [0,0,0,0,0,0,0];

    if (analyticsChartInstance) {
        analyticsChartInstance.data.labels = labels;
        analyticsChartInstance.data.datasets[0].data = dataPoints;
        analyticsChartInstance.update();
        return;
    }
    
    // Initial Chart Creation
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');

    analyticsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tokens Processed',
                data: dataPoints,
                borderColor: '#10b981',
                backgroundColor: gradient,
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#10b981',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#111111',
                    titleFont: { family: 'Inter', size: 13 },
                    bodyFont: { family: 'Inter', size: 14, weight: 'bold' },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { font: { family: 'Inter', size: 12 }, color: '#a3a3a3' }
                },
                y: {
                    grid: { color: '#eaeaea', drawBorder: false },
                    ticks: { 
                        font: { family: 'Inter', size: 12 }, 
                        color: '#a3a3a3',
                    },
                    beginAtZero: true,
                    suggestedMax: 1000
                }
            }
        }
    });

    // Analytics: Recent Inquiries
    const inquiriesContainer = document.getElementById('analytics-recent-inquiries');
    if (inquiriesContainer) {
        let allUserMessages = [];
        leads.forEach(lead => {
            lead.history.forEach(msg => {
                if (msg.role === 'user') {
                    allUserMessages.push({ text: msg.content, date: lead.timestamp, agent: lead.agentName });
                }
            });
        });
        
        allUserMessages.sort((a, b) => new Date(b.date) - new Date(a.date));
        const recentMessages = allUserMessages.slice(0, 5);
        
        inquiriesContainer.innerHTML = '';
        if (recentMessages.length === 0) {
            inquiriesContainer.innerHTML = '<div style="text-align: center; color: var(--fg-muted); padding: 1rem;">No inquiries yet.</div>';
        } else {
            recentMessages.forEach(m => {
                const item = document.createElement('div');
                item.style.cssText = 'padding: 1rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--bg-secondary);';
                item.innerHTML = `
                    <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.25rem; color: var(--fg-main);">"${m.text}"</div>
                    <div style="font-size: 0.75rem; color: var(--fg-light);">To: ${m.agent}</div>
                `;
                inquiriesContainer.appendChild(item);
            });
        }
    }
}

// Supabase init moved to top

// Modal Elements
const authModal = document.getElementById('auth-modal');
const loginContainer = document.getElementById('login-form-container');
const registerContainer = document.getElementById('register-form-container');
const openLoginBtn = document.getElementById('open-login');
const openRegisterBtn = document.getElementById('open-register');
const closeModalBtn = document.getElementById('close-modal');
const modalBackdrop = document.getElementById('modal-backdrop');
const switchToRegister = document.getElementById('switch-to-register');
const switchToLogin = document.getElementById('switch-to-login');

// New Modals
const videoModal = document.getElementById('video-modal');
const onboardingModal = document.getElementById('onboarding-modal');

document.getElementById('open-demo-video')?.addEventListener('click', (e) => {
    e.preventDefault();
    videoModal?.classList.add('active');
    document.body.style.overflow = 'hidden';
});

document.getElementById('close-video-modal')?.addEventListener('click', () => {
    videoModal?.classList.remove('active');
    document.body.style.overflow = '';
});

document.getElementById('video-backdrop')?.addEventListener('click', () => {
    videoModal?.classList.remove('active');
    document.body.style.overflow = '';
});

function checkAndShowOnboarding(agentsList) {
    // Only show if user is logged in, has 0 agents, and hasn't explicitly completed it
    const hasCompleted = currentUser?.user_metadata?.onboardingCompleted;
    if (agentsList.length === 0 && currentUser && !hasCompleted) {
        onboardingModal?.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

document.getElementById('start-onboarding-btn')?.addEventListener('click', () => {
    onboardingModal?.classList.remove('active');
    document.body.style.overflow = '';
    showAgentModal(); // Open the new agent modal
});

// Prompt Templates Logic
const promptTemplates = {
    saas: {
        goal: "Qualify inbound leads for a B2B SaaS product and book demos.",
        audience: "Founders, CTOs, and VP of Sales.",
        tone: "Professional, consultative, and concise.",
        rules: "Never mention exact pricing. Focus on ROI. Always ask for a preferred demo time. Only book meetings if they show clear intent."
    },
    realestate: {
        goal: "Pre-qualify buyers/renters and schedule property viewings.",
        audience: "People looking for apartments or commercial spaces.",
        tone: "Friendly, helpful, and highly responsive.",
        rules: "Always ask about their budget and preferred location before offering properties. Do not promise discounts."
    },
    fitness: {
        goal: "Sell premium online fitness coaching packages.",
        audience: "People who want to lose weight or build muscle but lack discipline.",
        tone: "Motivating, energetic, and encouraging.",
        rules: "Focus on their pain points. Offer a free 15-minute consultation call to close the deal. Don't be too aggressive."
    }
};

document.getElementById('wizard-template')?.addEventListener('change', (e) => {
    const t = promptTemplates[e.target.value];
    if (t) {
        document.getElementById('wizard-goal').value = t.goal;
        document.getElementById('wizard-audience').value = t.audience;
        document.getElementById('wizard-tone').value = t.tone;
        document.getElementById('wizard-rules').value = t.rules;
    } else {
        document.getElementById('wizard-goal').value = '';
        document.getElementById('wizard-audience').value = '';
        document.getElementById('wizard-tone').value = '';
        document.getElementById('wizard-rules').value = '';
    }
});

function openModal(mode = 'login') {
    if (!authModal) return;
    authModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (mode === 'register') {
        loginContainer.style.display = 'none';
        registerContainer.style.display = 'block';
    } else {
        loginContainer.style.display = 'block';
        registerContainer.style.display = 'none';
    }
}

function closeModal() {
    if (!authModal) return;
    authModal.classList.remove('active');
    document.body.style.overflow = '';
}

openLoginBtn?.addEventListener('click', (e) => { e.preventDefault(); openModal('login'); });
openRegisterBtn?.addEventListener('click', (e) => { e.preventDefault(); openModal('register'); });
document.getElementById('hero-start-btn')?.addEventListener('click', (e) => { e.preventDefault(); openModal('register'); });
closeModalBtn?.addEventListener('click', closeModal);
modalBackdrop?.addEventListener('click', closeModal);
switchToRegister?.addEventListener('click', (e) => { e.preventDefault(); openModal('register'); });
switchToLogin?.addEventListener('click', (e) => { e.preventDefault(); openModal('login'); });

// Nav Auth Elements
const authGuest = document.querySelector('.auth-guest');
const authUser = document.querySelector('.auth-user');
const userEmailSpan = document.getElementById('user-email');
const logoutBtn = document.getElementById('handle-logout');
const dashboardLogoutBtn = document.querySelector('.logout-dashboard');

const landingPage = document.getElementById('landing-page');
const workspaceDashboard = document.getElementById('workspace-dashboard');
const userDisplayName = document.querySelector('.user-display-name');

let currentUserPlan = 'free';
let currentUser = null;

// Update UI based on User
function updateAuthUI(user) {
    currentUser = user;
    if (user) {
        // Switch to Dashboard View
        if (landingPage) landingPage.style.display = 'none';
        if (workspaceDashboard) workspaceDashboard.style.display = 'flex';
        
        if (authGuest) authGuest.style.display = 'none';
        if (authUser) authUser.style.display = 'flex';
        
        const email = user.email;
        if (userEmailSpan) userEmailSpan.textContent = email;
        const displayName = user.user_metadata?.full_name || email.split('@')[0];
        if (userDisplayName) userDisplayName.textContent = displayName;

        // Plan Badge
        const plan = user.user_metadata?.plan || 'free';
        currentUserPlan = plan;
        
        const planBadge = document.getElementById('user-plan-badge');
        const settingsPlanBadge = document.getElementById('settings-plan-badge');
        
        let planName = 'Free Plan';
        let planColor = '#8b5cf6';
        let planBg = 'rgba(139, 92, 246, 0.15)';
        
        if (plan === 'starter') {
            planName = 'Starter Plan';
        } else if (plan === 'pro') {
            planName = 'Pro Plan';
            planColor = '#10b981';
            planBg = 'rgba(16, 185, 129, 0.15)';
        } else if (plan === 'enterprise') {
            planName = 'Enterprise Plan';
            planColor = '#f59e0b';
            planBg = 'rgba(245, 158, 11, 0.15)';
        }
        
        if (planBadge) {
            planBadge.textContent = planName;
            planBadge.style.color = planColor;
            planBadge.style.background = planBg;
        }
        if (settingsPlanBadge) {
            settingsPlanBadge.textContent = planName;
            settingsPlanBadge.style.color = planColor;
            settingsPlanBadge.style.background = planBg;
        }
        
        // Hide upgrade button in settings if pro or enterprise
        const settingsUpgradeBtn = document.getElementById('settings-upgrade-btn');
        if (settingsUpgradeBtn) {
            settingsUpgradeBtn.style.display = (plan === 'pro' || plan === 'enterprise') ? 'none' : 'flex';
        }

        const entFeatures = document.getElementById('enterprise-features');
        if (entFeatures) entFeatures.style.display = plan === 'enterprise' ? 'block' : 'none';

        // Admin Panel Visibility
        const adminBtn = document.querySelector('.nav-view-btn.admin-only');
        if (adminBtn) {
            if (user.email === 'toofiks.fx@gmail.com' || user.user_metadata?.is_admin) {
                adminBtn.style.display = 'flex';
            } else {
                adminBtn.style.display = 'none';
            }
        }

        if (user.user_metadata?.openRouterKey) {
        const adminBtn = document.querySelector('.nav-view-btn.admin-only');
        if (adminBtn) {
            if (user.email === 'toofiks.fx@gmail.com' || user.user_metadata?.is_admin) {
                adminBtn.style.display = 'flex';
            } else {
                adminBtn.style.display = 'none';
            }
        }

        // Hide pro banner on dashboard if pro or enterprise
        const dashboardProBanner = document.getElementById('dashboard-pro-banner');
        if (dashboardProBanner) {
            dashboardProBanner.style.display = (plan === 'pro' || plan === 'enterprise') ? 'none' : 'flex';
        }

        const settingsEmail = document.getElementById('settings-email');        if (settingsEmail) settingsEmail.value = email;
        const settingsName = document.getElementById('settings-name');
        if (settingsName && user.user_metadata?.full_name) settingsName.value = user.user_metadata.full_name;

        // Load custom API keys
        if (user.user_metadata?.openRouterKey) {
            const el = document.getElementById('settings-openrouter-key');
            if (el) el.value = user.user_metadata.openRouterKey;
        }
        if (user.user_metadata?.geminiKey) {
            const el = document.getElementById('settings-gemini-key');
            if (el) el.value = user.user_metadata.geminiKey;
        }
        
        renderAgents(); // Re-render to update limits
        startDashboardPolling();
    } else {
        // Switch to Landing View
        if (landingPage) landingPage.style.display = 'block';
        if (workspaceDashboard) workspaceDashboard.style.display = 'none';
        
        if (authGuest) authGuest.style.display = 'flex';
        if (authUser) authUser.style.display = 'none';
        
        stopDashboardPolling();
    }
}

// Auth Handlers
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    
    if (loginError) loginError.textContent = '';

    if (!supabaseClient) return showToast('Supabase not initialized. Please add your credentials in script.js', 'error');

    // Show loading state
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Signing in...';
    submitBtn.disabled = true;

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            if (loginError) loginError.textContent = error.message;
        } else {
            closeModal();
            showToast('Logged in successfully!', 'success');
        }
    } catch (err) {
        if (loginError) loginError.textContent = err.message || 'An error occurred';
    } finally {
        // Restore button state
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const submitBtn = registerForm.querySelector('button[type="submit"]');

    if (registerError) registerError.textContent = '';

    if (!supabaseClient) return showToast('Supabase not initialized. Please add your credentials in script.js', 'error');

    // Show loading state
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;

    try {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) {
            if (registerError) {
                if (error.message.toLowerCase().includes('rate limit')) {
                    registerError.innerHTML = `Security rate limit exceeded (too many signups from this IP).<br><br><span style="font-size: 0.8rem; color: var(--fg-muted);"><strong>Developer Tip:</strong> Go to your Supabase Dashboard -> Authentication -> Providers -> Email, and disable "Confirm email" to bypass this during testing.</span>`;
                } else {
                    registerError.textContent = error.message;
                }
            }
        } else {
            showToast('Registration successful! Please check your email for the confirmation link.', 'success');
            closeModal();
        }
    } catch (err) {
         if (registerError) registerError.textContent = err.message || 'An error occurred';
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

// Logout handling
const handleLogoutAction = async (e) => {
    e.preventDefault();
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (!error) {
        showToast('Logged out successfully.', 'success');
        window.location.reload();
    } else {
        showToast('Sign out failed: ' + error.message, 'error');
    }
};

logoutBtn?.addEventListener('click', handleLogoutAction);
dashboardLogoutBtn?.addEventListener('click', handleLogoutAction);
document.getElementById('mobile-logout-btn')?.addEventListener('click', handleLogoutAction);

// Shortcut Buttons (Dashboard Hub)
document.querySelectorAll('.shortcut-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-view');
        const navBtn = document.querySelector(`.nav-view-btn[data-view="${targetView}"]`);
        if (navBtn) {
            navBtn.click();
            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
});

// Mobile Quick Menu Logic
const mobileMenuBtn = document.getElementById('mobile-quick-menu-btn');
const mobileDropdown = document.getElementById('mobile-quick-dropdown');

mobileMenuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    mobileDropdown?.classList.toggle('active');
});

document.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.getAttribute('data-view');
        const navBtn = document.querySelector(`.nav-view-btn[data-view="${view}"]`);
        if (navBtn) {
            navBtn.click();
            mobileDropdown?.classList.remove('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
});

// Close dropdown on outside click
document.addEventListener('click', () => {
    mobileDropdown?.classList.remove('active');
});

// Listen for Auth Changes
if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        updateAuthUI(session?.user ?? null);
    });
    
    // Initial check
    supabaseClient.auth.getUser().then(({ data: { user } }) => {
        updateAuthUI(user);
    });
}

// Settings Form
const settingsForm = document.getElementById('settings-form');
settingsForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('settings-name').value;
    const telegramChatId = document.getElementById('settings-telegram-chat-id')?.value || '';

    if (supabaseClient) {
        const { data, error } = await supabaseClient.auth.updateUser({
            data: { full_name: name, telegram_chat_id: telegramChatId }
        });        
        if (error) {
            showToast(error.message, 'error');
        } else {
            showToast('Profile updated successfully!', 'success');
            if (name) {
                document.querySelector('.user-display-name').textContent = name;
            }
            // Update local state if needed
            if (data.user) {
                updateAuthUI(data.user);
            }
        }
    } else {
        showToast('Settings saved locally.', 'success');
        if (name) {
            document.querySelector('.user-display-name').textContent = name;
        }
    }
});

const settingsApiForm = document.getElementById('settings-api-form');
settingsApiForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const openRouterKey = document.getElementById('settings-openrouter-key').value;
    const geminiKey = document.getElementById('settings-gemini-key').value;

    if (supabaseClient) {
        const { data, error } = await supabaseClient.auth.updateUser({
            data: { openRouterKey: openRouterKey, geminiKey: geminiKey }
        });        
        if (error) {
            showToast(error.message, 'error');
        } else {
            showToast('API Keys saved securely!', 'success');
            if (data.user) {
                updateAuthUI(data.user);
            }
        }
    }
});

// Stripe Mock Logic
const stripeModal = document.getElementById('stripe-modal');
const stripeBackdrop = document.getElementById('stripe-backdrop');
const closeStripeModal = document.getElementById('close-stripe-modal');

document.querySelectorAll('.upgrade-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        // If not logged in, ask to login first
        supabaseClient.auth.getUser().then(({ data: { user } }) => {
            if (!user) {
                showToast('Please log in first to upgrade.', 'error');
                openModal('login');
                return;
            }
            if (stripeModal) {
                stripeModal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
    });
});

function hideStripeModal() {
    if (stripeModal) {
        stripeModal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

closeStripeModal?.addEventListener('click', hideStripeModal);
stripeBackdrop?.addEventListener('click', hideStripeModal);

document.querySelectorAll('.plan-select-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const plan = btn.getAttribute('data-plan');
        const originalText = btn.textContent;
        btn.textContent = 'Redirecting...';
        btn.disabled = true;

        try {
            const res = await authenticatedFetch('/api/stripe/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan })
            });

            if (res.ok) {
                const resData = await res.json();
                if (resData.url) {
                    window.location.href = resData.url;
                } else {
                    showToast('Failed to retrieve checkout URL.', 'error');
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            } else {
                const err = await res.json();
                showToast(err.error || 'Payment failed.', 'error');
                btn.textContent = originalText;
                btn.disabled = false;
            }
        } catch (e) {
            console.error(e);
            showToast('Connection error.', 'error');
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
});

// Check URL for payment success or cancellation
window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');

    if (paymentStatus === 'success') {
        showToast('Payment successful! Your account has been upgraded.', 'success');
        // Refresh session to get new metadata
        const { data } = await supabaseClient.auth.refreshSession();
        if (data && data.user) {
            updateAuthUI(data.user);
        }
        // Clean URL
        window.history.replaceState({}, document.title, "/");
    } else if (paymentStatus === 'cancelled') {
        showToast('Payment was cancelled.', 'error');
        // Clean URL
        window.history.replaceState({}, document.title, "/");
    }
});

// CSV Export Functionality
document.getElementById('export-csv-btn')?.addEventListener('click', () => {
    if (!leads || leads.length === 0) {
        showToast('No leads available to export.', 'error');
        return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Chat ID,Username,Agent Name,Status,Last Message,Date,Full History\n";
    
    leads.forEach(l => {
        const date = new Date(l.timestamp).toLocaleString().replace(/,/g, '');
        const lastMsg = l.lastMessage ? l.lastMessage.replace(/"/g, '""').replace(/\n/g, ' ') : '';
        
        // Format full history for CSV
        const historyText = l.history
            .filter(m => m.role !== 'system')
            .map(m => `${m.role === 'assistant' ? 'Bot' : 'User'}: ${m.content.replace(/"/g, '""')}`)
            .join(' | ');
            
        const row = `${l.chatId},${l.username || ''},${l.agentName},${l.status},"${lastMsg}",${date},"${historyText}"`;
        csvContent += row + "\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `zentia_leads_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Leads with history exported!', 'success');
});

// --- ADMIN PANEL LOGIC ---
const adminTabBtns = document.querySelectorAll('.admin-tab');
const adminTabContents = document.querySelectorAll('.admin-tab-content');
const adminChatsTable = document.getElementById('admin-chats-table');
const adminUsersTable = document.getElementById('admin-users-table');
const adminAgentsTable = document.getElementById('admin-agents-table');

let adminStats = {};
let adminChats = [];
let adminUsers = [];
let adminAgents = [];
let systemUsers = [];

adminTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = btn.getAttribute('data-tab');
        adminTabBtns.forEach(b => b.classList.remove('active'));
        adminTabContents.forEach(c => c.style.display = 'none');
        btn.classList.add('active');
        const content = document.getElementById(`admin-${target}`);
        if (content) content.style.display = 'block';
        if (target === 'system-users') fetchSystemUsers();
    });
});

async function fetchAdminData() {
    if (!currentUser || (currentUser.email !== 'toofiks.fx@gmail.com' && !currentUser.user_metadata?.is_admin)) return;

    // Show system tab only for root admin
    const sysTab = document.getElementById('admin-tab-sys');
    if (sysTab) sysTab.style.display = currentUser.email === 'toofiks.fx@gmail.com' ? 'block' : 'none';

    try {
        const [statsRes, chatsRes, usersRes, agentsRes] = await Promise.all([
            authenticatedFetch('/api/admin/stats'),
            authenticatedFetch('/api/admin/chats'),
            authenticatedFetch('/api/admin/users'),
            authenticatedFetch('/api/admin/agents')
        ]);

        if (statsRes.ok) {
            adminStats = await statsRes.json();
            document.getElementById('admin-stat-agents').textContent = adminStats.agents || 0;
            document.getElementById('admin-stat-users').textContent = adminStats.users || 0;
            document.getElementById('admin-stat-leads').textContent = adminStats.leads || 0;
            document.getElementById('admin-stat-banned').textContent = adminStats.banned || 0;
        }

        if (chatsRes.ok) {
            adminChats = await chatsRes.json();
            renderAdminChats();
        }

        if (usersRes.ok) {
            adminUsers = await usersRes.json();
            renderAdminUsers();
        }

        if (agentsRes.ok) {
            adminAgents = await agentsRes.json();
            renderAdminAgents();
        }
    } catch(e) {
        console.error('Admin fetch error:', e);
    }
}

async function fetchSystemUsers() {
    if (currentUser?.email !== 'toofiks.fx@gmail.com') return;
    try {
        const res = await authenticatedFetch('/api/admin/system-users');
        if (res.ok) {
            systemUsers = await res.json();
            renderSystemUsers();
        }
    } catch(e) { console.error('Sys users fetch error:', e); }
}

function renderSystemUsers() {
    if (!adminSysUsersTable) return;
    adminSysUsersTable.innerHTML = systemUsers.map(user => {
        if (user.email === 'toofiks.fx@gmail.com') return ''; // Don't show self
        const status = user.isAdmin ? '<span class="status-badge success">ADMIN</span>' : '<span class="status-badge neutral">USER</span>';
        const actionBtn = user.isAdmin 
            ? `<button class="btn btn-secondary" onclick="setPrivileges('${user.id}', false)" style="padding: 0.3rem 0.6rem; font-size: 0.7rem; color: #ef4444;">Revoke Admin</button>`
            : `<button class="btn btn-primary" onclick="setPrivileges('${user.id}', true)" style="padding: 0.3rem 0.6rem; font-size: 0.7rem; background: #8b5cf6;">Grant Admin</button>`;
            
        return `
            <tr>
                <td><strong>${user.email}</strong></td>
                <td><code>${user.id}</code></td>
                <td>${status}</td>
                <td>${actionBtn}</td>
            </tr>
        `;
    }).join('');
}

window.setPrivileges = async (userId, isAdmin) => {
    const res = await authenticatedFetch('/api/admin/set-privileges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isAdmin })
    });
    if (res.ok) {
        showToast(`Privileges updated.`);
        fetchSystemUsers();
    }
};

function renderAdminChats() {
    if (!adminChatsTable) return;
    if (adminChats.length === 0) {
        adminChatsTable.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No active chat sessions.</td></tr>';
        return;
    }

    adminChatsTable.innerHTML = adminChats.map(session => {
        const lastMsg = session.history && session.history.length > 0 
            ? session.history[session.history.length-1].content.substring(0, 60) + '...'
            : 'No history';
        const d = new Date(session.updated_at).toLocaleString();

        return `
            <tr style="cursor: pointer;" onclick="viewChatHistoryAdmin('${session.id}')">
                <td style="font-size: 0.75rem;">${d}</td>
                <td><code>${session.chatId}</code></td>
                <td>${session.agentId}</td>
                <td style="font-size: 0.8rem; color: var(--fg-muted); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${lastMsg}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem;" onclick="event.stopPropagation()">
                         <button class="btn btn-secondary" onclick="viewChatHistoryAdmin('${session.id}')" style="padding: 0.3rem 0.6rem; font-size: 0.7rem; color: var(--fg-main);">View</button>
                         <button class="btn btn-secondary" onclick="deleteChatAdmin('${session.id}')" style="padding: 0.3rem 0.6rem; font-size: 0.7rem; color: #ef4444;">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderAdminUsers() {
    if (!adminUsersTable) return;
    adminUsersTable.innerHTML = adminUsers.map(user => {
        const d = new Date(user.lastActivity).toLocaleString();
        const banBtn = user.isBanned 
            ? `<button class="btn btn-primary" onclick="toggleBan('${user.chatId}', 'unban')" style="padding: 0.3rem 0.6rem; font-size: 0.7rem; background: #10b981; border-color: #10b981;">Unban</button>`
            : `<button class="btn btn-secondary" onclick="toggleBan('${user.chatId}', 'ban')" style="padding: 0.3rem 0.6rem; font-size: 0.7rem; color: #ef4444;">Ban User</button>`;
        
        const tgLink = user.username && user.username !== 'Anonymous' 
            ? `<a href="https://t.me/${user.username.replace('@', '')}" target="_blank" style="color: #0088cc; font-weight: 700; text-decoration: underline;">@${user.username.replace('@','')}</a>`
            : `<span style="color: var(--fg-light);">No handle</span>`;

        return `
            <tr>
                <td><strong>${user.username}</strong><br>${tgLink}</td>
                <td><code>${user.chatId}</code></td>
                <td><code>${user.ip_address || 'Telegram'}</code></td>
                <td style="font-size: 0.75rem;">${d}</td>
                <td><span class="status-badge ${user.isBanned ? 'error' : 'success'}">${user.isBanned ? 'BANNED' : 'Active'}</span></td>
                <td>${banBtn}</td>
            </tr>
        `;
    }).join('');
}

// --- ADMIN CHAT VIEWER MODAL LOGIC ---
const adminChatModal = document.getElementById('admin-chat-modal');
const adminChatLog = document.getElementById('admin-chat-log');
const adminChatTitle = document.getElementById('admin-chat-title');
const adminChatSubtitle = document.getElementById('admin-chat-subtitle');
const adminChatMeta = document.getElementById('admin-chat-meta');
const adminChatTgLink = document.getElementById('admin-chat-tg-link');

window.viewChatHistoryAdmin = (sessionId) => {
    const session = adminChats.find(s => s.id === sessionId);
    if (!session) return;
    
    // Try to find user info to enrich title
    const user = adminUsers.find(u => u.chatId.toString() === session.chatId.toString());
    const displayName = user ? `@${user.username}` : `Chat ID: ${session.chatId}`;
    
    adminChatTitle.textContent = `Dialogue with ${displayName}`;
    adminChatSubtitle.textContent = `Agent ID: ${session.agentId} • Updated: ${new Date(session.updated_at).toLocaleString()}`;
    adminChatMeta.textContent = `SESS_ID: ${session.id} | TG_ID: ${session.chatId}`;
    
    if (user && user.username && user.username !== 'Anonymous') {
        adminChatTgLink.href = `https://t.me/${user.username.replace('@', '')}`;
        adminChatTgLink.style.display = 'flex';
    } else {
        adminChatTgLink.style.display = 'none';
    }
    
    // Render History
    adminChatLog.innerHTML = '';
    if (!session.history || session.history.length === 0) {
        adminChatLog.innerHTML = '<div style="text-align: center; color: var(--fg-muted); padding: 2rem;">No message history found.</div>';
    } else {
        session.history.forEach(msg => {
            if (msg.role === 'system') {
                const sysTag = document.createElement('div');
                sysTag.style.cssText = 'align-self: center; font-size: 0.65rem; color: var(--fg-light); background: var(--bg-tertiary); padding: 2px 8px; border-radius: 4px; text-transform: uppercase; font-weight: 700;';
                sysTag.textContent = msg.content;
                adminChatLog.appendChild(sysTag);
                return;
            }
            
            const bubble = document.createElement('div');
            bubble.className = `chat-bubble ${msg.role === 'assistant' ? 'bot' : 'user'}`;
            bubble.style.cssText = 'max-width: 85%; animation: none; opacity: 1; transform: none; font-size: 0.85rem; padding: 0.75rem 1rem;';
            
            let content = msg.content;
            if (typeof content !== 'string') content = JSON.stringify(content);
            
            if (msg.role === 'assistant') {
                bubble.innerHTML = `<span class="cemoji"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5Z"></path></svg></span>${content}`;
            } else {
                bubble.innerHTML = content;
            }
            adminChatLog.appendChild(bubble);
        });
    }
    
    adminChatModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Scroll to bottom
    setTimeout(() => {
        adminChatLog.scrollTop = adminChatLog.scrollHeight;
    }, 50);
};

document.getElementById('close-admin-chat')?.addEventListener('click', () => {
    adminChatModal.classList.remove('active');
    document.body.style.overflow = '';
});
document.getElementById('admin-chat-backdrop')?.addEventListener('click', () => {
    adminChatModal.classList.remove('active');
    document.body.style.overflow = '';
});

function renderAdminAgents() {
    if (!adminAgentsTable) return;
    adminAgentsTable.innerHTML = adminAgents.map(agent => `
        <tr>
            <td><strong>${agent.name}</strong></td>
            <td style="font-size: 0.7rem; color: var(--fg-light);"><code>${agent.user_id}</code></td>
            <td>${agent.tokensUsed || 0}</td>
            <td>${agent.messagesSent || 0}</td>
            <td><span class="status-badge ${agent.isActive ? 'success' : 'neutral'}">${agent.isActive ? 'Active' : 'Offline'}</span></td>
        </tr>
    `).join('');
}

window.toggleBan = async (chatId, action) => {
    if (action === 'ban') {
        const confirmed = await showConfirm('Ban User?', `Are you sure you want to GLOBALLY ban user ${chatId}? They will be blocked from all Zentia bots.`, 'Ban', true);
        if (!confirmed) return;
    }

    try {
        const res = await authenticatedFetch('/api/admin/ban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, action })
        });
        if (res.ok) {
            showToast(`User has been ${action === 'ban' ? 'banned' : 'unbanned'}.`);
            fetchAdminData();
        }
    } catch(e) { showToast('Ban failed', 'error'); }
};

window.deleteChatAdmin = async (id) => {
    const confirmed = await showConfirm('Delete Content?', 'This will permanently remove this session/lead data from the system.', 'Delete');
    if (!confirmed) return;

    try {
        const res = await authenticatedFetch(`/api/admin/chats/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Deleted successfully');
            fetchAdminData();
        }
    } catch(e) { showToast('Delete failed', 'error'); }
};

document.querySelector('.admin-refresh-btn')?.addEventListener('click', fetchAdminData);

// Update nav click to include admin fetch
document.querySelector('.nav-view-btn[data-view="admin"]')?.addEventListener('click', () => {
    fetchAdminData();
});
// --- END ADMIN PANEL LOGIC ---

// --- Individual Chat TXT Export ---
document.getElementById('export-chat-txt-btn')?.addEventListener('click', () => {
    if (!selectedLeadId) return;
    const lead = leads.find(l => l.chatId === selectedLeadId);
    if (!lead) return;

    let content = `CHAT TRANSCRIPT: ${lead.username || 'User'} (${lead.chatId})\n`;
    content += `Agent: ${lead.agentName}\n`;
    content += `Date: ${new Date(lead.timestamp).toLocaleString()}\n`;
    content += `--------------------------------------------------\n\n`;

    lead.history.forEach(m => {
        if (m.role === 'system') return;
        const role = m.role === 'assistant' ? 'AI BOT' : 'USER';
        content += `[${role}]: ${m.content}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transcript_${lead.username || 'user'}_${selectedLeadId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    showToast('Transcript downloaded!', 'success');
});
