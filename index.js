import express from 'express';
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
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

const apiLimiter = rateLimit({ windowMs: 15*60*1000, max: 2000, validate:{xForwardedForHeader:false} });
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY || 'dummy' });
const agents = new Map(); 
const processingChats = new Set();
let bannedUsers = [];

async function loadGlobalBans() {
    const { data } = await supabase.from('global_bans').select('chat_id');
    if (data) bannedUsers = data.map(b => b.chat_id.toString());
}

async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing header' });
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.split(' ')[1]);
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user; next();
}

async function checkAccess(req, agentId) {
    const admins = ['toofiks.fx@gmail.com', 'emofitz@gmail.com'];
    if (admins.includes(req.user.email) || req.user.user_metadata?.is_admin) return true;
    const { data: agent } = await supabase.from('agents').select('user_id').eq('id', agentId).single();
    if (agent?.user_id === req.user.id) return true;
    const { data: mgr } = await supabase.from('agent_managers').select('id').eq('agentId', agentId).eq('email', req.user.email).limit(1);
    return !!(mgr && mgr.length > 0);
}

function startBot(agent) {
    const bot = new Telegraf(agent.token); agent.botInstance = bot;
    bot.on('message', async (ctx) => {
        const chatId = ctx.chat.id.toString();
        if (bannedUsers.includes(chatId)) return;
        const userMessage = ctx.message.text || "[Media]";
        await supabase.from('bot_users').upsert({ chatId, username: ctx.from.username || 'Anon', agentId: agent.id, agentName: agent.name, lastActivity: new Date().toISOString(), user_id: agent.user_id, ip_address: 'TG_GATEWAY' }, { onConflict: 'chatId, agentId' });
        if (!agent.isActive || processingChats.has(chatId)) return;
        processingChats.add(chatId);
        try {
            const { data: sess } = await supabase.from('chat_sessions').select('id, history').eq('chatId', chatId).eq('agentId', agent.id).limit(1);
            let history = sess?.[0]?.history || [];
            history.push({ role: "user", content: userMessage });
            const { data: owner } = await supabase.auth.admin.getUserById(agent.user_id);
            const key = owner?.user?.user_metadata?.openRouterKey || process.env.OPENROUTER_API_KEY;
            const completion = await (new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: key })).chat.completions.create({ model: agent.model, messages: [{ role: "system", content: agent.prompt }, ...history.slice(-10)], max_tokens: 1000 });
            const aiResponse = completion.choices[0]?.message?.content || "No response";
            await ctx.reply(aiResponse);
            history.push({ role: "assistant", content: aiResponse });
            if (sess?.[0]) await supabase.from('chat_sessions').update({ history, updated_at: new Date().toISOString() }).eq('id', sess[0].id);
            else await supabase.from('chat_sessions').insert({ chatId, agentId: agent.id, history });
            // Lead qualification
            if (aiResponse.includes('[LEAD_QUALIFIED]') || aiResponse.includes('[MEETING_BOOKED]')) {
                await supabase.from('leads').upsert({ chatId, username: ctx.from.username || 'Anon', agentId: agent.id, agentName: agent.name, history, status: aiResponse.includes('[MEETING_BOOKED]') ? 'Meeting Booked' : 'Qualified', lastMessage: aiResponse, timestamp: new Date().toISOString(), user_id: agent.user_id }, { onConflict: 'chatId, agentId' });
            }
        } finally { processingChats.delete(chatId); }
    });
    bot.launch({ dropPendingUpdates: true }).catch(() => {});
}

async function loadAgentsFromDB() {
    const { data } = await supabase.from('agents').select('*');
    if (data) data.forEach(a => { agents.set(a.id, a); if (a.isActive) startBot(a); });
}

// --- API ---
app.get('/api/leads', authMiddleware, async (req, res) => {
    const admins = ['toofiks.fx@gmail.com', 'emofitz@gmail.com'];
    let query = supabase.from('leads').select('*');
    if (!admins.includes(req.user.email) && !req.user.user_metadata?.is_admin) query = query.eq('user_id', req.user.id);
    const { data } = await query; res.json(data || []);
});

app.get('/api/users', authMiddleware, async (req, res) => {
    const admins = ['toofiks.fx@gmail.com', 'emofitz@gmail.com'];
    let query = supabase.from('bot_users').select('*');
    if (!admins.includes(req.user.email) && !req.user.user_metadata?.is_admin) query = query.eq('user_id', req.user.id);
    const { data } = await query;
    const unique = []; const seen = new Set();
    (data || []).forEach(u => { if (!seen.has(u.chatId)) { unique.push(u); seen.add(u.chatId); } });
    res.json(unique);
});

