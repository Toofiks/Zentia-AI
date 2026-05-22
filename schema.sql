-- Supabase Schema Migration

-- Create agents table
CREATE TABLE public.agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt TEXT NOT NULL,
    payment TEXT,
    "isActive" BOOLEAN DEFAULT true,
    "tokensUsed" BIGINT DEFAULT 0,
    "messagesSent" BIGINT DEFAULT 0,
    "uniqueUsers" JSONB DEFAULT '[]'::jsonb,
    analytics JSONB DEFAULT '{}'::jsonb,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create leads table
CREATE TABLE public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "chatId" BIGINT NOT NULL,
    username TEXT,
    "agentId" TEXT REFERENCES public.agents(id) ON DELETE CASCADE,
    "agentName" TEXT,
    "lastMessage" TEXT,
    history JSONB DEFAULT '[]'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT now(),
    status TEXT DEFAULT 'Interested',
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create bot_users table (to track people interacting with bots)
CREATE TABLE public.bot_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "chatId" BIGINT NOT NULL,
    username TEXT,
    "agentId" TEXT REFERENCES public.agents(id) ON DELETE CASCADE,
    "agentName" TEXT,
    "lastActivity" TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create knowledge_base table for RAG
CREATE TABLE public.knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "agentId" TEXT REFERENCES public.agents(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Row Level Security (RLS) setup for Step 2
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

-- Policies for agents
CREATE POLICY "Users can manage their own agents"
    ON public.agents
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policies for leads
CREATE POLICY "Users can manage leads for their agents"
    ON public.leads
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policies for bot_users
CREATE POLICY "Users can manage bot_users for their agents"
    ON public.bot_users
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policies for knowledge_base
CREATE POLICY "Users can manage KB for their agents"
    ON public.knowledge_base
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create chat_sessions table
CREATE TABLE public.chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "chatId" BIGINT NOT NULL,
    "agentId" TEXT REFERENCES public.agents(id) ON DELETE CASCADE,
    history JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE("chatId", "agentId")
);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage sessions for their agents"
    ON public.chat_sessions
    USING ( EXISTS (SELECT 1 FROM agents WHERE agents.id = chat_sessions."agentId" AND agents.user_id = auth.uid()) )
    WITH CHECK ( EXISTS (SELECT 1 FROM agents WHERE agents.id = chat_sessions."agentId" AND agents.user_id = auth.uid()) );
\

-- Add totalCost column to agents table for exact cost tracking
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS "totalCost" DOUBLE PRECISION DEFAULT 0.0;

-- Create agent_managers table for team collaboration
CREATE TABLE public.agent_managers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "agentId" TEXT REFERENCES public.agents(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    added_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE("agentId", email)
);

ALTER TABLE public.agent_managers ENABLE ROW LEVEL SECURITY;

-- Policy: Owners can manage their managers
CREATE POLICY "Owners can manage team members"
    ON public.agent_managers
    USING ( EXISTS (SELECT 1 FROM agents WHERE agents.id = agent_managers."agentId" AND agents.user_id = auth.uid()) )
    WITH CHECK ( EXISTS (SELECT 1 FROM agents WHERE agents.id = agent_managers."agentId" AND agents.user_id = auth.uid()) );

-- Policy: Managers can view their own assignments
CREATE POLICY "Managers can view assignments"
    ON public.agent_managers FOR SELECT
    USING ( email = (SELECT email FROM auth.users WHERE auth.users.id = auth.uid()) );
-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create a table for chunks
CREATE TABLE public.knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "agentId" TEXT REFERENCES public.agents(id) ON DELETE CASCADE,
    document_id UUID REFERENCES public.knowledge_base(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(768),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage KB chunks for their agents"
    ON public.knowledge_chunks
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create a function to search chunks
CREATE OR REPLACE FUNCTION match_knowledge (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_agent_id text
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    knowledge_chunks.id,
    knowledge_chunks.content,
    1 - (knowledge_chunks.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks
  WHERE knowledge_chunks."agentId" = p_agent_id
    AND 1 - (knowledge_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY knowledge_chunks.embedding <=> query_embedding
  LIMIT match_count;
$$;
