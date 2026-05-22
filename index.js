import express from 'express';
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

const upload = multer({ dest: 'uploads/' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY || 'dummy' });
const agents = new Map(); 
const processingChats = new Set();
let bannedUsers = [];

function chunkText(text, chunkSize = 1000, overlap = 200) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        chunks.push(text.slice(i, i + chunkSize));
        i += chunkSize - overlap;
    }
    return chunks;
}

async function loadGlobalBans() {
    try {
        const { data, error } = await supabase.from('global_bans').select('chat_id');
        if (!error && data) { bannedUsers = data.map(b => b.chat_id.toString()); }
    } catch(e) { console.error('Ban load error:', e); }
}

async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing header' });
    try {
        const { data: { user }, error } = await supabase.auth.getUser(authHeader.split(' ')[1]);
        if (error || !user) return res.status(401).json({ error: 'Unauthorized' });
        req.user = user; next();
    } catch (e) { return res.status(500).json({ error: 'Auth failed' }); }
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
        
        // Manual upsert for bot_users
        try {
            const { data: existing } = await supabase.from('bot_users').select('id').eq('chatId', chatId).eq('agentId', agent.id).limit(1);
            if (existing?.[0]) {
                await supabase.from('bot_users').update({ username: ctx.from.username || 'Anon', lastActivity: new Date().toISOString(), ip_address: 'Telegram Gateway' }).eq('id', existing[0].id);
            } else {
                await supabase.from('bot_users').insert({ chatId, username: ctx.from.username || 'Anon', agentId: agent.id, agentName: agent.name, user_id: agent.user_id, ip_address: 'Telegram Gateway' });
            }
        } catch(e) {}

        if (!agent.isActive || processingChats.has(chatId)) return;
        processingChats.add(chatId);

        try {
            const { data: sess } = await supabase.from('chat_sessions').select('id, history').eq('chatId', chatId).eq('agentId', agent.id).limit(1);
            let history = sess?.[0]?.history || [];
            
            const lastDisabled = history.map(m => m.content).lastIndexOf('[AI_DISABLED]');
            const lastEnabled = history.map(m => m.content).lastIndexOf('[AI_ENABLED]');
            if (lastDisabled > lastEnabled) return;

            history.push({ role: "user", content: userMessage, timestamp: new Date().toISOString() });
            if (history.length > 20) history = history.slice(-20);

            const { data: owner } = await supabase.auth.admin.getUserById(agent.user_id);
            const key = owner?.user?.user_metadata?.openRouterKey || process.env.OPENROUTER_API_KEY;
            const geminiKey = owner?.user?.user_metadata?.geminiKey || process.env.GEMINI_API_KEY;

            // RAG Vector Search
            let ragContext = "";
            if (geminiKey) {
                try {
                    const genAI = new GoogleGenerativeAI(geminiKey);
                    const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
                    const result = await embedModel.embedContent(userMessage);
                    const queryEmbedding = result.embedding.values;
                    
                    const { data: chunks } = await supabase.rpc('match_knowledge', {
                        query_embedding: queryEmbedding,
                        match_threshold: 0.70,
                        match_count: 3,
                        p_agent_id: agent.id
                    });

                    if (chunks && chunks.length > 0) {
                        ragContext = "\n\nKNOWLEDGE BASE CONTEXT (Use this to answer questions):\n" + chunks.map(c => c.content).join("\n\n");
                    }
                } catch(e) { console.error('[Vector DB] Search error:', e.message); }
            }
            
            const completion = await (new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: key })).chat.completions.create({ 
                model: agent.model, 
                messages: [{ role: "system", content: agent.prompt + ragContext }, ...history.filter(m => m.role !== 'system')], 
                max_tokens: 1000 
            });
            const aiResponse = completion.choices[0]?.message?.content || "No response";
            await ctx.reply(aiResponse);
            
            history.push({ role: "assistant", content: aiResponse, timestamp: new Date().toISOString() });

            if (sess?.[0]) await supabase.from('chat_sessions').update({ history, updated_at: new Date().toISOString() }).eq('id', sess[0].id);
            else await supabase.from('chat_sessions').insert({ chatId, agentId: agent.id, history });

            let status = null;
            if (aiResponse.includes('[MEETING_BOOKED]')) status = 'Meeting Booked';
            else if (aiResponse.includes('[LEAD_QUALIFIED]')) status = 'Qualified';

            if (status) {
                await supabase.from('leads').upsert({ chatId, username: ctx.from.username || 'Anon', agentId: agent.id, agentName: agent.name, history, status, lastMessage: aiResponse, timestamp: new Date().toISOString(), user_id: agent.user_id }, { onConflict: 'chatId, agentId' });
                
                // Trigger Webhook if configured
                if (agent.analytics && agent.analytics.webhookUrl) {
                    try {
                        const payload = {
                            event: 'lead_status_changed',
                            agent_id: agent.id,
                            agent_name: agent.name,
                            lead: {
                                chat_id: chatId,
                                username: ctx.from.username || 'Anon',
                                status: status,
                                last_message: aiResponse,
                                history: history
                            },
                            timestamp: new Date().toISOString()
                        };
                        fetch(agent.analytics.webhookUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        }).catch(err => console.error(`[Webhook] Failed to send to ${agent.analytics.webhookUrl}:`, err.message));
                    } catch(e) {
                        console.error('[Webhook] Exception:', e.message);
                    }
                }
            }
        } catch (e) { console.error('Bot Error:', e); } 
        finally { processingChats.delete(chatId); }
    });
    bot.launch({ dropPendingUpdates: true }).catch(() => {});
}

