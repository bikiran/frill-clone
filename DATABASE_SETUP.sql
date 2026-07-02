-- ============================================
-- FRILL CLONE - COMPLETE DATABASE SETUP
-- Copy ALL of this into Supabase SQL Editor and click RUN
-- Works on a fresh database AND on existing setups
-- ============================================

-- Ideas/Feedback table
CREATE TABLE IF NOT EXISTS ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'new',
  votes INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  created_by_name TEXT
);

-- Add new columns for advanced features
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS topics TEXT[] DEFAULT '{}';
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS show_on_roadmap BOOLEAN DEFAULT true;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS vote_score INT DEFAULT 100;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS reward INT DEFAULT 100;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS effort INT DEFAULT 1;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS cover_image TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS poll_id UUID;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS survey_id UUID;

-- Votes table (one vote per user per idea)
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(idea_id, user_id)
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES comments(id) ON DELETE CASCADE;

-- Guest interactions (for tracking guest votes/submissions)
CREATE TABLE IF NOT EXISTS guest_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  "action" TEXT DEFAULT 'vote',
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE guest_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can log guest interactions" ON guest_interactions;
DROP POLICY IF EXISTS "Anyone can log guest interactions" ON guest_interactions;
CREATE POLICY "Anyone can log guest interactions" ON guest_interactions FOR ALL USING (true);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  "action" TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Team Members table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id),
  role TEXT DEFAULT 'editor',
  status TEXT DEFAULT 'invited',
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Site Settings (singleton key-value store)
CREATE TABLE IF NOT EXISTS site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "value" JSONB,
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS order_index INT DEFAULT 0;

-- Announcements/Changelog table
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  tag TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Custom statuses table
CREATE TABLE IF NOT EXISTS statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  color TEXT DEFAULT '#94a3b8',
  bg TEXT DEFAULT '#f3f4f6',
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Surveys table
CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  "type" TEXT DEFAULT 'nps',
  question TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Survey responses
CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID REFERENCES surveys(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  score INT,
  response_text TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Polls table
CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  options JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Poll votes
CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  option_index INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(poll_id, user_id)
);

-- Segments table
CREATE TABLE IF NOT EXISTS segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  conditions JSONB DEFAULT '[]',
  match_type TEXT DEFAULT 'all',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add stats columns
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS views INT DEFAULT 0;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS impressions INT DEFAULT 0;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS poll_id UUID;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS survey_id UUID;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';

