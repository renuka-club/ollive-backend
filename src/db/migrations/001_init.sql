-- CONVERSATIONS
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,                              -- auto-set from first message (first 80 chars)
  status TEXT NOT NULL DEFAULT 'active'    -- active | cancelled | completed
    CHECK (status IN ('active', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_count INTEGER NOT NULL DEFAULT 0
);

-- MESSAGES
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  token_count INTEGER,                     -- filled from inference log
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INFERENCE LOGS
CREATE TABLE inference_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'google',
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  latency_ms INTEGER NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  input_preview TEXT,                      -- first 200 chars of prompt
  output_preview TEXT,                     -- first 200 chars of response
  error_message TEXT,                      -- null if success
  request_timestamp TIMESTAMPTZ NOT NULL,
  response_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_logs_conversation ON inference_logs(conversation_id);
CREATE INDEX idx_logs_created ON inference_logs(created_at DESC);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);

-- AUTO-UPDATE updated_at on conversations
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
