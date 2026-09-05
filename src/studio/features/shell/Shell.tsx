import { useEffect, useState, type FC, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, MapPin, Search, Plus, ExternalLink, LogOut, Moon, Sun, Menu as MenuIcon, X, PanelLeftClose, PanelLeftOpen, Wifi, WifiOff, FlaskConical } from 'lucide-react';
import { collections } from '../../schema';
import { siteBuild, isMock } from '../../api';
import { timeAgo } from '../../studio-lib';
import { collectionIcon } from '../../ui/CommandPalette';
import { Button, Kbd, Menu, Pill } from '../../ui/primitives';

export interface ShellProps {
  children: ReactNode;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenPalette: () => void;
  onSignOut: () => void;
  crumbs?: ReactNode;
}

const SITE_URL = import.meta.env.BASE_URL;
const isActive = (loc: string, href: string) => (href === '/' ? loc === '/' : loc === href || loc.startsWith(href + '/'));

/** Sidebar + top bar. Collapses to an icon rail; on phones it is a drawer. */
export const Shell: FC<ShellProps> = ({ children, theme, onToggleTheme, onOpenPalette, onSignOut, crumbs }) => {
  const [loc, navigate] = useLocation();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('studio.rail') === '1'; } catch { return false; } });
  const [drawer, setDrawer] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const build = useQuery({ queryKey: ['site-build'], queryFn: siteBuild, refetchInterval: 90_000, staleTime: 60_000 });

  useEffect(() => { setDrawer(false); }, [loc]);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  const toggleRail = () => { const n = !collapsed; setCollapsed(n); try { localStorage.setItem('studio.rail', n ? '1' : '0'); } catch { /* fine */ } };

  const folders = collections.filter((c) => c.kind === 'folder');
  const files = collections.filter((c) => c.kind === 'file');
  const NavLink: FC<{ href: string; icon: ReactNode; label: string; badge?: ReactNode }> = ({ href, icon, label, badge }) => (
    <Link href={href} className={`nav__link${isActive(loc, href) ? ' is-active' : ''}`} aria-current={isActive(loc, href) ? 'page' : undefined} title={collapsed ? label : undefined}>
      <span className="nav__icon" aria-hidden>{icon}</span>
      <span className="nav__label">{label}</span>
      {badge && <span className="nav__badge">{badge}</span>}
    </Link>
  );

  return (
    <div className={`sd${collapsed ? ' sd--rail' : ''}${drawer ? ' sd--drawer' : ''}`}>
      <aside className="sd__side" aria-label="Studio navigation">
        <div className="sd__brand">
          <Link href="/" className="brand"><span className="brand__mark" aria-hidden>◆</span><span className="brand__name">Studio</span></Link>
          <button type="button" className="rail-toggle" onClick={toggleRail} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
          <button type="button" className="drawer-close" onClick={() => setDrawer(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav className="nav">
          <NavLink href="/" icon={<LayoutDashboard size={17} />} label="Dashboard" />
          <div className="nav__group">Content</div>
          {folders.map((c) => <NavLink key={c.id} href={`/c/${c.id}`} icon={collectionIcon(c.id, 17)} label={c.label} />)}
          <NavLink href="/field-log" icon={<MapPin size={17} />} label="Field log" badge={<span className="nav__tag">offline</span>} />
          <div className="nav__group">Site</div>
          {files.map((c) => <NavLink key={c.id} href={`/file/${c.id}`} icon={collectionIcon(c.id, 17)} label={c.label} />)}
        </nav>
        <div className="sd__foot">
          <div className="status">
            <span className={`status__dot${online ? ' is-on' : ''}`} aria-hidden />
            <span className="status__text">
              {!online ? 'Offline · captures still save' : isMock() ? 'Demo · nothing publishes' : build.data?.at ? `Live · built ${timeAgo(build.data.at)}` : 'Live'}
            </span>
          </div>
          <a className="nav__link nav__link--sub" href={SITE_URL} target="_blank" rel="noopener"><span className="nav__icon" aria-hidden><ExternalLink size={16} /></span><span className="nav__label">View site</span></a>
          <button type="button" className="nav__link nav__link--sub" onClick={onToggleTheme}><span className="nav__icon" aria-hidden>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</span><span className="nav__label">{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span></button>
          <button type="button" className="nav__link nav__link--sub" onClick={onSignOut}><span className="nav__icon" aria-hidden><LogOut size={16} /></span><span className="nav__label">Sign out</span></button>
        </div>
      </aside>
      {drawer && <div className="sd__scrim" onClick={() => setDrawer(false)} aria-hidden />}

      <div className="sd__main">
        <header className="topbar">
          <button type="button" className="topbar__menu" onClick={() => setDrawer(true)} aria-label="Open menu"><MenuIcon size={20} /></button>
          <div className="topbar__crumbs">{crumbs}</div>
          <div className="topbar__spacer" />
          {isMock() && <Pill tone="info" dot title="An in-memory copy of the site. Nothing you do here is published."><FlaskConical size={12} /> demo</Pill>}
          <button type="button" className="topbar__search" onClick={onOpenPalette} aria-label="Search and commands">
            <Search size={15} aria-hidden /><span className="topbar__search-label">Search or jump to…</span><Kbd>⌘K</Kbd>
          </button>
          <Menu open={newOpen} setOpen={setNewOpen} align="right"
            trigger={(p) => <Button variant="primary" size="sm" icon={<Plus size={15} />} {...p}>New</Button>}
            items={folders.map((c) => ({ label: c.label.replace(/s$/, ''), icon: collectionIcon(c.id, 15), onSelect: () => navigate(`/c/${c.id}/new`) }))} />
          <span className={`topbar__net${online ? '' : ' is-off'}`} title={online ? 'Online' : 'Offline'} aria-hidden>{online ? <Wifi size={15} /> : <WifiOff size={15} />}</span>
        </header>
        <main className="sd__content" id="main">{children}</main>
      </div>
    </div>
  );
};