-- Terminology/Localization table
CREATE TABLE IF NOT EXISTS terminology (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default English terminology
INSERT INTO terminology (key, label, category, description) VALUES
-- Main sections
('ideas', 'Ideas', 'main', 'Title for the ideas/feedback section'),
('announcements', 'Announcements', 'main', 'Title for announcements section'),
('roadmap', 'Roadmap', 'main', 'Title for the roadmap section'),
('surveys', 'Surveys', 'main', 'Title for surveys section'),

-- Ideas related
('idea', 'Idea', 'ideas', 'Singular form of idea'),
('submit_idea', 'Submit Idea', 'ideas', 'Button to create new idea'),
('create_idea', 'Create Idea', 'ideas', 'Form title for creating idea'),
('vote', 'Vote', 'ideas', 'Action to vote on idea'),
('votes', 'Votes', 'ideas', 'Plural votes'),
('topics', 'Topics', 'ideas', 'Tags/categories for ideas'),
('status', 'Status', 'ideas', 'Current status of idea'),
('priority', 'Priority', 'ideas', 'Priority level'),
('comment', 'Comment', 'ideas', 'Singular comment'),
('comments', 'Comments', 'ideas', 'Plural comments'),

-- Admin
('admin', 'Admin', 'admin', 'Administration section'),

-- General
('trending', 'Trending', 'general', 'Trending/popular sorting'),
('latest', 'Latest', 'general', 'Newest items'),
('most_votes', 'Most Votes', 'general', 'Sort by most voted'),
('search', 'Search', 'general', 'Search action'),
('filter', 'Filter', 'general', 'Filter action'),
('sort', 'Sort', 'general', 'Sort action'),
('delete', 'Delete', 'general', 'Delete action'),
('edit', 'Edit', 'general', 'Edit action'),
('save', 'Save', 'general', 'Save action'),
('cancel', 'Cancel', 'general', 'Cancel action'),
('loading', 'Loading', 'general', 'Loading state'),
('no_results', 'No results', 'general', 'Empty state message') ON CONFLICT (key) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (so we can re-run safely)
DROP POLICY IF EXISTS "Ideas are viewable by everyone" ON ideas;

DROP POLICY IF EXISTS "Votes are viewable by everyone" ON votes;

DROP POLICY IF EXISTS "Announcements are viewable by everyone" ON announcements;

DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;

-- IDEAS policies
DROP POLICY IF EXISTS "Ideas are viewable by everyone" ON ideas;
DROP POLICY IF EXISTS "Ideas are viewable by everyone" ON ideas;
CREATE POLICY "Ideas are viewable by everyone" ON ideas FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can insert ideas" ON ideas;
DROP POLICY IF EXISTS "Anyone can insert ideas" ON ideas;
CREATE POLICY "Anyone can insert ideas" ON ideas FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update ideas" ON ideas;
DROP POLICY IF EXISTS "Anyone can update ideas" ON ideas;
CREATE POLICY "Anyone can update ideas" ON ideas FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Anyone can delete ideas" ON ideas;
DROP POLICY IF EXISTS "Anyone can delete ideas" ON ideas;
CREATE POLICY "Anyone can delete ideas" ON ideas FOR DELETE USING (true);

-- VOTES policies
DROP POLICY IF EXISTS "Votes are viewable by everyone" ON votes;
DROP POLICY IF EXISTS "Votes are viewable by everyone" ON votes;
CREATE POLICY "Votes are viewable by everyone" ON votes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert their own votes" ON votes;
DROP POLICY IF EXISTS "Users can insert their own votes" ON votes;
CREATE POLICY "Users can insert their own votes" ON votes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own votes" ON votes;
DROP POLICY IF EXISTS "Users can delete their own votes" ON votes;
CREATE POLICY "Users can delete their own votes" ON votes FOR DELETE USING (auth.uid() = user_id);

-- ANNOUNCEMENTS policies
DROP POLICY IF EXISTS "Announcements are viewable by everyone" ON announcements;
DROP POLICY IF EXISTS "Announcements are viewable by everyone" ON announcements;
CREATE POLICY "Announcements are viewable by everyone" ON announcements FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can insert announcements" ON announcements;
DROP POLICY IF EXISTS "Anyone can insert announcements" ON announcements;
CREATE POLICY "Anyone can insert announcements" ON announcements FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update announcements" ON announcements;
DROP POLICY IF EXISTS "Anyone can update announcements" ON announcements;
CREATE POLICY "Anyone can update announcements" ON announcements FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Anyone can delete announcements" ON announcements;
DROP POLICY IF EXISTS "Anyone can delete announcements" ON announcements;
CREATE POLICY "Anyone can delete announcements" ON announcements FOR DELETE USING (true);

-- COMMENTS policies
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;
CREATE POLICY "Comments are viewable by everyone" ON comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert comments" ON comments;
DROP POLICY IF EXISTS "Users can insert comments" ON comments;
CREATE POLICY "Users can insert comments" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON comments;
CREATE POLICY "Users can delete their own comments" ON comments FOR DELETE USING (auth.uid() = user_id);

-- STATUSES policies
DROP POLICY IF EXISTS "Statuses are viewable by everyone" ON statuses;
DROP POLICY IF EXISTS "Statuses are viewable by everyone" ON statuses;
CREATE POLICY "Statuses are viewable by everyone" ON statuses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can manage statuses" ON statuses;
DROP POLICY IF EXISTS "Anyone can manage statuses" ON statuses;
CREATE POLICY "Anyone can manage statuses" ON statuses FOR ALL USING (true);

-- SURVEYS policies
DROP POLICY IF EXISTS "Surveys are viewable by everyone" ON surveys;
DROP POLICY IF EXISTS "Surveys are viewable by everyone" ON surveys;
CREATE POLICY "Surveys are viewable by everyone" ON surveys FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can manage surveys" ON surveys;
DROP POLICY IF EXISTS "Anyone can manage surveys" ON surveys;
CREATE POLICY "Anyone can manage surveys" ON surveys FOR ALL USING (true);

-- SURVEY RESPONSES policies
DROP POLICY IF EXISTS "Survey responses are viewable by everyone" ON survey_responses;
DROP POLICY IF EXISTS "Survey responses are viewable by everyone" ON survey_responses;
CREATE POLICY "Survey responses are viewable by everyone" ON survey_responses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can submit responses" ON survey_responses;
DROP POLICY IF EXISTS "Anyone can submit responses" ON survey_responses;
CREATE POLICY "Anyone can submit responses" ON survey_responses FOR INSERT WITH CHECK (true);

-- POLLS policies
DROP POLICY IF EXISTS "Polls are viewable by everyone" ON polls;
DROP POLICY IF EXISTS "Polls are viewable by everyone" ON polls;
CREATE POLICY "Polls are viewable by everyone" ON polls FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can manage polls" ON polls;
DROP POLICY IF EXISTS "Anyone can manage polls" ON polls;
CREATE POLICY "Anyone can manage polls" ON polls FOR ALL USING (true);

-- POLL VOTES policies
DROP POLICY IF EXISTS "Poll votes are viewable by everyone" ON poll_votes;
DROP POLICY IF EXISTS "Poll votes are viewable by everyone" ON poll_votes;
CREATE POLICY "Poll votes are viewable by everyone" ON poll_votes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can vote in polls" ON poll_votes;
DROP POLICY IF EXISTS "Anyone can vote in polls" ON poll_votes;
CREATE POLICY "Anyone can vote in polls" ON poll_votes FOR INSERT WITH CHECK (true);

-- SEGMENTS policies
DROP POLICY IF EXISTS "Segments are viewable by everyone" ON segments;
DROP POLICY IF EXISTS "Segments are viewable by everyone" ON segments;
CREATE POLICY "Segments are viewable by everyone" ON segments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can manage segments" ON segments;
DROP POLICY IF EXISTS "Anyone can manage segments" ON segments;
CREATE POLICY "Anyone can manage segments" ON segments FOR ALL USING (true);

-- ACTIVITY policies
DROP POLICY IF EXISTS "Activity is viewable by everyone" ON activity;
DROP POLICY IF EXISTS "Activity is viewable by everyone" ON activity;
CREATE POLICY "Activity is viewable by everyone" ON activity FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can log activity" ON activity;
DROP POLICY IF EXISTS "Anyone can log activity" ON activity;
CREATE POLICY "Anyone can log activity" ON activity FOR ALL USING (true);

-- REACTIONS policies
DROP POLICY IF EXISTS "Reactions are viewable by everyone" ON reactions;
DROP POLICY IF EXISTS "Reactions are viewable by everyone" ON reactions;
CREATE POLICY "Reactions are viewable by everyone" ON reactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can manage reactions" ON reactions;
DROP POLICY IF EXISTS "Anyone can manage reactions" ON reactions;
CREATE POLICY "Anyone can manage reactions" ON reactions FOR ALL USING (true);

-- TEAM_MEMBERS policies
DROP POLICY IF EXISTS "Team members are viewable by everyone" ON team_members;
DROP POLICY IF EXISTS "Team members are viewable by everyone" ON team_members;
CREATE POLICY "Team members are viewable by everyone" ON team_members FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can manage team members" ON team_members;
DROP POLICY IF EXISTS "Anyone can manage team members" ON team_members;
CREATE POLICY "Anyone can manage team members" ON team_members FOR ALL USING (true);

-- SITE_SETTINGS policies

-- ============================================
-- AUTO-UPDATE VOTE COUNTS
-- ============================================
CREATE OR REPLACE FUNCTION update_idea_votes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE ideas SET votes = votes + 1 WHERE id = NEW.idea_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE ideas SET votes = GREATEST(votes - 1, 0) WHERE id = OLD.idea_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vote_count_trigger ON votes;
CREATE TRIGGER vote_count_trigger
AFTER INSERT OR DELETE ON votes
FOR EACH ROW EXECUTE FUNCTION update_idea_votes();

-- ============================================
-- ============================================

-- Allow anyone to upload images


-- ============================================
-- ============================================



-- ============================================
-- ENABLE REALTIME SUBSCRIPTIONS
-- This makes ideas, votes, comments, announcements update live across all clients
-- ============================================
DO $$
BEGIN
  -- Add tables to realtime publication (ignore if already added)
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE ideas; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE votes; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE comments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE announcements; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ============================================
-- DONE! Tables, policies, storage, and realtime configured
-- ============================================

-- ============================================
-- v23: LIKES, SUBSCRIPTIONS, ATOMIC STATS
-- (idempotent — safe to re-run)
-- ============================================

-- Idea stats columns
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS views INT DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS impressions INT DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0;

-- Likes table (auth users via user_id, guests via guest_id)
CREATE TABLE IF NOT EXISTS idea_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  user_id UUID,
  guest_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idea_likes_user_unique ON idea_likes (idea_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idea_likes_guest_unique ON idea_likes (idea_id, guest_id) WHERE guest_id IS NOT NULL;

-- Subscriptions table
CREATE TABLE IF NOT EXISTS idea_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  user_id UUID,
  guest_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idea_subs_user_unique ON idea_subscriptions (idea_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idea_subs_guest_unique ON idea_subscriptions (idea_id, guest_id) WHERE guest_id IS NOT NULL;

ALTER TABLE idea_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE idea_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Likes viewable by everyone" ON idea_likes;
DROP POLICY IF EXISTS "Likes viewable by everyone" ON idea_likes;
CREATE POLICY "Likes viewable by everyone" ON idea_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can like" ON idea_likes;
DROP POLICY IF EXISTS "Anyone can like" ON idea_likes;
CREATE POLICY "Anyone can like" ON idea_likes FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can unlike" ON idea_likes;
DROP POLICY IF EXISTS "Anyone can unlike" ON idea_likes;
CREATE POLICY "Anyone can unlike" ON idea_likes FOR DELETE USING (true);

DROP POLICY IF EXISTS "Subs viewable by everyone" ON idea_subscriptions;
DROP POLICY IF EXISTS "Subs viewable by everyone" ON idea_subscriptions;
CREATE POLICY "Subs viewable by everyone" ON idea_subscriptions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can subscribe" ON idea_subscriptions;
DROP POLICY IF EXISTS "Anyone can subscribe" ON idea_subscriptions;
CREATE POLICY "Anyone can subscribe" ON idea_subscriptions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can unsubscribe" ON idea_subscriptions;
DROP POLICY IF EXISTS "Anyone can unsubscribe" ON idea_subscriptions;
CREATE POLICY "Anyone can unsubscribe" ON idea_subscriptions FOR DELETE USING (true);

-- Keep ideas.likes in sync (mirrors vote_count_trigger)
CREATE OR REPLACE FUNCTION update_idea_likes()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE ideas SET likes = likes + 1 WHERE id = NEW.idea_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE ideas SET likes = GREATEST(likes - 1, 0) WHERE id = OLD.idea_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS like_count_trigger ON idea_likes;
CREATE TRIGGER like_count_trigger
AFTER INSERT OR DELETE ON idea_likes
FOR EACH ROW EXECUTE FUNCTION update_idea_likes();

-- Atomic stat increments (no read-modify-write race)
CREATE OR REPLACE FUNCTION increment_idea_stats(p_idea_id UUID, p_views INT DEFAULT 0, p_impressions INT DEFAULT 0)
RETURNS VOID AS $$
BEGIN
  UPDATE ideas
  SET views = COALESCE(views, 0) + p_views,
      impressions = COALESCE(impressions, 0) + p_impressions
  WHERE id = p_idea_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_announcement_stats(p_id UUID, p_views INT DEFAULT 0, p_impressions INT DEFAULT 0)
RETURNS VOID AS $$
BEGIN
  UPDATE announcements
  SET views = COALESCE(views, 0) + p_views,
      impressions = COALESCE(impressions, 0) + p_impressions
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- Realtime for new tables
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE idea_likes; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE idea_subscriptions; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ============================================
-- PHASE 2: IMAGE GALLERY
-- ============================================
CREATE TABLE IF NOT EXISTS idea_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE idea_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view idea images" ON idea_images;
DROP POLICY IF EXISTS "Anyone can view idea images" ON idea_images;
CREATE POLICY "Anyone can view idea images" ON idea_images FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can create idea images" ON idea_images;
DROP POLICY IF EXISTS "Users can create idea images" ON idea_images;
CREATE POLICY "Users can create idea images" ON idea_images FOR INSERT WITH CHECK (true);

-- ============================================
-- PHASE 3: IDEA MANAGEMENT
-- ============================================
CREATE TABLE IF NOT EXISTS idea_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(idea_id, assigned_to)
);
ALTER TABLE idea_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view assignments" ON idea_assignments;
DROP POLICY IF EXISTS "Anyone can view assignments" ON idea_assignments;
CREATE POLICY "Anyone can view assignments" ON idea_assignments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Team can create assignments" ON idea_assignments;
DROP POLICY IF EXISTS "Team can create assignments" ON idea_assignments;
CREATE POLICY "Team can create assignments" ON idea_assignments FOR INSERT WITH CHECK (true);

CREATE TABLE IF NOT EXISTS idea_internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE idea_internal_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin only internal notes" ON idea_internal_notes;
DROP POLICY IF EXISTS "Admin only internal notes" ON idea_internal_notes;
CREATE POLICY "Admin only internal notes" ON idea_internal_notes FOR ALL USING (auth.jwt() ->> 'email' = 'bishalstha76@gmail.com');

-- Idea merge tracking
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES ideas(id) ON DELETE SET NULL;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS is_merged BOOLEAN DEFAULT FALSE;

-- ============================================
-- PHASE 4: CUSTOM FIELDS
-- ============================================
CREATE TABLE IF NOT EXISTS custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text', -- text, number, dropdown, date, checkbox
  field_label TEXT NOT NULL,
  field_description TEXT,
  dropdown_options JSONB, -- for type='dropdown'
  is_required BOOLEAN DEFAULT FALSE,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view custom fields" ON custom_fields;
DROP POLICY IF EXISTS "Anyone can view custom fields" ON custom_fields;
CREATE POLICY "Anyone can view custom fields" ON custom_fields FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin can manage fields" ON custom_fields;
DROP POLICY IF EXISTS "Admin can manage fields" ON custom_fields;
CREATE POLICY "Admin can manage fields" ON custom_fields FOR ALL USING (auth.jwt() ->> 'email' = 'bishalstha76@gmail.com');

CREATE TABLE IF NOT EXISTS idea_custom_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  field_value TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(idea_id, field_id)
);
ALTER TABLE idea_custom_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view custom values" ON idea_custom_values;
DROP POLICY IF EXISTS "Anyone can view custom values" ON idea_custom_values;
CREATE POLICY "Anyone can view custom values" ON idea_custom_values FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update custom values" ON idea_custom_values;
DROP POLICY IF EXISTS "Users can update custom values" ON idea_custom_values;
CREATE POLICY "Users can update custom values" ON idea_custom_values FOR ALL WITH CHECK (true);

-- ============================================
-- PHASE 5: NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "type" TEXT NOT NULL, -- vote, comment, status_change, mention, assignment
  related_idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  related_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  actor_name TEXT,
  actor_email TEXT,
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_on_vote BOOLEAN DEFAULT TRUE,
  email_on_comment BOOLEAN DEFAULT TRUE,
  email_on_status_change BOOLEAN DEFAULT TRUE,
  email_on_mention BOOLEAN DEFAULT TRUE,
  email_on_assignment BOOLEAN DEFAULT TRUE,
  digest_frequency TEXT DEFAULT 'immediate', -- immediate, daily, weekly, never
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can view own preferences" ON notification_preferences;
CREATE POLICY "Users can view own preferences" ON notification_preferences FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON notification_preferences;
CREATE POLICY "Users can update own preferences" ON notification_preferences FOR ALL USING (user_id = auth.uid());

-- ============================================
-- PHASE 6: ANALYTICS
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- page_view, vote, comment, idea_create, status_change
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  event_metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can log analytics" ON analytics_events;
DROP POLICY IF EXISTS "Anyone can log analytics" ON analytics_events;
CREATE POLICY "Anyone can log analytics" ON analytics_events FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admin can view analytics" ON analytics_events;
DROP POLICY IF EXISTS "Admin can view analytics" ON analytics_events;
CREATE POLICY "Admin can view analytics" ON analytics_events FOR SELECT USING (auth.jwt() ->> 'email' = 'bishalstha76@gmail.com');

-- ============================================
-- PHASE 7: API & INTEGRATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,
  key_preview TEXT NOT NULL, -- first 8 chars for display
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE
);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can manage API keys" ON api_keys;
DROP POLICY IF EXISTS "Admin can manage API keys" ON api_keys;
CREATE POLICY "Admin can manage API keys" ON api_keys FOR ALL USING (auth.jwt() ->> 'email' = 'bishalstha76@gmail.com');

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- idea.created, idea.voted, idea.comment, idea.status_changed
  webhook_url TEXT NOT NULL,
  secret TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  last_triggered_at TIMESTAMP
);
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can manage webhooks" ON webhooks;
DROP POLICY IF EXISTS "Admin can manage webhooks" ON webhooks;
CREATE POLICY "Admin can manage webhooks" ON webhooks FOR ALL USING (auth.jwt() ->> 'email' = 'bishalstha76@gmail.com');

