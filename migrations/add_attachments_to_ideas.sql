-- Add attachments column to ideas table
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS ideas_attachments_idx ON ideas USING GIN(attachments);

-- Create idea_attachments table for tracking
CREATE TABLE IF NOT EXISTS idea_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idea_attachments_idea_id_idx ON idea_attachments(idea_id);
