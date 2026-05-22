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
    process.exit(1);
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
  apiKey: openRouterKey,
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
        console.error(`[Auth] Middleware Error for ${req.path}:`, e.message);
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({ error: 'Authentication service unavailable', message: e.message });
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
    console.log(`[Bot ${agent.id}] Starting with token: ${agent.token.substring(0, 5)}...`);
    const bot = new Telegraf(agent.token);
    agent.botInstance = bot;

    bot.start((ctx) => ctx.reply('Hello! I am your AI assistant.').catch(e => console.error(`[Bot ${agent.id}] Start Error:`, e.message)));

    bot.catch((err, ctx) => {
        console.error(`[Bot ${agent.id}] Global Error for ${ctx.updateType}:`, err.message);
    });

    bot.on('message', async (ctx) => {
        try {
            const chatId = ctx.chat.id;
            
            // Global Ban Check
            if (bannedUsers.includes(chatId.toString())) {
                console.log(`[Bot ${agent.id}] Ignored message from banned user: ${chatId}`);
                return;
            }

            const username = ctx.from.username || ctx.from.first_name || 'Anonymous';
            let userMessage = '';
            let messageContent = []; // Support for Vision

            if (ctx.message.text) {
                userMessage = ctx.message.text;
                messageContent = userMessage;
            } else if (ctx.message.voice) {
                const openaiKey = process.env.OPENAI_API_KEY;
                if (!openaiKey) {
                    return ctx.reply('[Voice Recognition] OpenAI API key is missing. Cannot transcribe audio.');
                }
                try {
                    let placeholderListening = await ctx.reply('Listening...');
                    const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
                    
                    const response = await fetch(fileLink.href);
                    const buffer = await response.arrayBuffer();
                    const fs = await import('fs/promises');
                    const path = await import('path');
                    const tempFilePath = path.join(process.cwd(), `temp_${Date.now()}.ogg`);
                    await fs.writeFile(tempFilePath, Buffer.from(buffer));
                    
                    const whisperOpenai = new OpenAI({ apiKey: openaiKey });
                    const transcription = await whisperOpenai.audio.transcriptions.create({
                      file: fs.createReadStream(tempFilePath),
                      model: "whisper-1",
                    });
                    
                    await fs.unlink(tempFilePath);
                    userMessage = transcription.text;
                    messageContent = userMessage;
                    await ctx.telegram.deleteMessage(chatId, placeholderListening.message_id);
                } catch (e) {
                    console.error(`[Bot ${agent.id}] Voice Error:`, e);
                    return ctx.reply('Voice recognition error.');
                }
            } else if (ctx.message.photo) {
                try {
                    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
                    const fileLink = await ctx.telegram.getFileLink(photoId);
                    userMessage = ctx.message.caption || 'What is in this photo?';
                    messageContent = [
                        { type: 'text', text: userMessage },
                        { type: 'image_url', image_url: { url: fileLink.href } }
                    ];
                } catch (e) {
                    console.error(`[Bot ${agent.id}] Photo Error:`, e);
                    return ctx.reply('Error downloading the photo.');
                }
            } else {
                return; // Ignore other types like stickers or files for now
            }

            console.log(`[Bot ${agent.id}] Message from ${username}: ${typeof messageContent === 'string' ? messageContent : '[Photo + Text]'}`);

            // Update Bot Users DB
            const userData = {
                chatId,
                username,
                agentId: agent.id,
                agentName: agent.name,
                lastActivity: new Date().toISOString(),
                user_id: agent.user_id
            };
            
            // Check existing user to avoid duplication (chatId + agentId)
            const { data: existingUser } = await supabase.from('bot_users')
                .select('id')
                .eq('chatId', chatId)
                .eq('agentId', agent.id)
                .limit(1);

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
            try {
                const { data: sessionData } = await supabase.from('chat_sessions')
                    .select('id, history')
                    .eq('chatId', chatId)
                    .eq('agentId', agent.id)
                    .limit(1);

                if (sessionData && sessionData.length > 0) {
                    session.history = sessionData[0].history || [];
                    sessionId = sessionData[0].id;
                }
            } catch (e) {
                console.error(`[Bot ${agent.id}] Session DB Fetch Error:`, e.message);
            }

            // --- TAKEOVER LOGIC & EARLY SAVE ---
            const lastDisabled = session.history.map(m => m.content).lastIndexOf('[AI_DISABLED]');
            const lastEnabled = session.history.map(m => m.content).lastIndexOf('[AI_ENABLED]');
            let aiDisabled = lastDisabled > lastEnabled;

            const userMsgObj = { role: "user", content: typeof messageContent === 'string' ? messageContent : '[Photo/Voice]', message_id: ctx.message.message_id };
            session.history.push(userMsgObj);
            if (session.history.length > 20) session.history = session.history.slice(-20);

            try {
                if (sessionId) {
                    await supabase.from('chat_sessions').update({ history: session.history, updated_at: new Date().toISOString() }).eq('id', sessionId);
                } else {
                    const { data: newSession } = await supabase.from('chat_sessions').insert({ chatId, agentId: agent.id, history: session.history }).select('id').single();
                    if (newSession) sessionId = newSession.id;
                }
            } catch (dbErr) {
                console.error(`[Bot ${agent.id}] Session Early Save Error:`, dbErr.message);
            }

            try {
                const { data: earlyLeads } = await supabase.from('leads').select('id, status, history').eq('chatId', chatId).eq('agentId', agent.id).limit(1);
                if (earlyLeads && earlyLeads.length > 0) {
                    const leadHistory = [...(earlyLeads[0].history || []), userMsgObj];
                    await supabase.from('leads').update({ history: leadHistory, lastMessage: userMessage, timestamp: new Date().toISOString() }).eq('id', earlyLeads[0].id);
                }
            } catch (e) { console.error('Immediate lead save error:', e.message); }

            if (aiDisabled) {
                console.log(`[Bot ${agent.id}] AI disabled for chat ${chatId} (Human Takeover). Ignoring message.`);
                processingChats.delete(chatId);
                return; 
            }

            let placeholder;
            try {
                placeholder = await ctx.reply('✍️...');
                
                const baseInstruction = "You are a highly focused professional representative. STRICT TOPIC ENFORCEMENT. If the conversation successfully reaches its GOAL, you MUST add [LEAD_QUALIFIED] at the end. If the user agrees to a meeting or demo, you MUST add [MEETING_BOOKED] at the end. NEVER use bold formatting (**), italics (*), or any special characters (like dots or bullets) for text highlighting. Provide clean plain text only. NEVER MENTION THAT YOU ARE AN AI, BOT, OR LARGE LANGUAGE MODEL. Always maintain the persona of a human team member.";
                let dynamicSystemPrompt = `${baseInstruction}\n\nAGENT CONFIGURATION:\n${agent.prompt}`;
                
                if (agent.payment && agent.payment.trim() !== '') {
                    dynamicSystemPrompt += `\n\nPAYMENT DETAILS (Offer this when the user asks how to pay or you close the deal):\n${agent.payment}`;
                }

                if (agent.analytics && agent.analytics.calendarUrl && agent.analytics.calendarUrl.trim() !== '') {
                    dynamicSystemPrompt += `\n\nCALENDAR/BOOKING LINK (Provide this ONLY when [MEETING_BOOKED] is triggered):\n${agent.analytics.calendarUrl}`;
                }

                // Simple RAG
                try {
                    const { data: kbData } = await supabase.from('knowledge_base').select('content').eq('agentId', agent.id);
                    if (kbData && kbData.length > 0) {
                        dynamicSystemPrompt += `\n\nKNOWLEDGE BASE (Use this to answer questions):\n`;
                        kbData.forEach(doc => { dynamicSystemPrompt += `${doc.content}\n\n`; });
                    }
                } catch (kbError) { console.error(`[Bot ${agent.id}] KB Fetch Error:`, kbError.message); }

                const messages = [
                    { role: "system", content: dynamicSystemPrompt },
                    ...session.history.filter(h => h.role !== 'system'),
                    { role: "user", content: messageContent }
                ];

                let currentModel = `google/${agent.model}`; 
                let aiResponse = "No response.";
                let success = false;
                let lastError = null;

                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        const { data: ownerData } = await supabase.auth.admin.getUserById(agent.user_id);
                        const ownerMeta = ownerData?.user?.user_metadata || {};
                        const userOpenRouterKey = ownerMeta.openRouterKey;
                        const userGeminiKey = ownerMeta.geminiKey;
                        
                        if (!userOpenRouterKey && !userGeminiKey && !process.env.OPENROUTER_API_KEY) throw new Error("API_KEY_MISSING");

                        if (attempt === 3 && currentModel.includes('pro')) currentModel = 'google/gemini-2.5-flash';

                        if (userOpenRouterKey || process.env.OPENROUTER_API_KEY) {
                            try {
                                const activeOpenai = userOpenRouterKey ? new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: userOpenRouterKey }) : openai;
                                const completion = await activeOpenai.chat.completions.create({ model: currentModel, messages, max_tokens: 1000 });
                                aiResponse = completion.choices[0]?.message?.content || "No response.";
                                success = true; break; 
                            } catch (orError) {
                                lastError = orError;
                                if (!userGeminiKey) throw orError;
                            }
                        }

                        if (!success && userGeminiKey) {
                            try {
                                const { GoogleGenerativeAI } = await import('@google/generative-ai');
                                const genAI = new GoogleGenerativeAI(userGeminiKey);
                                const modelName = currentModel.startsWith('google/') ? currentModel.replace('google/', '') : 'gemini-2.5-flash';
                                const model = genAI.getGenerativeModel({ model: modelName });
                                const geminiMessages = messages.map(m => {
                                    if (m.role === 'system') return { role: 'user', parts: [{ text: "SYSTEM INSTRUCTION: " + m.content }] };
                                    return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }] };
                                });
                                const result = await model.generateContent({ contents: geminiMessages });
                                aiResponse = result.response.text();
                                success = true; break;
                            } catch (geminiError) { lastError = geminiError; throw geminiError; }
                        }
                    } catch (apiError) {
                        lastError = apiError;
                        if (apiError.message === "API_KEY_MISSING") break; 
                        if (attempt < 3) await new Promise(res => setTimeout(res, 1000));
                    }
                }

                if (!success) throw new Error(lastError?.message || "AI Service Failed");

                // Process AI response for triggers
                const { data: existingLeads } = await supabase.from('leads').select('id, history, status').eq('chatId', chatId).eq('agentId', agent.id).limit(1);
                const isAlreadyLead = existingLeads && existingLeads.length > 0;
                let newStatus = isAlreadyLead ? existingLeads[0].status : 'Active';
                let statusChanged = false;

                if (aiResponse.includes('[MEETING_BOOKED]')) {
                    aiResponse = aiResponse.replace('[MEETING_BOOKED]', '').trim();
                    if (newStatus !== 'Meeting Booked') { newStatus = 'Meeting Booked'; statusChanged = true; }
                }
                if (aiResponse.includes('[LEAD_QUALIFIED]') || aiResponse.toLowerCase().includes('договорились')) {
                    aiResponse = aiResponse.replace('[LEAD_QUALIFIED]', '').trim();
                    if (newStatus !== 'Meeting Booked' && newStatus !== 'Qualified') { newStatus = 'Qualified'; statusChanged = true; }
                }

                if (isAlreadyLead) {
                    const leadHistory = [...(existingLeads[0].history || []), { role: "assistant", content: aiResponse }];
                    await supabase.from('leads').update({ history: leadHistory, status: newStatus, timestamp: new Date().toISOString() }).eq('id', existingLeads[0].id);
                }

                if (statusChanged && (newStatus === 'Qualified' || newStatus === 'Meeting Booked')) {
                    try {
                        const { data: ownerData } = await supabase.auth.admin.getUserById(agent.user_id);
                        if (ownerData?.user?.user_metadata?.telegram_chat_id) {
                            const tgChatId = ownerData.user.user_metadata.telegram_chat_id;
                            const emoji = newStatus === 'Meeting Booked' ? '📅' : '🎉';
                            const title = newStatus === 'Meeting Booked' ? 'Meeting Booked!' : 'New Lead Qualified!';
                            const notificationMsg = `${emoji} *${title}*\n\nBot: ${agent.name}\nLead: @${username || chatId}\nMessage: "${userMessage}"\n\nGo to Zentia Dashboard to reply.`;
                            await agent.botInstance.telegram.sendMessage(tgChatId, notificationMsg, { parse_mode: 'Markdown' });
                        }
                    } catch (notifyErr) { console.error('Notification error:', notifyErr.message); }
                }

                let finalBotMessageId = placeholder.message_id;
                try { 
                    await ctx.telegram.editMessageText(chatId, placeholder.message_id, undefined, aiResponse); 
                } catch(e) { 
                    const fallbackMsg = await ctx.reply(aiResponse).catch(e2 => {}); 
                    if (fallbackMsg) finalBotMessageId = fallbackMsg.message_id;
                }

                session.history.push({ role: "assistant", content: aiResponse, message_id: finalBotMessageId });
                if (session.history.length > 20) session.history = session.history.slice(-20);
                
                await supabase.from('chat_sessions').update({ history: session.history, updated_at: new Date().toISOString() }).eq('id', sessionId);

                agent.messagesSent = (agent.messagesSent || 0) + 1;
                const currentTokens = Math.floor((userMessage.length + aiResponse.length) / 4);
                agent.tokensUsed = (agent.tokensUsed || 0) + currentTokens;
                
                const modelCostsPer1M = { 'google/gemini-3.1-pro-preview': 3.50, 'google/gemini-3-flash-preview': 0.10, 'google/gemini-2.5-pro': 3.50, 'google/gemini-2.5-flash': 0.075 };
                const costPer1M = modelCostsPer1M[currentModel] || 0.075;
                agent.totalCost = (agent.totalCost || 0.0) + (currentTokens / 1000000) * costPer1M;
                
                if (!agent.uniqueUsers) agent.uniqueUsers = [];
                if (!agent.uniqueUsers.includes(chatId)) agent.uniqueUsers.push(chatId);
                
                const today = new Date().toISOString().split('T')[0];
                if(!agent.analytics) agent.analytics = {};
                agent.analytics[today] = (agent.analytics[today] || 0) + currentTokens;
                
                await updateAgentInDB(agent);
            } catch (err) {
                console.error(`[Bot ${agent.id}] Error:`, err.message);
                if (placeholder) {
                    await ctx.telegram.editMessageText(chatId, placeholder.message_id, undefined, `⚠️ Error: ${err.message}`).catch(e => {});
                } else {
                    await ctx.reply(`⚠️ Error: ${err.message}`).catch(e => {});
                }
            } finally {
                processingChats.delete(chatId);
            }
        } catch (globalErr) {
            console.error(`[Bot ${agent.id}] Global Handler Error:`, globalErr.message);
        }
    });

    console.log(`[Bot ${agent.id}] Launching bot...`);
    bot.launch({ dropPendingUpdates: true })
        .then(() => console.log(`[Bot ${agent.id}] Online.`))
        .catch(e => { console.error(`[Bot ${agent.id}] Failed to launch:`, e.message); });
}