CREATE TABLE IF NOT EXISTS slack_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_team_id TEXT UNIQUE,
  slack_channel_id TEXT,
  slack_webhook_url TEXT,
  events_to_post JSONB DEFAULT '["idea.created", "status.changed"]',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE slack_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can manage slack" ON slack_integrations;
DROP POLICY IF EXISTS "Admin can manage slack" ON slack_integrations;
CREATE POLICY "Admin can manage slack" ON slack_integrations FOR ALL USING (auth.jwt() ->> 'email' = 'bishalstha76@gmail.com');


-- ============================================
-- STRIPE INTEGRATION
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  tier TEXT DEFAULT 'free', -- free, pro, enterprise
  status TEXT DEFAULT 'active', -- active, canceled, past_due
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
CREATE POLICY "Users can view own subscription" ON subscriptions FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admin can manage subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Admin can manage subscriptions" ON subscriptions;
CREATE POLICY "Admin can manage subscriptions" ON subscriptions FOR ALL USING (auth.jwt() ->> 'email' = 'bishalstha76@gmail.com');

-- Feature usage tracking
CREATE TABLE IF NOT EXISTS feature_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL, -- white_labeling, guest_voting, api_access, advanced_analytics
  usage_count INT DEFAULT 0,
  last_used TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE feature_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can track own features" ON feature_usage;
