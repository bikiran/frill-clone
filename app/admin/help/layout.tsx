import { HelpFrame } from '@/components/help/HelpShell'

// One Help Centre frame (menu + page card) for Articles, Reporting, Import and
// Settings, so switching between them doesn't redraw the whole screen.
export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <HelpFrame>{children}</HelpFrame>
}
