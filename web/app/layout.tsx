import ManagementQuickNav from './ManagementQuickNav';
import './globals.css';

export const metadata = {
  title: 'FiberBlaze WFM',
  description: 'FiberBlaze Workforce Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="fb-app">
          <ManagementQuickNav />
          <div className="fb-content">
            <header className="fb-topbar">
              <div className="fb-topbar-left">
                <div className="fb-topbar-logo-wrap">
                  <img className="fb-topbar-logo" src="/images/fiberblaze-logo.png" alt="FiberBlaze" />
                </div>
                <div>
                  <div className="fb-mobile-bar">
                    <span className="fb-topbar-title">WFM</span>
                  </div>
                  <div className="fb-topbar-title" style={{display:'var(--desktop-title, block)'}}>Workforce Management</div>
                  <div className="fb-topbar-meta">Field operations command center</div>
                </div>
              </div>
              <div className="fb-user">
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:11,fontWeight:800}}>FiberBlaze Operations</div>
                  <div className="fb-topbar-meta">Secure workspace</div>
                </div>
                <div className="fb-avatar">FB</div>
              </div>
            </header>
            <div className="fb-page">{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}
