import express from 'express';
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

dotenv.config();

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
app.set('trust proxy', 1);

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 2000, validate: { xForwardedForHeader: false } });
const promptLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 100, validate: { xForwardedForHeader: false } });

app.use(cors());

// Global Bans
let bannedUsers = [];
async function loadGlobalBans() {
    try {
        const { data, error } = await supabase.from('global_bans').select('chat_id');
        if (!error && data) { bannedUsers = data.map(b => b.chat_id.toString()); }
    } catch(e) { console.error('Ban load error:', e); }
}

// Stripe Webhook
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).send('Stripe not configured.');
    const sig = req.headers['stripe-signature'];
    let event;
    try { event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET); } 
    catch (err) { return res.status(400).send(`Webhook Error: ${err.message}`); }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const plan = session.metadata?.plan || 'pro';
        if (userId) { await supabase.auth.admin.updateUserById(userId, { user_metadata: { plan: plan } }); }
    }
    res.json({ received: true });
});

app.use(express.json());
app.use(express.static('.'));
app.use('/api/', apiLimiter);

const upload = multer({ dest: 'uploads/' });
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const openai = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY || 'dummy' });
const agents = new Map();
const processingChats = new Set();

// Middlewares
async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No authorization header' });
    const token = authHeader.split(' ')[1];
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ error: 'Unauthorized' });
        req.user = user;
        next();
    } catch (e) { return res.status(500).json({ error: 'Auth failed' }); }
}

async function adminMiddleware(req, res, next) {
    await authMiddleware(req, res, () => {
        const adminEmails = ['toofiks.fx@gmail.com', 'emofitz@gmail.com'];
        if (adminEmails.includes(req.user.email) || req.user.user_metadata?.is_admin) { next(); } 
        else { res.status(403).json({ error: 'Admin access required' }); }
    });
}

async function superAdminMiddleware(req, res, next) {
    await authMiddleware(req, res, () => {
        if (req.user.email === 'toofiks.fx@gmail.com') { next(); } 
        else { res.status(403).json({ error: 'Super Admin access required' }); }
    });
}

// Access Helper
async function checkAccess(req, agentId) {
    const adminEmails = ['toofiks.fx@gmail.com', 'emofitz@gmail.com'];
    if (adminEmails.includes(req.user.email) || req.user.user_metadata?.is_admin) return true;
    
    // Check ownership
    const { data: agent } = await supabase.from('agents').select('user_id').eq('id', agentId).single();
    if (agent && agent.user_id === req.user.id) return true;

    // Check manager status
    const { data: manager } = await supabase.from('agent_managers').select('id').eq('agentId', agentId).eq('email', req.user.email).limit(1);
    return !!(manager && manager.length > 0);
}

// Bot Logic
async function loadAgentsFromDB() {
    try {
        const { data, error } = await supabase.from('agents').select('*');
        if (error) throw error;
        for (const agent of data) {
            agents.set(agent.id, agent);
            if (agent.isActive) startBot(agent);
        }
    } catch (e) { console.error('Load agents error:', e.message); }
}