DROP POLICY IF EXISTS "Users can track own features" ON feature_usage;
CREATE POLICY "Users can track own features" ON feature_usage FOR ALL USING (user_id = auth.uid());

-- Stripe events log
CREATE TABLE IF NOT EXISTS stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE,
  event_type TEXT,
  event_data JSONB,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can view stripe events" ON stripe_events;
DROP POLICY IF EXISTS "Admin can view stripe events" ON stripe_events;
CREATE POLICY "Admin can view stripe events" ON stripe_events FOR SELECT USING (auth.jwt() ->> 'email' = 'bishalstha76@gmail.com');


-- ============================================
-- HELP CENTRE / KNOWLEDGE BASE
-- ============================================
CREATE TABLE IF NOT EXISTS help_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  category TEXT DEFAULT 'Getting Started',
  status TEXT DEFAULT 'draft',
  featured BOOLEAN DEFAULT false,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE help_articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view help articles" ON help_articles;
CREATE POLICY "Anyone can view help articles" ON help_articles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin can manage help articles" ON help_articles;
CREATE POLICY "Admin can manage help articles" ON help_articles FOR ALL USING (true);

-- ============================================
-- SUPPORT TICKETS
-- ============================================
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT,
  article_id TEXT,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can submit tickets" ON support_tickets;
