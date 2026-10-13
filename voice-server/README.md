# Colvy voice relay

The always-on piece of the AI phone agent. Twilio's real-time voice
(ConversationRelay) keeps a WebSocket open for the whole call; Vercel can't, so
this small server holds it and forwards each turn to Colvy
(`POST /api/phone-agent/relay`), streaming Colvy's reply back to Twilio word by
word. It holds no database keys — only Colvy's address and a shared secret.

## Deploy on Railway (about 10 minutes)

1. **Make a secret.** Any long random string, e.g. run `openssl rand -hex 32`.
2. **Railway** → New Project → *Deploy from GitHub repo* → pick this repo.
   - Service → Settings → **Root Directory**: `voice-server` (Railway then builds the Dockerfile here).
   - Variables: `COLVY_URL` = `https://colvy.com`, `VOICE_RELAY_SECRET` = the secret.
   - Settings → Networking → **Generate Domain**. You get something like `colvy-voice-production.up.railway.app`.
   - Open `https://<that domain>/health` — it should say `ok`.
3. **Vercel** → the Colvy project → Settings → Environment Variables (Production):
   - `VOICE_RELAY_URL` = `wss://<that domain>/relay`
   - `VOICE_RELAY_SECRET` = the same secret.
   Then redeploy Colvy so it picks them up.
4. **Twilio** → if ConversationRelay isn't enabled on the account yet, the Twilio
   Console asks you to accept the *Predictive and Generative AI/ML Features
   Addendum* (Voice → Settings). Accept it.
5. In Colvy → Calls & SMS → **AI phone agent**, the card should now say
   **Real-time: on**. Call from a test number.

Any host that runs a Docker container and gives it a public HTTPS address works
the same way (Fly.io, Render's paid plans, a VPS). Avoid hosts that put idle
services to sleep — the first call would wait for it to wake.

If the relay is down, Twilio can't connect: callers hear an apology and go to
voicemail. Removing `VOICE_RELAY_URL` from Vercel switches the agent back to
the slower turn-by-turn mode.

## Local check

```
npm install
npm test
```
