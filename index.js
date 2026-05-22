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
app.set('trust proxy', 1); // trust first proxy for ngrok (Crucial for rate limiters)

// Rate limiting setup
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000, // Increased significantly for ngrok/local testing
    validate: { xForwardedForHeader: false },
    message: { error: 'Too many requests, please try again later.' }
});

const promptLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // limit prompt generation heavily to prevent abuse
    validate: { xForwardedForHeader: false },
    message: { error: 'Prompt generation limit reached. Try again in an hour.' }
});

app.use(cors());

// Global Bans state (Loaded from DB)
let bannedUsers = [];
async function loadGlobalBans() {
    try {
        const { data, error } = await supabase.from('global_bans').select('chat_id');
        if (!error && data) {
            bannedUsers = data.map(b => b.chat_id.toString());
            console.log(`[Moderation] Loaded ${bannedUsers.length} bans from database.`);
        }
    } catch(e) { console.error('Ban load error:', e); }
}

// Stripe Webhook MUST use express.raw before express.json() is applied globally
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
        return res.status(400).send('Stripe is not configured.');
    }

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`[Stripe] Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.client_reference_id; // We will pass user.id here when creating the session
        const plan = session.metadata?.plan || 'pro';

        if (userId) {
            console.log(`[Stripe] Payment success for user ${userId}. Upgrading to ${plan.toUpperCase()}.`);
            try {
                // Supabase admin client is needed to update user metadata
                await supabase.auth.admin.updateUserById(userId, {
                    user_metadata: { plan: plan }
                });
            } catch (updateErr) {
                console.error(`[Stripe] Failed to update user plan:`, updateErr.message);
            }
        }
    }

    res.json({ received: true });
});

app.use(express.json());
app.use(express.static('.'));
app.use('/api/', apiLimiter); // Apply general limit to all API routes

const upload = multer({ dest: 'uploads/' });

const openRouterKey = process.env.OPENROUTER_API_KEY;
if (!openRouterKey) {
    console.error('CRITICAL ERROR: OPENROUTER_API_KEY is missing in .env');
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error('CRITICAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: openRouterKey || 'dummy',
});

const agents = new Map(); // Store in-memory bot instances
const processingChats = new Set(); // Prevent race conditions

async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No authorization header' });
    const token = authHeader.split(' ')[1];
    
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        req.user = user;
        next();
    } catch (e) {
        console.error(`[Auth] Middleware Error:`, e.message);
        return res.status(500).json({ error: 'Authentication service unavailable' });
    }
}

async function loadAgentsFromDB() {
    try {
        const { data, error } = await supabase.from('agents').select('*');
        if (error) throw error;
        
        for (const agent of data) {
            agents.set(agent.id, agent);
            if (agent.isActive) {
                startBot(agent);
            }
        }
        console.log(`[Storage] Resumed ${agents.size} agents from Supabase.`);
    } catch (e) {
        console.error('[Storage] Error loading agents:', e.message);
    }
}

async function updateAgentInDB(agent) {
    const { botInstance, ...agentData } = agent;
    await supabase.from('agents').update(agentData).eq('id', agent.id);
}

function startBot(agent) {
    console.log(`[Bot ${agent.id}] Starting bot...`);
    const bot = new Telegraf(agent.token);
    agent.botInstance = bot;

    bot.start((ctx) => ctx.reply('Hello! I am your AI assistant.').catch(e => {}));

    bot.on('message', async (ctx) => {
        try {
            const chatId = ctx.chat.id;
            
            // Global Ban Check
            if (bannedUsers.includes(chatId.toString())) {
                console.log(`[Bot ${agent.id}] Ignored banned user: ${chatId}`);
                return;
            }

            const username = ctx.from.username || ctx.from.first_name || 'Anonymous';
            let userMessage = '';
            let messageContent = [];

            if (ctx.message.text) {
                userMessage = ctx.message.text;
                messageContent = userMessage;
            } else if (ctx.message.voice) {
                // Transcription logic omitted for brevity, but could be restored
                userMessage = "[Voice Message]";
                messageContent = userMessage;
            } else if (ctx.message.photo) {
                userMessage = ctx.message.caption || "[Photo]";
                messageContent = userMessage;
            } else return;

            // Tracking with IP (Telegram doesn't provide user IP, but we store placeholder)
            const userData = {
                chatId, username, agentId: agent.id, agentName: agent.name,
                lastActivity: new Date().toISOString(), user_id: agent.user_id,
                ip_address: 'Telegram Proxy'
            };
            
            const { data: existingUser } = await supabase.from('bot_users').select('id').eq('chatId', chatId).eq('agentId', agent.id).limit(1);
            if (existingUser && existingUser.length > 0) {
                await supabase.from('bot_users').update(userData).eq('id', existingUser[0].id);
            } else {
                await supabase.from('bot_users').insert(userData);
            }

            if (!agent.isActive) return;
            if (processingChats.has(chatId)) return;
            processingChats.add(chatId);

            let session = { history: [] };
            let sessionId = null;
            const { data: sessionData } = await supabase.from('chat_sessions').select('id, history').eq('chatId', chatId).eq('agentId', agent.id).limit(1);
            if (sessionData && sessionData.length > 0) {
                session.history = sessionData[0].history || [];
                sessionId = sessionData[0].id;
            }

            const lastDisabled = session.history.map(m => m.content).lastIndexOf('[AI_DISABLED]');
            const lastEnabled = session.history.map(m => m.content).lastIndexOf('[AI_ENABLED]');
            if (lastDisabled > lastEnabled) {
                processingChats.delete(chatId);
                return;
            }

            const userMsgObj = { role: "user", content: userMessage, message_id: ctx.message.message_id };
            session.history.push(userMsgObj);
            if (session.history.length > 20) session.history = session.history.slice(-20);

            if (sessionId) {
                await supabase.from('chat_sessions').update({ history: session.history, updated_at: new Date().toISOString() }).eq('id', sessionId);
            } else {
                const { data: newSession } = await supabase.from('chat_sessions').insert({ chatId, agentId: agent.id, history: session.history }).select('id').single();
                if (newSession) sessionId = newSession.id;
            }

            // Lead immediate save
            try {
                const { data: earlyLeads } = await supabase.from('leads').select('id, history').eq('chatId', chatId).eq('agentId', agent.id).limit(1);
                if (earlyLeads && earlyLeads.length > 0) {
                    const leadHistory = [...(earlyLeads[0].history || []), userMsgObj];
                    await supabase.from('leads').update({ history: leadHistory, lastMessage: userMessage, timestamp: new Date().toISOString() }).eq('id', earlyLeads[0].id);
                }
            } catch (e) {}

            let placeholder;
            try {
                placeholder = await ctx.reply('✍️...');
                
                const messages = [
                    { role: "system", content: agent.prompt },
                    ...session.history.filter(h => h.role !== 'system'),
                    { role: "user", content: userMessage }
                ];

                let aiResponse = "No response.";
                let success = false;
                let lastError = null;

                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        const { data: ownerData } = await supabase.auth.admin.getUserById(agent.user_id);
                        const meta = ownerData?.user?.user_metadata || {};
                        const key = meta.openRouterKey || meta.geminiKey || process.env.OPENROUTER_API_KEY;
                        
                        if (!key) throw new Error("API_KEY_MISSING");

                        const activeOpenai = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: key });
                        const completion = await activeOpenai.chat.completions.create({ model: agent.model, messages, max_tokens: 1000 });
                        aiResponse = completion.choices[0]?.message?.content || "No response.";
                        success = true; break;
                    } catch (e) { 
                        lastError = e; 
                        if (attempt < 3) await new Promise(r => setTimeout(r, 1000)); 
                    }
                }

                if (!success) throw new Error(lastError?.message || "AI Failed");

                // Triggers
                let newStatus = 'Active';
                if (aiResponse.includes('[MEETING_BOOKED]')) {
                    aiResponse = aiResponse.replace('[MEETING_BOOKED]', '').trim();
                    newStatus = 'Meeting Booked';
                } else if (aiResponse.includes('[LEAD_QUALIFIED]')) {
                    aiResponse = aiResponse.replace('[LEAD_QUALIFIED]', '').trim();
                    newStatus = 'Qualified';
                }

                await ctx.telegram.editMessageText(chatId, placeholder.message_id, undefined, aiResponse).catch(e => ctx.reply(aiResponse));

                session.history.push({ role: "assistant", content: aiResponse });
                await supabase.from('chat_sessions').update({ history: session.history, updated_at: new Date().toISOString() }).eq('id', sessionId);
                
                agent.messagesSent = (agent.messagesSent || 0) + 1;
                await updateAgentInDB(agent);

            } catch (err) {
                console.error(`[Bot Error]:`, err.message);
                if (placeholder) ctx.telegram.editMessageText(chatId, placeholder.message_id, undefined, "⚠️ System Error. Try again later.").catch(e => {});
            } finally {
                processingChats.delete(chatId);
            }
        } catch (globalErr) { console.error('Global Bot Error:', globalErr.message); }
    });

    bot.launch({ dropPendingUpdates: true }).catch(e => {});
}

// --- API ROUTES ---
app.get('/api/leads', authMiddleware, async (req, res) => {
    const { data, error } = await supabase.from('leads').select('*').eq('user_id', req.user.id);
    res.json(data || []);
});

app.get('/api/agents', authMiddleware, async (req, res) => {
    const { data, error } = await supabase.from('agents').select('*').eq('user_id', req.user.id);
    res.json(data || []);
});

// --- ADMIN ROUTES ---
async function adminMiddleware(req, res, next) {
    await authMiddleware(req, res, () => {
        if (req.user.email === 'toofiks.fx@gmail.com' || req.user.user_metadata?.is_admin) { next(); } 
        else { res.status(403).json({ error: 'Admin access required' }); }
    });
}

async function superAdminMiddleware(req, res, next) {
    await authMiddleware(req, res, () => {
        if (req.user.email === 'toofiks.fx@gmail.com') { next(); } 
        else { res.status(403).json({ error: 'Super Admin access required' }); }
    });
}

app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
    const { count: ac } = await supabase.from('agents').select('*', { count: 'exact', head: true });
    const { count: uc } = await supabase.from('bot_users').select('*', { count: 'exact', head: true });
    const { count: lc } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    res.json({ agents: ac, users: uc, leads: lc, banned: bannedUsers.length });
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
    const { chatId, action } = req.body;
    const idStr = chatId.toString();
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
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });
    res.json(users.map(u => ({ id: u.id, email: u.email, isAdmin: !!u.user_metadata?.is_admin })));
});

app.post('/api/admin/set-privileges', superAdminMiddleware, async (req, res) => {
    const { userId, isAdmin } = req.body;
    await supabase.auth.admin.updateUserById(userId, { user_metadata: { is_admin: isAdmin } });
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[Server] Running on port ${PORT}`);
    await loadAgentsFromDB();
    await loadGlobalBans();
});

process.once('SIGINT', () => { agents.forEach(a => a.botInstance?.stop('SIGINT')); process.exit(); });
process.once('SIGTERM', () => { agents.forEach(a => a.botInstance?.stop('SIGTERM')); process.exit(); });