async function loadAgentsFromDB() {
    const { data } = await supabase.from('agents').select('*');
    if (data) data.forEach(a => { agents.set(a.id, a); if (a.isActive) startBot(a); });
}

// --- API ---
app.get('/api/leads', authMiddleware, async (req, res) => {
    try {
        const admins = ['toofiks.fx@gmail.com', 'emofitz@gmail.com'];
        let query = supabase.from('leads').select('*');
        query = query.or('status.eq.Qualified,status.eq.Meeting Booked');

        if (!admins.includes(req.user.email) && !req.user.user_metadata?.is_admin) {
            const { data: owned } = await supabase.from('agents').select('id').eq('user_id', req.user.id);
            const { data: managed } = await supabase.from('agent_managers').select('agentId').eq('email', req.user.email);
            const ids = [...(owned || []).map(a => a.id), ...(managed || []).map(m => m.agentId)];
            
            if (ids.length === 0) return res.json([]);
            query = query.in('agentId', ids);
        }
        
        const { data } = await query.order('timestamp', { ascending: false });
        res.json(data || []);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users', authMiddleware, async (req, res) => {
    const admins = ['toofiks.fx@gmail.com', 'emofitz@gmail.com'];
    let query = supabase.from('bot_users').select('*');

    if (!admins.includes(req.user.email) && !req.user.user_metadata?.is_admin) {
        const { data: owned } = await supabase.from('agents').select('id').eq('user_id', req.user.id);
        const { data: managed } = await supabase.from('agent_managers').select('agentId').eq('email', req.user.email);
        const ids = [...(owned || []).map(a => a.id), ...(managed || []).map(m => m.agentId)];
        
        if (ids.length === 0) return res.json([]);
        query = query.in('agentId', ids);
    }
    
    const { data } = await query;
    const unique = []; const seen = new Set();
    (data || []).forEach(u => { 
        const idStr = u.chatId.toString();
        if (!seen.has(idStr)) { unique.push(u); seen.add(idStr); } 
    });
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

app.post('/api/agents', authMiddleware, async (req, res) => {
    const { id, name, token, model, prompt, payment, webhookUrl, googleSheetsUrl, removeBranding, calendarUrl } = req.body;
    const agentId = id || 'agent_' + Date.now();
    const analytics = { webhookUrl, googleSheetsUrl, removeBranding, calendarUrl };
    const newAgent = { id: agentId, name, token, model, prompt, payment, analytics, isActive: true, user_id: req.user.id };
    await supabase.from('agents').insert(newAgent);
    agents.set(agentId, newAgent);
    startBot(newAgent);
    res.json({ success: true, id: agentId });
});

app.put('/api/agents/:id', authMiddleware, async (req, res) => {
    if (!await checkAccess(req, req.params.id)) return res.status(403).send('Forbidden');    
    const { name, model, prompt, payment, webhookUrl, googleSheetsUrl, removeBranding, calendarUrl, isActive } = req.body;
    const agent = agents.get(req.params.id);
    if (agent) {
        const analytics = { ...agent.analytics, webhookUrl, googleSheetsUrl, removeBranding, calendarUrl };
        Object.assign(agent, { name, model, prompt, payment, analytics });
        if (isActive !== undefined) {
            agent.isActive = isActive;
            if (isActive) startBot(agent); else agent.botInstance?.stop();
        }
        await supabase.from('agents').update({ name, model, prompt, payment, analytics, isActive: agent.isActive }).eq('id', req.params.id);
    }
    res.json({ success: true });
});
app.delete('/api/agents/:id', authMiddleware, async (req, res) => {
    const agent = agents.get(req.params.id);
    if (agent && agent.user_id === req.user.id) {
        agent.botInstance?.stop(); agents.delete(agent.id);
        await supabase.from('agents').delete().eq('id', req.params.id);
        res.json({ success: true });
    } else res.status(403).send('Forbidden');
});

app.post('/api/leads/:chatId/message', authMiddleware, async (req, res) => {
    if (!await checkAccess(req, req.body.agentId)) return res.status(403).json({ error: 'Forbidden' });
    const agent = agents.get(req.body.agentId);
    if (!agent?.botInstance) return res.status(404).json({ error: 'Bot offline' });
    try {
        const sent = await agent.botInstance.telegram.sendMessage(req.params.chatId, req.body.message);
        
        // Update Leads History
        const { data: lead } = await supabase.from('leads').select('history').eq('chatId', req.params.chatId).eq('agentId', req.body.agentId).single();
        if (lead) {
            const history = [...(lead.history || []), { role: 'assistant', content: req.body.message, timestamp: new Date().toISOString() }];
            await supabase.from('leads').update({ history, lastMessage: req.body.message, timestamp: new Date().toISOString() }).eq('chatId', req.params.chatId).eq('agentId', req.body.agentId);
        }

        // Update Chat Sessions History
        const { data: sess } = await supabase.from('chat_sessions').select('id, history').eq('chatId', req.params.chatId).eq('agentId', req.body.agentId).single();
        if (sess) {
            const history = [...(sess.history || []), { role: 'assistant', content: req.body.message, timestamp: new Date().toISOString() }];
            await supabase.from('chat_sessions').update({ history, updated_at: new Date().toISOString() }).eq('id', sess.id);
        }

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leads/:chatId/suggest', authMiddleware, async (req, res) => {
    if (!await checkAccess(req, req.body.agentId)) return res.status(403).json({ error: 'Forbidden' });
    const agent = agents.get(req.body.agentId);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    try {
        const { data: lead } = await supabase.from('leads').select('history').eq('chatId', req.params.chatId).eq('agentId', req.body.agentId).single();
        if (!lead || !lead.history) return res.status(400).json({ error: 'No history found' });

        const history = lead.history.filter(m => m.role !== 'system');
        const messages = [
            { role: "system", content: `${agent.prompt}\n\nINSTRUCTION FOR THIS REQUEST: You are an AI assistant helping a human sales representative. Review the following conversation history and generate ONE short, highly effective, and natural-sounding response that the human representative should send next. ONLY output the suggested message text, with no surrounding quotes or explanations.` },
            ...history
        ];

        const { data: owner } = await supabase.auth.admin.getUserById(agent.user_id);
        const key = owner?.user?.user_metadata?.openRouterKey || process.env.OPENROUTER_API_KEY;
        const activeOpenai = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: key });
        const completion = await activeOpenai.chat.completions.create({ model: agent.model, messages, max_tokens: 200 });
        
        const suggestion = completion.choices[0]?.message?.content || "Could not generate suggestion.";
        res.json({ success: true, suggestion });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/leads/:chatId/ai-toggle', authMiddleware, async (req, res) => {
    const { chatId } = req.params; const { agentId, aiDisabled } = req.body;
    if (!await checkAccess(req, agentId)) return res.status(403).json({ error: 'Forbidden' });
    
    const { data: lead } = await supabase.from('leads').select('id, history').eq('chatId', chatId).eq('agentId', agentId).single();
    if (lead) {
        const history = [...(lead.history || []), { role: 'system', content: aiDisabled ? '[AI_DISABLED]' : '[AI_ENABLED]' }];
        await supabase.from('leads').update({ history }).eq('chatId', chatId).eq('agentId', agentId);
    }
    const { data: sess } = await supabase.from('chat_sessions').select('id, history').eq('chatId', chatId).eq('agentId', agentId).single();
    if (sess) {
        const history = [...(sess.history || []), { role: 'system', content: aiDisabled ? '[AI_DISABLED]' : '[AI_ENABLED]' }];
        await supabase.from('chat_sessions').update({ history }).eq('chatId', chatId).eq('agentId', agentId);
    }
    res.json({ success: true });
});

// Managers & KB
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

app.get('/api/knowledge/:agentId', authMiddleware, async (req, res) => {
    if (!await checkAccess(req, req.params.agentId)) return res.status(403).send('Forbidden');
    const { data } = await supabase.from('knowledge_base').select('id, filename, uploaded_at').eq('agentId', req.params.agentId);
    res.json(data || []);
});
app.post('/api/knowledge/:agentId', authMiddleware, upload.single('file'), async (req, res) => {
    if (!await checkAccess(req, req.params.agentId)) return res.status(403).send('Forbidden');
    const file = req.file; if (!file) return res.status(400).send('No file');
    try {
        let content = '';
        if (file.mimetype === 'application/pdf') {
            const dataBuffer = await fsPromises.readFile(file.path);
            const data = await pdfParse(dataBuffer); content = data.text;
        } else content = await fsPromises.readFile(file.path, 'utf8');
        await fsPromises.unlink(file.path);
        
        // Insert main document record
        const { data: kbDoc, error: kbErr } = await supabase.from('knowledge_base')
            .insert({ agentId: req.params.agentId, filename: file.originalname, content: 'Vectorized Document', user_id: req.user.id })
            .select('id').single();
            
        if (kbErr) throw kbErr;

        // Process Vectors with Gemini
        const owner = await supabase.auth.admin.getUserById(req.user.id);
        const geminiKey = owner?.data?.user?.user_metadata?.geminiKey || process.env.GEMINI_API_KEY;
        
        if (geminiKey) {
            const genAI = new GoogleGenerativeAI(geminiKey);
            const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
            const chunks = chunkText(content);
            
            for (const chunk of chunks) {
                if (chunk.trim().length < 10) continue;
                try {
                    const result = await embedModel.embedContent(chunk);
                    const embedding = result.embedding.values;
                    await supabase.from('knowledge_chunks').insert({
                        "agentId": req.params.agentId,
                        document_id: kbDoc.id,
                        content: chunk,
                        embedding: embedding,
                        user_id: req.user.id
                    });
                } catch (embedErr) {
                    console.error('[Vector DB] Failed to embed chunk:', embedErr.message);
                }
            }
        }

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/knowledge/:id', authMiddleware, async (req, res) => {
    const { data: kb } = await supabase.from('knowledge_base').select('agentId').eq('id', req.params.id).single();
    if (!kb || !await checkAccess(req, kb.agentId)) return res.status(403).send('Forbidden');
    await supabase.from('knowledge_base').delete().eq('id', req.params.id);
    res.json({ success: true });
});

// Admin
async function adminMiddleware(req, res, next) {
    const admins = ['toofiks.fx@gmail.com', 'emofitz@gmail.com'];
    if (admins.includes(req.user.email) || req.user.user_metadata?.is_admin) next();
    else res.status(403).json({ error: 'Admin access required' });
}

app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { count: ac } = await supabase.from('agents').select('*', { count: 'exact', head: true });
        const { data: users } = await supabase.from('bot_users').select('chatId');
        const unique = new Set((users||[]).map(u=>u.chatId.toString())).size;
        const { count: lc } = await supabase.from('leads').select('*', { count: 'exact', head: true });
        res.json({ agents: ac, users: unique, leads: lc, banned: bannedUsers.length });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/agents', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase.from('agents').select('*').order('tokensUsed', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase.from('bot_users').select('*').order('lastActivity', { ascending: false });
        if (error) throw error;
        res.json((data || []).map(u => ({ ...u, isBanned: bannedUsers.includes(u.chatId.toString()) })));
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/chats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase.from('chat_sessions').select('*').order('updated_at', { ascending: false }).limit(200);
        if (error) throw error;
        res.json(data || []);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/ban', authMiddleware, adminMiddleware, async (req, res) => {
    const { chatId, action } = req.body; const idStr = chatId.toString();
    if (action === 'ban') { await supabase.from('global_bans').upsert({ chat_id: idStr }); if (!bannedUsers.includes(idStr)) bannedUsers.push(idStr); }
    else { await supabase.from('global_bans').delete().eq('chat_id', idStr); bannedUsers = bannedUsers.filter(id => id !== idStr); }
    res.json({ success: true });
});

app.get('/api/admin/system-users', authMiddleware, async (req, res) => {
    if (req.user.email !== 'toofiks.fx@gmail.com') return res.status(403).json({ error: 'Forbidden' });
    const { data: { users } } = await supabase.auth.admin.listUsers();
    res.json((users || []).map(u => ({ id: u.id, email: u.email, isAdmin: !!u.user_metadata?.is_admin })));
});

app.post('/api/admin/set-privileges', authMiddleware, async (req, res) => {
    if (req.user.email !== 'toofiks.fx@gmail.com') return res.status(403).json({ error: 'Forbidden' });
    await supabase.auth.admin.updateUserById(req.body.userId, { user_metadata: { is_admin: req.body.isAdmin } });
    res.json({ success: true });
});

app.delete('/api/admin/chats/:id', authMiddleware, adminMiddleware, async (req, res) => {
    await supabase.from('chat_sessions').delete().eq('id', req.params.id);
    await supabase.from('leads').delete().eq('id', req.params.id);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[Server] Running on port ${PORT}`);
    await loadAgentsFromDB(); await loadGlobalBans();
});

process.once('SIGINT', () => { agents.forEach(a => a.botInstance?.stop('SIGINT')); process.exit(); });
process.once('SIGTERM', () => { agents.forEach(a => a.botInstance?.stop('SIGTERM')); process.exit(); });
