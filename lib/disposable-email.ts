// Throwaway ("disposable") email domains. Used as one risk signal on sign-up
// attempts: someone signing up a business with a 10-minute inbox is rarely a
// real customer. Not a block: a real person can still use one.
//
// Short on purpose: the providers that actually turn up, not the 100,000-line
// public lists. Subdomains count (e.g. "x.mailinator.com").

const DISPOSABLE = new Set([
  '0-mail.com', '10minutemail.com', '10minutemail.net', '10minmail.com', '20minutemail.com', '33mail.com',
  'anonbox.net', 'anonymbox.com', 'burnermail.io', 'byom.de', 'clrmail.com', 'cock.li', 'crazymailing.com',
  'deadaddress.com', 'discard.email', 'discardmail.com', 'dispostable.com', 'dropmail.me', 'easytrashmail.com',
  'emailondeck.com', 'emailfake.com', 'emltmp.com', 'fakeinbox.com', 'fakemail.net', 'fakemailgenerator.com',
  'fexpost.com', 'fextemp.com', 'getairmail.com', 'getnada.com', 'gmailnator.com', 'guerrillamail.biz',
  'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamailblock.com', 'harakirimail.com', 'inboxbear.com', 'inboxkitten.com', 'incognitomail.org',
  'jetable.org', 'kurzepost.de', 'linshiyouxiang.net', 'mail-temp.com', 'mail.tm', 'mail7.io', 'mailcatch.com',
  'maildrop.cc', 'mailinator.com', 'mailinator.net', 'mailinator2.com', 'mailnesia.com', 'mailpoof.com',
  'mailsac.com', 'mailtemp.net', 'mintemail.com', 'mohmal.com', 'moakt.com', 'mytemp.email', 'mytrashmail.com',
  'nada.email', 'nowmymail.com', 'owlymail.com', 'sharklasers.com', 'spam4.me', 'spambox.us', 'spamgourmet.com',
  'spamex.com', 'tafmail.com', 'temp-mail.io', 'temp-mail.org', 'tempail.com', 'tempinbox.com', 'tempm.com',
  'tempmail.dev', 'tempmail.net', 'tempmail.plus', 'tempmailo.com', 'tempr.email', 'throwawaymail.com',
  'tmail.ws', 'tmailor.com', 'tmpmail.net', 'tmpmail.org', 'trash-mail.com', 'trashmail.com', 'trashmail.de',
  'trashmail.net', 'trbvm.com', 'vomoto.com', 'wegwerfmail.de', 'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'zeroe.ml', 'grr.la', 'pokemail.net', 'spamthisplease.com', 'emailtemporanea.net', 'luxusmail.org',
  'mailbox.in.ua', 'minuteinbox.com', 'qq.cm', 'rootfest.net', 'smashmail.de', 'temporary-mail.net',
])

/** The domain part of an address, lower-cased ('' when there's none). */
export function emailDomain(email: string | null | undefined): string {
  const at = String(email || '').lastIndexOf('@')
  return at < 0 ? '' : String(email).slice(at + 1).trim().toLowerCase().replace(/\.$/, '')
}

/** Is this address (or bare domain) at a known throwaway provider? */
export function isDisposableEmail(emailOrDomain: string | null | undefined): boolean {
  const s = String(emailOrDomain || '').toLowerCase()
  let d = s.includes('@') ? emailDomain(s) : s.trim()
  while (d) {
    if (DISPOSABLE.has(d)) return true
    const dot = d.indexOf('.')
    if (dot < 0) break
    d = d.slice(dot + 1)
    if (!d.includes('.')) break    // stop at the bare TLD
  }
  return false
}
