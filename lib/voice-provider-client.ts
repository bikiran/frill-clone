import { supabase } from './supabase'

// Which provider handles calls for this company, read in the browser so the
// calling components (CallBar, IncomingCallListener) know whether to use the
// Telnyx WebRTC SDK or the Twilio Voice SDK. Defaults to Telnyx and tolerates
// the voice_provider column not existing yet.
export async function getVoiceProvider(companyId: string): Promise<'telnyx' | 'twilio'> {
  try {
    const { data } = await (supabase as any).from('companies').select('voice_provider').eq('id', companyId).maybeSingle()
    // Twilio unless a company is still explicitly on legacy Telnyx.
    return data?.voice_provider === 'telnyx' ? 'telnyx' : 'twilio'
  } catch { return 'twilio' }
}
