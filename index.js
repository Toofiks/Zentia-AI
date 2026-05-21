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
        const chatId = ctx.chat.id;
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
                let placeholder = await ctx.reply('Listening...');
                const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
                
                const response = await fetch(fileLink.href);
                const buffer = await response.arrayBuffer();
                const fs = await import('fs/promises');
                const path = await import('path');
                const tempFilePath = path.join(process.cwd(), `temp_${Date.now()}.ogg`);
                await fs.writeFile(tempFilePath, Buffer.from(buffer));
                
                const whisperOpenai = new OpenAI({ apiKey: openaiKey });
                const transcription = await whisperOpenai.audio.transcriptions.create({
                  file: await import('fs').then(fs => fs.createReadStream(tempFilePath)),
                  model: "whisper-1",
                });
                
                await fs.unlink(tempFilePath);
                userMessage = transcription.text;
                messageContent = userMessage;
                await ctx.telegram.deleteMessage(chatId, placeholder.message_id);
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

        try {
            const baseInstruction = "You are a highly focused professional representative. STRICT TOPIC ENFORCEMENT. If the conversation successfully reaches its GOAL, you MUST add [LEAD_QUALIFIED] at the end. If the user agrees to a meeting or demo, you MUST add [MEETING_BOOKED] at the end. NEVER use bold formatting (**), italics (*), or any special characters (like dots or bullets) for text highlighting. Provide clean plain text only. NEVER MENTION THAT YOU ARE AN AI, BOT, OR LARGE LANGUAGE MODEL. Always maintain the persona of a human team member.";
            let dynamicSystemPrompt = `${baseInstruction}\n\nAGENT CONFIGURATION:\n${agent.prompt}`;
            
            if (agent.payment && agent.payment.trim() !== '') {
                dynamicSystemPrompt += `\n\nPAYMENT DETAILS (Offer this when the user asks how to pay or you close the deal):\n${agent.payment}`;
            }

            if (agent.analytics && agent.analytics.calendarUrl && agent.analytics.calendarUrl.trim() !== '') {
                dynamicSystemPrompt += `\n\nCALENDAR/BOOKING LINK (Provide this ONLY when [MEETING_BOOKED] is triggered):\n${agent.analytics.calendarUrl}`;
            }

            // Simple RAG implementation: append all knowledge base text for this agent
            try {
                const { data: kbData } = await supabase.from('knowledge_base').select('content').eq('agentId', agent.id);
                if (kbData && kbData.length > 0) {
                    dynamicSystemPrompt += `\n\nKNOWLEDGE BASE (Use this to answer questions):\n`;
                    kbData.forEach(doc => {
                        dynamicSystemPrompt += `${doc.content}\n\n`;
                    });
                }
            } catch (kbError) {
                console.error(`[Bot ${agent.id}] KB Fetch Error:`, kbError.message);
            }

            const messages = [
                { role: "system", content: dynamicSystemPrompt },
                ...session.history,
                { role: "user", content: messageContent }
            ];

            let placeholder;
            try {
                placeholder = await ctx.reply('✍️...');
            } catch (e) {
                console.warn(`[Bot ${agent.id}] Could not send placeholder:`, e.message);
                return; // User probably blocked the bot
            }

            // Map frontend model names to OpenRouter model IDs
            let currentModel = `google/${agent.model}`; 
            
            let aiResponse = "No response.";
            let success = false;
            let lastError = null;

            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    // Retrieve owner's custom key if available
                    const { data: ownerData } = await supabase.auth.admin.getUserById(agent.user_id);
                    const ownerMeta = ownerData?.user?.user_metadata || {};
                    
                    const userOpenRouterKey = ownerMeta.openRouterKey;
                    const userGeminiKey = ownerMeta.geminiKey;
                    
                    if (!userOpenRouterKey && !userGeminiKey && !process.env.OPENROUTER_API_KEY) {
                        throw new Error("API_KEY_MISSING");
                    }

                    // Fallback to flash on 3rd attempt if using a heavy model
                    if (attempt === 3) {
                         console.log(`[Bot ${agent.id}] Attempt 3: Falling back to gemini-2.5-flash`);
                         currentModel = 'google/gemini-2.5-flash';
                    }

                    // If we have a Gemini Key and it's a Gemini model, use the official Google API directly
                    if (userGeminiKey && currentModel.startsWith('google/')) {
                        const { GoogleGenerativeAI } = await import('@google/generative-ai');
                        const genAI = new GoogleGenerativeAI(userGeminiKey);
                        const modelName = currentModel.replace('google/', ''); // e.g. gemini-2.5-flash
                        const model = genAI.getGenerativeModel({ model: modelName });
                        
                        // Convert OpenAI messages format to Gemini format
                        const geminiMessages = messages.map(m => {
                            if (m.role === 'system') return { role: 'user', parts: [{ text: "SYSTEM INSTRUCTION: " + m.content }] };
                            return {
                                role: m.role === 'assistant' ? 'model' : 'user',
                                parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
                            };
                        });
                        
                        const result = await model.generateContent({ contents: geminiMessages });
                        aiResponse = result.response.text();
                        success = true;
                        break;
                    } else {
                        // Use OpenRouter
                        let activeOpenai = openai;
                        if (userOpenRouterKey) {
                            activeOpenai = new OpenAI({
                                baseURL: "https://openrouter.ai/api/v1",
                                apiKey: userOpenRouterKey
                            });
                        }

                        const completion = await activeOpenai.chat.completions.create({
                            model: currentModel,
                            messages: messages,
                            max_tokens: 1000,
                        });
                        aiResponse = completion.choices[0]?.message?.content || "No response.";
                        success = true;
                        break; // Success, exit retry loop
                    }
                } catch (apiError) {
                    lastError = apiError;
                    console.error(`[Bot ${agent.id}] AI API Error (Attempt ${attempt}/3):`, apiError.message);
                    if (apiError.message === "API_KEY_MISSING") break; // Don't retry if key is missing
                    if (attempt < 3) {
                        // Wait 1 second before retrying
                        await new Promise(res => setTimeout(res, 1000));
                    }
                }
            }

            if (!success) {
                if (lastError && lastError.message === "API_KEY_MISSING") {
                    throw new Error("Please provide an API key (Gemini or OpenRouter) in the Zentia Dashboard settings first.");
                }
                // All attempts failed. Notify user and owner.
                throw new Error(`AI Service Failed: ${lastError?.message || 'Unknown error'}`);
            }
            
            const isLead = aiResponse.includes('[LEAD_QUALIFIED]') || 
                           aiResponse.toLowerCase().includes('договорились') || 
                           aiResponse.toLowerCase().includes('успешного обучения');

            // Check if already a lead
            const { data: existingLeads } = await supabase.from('leads')
                .select('id, history')
                .eq('chatId', chatId)
                .eq('agentId', agent.id)
                .limit(1);

            const isAlreadyLead = existingLeads && existingLeads.length > 0;
            const currentStatus = isAlreadyLead ? existingLeads[0].status : null;
            let newStatus = currentStatus || 'Interested';
            
            let statusChanged = false;

            if (isLead || isAlreadyLead) {
                if (aiResponse.includes('[MEETING_BOOKED]')) {
                    console.log(`[Bot ${agent.id}] Meeting booked!`);
                    aiResponse = aiResponse.replace('[MEETING_BOOKED]', '').trim();
                    if (newStatus !== 'Meeting Booked') {
                        newStatus = 'Meeting Booked';
                        statusChanged = true;
                    }
                }

                if (aiResponse.includes('[LEAD_QUALIFIED]')) {
                    console.log(`[Bot ${agent.id}] Lead detected!`);
                    aiResponse = aiResponse.replace('[LEAD_QUALIFIED]', '').trim();
                    if (!isAlreadyLead) {
                        statusChanged = true; // New lead
                    }
                }

                const leadHistory = isAlreadyLead ? [...(existingLeads[0].history || [])] : [...session.history];
                leadHistory.push({ role: "user", content: userMessage }, { role: "assistant", content: aiResponse });

                const leadData = {
                    chatId, username, agentId: agent.id, agentName: agent.name,
                    lastMessage: userMessage,
                    history: leadHistory,
                    timestamp: new Date().toISOString(),
                    status: newStatus,
                    user_id: agent.user_id
                };

                if (isAlreadyLead) {
                    await supabase.from('leads').update(leadData).eq('id', existingLeads[0].id);
                } else {
                    await supabase.from('leads').insert(leadData);
                }

                // If this is a new lead OR the status upgraded to Meeting Booked, trigger notifications & webhooks
                if (statusChanged) {
                    // 1. Telegram Notification to Owner
                    let ownerEmail = null;
                    try {
                        const { data: ownerData, error: ownerError } = await supabase.auth.admin.getUserById(agent.user_id);
                        if (!ownerError && ownerData?.user) {
                            ownerEmail = ownerData.user.email;
                            if (ownerData.user.user_metadata?.telegram_chat_id) {
                                const tgChatId = ownerData.user.user_metadata.telegram_chat_id;
                                const emoji = newStatus === 'Meeting Booked' ? '📅' : '🎉';
                                const title = newStatus === 'Meeting Booked' ? 'Meeting Booked!' : 'New Lead Qualified!';
                                const notificationMsg = `${emoji} *${title}*\n\nBot: ${agent.name}\nLead: @${username || chatId}\nMessage: "${userMessage}"\n\nGo to Zentia Dashboard to reply.`;
                                await agent.botInstance.telegram.sendMessage(tgChatId, notificationMsg, { parse_mode: 'Markdown' });
                            }
                        }
                    } catch (notifyErr) {
                        console.error(`[Bot ${agent.id}] Failed to notify owner via TG:`, notifyErr.message);
                    }

                    // 2. Email Notification Scaffold (Ready for Resend/Nodemailer)
                    if (ownerEmail) {
                        console.log(`[Email Scaffold] Sending email to ${ownerEmail} -> Subject: ${newStatus === 'Meeting Booked' ? 'Meeting Booked!' : 'New Lead!'}`);
                        // TODO: Implement actual email sending here:
                        // await resend.emails.send({ from: 'hello@zentia.ai', to: ownerEmail, subject: '...', html: '...' });
                    }

                    // 3. Webhook integration (For Zapier / Make.com / HubSpot / Salesforce)
                    if (agent.analytics && agent.analytics.webhookUrl) {
                        try {
                            const payload = {
                                event: newStatus === 'Meeting Booked' ? 'meeting_booked' : 'lead_qualified',
                                agent: { id: agent.id, name: agent.name },
                                lead: { chatId, username, status: newStatus, lastMessage: userMessage, history: leadHistory }
                            };
                            await fetch(agent.analytics.webhookUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            console.log(`[Bot ${agent.id}] CRM Webhook triggered successfully.`);
                        } catch (webhookErr) {
                            console.error(`[Bot ${agent.id}] CRM Webhook trigger failed:`, webhookErr.message);
                        }
                    }
                    
                    // 4. Google Sheets integration
                    if (agent.analytics && agent.analytics.googleSheetsUrl) {
                        try {
                            await fetch(agent.analytics.googleSheetsUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    timestamp: new Date().toISOString(),
                                    event: newStatus,
                                    chatId: chatId,
                                    username: username,
                                    agentName: agent.name,
                                    lastMessage: userMessage
                                })
                            });
                            console.log(`[Bot ${agent.id}] Google Sheets synced successfully.`);
                        } catch (sheetsErr) {
                            console.error(`[Bot ${agent.id}] Google Sheets sync failed:`, sheetsErr.message);
                        }
                    }
                }
            }

            let finalBotMessageId = placeholder ? placeholder.message_id : null;
            try { 
                await ctx.telegram.editMessageText(chatId, placeholder.message_id, undefined, aiResponse); 
            } catch(e) { 
                const fallbackMsg = await ctx.reply(aiResponse).catch(e2 => console.error(`[Bot ${agent.id}] Reply Error:`, e2.message)); 
                if (fallbackMsg) finalBotMessageId = fallbackMsg.message_id;
            }

            session.history.push(
                { role: "user", content: userMessage, message_id: ctx.message.message_id }, 
                { role: "assistant", content: aiResponse, message_id: finalBotMessageId }
            );
            if (session.history.length > 20) session.history = session.history.slice(-20);
            
            // Persist session to database
            try {
                if (sessionId) {
                    await supabase.from('chat_sessions').update({ history: session.history, updated_at: new Date().toISOString() }).eq('id', sessionId);
                } else {
                    await supabase.from('chat_sessions').insert({ chatId, agentId: agent.id, history: session.history });
                }
            } catch (dbErr) {
                console.error(`[Bot ${agent.id}] Session Save Error:`, dbErr.message);
            }

            agent.messagesSent = (agent.messagesSent || 0) + 1;
            const currentTokens = Math.floor((userMessage.length + aiResponse.length) / 4);
            agent.tokensUsed = (agent.tokensUsed || 0) + currentTokens;
            
            // Calculate actual cost
            const modelCostsPer1M = {
                'google/gemini-3.1-pro-preview': 3.50,
                'google/gemini-3-flash-preview': 0.10,
                'google/gemini-2.5-pro': 3.50,
                'google/gemini-2.5-flash': 0.075
            };
            const costPer1M = modelCostsPer1M[currentModel] || 0.075;
            const requestCost = (currentTokens / 1000000) * costPer1M;
            agent.totalCost = (agent.totalCost || 0.0) + requestCost;
            
            if (!agent.uniqueUsers) agent.uniqueUsers = [];
            if (!agent.uniqueUsers.includes(chatId)) {
                agent.uniqueUsers.push(chatId);
                console.log(`[Bot ${agent.id}] New unique user: ${chatId}`);
            }
            
            const today = new Date().toISOString().split('T')[0];
            if(!agent.analytics) agent.analytics = {};
            agent.analytics[today] = (agent.analytics[today] || 0) + currentTokens;
            
            updateAgentInDB(agent).catch(e => console.error('Save Agents Error:', e.message));
        } catch (error) {
            console.error(`[Bot ${agent.id}] Error:`, error.message);
            ctx.reply('Busy, try later.').catch(e => {});

            // Notify owner of the critical failure
            try {
                const { data: ownerData, error: ownerError } = await supabase.auth.admin.getUserById(agent.user_id);
                if (!ownerError && ownerData?.user?.user_metadata?.telegram_chat_id) {
                    const tgChatId = ownerData.user.user_metadata.telegram_chat_id;
                    const errorMsg = `⚠️ *CRITICAL AI ERROR*\n\nBot: ${agent.name}\nError: ${error.message}\n\nPlease check your OpenRouter API balance or configuration in the Zentia Dashboard.`;
                    await agent.botInstance.telegram.sendMessage(tgChatId, errorMsg, { parse_mode: 'Markdown' });
                }
            } catch (notifyErr) {
                console.error(`[Bot ${agent.id}] Failed to notify owner of error:`, notifyErr.message);
            }
        }
    });

    console.log(`[Bot ${agent.id}] Launching bot...`);
    bot.launch({ dropPendingUpdates: true })
        .then(() => console.log(`[Bot ${agent.id}] Online.`))
        .catch(e => {
             console.error(`[Bot ${agent.id}] Failed to launch (might be running elsewhere):`, e.message);
        });
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
        
        // Get agents owned by user
        const { data: ownedAgents } = await supabase.from('agents').select('id').eq('user_id', req.user.id);
        const ownedIds = ownedAgents ? ownedAgents.map(a => a.id) : [];
        
        const allAccessibleAgentIds = [...new Set([...ownedIds, ...managedIds])];
        
        if (allAccessibleAgentIds.length === 0) return res.json([]);

        const { data, error } = await supabase.from('leads')
            .select('*')
            .in('agentId', allAccessibleAgentIds);

        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/users', authMiddleware, async (req, res) => {
    try {
        const managedIds = await getManagedAgentIds(req.user.email);
        
        // Get agents owned by user
        const { data: ownedAgents } = await supabase.from('agents').select('id').eq('user_id', req.user.id);
        const ownedIds = ownedAgents ? ownedAgents.map(a => a.id) : [];
        
        const allAccessibleAgentIds = [...new Set([...ownedIds, ...managedIds])];
        
        if (allAccessibleAgentIds.length === 0) return res.json([]);

        const { data, error } = await supabase.from('bot_users')
            .select('*')
            .in('agentId', allAccessibleAgentIds);

        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
    res.json(data.map(a => ({
        ...a, 
        uniqueUsers: (a.uniqueUsers || []).length,
        isManager: a.user_id !== req.user.id
    })));
});