// Protected Routes (Require user_id)
async function getManagedAgentIds(email) {
    if (!email) return [];
    const { data } = await supabase.from('agent_managers').select('agentId').eq('email', email);
    return data ? data.map(m => m.agentId) : [];
}

app.get('/api/leads', authMiddleware, async (req, res) => {
    try {
        const managedIds = await getManagedAgentIds(req.user.email);
        const { data: ownedAgents } = await supabase.from('agents').select('id').eq('user_id', req.user.id);
        const ownedIds = ownedAgents ? ownedAgents.map(a => a.id) : [];
        const allAccessibleAgentIds = [...new Set([...ownedIds, ...managedIds])];
        if (allAccessibleAgentIds.length === 0) return res.json([]);
        const { data, error } = await supabase.from('leads').select('*').in('agentId', allAccessibleAgentIds);
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users', authMiddleware, async (req, res) => {
    try {
        const managedIds = await getManagedAgentIds(req.user.email);
        const { data: ownedAgents } = await supabase.from('agents').select('id').eq('user_id', req.user.id);
        const ownedIds = ownedAgents ? ownedAgents.map(a => a.id) : [];
        const allAccessibleAgentIds = [...new Set([...ownedIds, ...managedIds])];
        if (allAccessibleAgentIds.length === 0) return res.json([]);
        const { data, error } = await supabase.from('bot_users').select('*').in('agentId', allAccessibleAgentIds);
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/agents', authMiddleware, async (req, res) => {
    const managedIds = await getManagedAgentIds(req.user.email);
    const query = supabase.from('agents').select('*');
    if (managedIds.length > 0) {
        query.or(`user_id.eq.${req.user.id},id.in.(${managedIds.join(',')})`);
    } else {
        query.eq('user_id', req.user.id);
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data.map(a => ({ ...a, uniqueUsers: (a.uniqueUsers || []).length, isManager: a.user_id !== req.user.id })));
});

app.post('/api/stripe/create-checkout-session', authMiddleware, async (req, res) => {
    if (!stripe || !process.env.STRIPE_PRICE_ID_PRO) return res.status(500).json({ error: 'Stripe is not configured.' });
    try {
        const { plan } = req.body;
        let priceId = process.env.STRIPE_PRICE_ID_PRO;
        if (plan === 'enterprise') priceId = process.env.STRIPE_PRICE_ID_ENTERPRISE;
        if (plan === 'starter') priceId = process.env.STRIPE_PRICE_ID_STARTER;
        if (!priceId) return res.status(400).json({ error: `Price ID for plan ${plan} is not configured.` });
        const domainUrl = process.env.DOMAIN_URL || req.headers.origin || 'http://localhost:3000';
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription', payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            client_reference_id: req.user.id,
            success_url: `${domainUrl}/?payment=success`, cancel_url: `${domainUrl}/?payment=cancelled`,
            metadata: { plan: plan || 'pro' }
        });
        res.json({ url: session.url });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tools/expand-prompt', authMiddleware, promptLimiter, async (req, res) => {
    const { goal, audience, tone, rules } = req.body;
    const userOpenRouterKey = req.user.user_metadata?.openRouterKey;
    const userGeminiKey = req.user.user_metadata?.geminiKey;
    if (!userOpenRouterKey && !userGeminiKey && !process.env.OPENROUTER_API_KEY) {
        return res.status(400).json({ error: 'API_KEY_MISSING', message: 'API Key is missing.' });
    }
    try {
        const expansionPrompt = `...`; // omitted for brevity
        let activeOpenai = openai;
        if (req.user.user_metadata?.openRouterKey) {
            activeOpenai = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: req.user.user_metadata.openRouterKey });
        }
        const completion = await activeOpenai.chat.completions.create({ model: 'google/gemini-2.5-flash', messages: [{ role: 'user', content: expansionPrompt }], max_tokens: 2000 });
        res.json({ expandedPrompt: completion.choices[0]?.message?.content || "Failed to expand prompt." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/agents', authMiddleware, async (req, res) => {
    try {
        const { data: userAgents } = await supabase.from('agents').select('id').eq('user_id', req.user.id);
        let limit = 1;
        if (req.user.user_metadata?.plan === 'pro') limit = 10;
        else if (req.user.user_metadata?.plan === 'starter') limit = 3;
        else if (req.user.user_metadata?.plan === 'enterprise') limit = 999;
        if (userAgents && userAgents.length >= limit) return res.status(403).json({ error: `Limit reached (${limit})` });

        const { id, name, token, model, prompt, payment, webhookUrl, googleSheetsUrl, removeBranding, calendarUrl } = req.body;
        if (token) {
            const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
            if (!tgRes.ok) return res.status(400).json({ error: 'Invalid Telegram Token' });
        }
        const agentId = id || 'agent_' + Date.now();
        const newAgent = { id: agentId, name, token, model, prompt, payment: payment || '', isActive: true, tokensUsed: 0, messagesSent: 0, uniqueUsers: [], analytics: { webhookUrl: webhookUrl || '', googleSheetsUrl: googleSheetsUrl || '', removeBranding: removeBranding || false, calendarUrl: calendarUrl || '' }, user_id: req.user.id };
        await supabase.from('agents').insert(newAgent);
        agents.set(agentId, newAgent);
        startBot(newAgent);
        res.json({ success: true, id: agentId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/agents/:id', authMiddleware, async (req, res) => {
    const agent = agents.get(req.params.id);
    if (!agent || agent.user_id !== req.user.id) return res.status(404).json({error: "Not found"});
    const { name, token, model, prompt, payment, webhookUrl, googleSheetsUrl, removeBranding, calendarUrl } = req.body;
    if (token && token !== agent.token) {
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        if (!tgRes.ok) return res.status(400).json({ error: 'Invalid Token' });
        try { agent.botInstance?.stop(); } catch(e) {}
        agent.token = token; startBot(agent);
    }
    agent.name = name || agent.name; agent.model = model || agent.model; agent.prompt = prompt || agent.prompt; agent.payment = payment !== undefined ? payment : agent.payment;
    if (!agent.analytics) agent.analytics = {};
    if (webhookUrl !== undefined) agent.analytics.webhookUrl = webhookUrl;
    if (googleSheetsUrl !== undefined) agent.analytics.googleSheetsUrl = googleSheetsUrl;
    if (removeBranding !== undefined) agent.analytics.removeBranding = removeBranding;
    if (calendarUrl !== undefined) agent.analytics.calendarUrl = calendarUrl;
    await updateAgentInDB(agent);
    res.json({ success: true });
});

app.put('/api/agents/:id/toggle', authMiddleware, async (req, res) => {
    const agent = agents.get(req.params.id);
    if (!agent || agent.user_id !== req.user.id) return res.status(404).json({error: "Not found"});
    agent.isActive = !agent.isActive;
    if (agent.isActive) startBot(agent); else try { agent.botInstance.stop(); } catch(e) {}
    await updateAgentInDB(agent);
    res.json({ success: true, isActive: agent.isActive });
});

app.delete('/api/agents/:id', authMiddleware, async (req, res) => {
    const agent = agents.get(req.params.id);
    if (agent && agent.user_id === req.user.id) { try { agent.botInstance.stop(); } catch(e) {} agents.delete(agent.id); }
    await supabase.from('agents').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
});

app.post('/api/leads/:chatId/message', authMiddleware, async (req, res) => {
    const { chatId } = req.params; const { message, agentId } = req.body; const agent = agents.get(agentId);
    if (!agent || !agent.botInstance) return res.status(404).json({ error: 'Agent not found' });
    const managedIds = await getManagedAgentIds(req.user.email);
    if (agent.user_id !== req.user.id && !managedIds.includes(agent.id)) return res.status(403).json({ error: 'Forbidden' });
    try {
        const sentMsg = await agent.botInstance.telegram.sendMessage(chatId, message);
        const { data: lead } = await supabase.from('leads').select('id, history').eq('chatId', chatId).eq('agentId', agent.id).limit(1);
        if (lead && lead.length > 0) {
            const history = lead[0].history || [];
            history.push({ role: 'assistant', content: message, message_id: sentMsg.message_id });
            await supabase.from('leads').update({ history }).eq('id', lead[0].id);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/knowledge/:agentId', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        const agentId = req.params.agentId; const file = req.file;
        if (!file) return res.status(400).json({ error: 'No file' });
        const { data: ags } = await supabase.from('agents').select('id').eq('id', agentId).eq('user_id', req.user.id);
        if (!ags || ags.length === 0) return res.status(403).json({ error: 'Forbidden' });
        let content = '';
        if (file.mimetype === 'application/pdf') {
            const dataBuffer = await fsPromises.readFile(file.path);
            const data = await pdfParse(dataBuffer); content = data.text;
        } else if (file.mimetype === 'text/plain') {
            content = await fsPromises.readFile(file.path, 'utf8');
        }
        await fsPromises.unlink(file.path);
        await supabase.from('knowledge_base').insert({ agentId, filename: file.originalname, content, user_id: req.user.id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/knowledge/:agentId', authMiddleware, async (req, res) => {
    const { data, error } = await supabase.from('knowledge_base').select('id, filename, uploaded_at').eq('agentId', req.params.agentId).eq('user_id', req.user.id);
    res.json(data || []);
});

app.delete('/api/knowledge/:id', authMiddleware, async (req, res) => {
    await supabase.from('knowledge_base').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
});

app.get('/api/agents/:id/managers', authMiddleware, async (req, res) => {
    const agent = agents.get(req.params.id);
    if (!agent || agent.user_id !== req.user.id) return res.status(403).json({error: "Forbidden"});
    const { data } = await supabase.from('agent_managers').select('id, email, added_at').eq('agentId', agent.id);
    res.json(data || []);
});

app.post('/api/agents/:id/managers', authMiddleware, async (req, res) => {
    const agent = agents.get(req.params.id);
    if (!agent || agent.user_id !== req.user.id) return res.status(403).json({error: "Forbidden"});
    await supabase.from('agent_managers').insert({ agentId: agent.id, email: req.body.email });
    res.json({success: true});
});

app.delete('/api/agents/:id/managers/:managerId', authMiddleware, async (req, res) => {
    const agent = agents.get(req.params.id);
    if (!agent || agent.user_id !== req.user.id) return res.status(403).json({error: "Forbidden"});
    await supabase.from('agent_managers').delete().eq('id', req.params.managerId).eq('agentId', agent.id);
    res.json({success: true});
});

app.put('/api/leads/:chatId/status', authMiddleware, async (req, res) => {
    await supabase.from('leads').update({ status: req.body.status }).eq('chatId', req.params.chatId).eq('agentId', req.body.agentId);
    res.json({ success: true });
});

app.put('/api/leads/:chatId/ai-toggle', authMiddleware, async (req, res) => {
    const { chatId } = req.params; const { agentId, aiDisabled } = req.body;
    const { data: lead } = await supabase.from('leads').select('id, history').eq('chatId', chatId).eq('agentId', agentId).single();
    if (lead) {
        const history = lead.history || [];
        history.push({ role: 'system', content: aiDisabled ? '[AI_DISABLED]' : '[AI_ENABLED]' });
        await supabase.from('leads').update({ history }).eq('id', lead.id);
    }
    res.json({ success: true, aiDisabled });
});

// --- ADMIN ROUTES ---
async function adminMiddleware(req, res, next) {
    await authMiddleware(req, res, () => {
        if (req.user.email === 'toofiks.fx@gmail.com' || req.user.user_metadata?.is_admin) { next(); } 
        else { res.status(403).json({ error: 'Admin access required' }); }
    });
}
app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
    const { count: ac } = await supabase.from('agents').select('*', { count: 'exact', head: true });
    const { count: uc } = await supabase.from('bot_users').select('*', { count: 'exact', head: true });
    const { count: lc } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    res.json({ agents: ac, users: uc, leads: lc, banned: bannedUsers.length });
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
    const { data } = await supabase.from('chat_sessions').select('id, chatId, agentId, history, updated_at').order('updated_at', { ascending: false }).limit(200);
    res.json(data || []);
});
app.post('/api/admin/ban', adminMiddleware, async (req, res) => {
    const { chatId, action } = req.body; const idStr = chatId.toString();
    if (action === 'ban' && !bannedUsers.includes(idStr)) { bannedUsers.push(idStr); saveBannedUsers(); } 
    else if (action === 'unban') { bannedUsers = bannedUsers.filter(id => id !== idStr); saveBannedUsers(); }
    res.json({ success: true, bannedUsers });
});
app.delete('/api/admin/chats/:id', adminMiddleware, async (req, res) => {
    await supabase.from('chat_sessions').delete().eq('id', req.params.id);
    await supabase.from('leads').delete().eq('id', req.params.id);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[Server] Running on port ${PORT}`);
    await loadAgentsFromDB();
});

process.once('SIGINT', () => { agents.forEach(a => a.botInstance?.stop('SIGINT')); process.exit(); });
process.once('SIGTERM', () => { agents.forEach(a => a.botInstance?.stop('SIGTERM')); process.exit(); });
