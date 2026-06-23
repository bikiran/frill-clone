import { supabase } from '@/lib/supabase'

// Merge ideas
export async function mergeIdeas(sourceId: string, targetId: string) {
  try {
    // Move all votes to target
    await supabase.rpc('merge_idea_votes', { source_idea_id: sourceId, target_idea_id: targetId })
    
    // Move all comments to target
    await supabase.from('comments').update({ idea_id: targetId }).eq('idea_id', sourceId)
    
    // Mark source as merged
    await supabase.from('ideas').update({
      is_merged: true,
      merged_into: targetId,
      is_archived: true,
    }).eq('id', sourceId)
    
    return true
  } catch (err) {
    throw new Error('Merge failed: ' + (err as any).message)
  }
}

// Assign idea to team member
export async function assignIdea(ideaId: string, userId: string) {
  try {
    const { error } = await supabase.from('idea_assignments').insert({
      idea_id: ideaId,
      assigned_to: userId,
      assigned_by: (await supabase.auth.getSession()).data.session?.user.id,
    })
    if (error) {
      if (error.code === '23505') return // Already assigned
      throw error
    }
  } catch (err) {
    throw new Error('Assignment failed: ' + (err as any).message)
  }
}

// Unassign idea
export async function unassignIdea(ideaId: string, userId: string) {
  try {
    await supabase.from('idea_assignments').delete().eq('idea_id', ideaId).eq('assigned_to', userId)
  } catch (err) {
    throw new Error('Unassign failed: ' + (err as any).message)
  }
}

// Add internal note
export async function addInternalNote(ideaId: string, content: string) {
  try {
    const { data: session } = await supabase.auth.getSession()
    const { error } = await supabase.from('idea_internal_notes').insert({
      idea_id: ideaId,
      user_id: session.session!.user.id,
      content,
    })
    if (error) throw error
  } catch (err) {
    throw new Error('Note failed: ' + (err as any).message)
  }
}

// Fetch idea assignments
export async function fetchAssignments(ideaId: string) {
  try {
    const { data } = await supabase
      .from('idea_assignments')
      .select('*, assigned_to_user:auth.users(id, email, user_metadata)')
      .eq('idea_id', ideaId)
    return data || []
  } catch {
    return []
  }
}

// Fetch internal notes
export async function fetchInternalNotes(ideaId: string) {
  try {
    const { data } = await supabase
      .from('idea_internal_notes')
      .select('*')
      .eq('idea_id', ideaId)
      .order('created_at', { ascending: false })
    return data || []
  } catch {
    return []
  }
}
