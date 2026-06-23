import { supabase } from '@/lib/supabase'

export async function createCustomField(name: string, label: string, type: string, dropdownOptions?: string[]) {
  try {
    const { data: existing } = await supabase
      .from('custom_fields')
      .select('order_index')
      .order('order_index', { ascending: false })
      .limit(1)
    
    const nextOrder = (existing?.[0]?.order_index ?? -1) + 1
    
    const { data, error } = await supabase.from('custom_fields').insert({
      field_name: name,
      field_label: label,
      field_type: type,
      dropdown_options: type === 'dropdown' ? dropdownOptions : null,
      order_index: nextOrder,
    }).select().single()
    
    if (error) throw error
    return data
  } catch (err) {
    throw new Error('Field creation failed: ' + (err as any).message)
  }
}

export async function deleteCustomField(fieldId: string) {
  try {
    await supabase.from('custom_fields').delete().eq('id', fieldId)
  } catch (err) {
    throw new Error('Field deletion failed: ' + (err as any).message)
  }
}

export async function fetchCustomFields() {
  try {
    const { data } = await supabase
      .from('custom_fields')
      .select('*')
      .order('order_index', { ascending: true })
    return data || []
  } catch {
    return []
  }
}

export async function setCustomFieldValue(ideaId: string, fieldId: string, value: string) {
  try {
    const { error } = await supabase.from('idea_custom_values').upsert({
      idea_id: ideaId,
      field_id: fieldId,
      field_value: value,
    })
    if (error) throw error
  } catch (err) {
    throw new Error('Field value update failed: ' + (err as any).message)
  }
}

export async function fetchIdeaCustomValues(ideaId: string) {
  try {
    const { data } = await supabase
      .from('idea_custom_values')
      .select('*')
      .eq('idea_id', ideaId)
    return data || []
  } catch {
    return []
  }
}
