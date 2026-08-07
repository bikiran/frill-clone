// Next.js runs this once when the server process starts. We use it to install a
// global capture of console.error / console.warn on the Node runtime, which
// mirrors server-side failures into the api_logs table for the Super Admin
// console's API Logs page. Edge runtime is skipped — the capture writes to
// Supabase with the service role, which belongs on the Node server.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { installConsoleCapture } = await import('./lib/api-log')
      installConsoleCapture()
    } catch {
      /* diagnostics are best-effort — never block server startup */
    }
  }
}
