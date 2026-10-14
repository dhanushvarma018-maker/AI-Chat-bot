-- ==============================================================================
-- Supabase Schema for Gemini Chatbot
-- Run this script in your Supabase SQL Editor:
-- Dashboard -> SQL Editor -> New Query -> Paste and Run
-- ==============================================================================

-- 1. Create Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'New Chat',
  model TEXT DEFAULT 'gemini-2.5-flash',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'model', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Index for Performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 5. Policies for Public Anon Access (or customize for Auth users)
-- Allow read, insert, update, delete for conversations
CREATE POLICY "Allow public read conversations" 
  ON conversations FOR SELECT 
  USING (true);

CREATE POLICY "Allow public insert conversations" 
  ON conversations FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Allow public update conversations" 
  ON conversations FOR UPDATE 
  USING (true);

CREATE POLICY "Allow public delete conversations" 
  ON conversations FOR DELETE 
  USING (true);

-- Allow read, insert, delete for messages
CREATE POLICY "Allow public read messages" 
  ON messages FOR SELECT 
  USING (true);

CREATE POLICY "Allow public insert messages" 
  ON messages FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Allow public delete messages" 
  ON messages FOR DELETE 
  USING (true);
