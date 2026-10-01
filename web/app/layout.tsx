import ManagementQuickNav from './ManagementQuickNav';

export const metadata = { title: 'FiberBlaze WFM - Job Controller', description: 'Workforce Management' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body style={{ margin: 0, background: '#0A0A0B', color: '#fff', fontFamily: 'Inter, system-ui' }}>{children}<ManagementQuickNav /></body></html>
}