function startBot(agent) {
    const bot = new Telegraf(agent.token);
    agent.botInstance = bot;
    bot.start((ctx) => ctx.reply('Hello!'));
    bot.on('message', async (ctx) => {
        try {
            const chatId = ctx.chat.id;
            if (bannedUsers.includes(chatId.toString())) return;
            const username = ctx.from.username || ctx.from.first_name || 'Anonymous';
            let userMessage = ctx.message.text || "[Media]";
            
            // Manual upsert for bot_users
            const { data: existing } = await supabase.from('bot_users').select('id').eq('chatId', chatId).eq('agentId', agent.id).limit(1);
            if (existing?.[0]) {
                await supabase.from('bot_users').update({ 
                    username, lastActivity: new Date().toISOString(), ip_address: 'Telegram Gateway' 
                }).eq('id', existing[0].id);
            } else {
                await supabase.from('bot_users').insert({
                    chatId, username, agentId: agent.id, agentName: agent.name,
                    lastActivity: new Date().toISOString(), user_id: agent.user_id,
                    ip_address: 'Telegram Gateway'
                });
            }

            if (!agent.isActive || processingChats.has(chatId)) return;
            processingChats.add(chatId);

            let session = { history: [] };
            const { data: sessionData } = await supabase.from('chat_sessions').select('id, history').eq('chatId', chatId).eq('agentId', agent.id).limit(1);
            let sessionId = sessionData?.[0]?.id;
            if (sessionData?.[0]) session.history = sessionData[0].history || [];

            const lastDisabled = session.history.map(m => m.content).lastIndexOf('[AI_DISABLED]');
            const lastEnabled = session.history.map(m => m.content).lastIndexOf('[AI_ENABLED]');
            if (lastDisabled > lastEnabled) { processingChats.delete(chatId); return; }

            const userMsgObj = { role: "user", content: userMessage, message_id: ctx.message.message_id };
            session.history.push(userMsgObj);
            if (session.history.length > 20) session.history = session.history.slice(-20);

            if (sessionId) {
                await supabase.from('chat_sessions').update({ history: session.history, updated_at: new Date().toISOString() }).eq('id', sessionId);
            } else {
                const { data: newSession } = await supabase.from('chat_sessions').insert({ chatId, agentId: agent.id, history: session.history }).select('id').single();
                sessionId = newSession?.id;
            }

            let placeholder = await ctx.reply('✍️...');
            const messages = [{ role: "system", content: agent.prompt }, ...session.history.filter(h => h.role !== 'system')];

            let aiResponse = "Error";
            try {
                const { data: owner } = await supabase.auth.admin.getUserById(agent.user_id);
                const key = owner?.user?.user_metadata?.openRouterKey || owner?.user?.user_metadata?.geminiKey || process.env.OPENROUTER_API_KEY;
                const activeOpenai = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: key });
                const completion = await activeOpenai.chat.completions.create({ model: agent.model, messages, max_tokens: 1000 });
                aiResponse = completion.choices[0]?.message?.content || "No response";
            } catch (e) { aiResponse = "Service unavailable."; }

            await ctx.telegram.editMessageText(chatId, placeholder.message_id, undefined, aiResponse).catch(() => ctx.reply(aiResponse));
            session.history.push({ role: "assistant", content: aiResponse });
            await supabase.from('chat_sessions').update({ history: session.history, updated_at: new Date().toISOString() }).eq('id', sessionId);
        } finally { processingChats.delete(ctx.chat.id); }
    });
    bot.launch({ dropPendingUpdates: true }).catch(() => {});
}

// --- API ROUTES ---
app.get('/api/leads', authMiddleware, async (req, res) => {
    const adminEmails = ['toofiks.fx@gmail.com', 'emofitz@gmail.com'];
    let query = supabase.from('leads').select('*');
    if (!adminEmails.includes(req.user.email) && !req.user.user_metadata?.is_admin) {
        const { data: ownedAgs } = await supabase.from('agents').select('id').eq('user_id', req.user.id);
        const { data: managedAgs } = await supabase.from('agent_managers').select('agentId').eq('email', req.user.email);
        const ids = [...(ownedAgs||[]).map(a=>a.id), ...(managedAgs||[]).map(m=>m.agentId)];
        query = query.in('agentId', ids);
    }
    const { data } = await query;
    res.json(data || []);
});

app.get('/api/users', authMiddleware, async (req, res) => {
    const adminEmails = ['toofiks.fx@gmail.com', 'emofitz@gmail.com'];
    let query = supabase.from('bot_users').select('*');
    if (!adminEmails.includes(req.user.email) && !req.user.user_metadata?.is_admin) {
        const { data: ownedAgs } = await supabase.from('agents').select('id').eq('user_id', req.user.id);
        const ids = (ownedAgs||[]).map(a=>a.id);
        query = query.in('agentId', ids);
    }
    const { data } = await query;
    const unique = []; const seen = new Set();
    (data || []).forEach(u => {
        if (!seen.has(u.chatId.toString())) { unique.push(u); seen.add(u.chatId.toString()); }
    });
    res.json(unique);
});

app.get('/api/agents', authMiddleware, async (req, res) => {
    const { data: owned } = await supabase.from('agents').select('*').eq('user_id', req.user.id);
    const { data: managed } = await supabase.from('agent_managers').select('agentId').eq('email', req.user.email);
    const managedIds = (managed || []).map(m => m.agentId);
    let all = [...(owned || [])];
    if (managedIds.length > 0) {
        const { data: managedAgs } = await supabase.from('agents').select('*').in('id', managedIds);
        all = [...all, ...(managedAgs || []).map(a => ({ ...a, isManager: true }))];
    }
    res.json(all.map(a => ({ ...a, uniqueUsers: (a.uniqueUsers || []).length })));
});