CREATE POLICY "Anyone can submit tickets" ON support_tickets FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admin can view tickets" ON support_tickets;
CREATE POLICY "Admin can view tickets" ON support_tickets FOR SELECT USING (true);

-- ============================================
-- CHAT MESSAGES (Live Chat)
-- ============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  from_email TEXT,
  from_name TEXT,
  message TEXT NOT NULL,
  from_type TEXT DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can send chat messages" ON chat_messages;
CREATE POLICY "Anyone can send chat messages" ON chat_messages FOR ALL USING (true);

-- Add replies column to support_tickets
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS replies JSONB DEFAULT '[]';

-- Add replies column to support_tickets if not exists
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS replies JSONB DEFAULT '[]';

-- Add media column to help_articles
ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]';

-- Enable Realtime on chat_messages (run in Supabase dashboard > Database > Replication)
-- ALTER TABLE chat_messages REPLICA IDENTITY FULL;
-- Or add via Supabase dashboard: Database > Replication > Tables > chat_messages

-- SUPABASE REALTIME NOTE:
-- To enable realtime for live chat, go to:
-- Supabase Dashboard > Database > Replication > Tables
-- Enable 'chat_messages' table for realtime updates

-- Add SUPABASE_SERVICE_ROLE_KEY env var in Vercel for admin user creation

