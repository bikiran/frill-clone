import { supabase } from '@/lib/supabase'

export async function uploadIdeaImage(ideaId: string, file: File) {
  try {
    const fileName = `ideas/${ideaId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
    const { data, error } = await supabase.storage.from('idea-images').upload(fileName, file)
    if (error) throw error
    
    const { data: { publicUrl } } = supabase.storage.from('idea-images').getPublicUrl(data.path)
    
    // Get max order_index
    const { data: images } = await supabase
      .from('idea_images')
      .select('order_index')
      .eq('idea_id', ideaId)
      .order('order_index', { ascending: false })
      .limit(1)
    
    const nextOrder = (images?.[0]?.order_index ?? -1) + 1
    
    // Save to DB
    const { data: imgRecord, error: dbErr } = await supabase
      .from('idea_images')
      .insert({ idea_id: ideaId, image_url: publicUrl, order_index: nextOrder })
      .select()
      .single()
    
    if (dbErr) throw dbErr
    return imgRecord
  } catch (err: any) {
    throw new Error('Image upload failed: ' + err.message)
  }
}

export async function deleteIdeaImage(imageId: string) {
  try {
    const { error } = await supabase.from('idea_images').delete().eq('id', imageId)
    if (error) throw error
  } catch (err: any) {
    throw new Error('Image delete failed: ' + err.message)
  }
}

export async function reorderIdeaImages(ideaId: string, orderedIds: string[]) {
  try {
    await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from('idea_images').update({ order_index: idx }).eq('id', id)
      )
    )
  } catch (err: any) {
    throw new Error('Reorder failed: ' + err.message)
  }
}

export async function fetchIdeaImages(ideaId: string) {
  try {
    const { data, error } = await supabase
      .from('idea_images')
      .select('*')
      .eq('idea_id', ideaId)
      .order('order_index', { ascending: true })
    
    if (error) throw error
    return data || []
  } catch (err: any) {
    console.error('Fetch images failed:', err)
    return []
  }
}
