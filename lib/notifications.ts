import { supabase } from '@/lib/supabase'

export async function createNotification(userId: string, type: string, relatedIdeaId?: string, message?: string, actorName?: string, actorEmail?: string) {
  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      type,
      related_idea_id: relatedIdeaId,
      message,
      actor_name: actorName,
      actor_email: actorEmail,
    })
  } catch (err) {
    console.error('Notification creation failed:', err)
  }
}

export async function fetchUserNotifications(userId: string, limit = 50) {
  try {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(limit)
    return data || []
  } catch {
    return []
  }
}

export async function markNotificationAsRead(notificationId: string) {
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId)
  } catch (err) {
    console.error('Mark as read failed:', err)
  }
}

export async function fetchNotificationPreferences(userId: string) {
  try {
    const { data } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single()
    return data || null
  } catch {
    return null
  }
}

export async function updateNotificationPreferences(userId: string, prefs: any) {
  try {
    await supabase.from('notification_preferences').upsert({
      user_id: userId,
      ...prefs,
      updated_at: new Date().toISOString(),
    })
  } catch (err) {
    throw new Error('Preferences update failed: ' + (err as any).message)
  }
}

// Log event for analytics
export async function logAnalyticsEvent(eventType: string, ideaId?: string, metadata?: any) {
  try {
    const { data: session } = await supabase.auth.getSession()
    await supabase.from('analytics_events').insert({
      event_type: eventType,
      idea_id: ideaId,
      user_id: session.session?.user.id,
      user_email: session.session?.user.email,
      event_metadata: metadata,
    })
  } catch (err) {
    console.error('Analytics log failed:', err)
  }
}