-- Add prioritization columns to ideas
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS impact INTEGER DEFAULT 3;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS effort INTEGER DEFAULT 3;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS confidence INTEGER DEFAULT 3;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 1;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';

-- ============================================
-- INTEGRATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id TEXT NOT NULL UNIQUE,
  config JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT false,
  events JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can manage integrations" ON integration_configs;
CREATE POLICY "Admin can manage integrations" ON integration_configs FOR ALL USING (true);

-- Add boost fields to announcements
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS boost_until TEXT DEFAULT 'next';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS boost_until_date TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS boost_button_label TEXT DEFAULT 'Learn More';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS boost_title TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS boost_blurb TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS boost_image TEXT;

-- ============================================
-- STORAGE BUCKETS (run in Supabase Dashboard > Storage)
-- ============================================
-- Create bucket named 'idea-images' with Public access:
-- 1. Go to Supabase Dashboard > Storage
-- 2. Click "New bucket"
-- 3. Name: idea-images
-- 4. Toggle "Public bucket" ON
-- 5. Click Save
-- This enables avatar and image uploads to work.

-- ============================================
-- COMPANIES (Multi-tenant)
-- ============================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  industry TEXT,
  description TEXT,
  logo_url TEXT,
  accent_color TEXT DEFAULT '#ff7a6b',
  is_private BOOLEAN DEFAULT false,
  plan TEXT DEFAULT 'free',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_idx ON companies (slug);
