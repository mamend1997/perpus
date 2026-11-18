import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, LogOut, Menu } from 'lucide-react';
import SchoolDashboard from './SchoolDashboard.jsx';
import SchoolModulePage from './SchoolModulePage.jsx';
import { schoolNavigation } from './schoolNavigation.js';
import './school.css';

export default function SchoolPortal({ account, onLogout }) {
  const [active, setActive] = useState('Dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    'Master Data': true,
    'Data Buku & Inventaris': true
  });
  const profileMenuRef = useRef(null);
  const school = account.school || {};
  const schoolName = school.name || 'Sekolah';
  const role = account.role || 'admin';
  const roleLabel = { admin: 'Administrator', kepsek: 'Kepala Sekolah', kapus: 'Kepala Perpustakaan', member: 'Anggota' }[role] || 'Anggota';

  const visibleNavigation = useMemo(() => schoolNavigation.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      children: item.children?.filter((child) => child.roles.includes(role))
    })).filter((item) => item.children ? item.children.length > 0 : item.roles.includes(role))
  })).filter((section) => section.items.length > 0), [role]);

  useEffect(() => {
    if (!profileOpen) return undefined;
    function closeProfile(event) {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && profileMenuRef.current?.contains(event.target)) return;
      setProfileOpen(false);
    }
    document.addEventListener('pointerdown', closeProfile);
    document.addEventListener('keydown', closeProfile);
    return () => {
      document.removeEventListener('pointerdown', closeProfile);
      document.removeEventListener('keydown', closeProfile);
    };
  }, [profileOpen]);

  function selectMenu(label) {
    setActive(label);
    setMobileOpen(false);
  }

  function toggleSection(label) {
    setExpandedSections((sections) => ({ ...sections, [label]: !sections[label] }));
  }

  return (
    <div className="school-app-shell">
      {mobileOpen && <button className="school-sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Tutup menu sekolah" />}
      <aside className={`school-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="school-sidebar-brand">
          <div className="brand-mark"><BookOpen size={21} /></div>
          <div><b>perpuskita<span>.</span></b><small>PORTAL SEKOLAH</small></div>
        </div>
        <div className="school-sidebar-tenant">
          <div className="workspace-logo">{schoolName.slice(0, 1).toUpperCase()}</div>
          <div><b>{schoolName}</b><span>Kode {school.code || '—'}</span></div>
        </div>
        <nav className="school-side-nav" aria-label="Menu perpustakaan sekolah">
          {visibleNavigation.map((section) => (
            <div className="school-nav-section" key={section.section}>
              <p>{section.section}</p>
              {section.items.map(({ label, icon: Icon, children }) => children ? (
                <div className="school-nav-parent" key={label}>
                  <button type="button" className={`school-nav-item school-nav-group ${children.some((child) => child.label === active) ? 'selected' : ''}`} aria-expanded={Boolean(expandedSections[label])} onClick={() => toggleSection(label)}>
                    <Icon size={17} /><span>{label}</span>{expandedSections[label] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {expandedSections[label] && <div className="school-nav-children">
                    {children.map(({ label: childLabel, icon: ChildIcon }) => (
                      <button type="button" key={childLabel} onClick={() => selectMenu(childLabel)} className={`school-nav-item school-nav-child ${active === childLabel ? 'selected' : ''}`}>
                        <ChildIcon size={15} /><span>{childLabel}</span>
                      </button>
                    ))}
                  </div>}
                </div>
              ) : (
                <button type="button" key={label} onClick={() => selectMenu(label)} className={`school-nav-item ${active === label ? 'selected' : ''}`}>
                  <Icon size={17} /><span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="school-sidebar-bottom">
          <div className="school-admin-profile">
            <span className="profile-avatar">{account.name.slice(0, 1).toUpperCase()}</span>
            <div><b>{account.name}</b><small>{roleLabel}</small></div>
          </div>
          <button type="button" className="school-logout-button" onClick={onLogout}><LogOut size={16} />Keluar</button>
        </div>
      </aside>

      <main className="school-main-area">
        <header className="school-topbar">
          <div className="school-topbar-left">
            <button type="button" className="school-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Buka menu sekolah"><Menu size={20} /></button>
            <div><span>{schoolName}</span><b>{active}</b></div>
          </div>
          <div className="school-profile-menu" ref={profileMenuRef}>
            <button type="button" className="school-profile-trigger" aria-label={`Profil ${account.name}`} aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => setProfileOpen((open) => !open)}>
              <span className="top-admin-avatar">{account.name.slice(0, 1).toUpperCase()}</span>
              <span className="school-profile-trigger-copy"><b>{account.name}</b><small>{account.email}</small></span>
              <ChevronDown size={15} />
            </button>
            {profileOpen && <div className="school-profile-dropdown" role="menu">
              <div><b>{account.name}</b><span>{account.email}</span></div>
              <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onLogout(); }}><LogOut size={15} />Keluar</button>
            </div>}
          </div>
        </header>

        <div className="school-page-content">
          {active === 'Dashboard' ? <SchoolDashboard account={account} /> : <SchoolModulePage active={active} />}
          <footer className="page-footer"><span>© {new Date().getFullYear()} PerpusKita</span><span>{schoolName}</span></footer>
        </div>
      </main>
    </div>
  );
}