// Real Stripe Checkout Endpoint
app.post('/api/stripe/create-checkout-session', authMiddleware, async (req, res) => {
    if (!stripe || !process.env.STRIPE_PRICE_ID_PRO) {
        return res.status(500).json({ error: 'Stripe is not configured on the server. Please set STRIPE_SECRET_KEY and STRIPE_PRICE_ID_PRO.' });
    }

    try {
        const { plan } = req.body;
        
        let priceId = process.env.STRIPE_PRICE_ID_PRO;
        if (plan === 'enterprise') priceId = process.env.STRIPE_PRICE_ID_ENTERPRISE;
        if (plan === 'starter') priceId = process.env.STRIPE_PRICE_ID_STARTER;
        
        if (!priceId) {
             return res.status(400).json({ error: `Price ID for plan ${plan} is not configured on the server.` });
        }

        const domainUrl = process.env.DOMAIN_URL || req.headers.origin || 'http://localhost:3000';

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            client_reference_id: req.user.id, // This is crucial for the webhook to identify the user
            success_url: `${domainUrl}/?payment=success`,
            cancel_url: `${domainUrl}/?payment=cancelled`,
            metadata: { plan: plan || 'pro' }
        });

        res.json({ url: session.url });
    } catch (e) {
        console.error('Stripe checkout error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/tools/expand-prompt', authMiddleware, promptLimiter, async (req, res) => {
    const { goal, audience, tone, rules } = req.body;
    
    const userOpenRouterKey = req.user.user_metadata?.openRouterKey;
    const userGeminiKey = req.user.user_metadata?.geminiKey;
    const globalKey = process.env.OPENROUTER_API_KEY;
    if (!userOpenRouterKey && !userGeminiKey && !globalKey) {
        return res.status(400).json({ 
            error: 'API_KEY_MISSING', 
            message: 'API Key is missing. Please enter your OpenRouter or Gemini API Key in the Zentia Dashboard settings first.' 
        });
    }
    
    try {
        const expansionPrompt = `
I am configuring an AI agent. The user has provided the following parameters:
- Primary Goal: ${goal}
- Target Audience: ${audience}
- Tone of Voice: ${tone}
- Strict Rules: ${rules || 'None'}

Your task is to take these parameters and write a highly detailed, professional, and robust SYSTEM PROMPT. 
You must expand on the rules to make them more comprehensive, structured, and effective for an AI agent to follow. Add necessary behavioral guardrails that align with the user's intent.

CRITICAL CONSTRAINTS FOR THE GENERATED PROMPT:
1. It must strictly forbid the use of any bold highlighting, asterisks, dots, or bullets for text styling.
2. It must strictly forbid the AI from ever mentioning it is an AI, bot, or automated system. It must always act as a human representative.

Format the output cleanly WITHOUT ANY MARKDOWN (no asterisks, no hashes, no bullet points). Use plain text only.
Do not include any meta-commentary like "Here is the prompt", just return the raw system prompt text.
`;

        let activeOpenai = openai;
        if (req.user.user_metadata && req.user.user_metadata.openRouterKey) {
            activeOpenai = new OpenAI({
                baseURL: "https://openrouter.ai/api/v1",
                apiKey: req.user.user_metadata.openRouterKey
            });
        }

        const completion = await activeOpenai.chat.completions.create({
            model: 'google/gemini-2.5-flash',
            messages: [{ role: 'user', content: expansionPrompt }],
            max_tokens: 2000,
        });

        const expandedPrompt = completion.choices[0]?.message?.content || "Failed to expand prompt.";
        res.json({ expandedPrompt });
    } catch (e) {
        console.error('Prompt expansion failed:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/agents', authMiddleware, async (req, res) => {
    console.log(`[API] POST /api/agents triggered by user ${req.user.id}`);
    // Check limits
    try {
        const { data: userAgents, error: limitError } = await supabase.from('agents').select('id').eq('user_id', req.user.id);
        if (limitError) {
            console.error('[API] Limit check error:', limitError.message);
            return res.status(500).json({ error: 'Database error while checking limits.' });
        }

        let limit = 1;
        if (req.user.user_metadata?.plan === 'pro') limit = 10;
        else if (req.user.user_metadata?.plan === 'starter') limit = 3;
        else if (req.user.user_metadata?.plan === 'enterprise') limit = 999;
        
        if (userAgents && userAgents.length >= limit) {
            console.warn(`[API] User ${req.user.id} reached agent limit (${limit})`);
            return res.status(403).json({ error: `Please upgrade your plan to create more than ${limit} agents.` });
        }

        const { id, name, token, model, prompt, payment, webhookUrl, googleSheetsUrl, removeBranding, calendarUrl } = req.body;
        
        // Validate Telegram Token
        if (token) {
            console.log(`[API] Validating Telegram token for agent: ${name}`);
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
                
                const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: controller.signal });
                clearTimeout(timeout);
                
                if (!tgRes.ok) {
                    const errorData = await tgRes.json().catch(() => ({}));
                    console.warn(`[API] Invalid Telegram token: ${errorData.description || tgRes.statusText}`);
                    return res.status(400).json({ error: 'Invalid Telegram Bot Token. Please check and try again.' });
                }
                console.log(`[API] Telegram token validated successfully.`);
            } catch (e) {
                console.error(`[API] Telegram validation failed:`, e.message);
                if (e.name === 'AbortError') {
                    return res.status(500).json({ error: 'Telegram API timeout. Please try again later or check your network.' });
                }
                return res.status(500).json({ error: 'Failed to validate Telegram token due to a network error.' });
            }
        }

        const agentId = id || 'agent_' + Date.now();
        const newAgent = { 
            id: agentId, name, token, model, prompt, payment: payment || '', 
            isActive: true, tokensUsed: 0, messagesSent: 0, 
            uniqueUsers: [], analytics: { webhookUrl: webhookUrl || '', googleSheetsUrl: googleSheetsUrl || '', removeBranding: removeBranding || false, calendarUrl: calendarUrl || '' }, user_id: req.user.id
        };
        
        console.log(`[API] Inserting new agent into database: ${agentId}`);
        const { error: insertError } = await supabase.from('agents').insert(newAgent);
        if (insertError) {
            console.error('[API] Database insert error:', insertError.message);
            return res.status(500).json({ error: insertError.message });
        }

        agents.set(agentId, newAgent);
        console.log(`[API] Starting bot for agent: ${agentId}`);
        startBot(newAgent);
        
        console.log(`[API] Agent ${agentId} deployed successfully.`);
        res.json({ success: true, id: agentId });
    } catch (err) {
        console.error('[API] Unexpected error in POST /api/agents:', err);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});

app.put('/api/agents/:id', authMiddleware, async (req, res) => {
    const agent = agents.get(req.params.id);
    if (!agent || agent.user_id !== req.user.id) return res.status(404).json({error: "Not found"});
    
    const { name, token, model, prompt, payment, webhookUrl, googleSheetsUrl, removeBranding, calendarUrl } = req.body;
    
    // Validate Telegram Token if it has changed
    if (token && token !== agent.token) {
        try {
            const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
            if (!tgRes.ok) {
                return res.status(400).json({ error: 'Invalid Telegram Bot Token. Update aborted.' });
            }
        } catch (e) {
            return res.status(500).json({ error: 'Failed to validate Telegram token.' });
        }
        
        try { agent.botInstance?.stop(); } catch(e) {}
        agent.token = token;
        startBot(agent);
    }
    
    agent.name = name || agent.name;
    agent.model = model || agent.model;
    agent.prompt = prompt || agent.prompt;
    agent.payment = payment !== undefined ? payment : agent.payment;
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
    if (agent && agent.user_id === req.user.id) { 
        try { agent.botInstance.stop(); } catch(e) {} 
        agents.delete(agent.id); 
    }
    const { error } = await supabase.from('agents').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.post('/api/leads/:chatId/message', authMiddleware, async (req, res) => {
    const { chatId } = req.params;
    const { message, agentId } = req.body;
    const agent = agents.get(agentId);
    
    if (!agent || !agent.botInstance) {
        return res.status(404).json({ error: 'Agent not found' });
    }

    const managedIds = await getManagedAgentIds(req.user.email);
    if (agent.user_id !== req.user.id && !managedIds.includes(agent.id)) {
        return res.status(403).json({ error: 'Forbidden. You are not an owner or manager.' });
    }

    try {
        const sentMsg = await agent.botInstance.telegram.sendMessage(chatId, message);
        
        // Update history in DB
        const { data: lead } = await supabase.from('leads')
            .select('id, history')
            .eq('chatId', chatId)
            .eq('agentId', agent.id)
            .limit(1);

        if (lead && lead.length > 0) {
            const history = lead[0].history || [];
            history.push({ role: 'assistant', content: message, message_id: sentMsg.message_id });
            await supabase.from('leads').update({ history }).eq('id', lead[0].id);
        }
        
        // Update session history
        try {
            const { data: sessionData } = await supabase.from('chat_sessions')
                .select('id, history')
                .eq('chatId', chatId)
                .eq('agentId', agent.id)
                .limit(1);

            if (sessionData && sessionData.length > 0) {
                let history = sessionData[0].history || [];
                history.push({ role: 'assistant', content: message, message_id: sentMsg.message_id });
                if (history.length > 20) history = history.slice(-20);
                await supabase.from('chat_sessions').update({ history, updated_at: new Date().toISOString() }).eq('id', sessionData[0].id);
            }
        } catch (dbErr) {
            console.error('Failed to update session history:', dbErr.message);
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Failed to send message:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/knowledge/:agentId', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        const agentId = req.params.agentId;
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'No file uploaded' });

        // Verify agent ownership
        const { data: agents } = await supabase.from('agents').select('id').eq('id', agentId).eq('user_id', req.user.id);
        if (!agents || agents.length === 0) return res.status(403).json({ error: 'Forbidden' });

        let content = '';
        if (file.mimetype === 'application/pdf') {
            const fs = await import('fs/promises');
            const dataBuffer = await fs.readFile(file.path);
            const data = await pdfParse(dataBuffer);
            content = data.text;
            await fs.unlink(file.path);
        } else if (file.mimetype === 'text/plain') {
            const fs = await import('fs/promises');
            content = await fs.readFile(file.path, 'utf8');
            await fs.unlink(file.path);
        } else {
            const fs = await import('fs/promises');
            await fs.unlink(file.path);
            return res.status(400).json({ error: 'Unsupported file type. Use PDF or TXT.' });
        }

        const { error } = await supabase.from('knowledge_base').insert({
            agentId,
            filename: file.originalname,
            content,
            user_id: req.user.id
        });

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        console.error('KB Upload Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/knowledge/:agentId', authMiddleware, async (req, res) => {
    const { data, error } = await supabase.from('knowledge_base').select('id, filename, uploaded_at').eq('agentId', req.params.agentId).eq('user_id', req.user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.delete('/api/knowledge/:id', authMiddleware, async (req, res) => {
    const { error } = await supabase.from('knowledge_base').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.get('/api/agents/:id/managers', authMiddleware, async (req, res) => {
    const agent = agents.get(req.params.id);
    if (!agent || agent.user_id !== req.user.id) return res.status(403).json({error: "Forbidden"});
    const { data, error } = await supabase.from('agent_managers').select('id, email, added_at').eq('agentId', agent.id);
    if (error) return res.status(500).json({error: error.message});
    res.json(data);
});

app.post('/api/agents/:id/managers', authMiddleware, async (req, res) => {
    const agent = agents.get(req.params.id);
    if (!agent || agent.user_id !== req.user.id) return res.status(403).json({error: "Forbidden"});
    const { email } = req.body;
    if (!email) return res.status(400).json({error: "Email required"});
    
    const { error } = await supabase.from('agent_managers').insert({ agentId: agent.id, email });
    if (error) return res.status(500).json({error: error.message});
    res.json({success: true});
});

app.delete('/api/agents/:id/managers/:managerId', authMiddleware, async (req, res) => {
    const agent = agents.get(req.params.id);
    if (!agent || agent.user_id !== req.user.id) return res.status(403).json({error: "Forbidden"});
    const { error } = await supabase.from('agent_managers').delete().eq('id', req.params.managerId).eq('agentId', agent.id);
    if (error) return res.status(500).json({error: error.message});
    res.json({success: true});
});

app.put('/api/leads/:chatId/status', authMiddleware, async (req, res) => {
    const { chatId } = req.params;
    const { status, agentId } = req.body;
    
    try {
        const { error } = await supabase.from('leads')
            .update({ status })
            .eq('chatId', chatId)
            .eq('agentId', agentId);

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/leads/:chatId/messages/:index', authMiddleware, async (req, res) => {
    const { chatId, index } = req.params;
    const { agentId } = req.query;
    const uiIndex = parseInt(index);

    try {
        // 1. Fetch Lead
        let query = supabase.from('leads')
            .select('id, history, agentId, user_id')
            .eq('chatId', chatId);
            
        if (agentId) {
            query = query.eq('agentId', agentId);
        }

        const { data: lead, error: fetchErr } = await query.limit(1).single();

        if (fetchErr || !lead) return res.status(404).json({ error: 'Lead not found' });

        console.log(`[Security Debug] Attempting delete. ReqUser: ${req.user.id}, LeadUser: ${lead.user_id}, AgentId: ${lead.agentId}`);

        // Security: Direct DB check for absolute reliability
        const { data: agentData, error: agentErr } = await supabase.from('agents').select('user_id').eq('id', lead.agentId).limit(1).single();
        
        if (agentErr) console.error(`[Security Debug] Agent Fetch Error:`, agentErr.message);
        console.log(`[Security Debug] AgentOwner from DB: ${agentData?.user_id}`);

        const managedIds = await getManagedAgentIds(req.user.email);
        console.log(`[Security Debug] User managed IDs:`, managedIds);
        
        const isOwner = (agentData && agentData.user_id === req.user.id) || (lead.user_id === req.user.id);
        const isManager = managedIds.includes(lead.agentId);

        console.log(`[Security Debug] Result -> isOwner: ${isOwner}, isManager: ${isManager}`);

        if (!isOwner && !isManager) {
            console.warn(`[Security Failure] Access Denied.`);
            return res.status(403).json({ 
                error: 'Forbidden', 
                message: `Permission denied. Your ID: ${req.user.id}. Required Owner ID: ${agentData?.user_id || lead.user_id}` 
            });
        }

        // 2. Map UI index to Real index (handling filtered system messages)
        let history = lead.history || [];
        let realIndex = -1;
        let currentUiCounter = 0;

        for (let i = 0; i < history.length; i++) {
            if (history[i].role !== 'system') {
                if (currentUiCounter === uiIndex) {
                    realIndex = i;
                    break;
                }
                currentUiCounter++;
            }
        }

        if (realIndex !== -1) {
            const deletedMsg = history[realIndex];
            history.splice(realIndex, 1);
            
            // Delete from Telegram if message_id exists
            if (deletedMsg && deletedMsg.message_id) {
                const agent = agents.get(lead.agentId);
                if (agent && agent.botInstance) {
                    try {
                        await agent.botInstance.telegram.deleteMessage(chatId, deletedMsg.message_id);
                        console.log(`[Bot ${agent.id}] Deleted message ${deletedMsg.message_id} from Telegram.`);
                    } catch (tgErr) {
                        console.error(`[Bot ${agent.id}] Failed to delete from Telegram:`, tgErr.message);
                    }
                }
            }
        } else {
            return res.status(400).json({ error: 'Message not found at index ' + uiIndex });
        }

        // 3. Update Lead in DB
        await supabase.from('leads').update({ history }).eq('id', lead.id);

        // 4. Update active chat session if exists
        try {
            const { data: session } = await supabase.from('chat_sessions')
                .select('id, history')
                .eq('chatId', chatId)
                .eq('agentId', lead.agentId)
                .limit(1)
                .single();
            
            if (session) {
                let sHistory = session.history || [];
                // Simple sync for session as well
                let sRealIndex = -1;
                let sUiCounter = 0;
                for (let i = 0; i < sHistory.length; i++) {
                    if (sHistory[i].role !== 'system') {
                        if (sUiCounter === uiIndex) {
                            sRealIndex = i;
                            break;
                        }
                        sUiCounter++;
                    }
                }
                if (sRealIndex !== -1) {
                    sHistory.splice(sRealIndex, 1);
                    await supabase.from('chat_sessions').update({ history: sHistory }).eq('id', session.id);
                }
            }
        } catch (e) { console.warn('Session sync on delete failed'); }

        res.json({ success: true });
    } catch (e) {
        console.error('Delete message API error:', e);
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
    await loadAgentsFromDB();
});

process.once('SIGINT', () => { agents.forEach(a => a.botInstance?.stop('SIGINT')); process.exit(); });
process.once('SIGTERM', () => { agents.forEach(a => a.botInstance?.stop('SIGTERM')); process.exit(); });
