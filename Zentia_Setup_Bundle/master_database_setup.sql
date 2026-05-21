-- ==========================================
-- ZENTIA AI: MASTER DATABASE SETUP (SCHEMA + RLS)
-- ==========================================
-- INSTRUCTIONS:
-- Copy all the code below and run it in the Supabase SQL Editor.
-- This single script will create all necessary tables, indexes, 
-- and Row Level Security (RLS) policies.
-- ==========================================

-- ------------------------------------------
-- PART 1: TABLE CREATION
-- ------------------------------------------

-- 1. Agents Table
CREATE TABLE IF NOT EXISTS public.agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt TEXT NOT NULL,
    payment TEXT,
    "isActive" BOOLEAN DEFAULT true,
    "tokensUsed" INTEGER DEFAULT 0,
    "messagesSent" INTEGER DEFAULT 0,
    "uniqueUsers" JSONB DEFAULT '[]'::jsonb,
    analytics JSONB DEFAULT '{}'::jsonb,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Leads Table
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "chatId" BIGINT NOT NULL,
    username TEXT,
    "agentId" TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    "agentName" TEXT NOT NULL,
    "lastMessage" TEXT,
    history JSONB DEFAULT '[]'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status TEXT DEFAULT 'Interested',
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 3. Bot Users Table
CREATE TABLE IF NOT EXISTS public.bot_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "chatId" BIGINT NOT NULL,
    username TEXT,
    "agentId" TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    "agentName" TEXT NOT NULL,
    "lastActivity" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 4. Chat Sessions Table (For memory persistence)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "chatId" BIGINT NOT NULL,
    "agentId" TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    history JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Knowledge Base Table (For RAG)
CREATE TABLE IF NOT EXISTS public.knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "agentId" TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Agent Managers Table (For Team Access)
CREATE TABLE IF NOT EXISTS public.agent_managers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "agentId" TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------
-- PART 2: INDEXES FOR PERFORMANCE
-- ------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_agentId ON public.leads("agentId");
CREATE INDEX IF NOT EXISTS idx_leads_chatId ON public.leads("chatId");
CREATE INDEX IF NOT EXISTS idx_bot_users_agentId ON public.bot_users("agentId");
CREATE INDEX IF NOT EXISTS idx_chat_sessions_chatId_agentId ON public.chat_sessions("chatId", "agentId");

-- ------------------------------------------
-- PART 3: ROW LEVEL SECURITY (RLS)
-- ------------------------------------------

-- Enable RLS on all tables
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_managers ENABLE ROW LEVEL SECURITY;

-- Agents Table Policies
CREATE POLICY "Users can view their own agents" ON agents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own agents" ON agents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own agents" ON agents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own agents" ON agents FOR DELETE USING (auth.uid() = user_id);

-- Leads Table Policies
CREATE POLICY "Users can view their own leads" ON leads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own leads" ON leads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own leads" ON leads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own leads" ON leads FOR DELETE USING (auth.uid() = user_id);

-- Bot Users Table Policies
CREATE POLICY "Users can view their own bot_users" ON bot_users FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own bot_users" ON bot_users FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own bot_users" ON bot_users FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own bot_users" ON bot_users FOR DELETE USING (auth.uid() = user_id);

-- Chat Sessions Table Policies (Linked via agentId)
CREATE POLICY "Users can manage chat_sessions via agents" ON chat_sessions 
FOR ALL USING (
  EXISTS (SELECT 1 FROM agents WHERE agents.id = chat_sessions."agentId" AND agents.user_id = auth.uid())
);

-- Knowledge Base Policies
CREATE POLICY "Users can view their own kb" ON knowledge_base FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own kb" ON knowledge_base FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own kb" ON knowledge_base FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own kb" ON knowledge_base FOR DELETE USING (auth.uid() = user_id);

-- Agent Managers Policies
CREATE POLICY "Users can manage their agent managers" ON agent_managers 
FOR ALL USING (
  EXISTS (SELECT 1 FROM agents WHERE agents.id = agent_managers."agentId" AND agents.user_id = auth.uid())
);

-- DONE.
