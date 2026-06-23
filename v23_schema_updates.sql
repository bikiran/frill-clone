
-- Create idea_likes table
CREATE TABLE idea_likes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX idea_likes_user_id_idx ON idea_likes(user_id);
CREATE INDEX idea_likes_guest_id_idx ON idea_likes(guest_id);

-- Create idea_subscriptions table  
CREATE TABLE idea_subscriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()  
);
CREATE INDEX idea_subscriptions_user_id_idx ON idea_subscriptions(user_id);  
CREATE INDEX idea_subscriptions_guest_id_idx ON idea_subscriptions(guest_id);

-- Add likes column to ideas table
ALTER TABLE ideas ADD COLUMN likes INT DEFAULT 0;

-- Create trigger to maintain likes count
CREATE OR REPLACE FUNCTION increment_likes()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ideas 
  SET likes = likes + 1
  WHERE id = NEW.idea_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER increment_likes_trigger
  AFTER INSERT ON idea_likes
  FOR EACH ROW
  EXECUTE PROCEDURE increment_likes();  