CREATE INDEX IF NOT EXISTS companies_owner_idx ON companies (owner_id);

ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Companies are viewable by everyone" ON companies;
CREATE POLICY "Companies are viewable by everyone" ON companies FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owners can update their company" ON companies;
CREATE POLICY "Owners can update their company" ON companies FOR UPDATE USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Users can create a company" ON companies;
CREATE POLICY "Users can create a company" ON companies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Owners can delete their company" ON companies;
CREATE POLICY "Owners can delete their company" ON companies FOR DELETE USING (auth.uid() = owner_id);

-- Add company_id columns (wrapped safely in case tables don't exist yet)
DO $$ BEGIN
  ALTER TABLE ideas ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE announcements ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE topics ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE comments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE votes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Add guest_id to votes for anonymous voting
ALTER TABLE votes ADD COLUMN IF NOT EXISTS guest_id TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS company_id UUID;

-- Allow anonymous votes (no user required)
DROP POLICY IF EXISTS "Anyone can vote" ON votes;
CREATE POLICY "Anyone can vote" ON votes FOR ALL USING (true);

-- Add plan column to companies (used by platform admin)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';

-- Platform admin can update plans
DROP POLICY IF EXISTS "Platform admin can update companies" ON companies;
CREATE POLICY "Platform admin can update companies" ON companies FOR UPDATE USING (true);

-- Custom domains for companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS board_domain TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS help_domain TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS board_domain_verified BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS help_domain_verified BOOLEAN DEFAULT false;

-- Add Vercel token env vars note
-- Add to Vercel environment variables:
-- VERCEL_TOKEN=your_vercel_api_token (from vercel.com/account/tokens)
-- VERCEL_PROJECT_ID=your_project_id (from Vercel project settings)
-- VERCEL_TEAM_ID=your_team_id (optional, only if using a team)

-- Manually set prexty company domains (run if needed)
-- UPDATE companies SET help_domain = 'help.prexty.com' WHERE slug = 'prexty';
-- UPDATE companies SET board_domain = 'feedback.prexty.com' WHERE slug = 'prexty';

-- Add company_id to help_articles and statuses for multi-tenant seeding
ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE statuses ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE statuses ADD COLUMN IF NOT EXISTS emoji TEXT;
ALTER TABLE statuses ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

-- Fix existing help articles that still say Frill
UPDATE help_articles SET 
  title = REPLACE(title, 'Frill', 'Colvy'),
  content = REPLACE(REPLACE(content, 'Frill', 'Colvy'), 'frill', 'colvy')
WHERE title LIKE '%Frill%' OR content LIKE '%Frill%';

-- Fix idea status values to match roadmap column keys
UPDATE ideas SET status = 'new' WHERE status = 'Under consideration' OR status = 'under_review' OR status = 'under review';
UPDATE ideas SET status = 'planned' WHERE status = 'Planned';
UPDATE ideas SET status = 'in_progress' WHERE status = 'In Development' OR status = 'in_development';
UPDATE ideas SET status = 'shipped' WHERE status = 'Shipped';

-- Make site_settings company-scoped
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS site_settings_key_company ON site_settings(key, company_id) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS site_settings_key_global ON site_settings(key) WHERE company_id IS NULL;

-- Forms feature (Typeform-like)
CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Form',
  questions JSONB DEFAULT '[]'::jsonb,
  theme JSONB DEFAULT '{}'::jsonb,
  welcome_message TEXT DEFAULT 'Welcome! This will only take a minute.',
  thank_you_message TEXT DEFAULT 'Thanks for completing this form!',
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read published forms" ON forms FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage forms" ON forms FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES forms(id) ON DELETE CASCADE,
  answers JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit form responses" ON form_responses FOR INSERT WITH CHECK (true);
CREATE POLICY "Form owners can read responses" ON form_responses FOR SELECT USING (true);

-- Poll/Survey rich media (already added previously, included here for completeness)
ALTER TABLE polls ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE polls ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Form post-submit actions (website/video/social/custom buttons)
ALTER TABLE forms ADD COLUMN IF NOT EXISTS end_actions JSONB DEFAULT '[]'::jsonb;

-- Forms: confetti toggle and rich media support on questions (questions JSONB already supports mediaUrl/mediaType/fileAccept per-question)
ALTER TABLE forms ADD COLUMN IF NOT EXISTS show_confetti BOOLEAN DEFAULT true;

-- Help Categories table
CREATE TABLE IF NOT EXISTS help_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(company_id, slug)
);

CREATE INDEX IF NOT EXISTS help_categories_company_idx ON help_categories(company_id);
CREATE INDEX IF NOT EXISTS help_categories_position_idx ON help_categories(company_id, position);

-- Add category_id to help_articles
ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES help_categories(id);
CREATE INDEX IF NOT EXISTS help_articles_category_id_idx ON help_articles(category_id);

-- Forms table updates for conditional logic & piping
-- Note: conditional_logic is already stored in JSON in the questions array
-- No migration needed - fields already supported in existing schema

-- Add optional columns for form display settings
ALTER TABLE forms ADD COLUMN IF NOT EXISTS display_style TEXT DEFAULT 'list'; -- 'list' or 'typeform'
ALTER TABLE forms ADD COLUMN IF NOT EXISTS enable_piping BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS forms_display_style_idx ON forms(company_id, display_style);