app.post('/api/leads/:chatId/message', authMiddleware, async (req, res) => {
    const { chatId } = req.params; const { message, agentId } = req.body;
    if (!await checkAccess(req, agentId)) return res.status(403).json({ error: 'Forbidden' });
    const agent = agents.get(agentId);
    if (!agent?.botInstance) return res.status(404).json({ error: 'Bot offline' });
    try {
        const sent = await agent.botInstance.telegram.sendMessage(chatId, message);
        const { data: lead } = await supabase.from('leads').select('id, history').eq('chatId', chatId).eq('agentId', agentId).single();
        if (lead) {
            const history = lead.history || [];
            history.push({ role: 'assistant', content: message, message_id: sent.message_id });
            await supabase.from('leads').update({ history }).eq('id', lead.id);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/knowledge/:agentId', authMiddleware, async (req, res) => {
    if (!await checkAccess(req, req.params.agentId)) return res.status(403).json({ error: 'Forbidden' });
    const { data } = await supabase.from('knowledge_base').select('id, filename, uploaded_at').eq('agentId', req.params.agentId);
    res.json(data || []);
});

app.get('/api/agents/:id/managers', authMiddleware, async (req, res) => {
    if (!await checkAccess(req, req.params.id)) return res.status(403).json({ error: 'Forbidden' });
    const { data } = await supabase.from('agent_managers').select('id, email, added_at').eq('agentId', req.params.id);
    res.json(data || []);
});

app.post('/api/agents', authMiddleware, async (req, res) => {
    const { id, name, token, model, prompt } = req.body;
    const agentId = id || 'agent_' + Date.now();
    const newAgent = { id: agentId, name, token, model, prompt, isActive: true, user_id: req.user.id };
    await supabase.from('agents').insert(newAgent);
    agents.set(agentId, newAgent);
    startBot(newAgent);
    res.json({ success: true, id: agentId });
});

app.put('/api/agents/:id', authMiddleware, async (req, res) => {
    if (!await checkAccess(req, req.params.id)) return res.status(403).json({ error: 'Forbidden' });
    const { name, model, prompt } = req.body;
    const agent = agents.get(req.params.id);
    if (agent) Object.assign(agent, { name, model, prompt });
    await supabase.from('agents').update({ name, model, prompt }).eq('id', req.params.id);
    res.json({ success: true });
});

app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
    try {
        const { count: ac } = await supabase.from('agents').select('*', { count: 'exact', head: true });
        const { data: usersData } = await supabase.from('bot_users').select('chatId');
        const uniqueUsersCount = new Set((usersData || []).map(u => u.chatId.toString())).size;
        const { count: lc } = await supabase.from('leads').select('*', { count: 'exact', head: true });
        res.json({ agents: ac, users: uniqueUsersCount, leads: lc, banned: bannedUsers.length });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/agents', adminMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase.from('agents').select('*').order('tokensUsed', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', adminMiddleware, async (req, res) => {
    const { data } = await supabase.from('bot_users').select('*').order('lastActivity', { ascending: false });
    res.json((data || []).map(u => ({ ...u, isBanned: bannedUsers.includes(u.chatId.toString()) })));
});

app.get('/api/admin/chats', adminMiddleware, async (req, res) => {
    const { data } = await supabase.from('chat_sessions').select('*').order('updated_at', { ascending: false }).limit(200);
    res.json(data || []);
});

app.post('/api/admin/ban', adminMiddleware, async (req, res) => {
    const { chatId, action } = req.body; const idStr = chatId.toString();
    if (action === 'ban') {
        await supabase.from('global_bans').upsert({ chat_id: idStr });
        if (!bannedUsers.includes(idStr)) bannedUsers.push(idStr);
    } else {
        await supabase.from('global_bans').delete().eq('chat_id', idStr);
        bannedUsers = bannedUsers.filter(id => id !== idStr);
    }
    res.json({ success: true });
});

app.get('/api/admin/system-users', superAdminMiddleware, async (req, res) => {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    res.json((users || []).map(u => ({ id: u.id, email: u.email, isAdmin: !!u.user_metadata?.is_admin })));
});

app.post('/api/admin/set-privileges', superAdminMiddleware, async (req, res) => {
    const { userId, isAdmin } = req.body;
    await supabase.auth.admin.updateUserById(userId, { user_metadata: { is_admin: isAdmin } });
    res.json({ success: true });
});

app.delete('/api/admin/chats/:id', adminMiddleware, async (req, res) => {
    await supabase.from('chat_sessions').delete().eq('id', req.params.id);
    await supabase.from('leads').delete().eq('id', req.params.id);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[Server] ${PORT}`);
    await loadAgentsFromDB();
    await loadGlobalBans();
});

process.once('SIGINT', () => { agents.forEach(a => a.botInstance?.stop('SIGINT')); process.exit(); });
process.once('SIGTERM', () => { agents.forEach(a => a.botInstance?.stop('SIGTERM')); process.exit(); });
