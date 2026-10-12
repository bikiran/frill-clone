import { redirect } from 'next/navigation'

// AI Knowledge lives under Settings, where the settings tabs show where you
// are. Old links to /admin/ai-knowledge land there.
export default function AiKnowledgeRedirect() {
  redirect('/admin/crm-settings/ai-knowledge')
}
