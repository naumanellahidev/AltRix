-- Create user_web_push_subscriptions table
CREATE TABLE IF NOT EXISTS user_web_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    device_info TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on user_web_push_subscriptions
ALTER TABLE user_web_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policy for user_web_push_subscriptions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_web_push_subscriptions' AND policyname = 'Users can manage their own subscriptions'
    ) THEN
        CREATE POLICY "Users can manage their own subscriptions"
            ON user_web_push_subscriptions
            FOR ALL
            TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- Create user_notification_preferences table
CREATE TABLE IF NOT EXISTS user_notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on user_notification_preferences
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Create policy for user_notification_preferences
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_notification_preferences' AND policyname = 'Users can manage their own preferences'
    ) THEN
        CREATE POLICY "Users can manage their own preferences"
            ON user_notification_preferences
            FOR ALL
            TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- Add category and action_url columns to app_notifications if not exist
ALTER TABLE app_notifications ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE app_notifications ADD COLUMN IF NOT EXISTS action_url TEXT;

-- Create index on category
CREATE INDEX IF NOT EXISTS idx_notifications_category ON app_notifications(category);