app.get('/api/agents', authMiddleware, async (req, res) => {
    const { data: owned } = await supabase.from('agents').select('*').eq('user_id', req.user.id);
    const { data: managed } = await supabase.from('agent_managers').select('agentId').eq('email', req.user.email);
    let all = [...(owned || [])];
    if (managed?.length > 0) {
        const { data: m } = await supabase.from('agents').select('*').in('id', managed.map(x=>x.agentId));
        all = [...all, ...(m || []).map(a => ({ ...a, isManager: true }))];
    }
    res.json(all.map(a => ({ ...a, uniqueUsers: (a.uniqueUsers || []).length })));
});

app.post('/api/leads/:chatId/message', authMiddleware, async (req, res) => {
    if (!await checkAccess(req, req.body.agentId)) return res.status(403).send('Forbidden');
    const agent = agents.get(req.body.agentId);
    if (!agent?.botInstance) return res.status(404).send('Bot offline');
    await agent.botInstance.telegram.sendMessage(req.params.chatId, req.body.message);
    const { data: lead } = await supabase.from('leads').select('history').eq('chatId', req.params.chatId).eq('agentId', req.body.agentId).single();
    if (lead) await supabase.from('leads').update({ history: [...(lead.history || []), { role: 'assistant', content: req.body.message }] }).eq('chatId', req.params.chatId).eq('agentId', req.body.agentId);
    res.json({ success: true });
});

app.get('/api/knowledge/:agentId', authMiddleware, async (req, res) => {
    if (!await checkAccess(req, req.params.agentId)) return res.status(403).send('Forbidden');
    const { data } = await supabase.from('knowledge_base').select('id, filename, uploaded_at').eq('agentId', req.params.agentId);
    res.json(data || []);
});

app.get('/api/agents/:id/managers', authMiddleware, async (req, res) => {
    if (!await checkAccess(req, req.params.id)) return res.status(403).send('Forbidden');
    const { data } = await supabase.from('agent_managers').select('*').eq('agentId', req.params.id);
    res.json(data || []);
});

app.post('/api/agents/:id/managers', authMiddleware, async (req, res) => {
    if (!await checkAccess(req, req.params.id)) return res.status(403).send('Forbidden');
    await supabase.from('agent_managers').insert({ agentId: req.params.id, email: req.body.email });
    res.json({ success: true });
});

app.delete('/api/agents/:agentId/managers/:id', authMiddleware, async (req, res) => {
    if (!await checkAccess(req, req.params.agentId)) return res.status(403).send('Forbidden');
    await supabase.from('agent_managers').delete().eq('id', req.params.id);
    res.json({ success: true });
});

// Admin
async function adminMiddleware(req, res, next) {
    const admins = ['toofiks.fx@gmail.com', 'emofitz@gmail.com'];
    if (admins.includes(req.user.email) || req.user.user_metadata?.is_admin) next();
    else res.status(403).send('Forbidden');
}

app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
    const { count: ac } = await supabase.from('agents').select('*', { count: 'exact', head: true });
    const { data: users } = await supabase.from('bot_users').select('chatId');
    const unique = new Set((users||[]).map(u=>u.chatId.toString())).size;
    const { count: lc } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    res.json({ agents: ac, users: unique, leads: lc, banned: bannedUsers.length });
});

app.get('/api/admin/agents', adminMiddleware, async (req, res) => {
    const { data } = await supabase.from('agents').select('*').order('tokensUsed', { ascending: false });
    res.json(data || []);
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
    if (action === 'ban') { await supabase.from('global_bans').upsert({ chat_id: idStr }); if (!bannedUsers.includes(idStr)) bannedUsers.push(idStr); }
    else { await supabase.from('global_bans').delete().eq('chat_id', idStr); bannedUsers = bannedUsers.filter(id => id !== idStr); }
    res.json({ success: true });
});

app.get('/api/admin/system-users', authMiddleware, async (req, res) => {
    if (req.user.email !== 'toofiks.fx@gmail.com') return res.status(403).send('Forbidden');
    const { data: { users } } = await supabase.auth.admin.listUsers();
    res.json((users || []).map(u => ({ id: u.id, email: u.email, isAdmin: !!u.user_metadata?.is_admin })));
});

app.post('/api/admin/set-privileges', authMiddleware, async (req, res) => {
    if (req.user.email !== 'toofiks.fx@gmail.com') return res.status(403).send('Forbidden');
    await supabase.auth.admin.updateUserById(req.body.userId, { user_metadata: { is_admin: req.body.isAdmin } });
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
    await loadAgentsFromDB(); await loadGlobalBans();
});
