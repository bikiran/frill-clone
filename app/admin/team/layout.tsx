import SettingsShell from '@/components/settings/SettingsShell'

// Inside the Settings area, with its menu (components/settings/SettingsShell).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>
}
