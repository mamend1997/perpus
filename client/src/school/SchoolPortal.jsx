import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Pencil } from 'lucide-react';
import SchoolDashboard from './SchoolDashboard.jsx';
import SchoolModulePage from './SchoolModulePage.jsx';
import SchoolMasterDataPage from './SchoolMasterDataPage.jsx';
import SchoolIdentityPage from './SchoolIdentityPage.jsx';
import SchoolBookCatalogPage from './SchoolBookCatalogPage.jsx';
import SchoolBookStockPage from './SchoolBookStockPage.jsx';
import SchoolRackTransfersPage from './SchoolRackTransfersPage.jsx';
import SchoolBookItemsPage from './SchoolBookItemsPage.jsx';
import SchoolLoansPage from './SchoolLoansPage.jsx';
import SchoolFinesPage from './SchoolFinesPage.jsx';
import SchoolVisitorsPage from './SchoolVisitorsPage.jsx';
import SchoolProcurementsPage from './SchoolProcurementsPage.jsx';
import SchoolProfileEditor from './SchoolProfileEditor.jsx';
import SchoolSettingsPage from './SchoolSettingsPage.jsx';
import SchoolReservationsPage from './SchoolReservationsPage.jsx';
import SchoolReviewsPage from './SchoolReviewsPage.jsx';
import SchoolPublicPortalPage from './SchoolPublicPortalPage.jsx';
import SchoolAnnouncementsPage from './SchoolAnnouncementsPage.jsx';
import SchoolAcademicYearsPage from './SchoolAcademicYearsPage.jsx';
import { fetchSchoolIdentity, fetchSchoolProfile } from './schoolAccountApi.js';
import { fetchMobileNavbarSettings, fetchMySchoolPermissions } from './schoolSettingsApi.js';
import { defaultMobileNavbarSettings, masterCategoryTypes, schoolNavigation } from './schoolNavigation.js';
import { defaultSchoolPermissions, schoolPermissionByLabel } from './schoolPermissions.js';
import SchoolPrintHeader from './SchoolPrintHeader.jsx';
import useSchoolFavicon from './useSchoolFavicon.js';
import './school.css';

const SchoolCirculationAnalyticsPage = lazy(() => import('./SchoolCirculationAnalyticsPage.jsx'));
const SchoolReportsPage = lazy(() => import('./SchoolReportsPage.jsx'));
const SchoolStudentsPage = lazy(() => import('./SchoolStudentsPage.jsx'));

class StudentPageErrorBoundary extends Component {
  state = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="library-error" role="alert">
          <span>Halaman Data Siswa gagal ditampilkan: {this.state.error.message || 'terjadi kesalahan saat memuat data.'}</span>
          <button type="button" onClick={() => this.setState((state) => ({ error: null, retryKey: state.retryKey + 1 }))}>Coba lagi</button>
        </div>
      );
    }
    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}

export default function SchoolPortal({ account, onLogout, onAccountUpdated }) {
  const [active, setActive] = useState('Dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profile, setProfile] = useState({ id: account.id, name: account.name, email: account.email, avatar: null });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [printIdentity, setPrintIdentity] = useState(() => ({
    name: account.school?.name || 'Sekolah',
    logo: account.school?.logo || null,
    npsn: account.school?.npsn || ''
  }));
  const [printIdentityError, setPrintIdentityError] = useState('');
  const [mobileNavbarSettings, setMobileNavbarSettings] = useState(() => ({
    items: [...defaultMobileNavbarSettings.items],
    highlight: defaultMobileNavbarSettings.highlight
  }));
  const [mobileNavbarError, setMobileNavbarError] = useState('');
  const [permissions, setPermissions] = useState(null);
  const [permissionsLoading, setPermissionsLoading] = useState(account.role !== 'admin');
  const [permissionsError, setPermissionsError] = useState('');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('school-sidebar-collapsed') === 'true');
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    'Data Buku': true,
    'Sirkulasi Buku': true,
    'Master Data': true,
  });
  const profileMenuRef = useRef(null);
  const school = account.school || {};
  const schoolName = school.name || 'Sekolah';
  const role = account.role || 'admin';
  const activeMasterType = masterCategoryTypes[active];

  function canView(feature) {
    return role === 'admin' || Boolean(permissions?.[feature]?.view);
  }

  const visibleNavigation = useMemo(() => schoolNavigation.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      children: item.children?.filter((child) => child.roles.includes(role) && canView(child.permission))
    })).filter((item) => item.children
      ? item.children.length > 0
      : item.roles.includes(role) && (!item.permission || canView(item.permission)))
  })).filter((section) => section.items.length > 0), [role, permissions]);
  const mobileNavbarItems = useMemo(() => {
    const accessibleItems = visibleNavigation.flatMap((section) => section.items
      .flatMap((item) => item.children || [item]));
    const accessibleByLabel = new Map(accessibleItems.map((item) => [item.label, item]));
    const configured = mobileNavbarSettings.items
      .filter((label) => accessibleByLabel.has(label))
      .map((label) => accessibleByLabel.get(label));
    const configuredLabels = new Set(configured.map((item) => item.label));
    const fallback = accessibleItems.filter((item) => !configuredLabels.has(item.label));
    return [...configured, ...fallback].slice(0, 5);
  }, [visibleNavigation, mobileNavbarSettings]);
  const mobileNavbarHighlight = mobileNavbarItems.some((item) => item.label === mobileNavbarSettings.highlight)
    ? mobileNavbarSettings.highlight
    : mobileNavbarItems[0]?.label;

  const activePermissionFeature = activeMasterType ? `master.${activeMasterType}` : schoolPermissionByLabel[active];
  const activeRights = role === 'admin'
    ? { view: true, edit: true, delete: true }
    : permissions?.[activePermissionFeature] || defaultSchoolPermissions()[activePermissionFeature];

  useEffect(() => {
    let activeRequest = true;
    fetchMobileNavbarSettings()
      .then(({ settings }) => {
        if (activeRequest) {
          setMobileNavbarSettings({ items: [...settings.items], highlight: settings.highlight });
          setMobileNavbarError('');
        }
      })
      .catch((error) => { if (activeRequest) setMobileNavbarError(error.message); });
    return () => { activeRequest = false; };
  }, []);

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

  useEffect(() => {
    if (role === 'admin') {
      setPermissions(null);
      setPermissionsError('');
      setPermissionsLoading(false);
      return undefined;
    }
    let activeRequest = true;
    setPermissionsLoading(true);
    setPermissionsError('');
    fetchMySchoolPermissions()
      .then(({ permissions: currentPermissions }) => {
        if (activeRequest) setPermissions(currentPermissions);
      })
      .catch((error) => {
        if (activeRequest) setPermissionsError(error.message);
      })
      .finally(() => {
        if (activeRequest) setPermissionsLoading(false);
      });
    return () => { activeRequest = false; };
  }, [role]);

  useEffect(() => {
    if (!profileOpen || profileLoaded) return undefined;
    let activeRequest = true;
    setProfileLoading(true);
    setProfileError('');
    fetchSchoolProfile()
      .then(({ profile: currentProfile }) => {
        if (!activeRequest) return;
        setProfile(currentProfile);
        setProfileLoaded(true);
      })
      .catch((error) => {
        if (activeRequest) setProfileError(error.message);
      })
      .finally(() => {
        if (activeRequest) setProfileLoading(false);
      });
    return () => { activeRequest = false; };
  }, [profileLoaded, profileOpen]);

  useSchoolFavicon(school.logo);

  useEffect(() => {
    if (role !== 'admin' && !permissions?.['master.identity']?.view) {
      setPrintIdentity({
        name: school.name || 'Sekolah',
        logo: school.logo || null,
        npsn: school.npsn || ''
      });
      setPrintIdentityError('');
      return undefined;
    }
    let activeRequest = true;
    fetchSchoolIdentity()
      .then(({ identity }) => {
        if (activeRequest) {
          setPrintIdentity(identity);
          setPrintIdentityError('');
        }
      })
      .catch((error) => {
        if (activeRequest) setPrintIdentityError(error.message);
      });
    return () => { activeRequest = false; };
  }, [role, permissions, school.name, school.logo, school.npsn]);

  function selectMenu(label) {
    setActive(label);
    setMobileOpen(false);
  }

  function handleProfileUpdated(updatedProfile) {
    const updatedAccount = { ...account, ...updatedProfile };
    setProfile(updatedProfile);
    setProfileLoaded(true);
    onAccountUpdated?.(updatedAccount);
    setProfileEditorOpen(false);
    setProfileOpen(false);
  }

  function handleSchoolIdentityUpdated(identity) {
    setPrintIdentity(identity);
    setPrintIdentityError('');
    onAccountUpdated?.({
      ...account,
      school: { ...school, name: identity.name, npsn: identity.npsn, logo: identity.logo }
    });
  }

  function toggleSection(label) {
    setExpandedSections((sections) => ({ ...sections, [label]: !sections[label] }));
  }

  function toggleSidebar() {
    const nextCollapsed = !collapsed;
    localStorage.setItem('school-sidebar-collapsed', String(nextCollapsed));
    setCollapsed(nextCollapsed);
    setHoverExpanded(false);
  }

  return (
    <div className={`school-app-shell library-app-frame ${collapsed ? 'sidebar-collapsed' : ''} ${active === 'Data Siswa & Rombel' ? 'is-printing-students' : ''} ${active === 'Buku Tamu Digital' ? 'is-printing-visitors' : ''}`}>
      {mobileOpen && <button className="school-sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Tutup menu sekolah" />}
      <aside
        className={`school-sidebar ${mobileOpen ? 'mobile-open' : ''} ${collapsed ? 'collapsed' : ''} ${collapsed && hoverExpanded ? 'hover-expanded' : ''}`}
        onMouseEnter={() => { if (collapsed) setHoverExpanded(true); }}
        onMouseLeave={() => setHoverExpanded(false)}
        onFocus={() => { if (collapsed) setHoverExpanded(true); }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setHoverExpanded(false);
        }}
      >
        <div className="school-sidebar-brand">
          <div className="brand-mark"><BookOpen size={21} /></div>
          <div className="school-sidebar-brand-copy"><b>perpuskita<span>.</span></b><small>PORTAL SEKOLAH</small></div>
          <button type="button" className="school-sidebar-toggle" onClick={toggleSidebar} aria-label={collapsed ? 'Buka sidebar penuh' : 'Minimalkan sidebar'} aria-expanded={!collapsed}>
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
        <nav className="school-side-nav" aria-label="Menu perpustakaan sekolah">
          {visibleNavigation.map((section) => (
            <div className="school-nav-section" key={section.section}>
              {!['PENGELOLAAN PERPUSTAKAAN', 'MASTER DATA', 'LAYANAN PERPUSTAKAAN'].includes(section.section)
                && <p>{section.section}</p>}
              {section.items.map(({ label, icon: Icon, children }) => children ? (
                <div className="school-nav-parent" key={label}>
                  <button type="button" title={collapsed && !hoverExpanded ? label : undefined} className={`school-nav-item school-nav-group ${children.some((child) => child.label === active) ? 'selected' : ''}`} aria-expanded={Boolean(expandedSections[label])} onClick={() => toggleSection(label)}>
                    <Icon size={17} /><span>{label}</span>{expandedSections[label] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {expandedSections[label] && <div className="school-nav-children">
                    {children.map(({ label: childLabel, icon: ChildIcon }) => (
                      <button type="button" key={childLabel} title={collapsed && !hoverExpanded ? childLabel : undefined} onClick={() => selectMenu(childLabel)} className={`school-nav-item school-nav-child ${active === childLabel ? 'selected' : ''}`}>
                        <ChildIcon size={15} /><span>{childLabel}</span>
                      </button>
                    ))}
                  </div>}
                </div>
              ) : (
                <button type="button" key={label} title={collapsed && !hoverExpanded ? label : undefined} onClick={() => selectMenu(label)} className={`school-nav-item ${active === label ? 'selected' : ''}`}>
                  <Icon size={17} /><span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="school-main-area">
        <div className="school-global-print-header">
          <SchoolPrintHeader identity={printIdentity} title={active} />
        </div>
        <header className="school-topbar">
          <div className="school-topbar-left">
            <button type="button" className="school-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Buka menu sekolah"><Menu size={20} /></button>
            <div><span>{schoolName}</span><b>{active}</b></div>
          </div>
          <div className="school-profile-menu" ref={profileMenuRef}>
            <button type="button" className="school-profile-trigger school-avatar-only" aria-label={`Profil ${profile.name}`} aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => setProfileOpen((open) => !open)}>
              {profile.avatar
                ? <img className="school-profile-avatar-image" src={profile.avatar} alt="" />
                : <span className="top-admin-avatar">{profile.name?.slice(0, 1).toUpperCase() || 'U'}</span>}
            </button>
            {profileOpen && <div className="school-profile-dropdown" role="menu">
              <div><b>{profile.name}</b><span>{profile.email}</span></div>
              {profileLoading && <small className="school-profile-loading">Memuat profil...</small>}
              {profileError && <p className="school-profile-error" role="alert">{profileError}</p>}
              <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); setProfileEditorOpen(true); }}><Pencil size={15} />Edit Profil</button>
              <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onLogout(); }}><LogOut size={15} />Keluar</button>
            </div>}
          </div>
        </header>

        <div className="school-page-content">
          {printIdentityError && <p className="school-print-identity-error" role="alert">Kop sekolah belum dapat dimuat untuk cetak: {printIdentityError}</p>}
          <div className="library-page-transition" key={active}>
            {permissionsLoading ? (
              <div className="library-empty-state">Memuat hak akses...</div>
            ) : permissionsError ? (
              <div className="library-error" role="alert">{permissionsError}</div>
            ) : active === 'Pengaturan' && role === 'admin' ? (
              <SchoolSettingsPage onMobileNavbarSettingsSaved={setMobileNavbarSettings} />
            ) : role !== 'admin' && !activeRights?.view ? (
              <div className="library-error" role="alert">Anda tidak memiliki izin untuk membuka halaman ini.</div>
            ) : active === 'Dashboard' ? (
              <SchoolDashboard account={profile} />
            ) : active === 'Daftar Pustaka' ? (
              <SchoolBookCatalogPage rights={activeRights} role={role} schoolIdentity={printIdentity} />
            ) : active === 'Tambah Stok Buku' ? (
              <SchoolBookStockPage rights={activeRights} />
            ) : active === 'Pindah Rak' ? (
              <SchoolRackTransfersPage rights={activeRights} />
            ) : active === 'Eksemplar' ? (
              <SchoolBookItemsPage rights={activeRights} schoolName={schoolName} schoolIdentity={printIdentity} />
            ) : active === 'Pengadaan Buku' ? (
              <SchoolProcurementsPage rights={activeRights} role={role} requester={profile.name} />
            ) : active === 'Buku Tamu Digital' ? (
              <SchoolVisitorsPage rights={activeRights} role={role} account={profile} schoolName={schoolName} schoolIdentity={printIdentity} />
            ) : active === 'Peminjaman' ? (
              <SchoolLoansPage rights={activeRights} role={role} account={profile} />
            ) : active === 'Denda' ? (
              <SchoolFinesPage rights={activeRights} />
            ) : active === 'Booking Buku' ? (
              <SchoolReservationsPage rights={activeRights} role={role} account={profile} />
            ) : active === 'Ulasan & Rating' ? (
              <SchoolReviewsPage rights={activeRights} role={role} />
            ) : active === 'Pengumuman' ? (
              <SchoolAnnouncementsPage rights={activeRights} role={role} />
            ) : active === 'Laporan' ? (
              <Suspense fallback={<div className="library-empty-state">Memuat laporan...</div>}>
                <SchoolReportsPage rights={activeRights} />
              </Suspense>
            ) : active === 'Tahun Pelajaran' ? (
              <SchoolAcademicYearsPage rights={activeRights} />
            ) : active === 'Data Siswa & Rombel' ? (
              <StudentPageErrorBoundary>
                <Suspense fallback={<div className="library-empty-state">Memuat data siswa...</div>}>
                  <SchoolStudentsPage rights={activeRights} schoolIdentity={printIdentity} />
                </Suspense>
              </StudentPageErrorBoundary>
            ) : active === 'Analitik Sirkulasi' ? (
              <Suspense fallback={<div className="library-empty-state">Memuat analitik sirkulasi...</div>}>
                <SchoolCirculationAnalyticsPage rights={activeRights} schoolName={schoolName} schoolIdentity={printIdentity} />
              </Suspense>
            ) : active === 'Identitas Sekolah' ? (
              <SchoolIdentityPage rights={activeRights} onSaved={handleSchoolIdentityUpdated} />
            ) : active === 'Kop Sekolah' ? (
              <SchoolIdentityPage mode="letterhead" rights={activeRights} onSaved={handleSchoolIdentityUpdated} />
            ) : active === 'Portal Publik' ? (
              <SchoolPublicPortalPage schoolCode={school.code} />
            ) : activeMasterType ? (
              <SchoolMasterDataPage active={active} type={activeMasterType} rights={activeRights} />
            ) : (
              <SchoolModulePage active={active} />
            )}
          </div>
          <footer className="page-footer"><span>© {new Date().getFullYear()} PerpusKita</span><span>{schoolName}</span></footer>
        </div>
      </main>
      {mobileNavbarError && <p className="school-mobile-navbar-error" role="alert">Navbar ponsel gagal dimuat: {mobileNavbarError}</p>}
      {mobileNavbarItems.length > 0 && <nav className="school-mobile-navbar" aria-label="Navigasi cepat">
        {mobileNavbarItems.map(({ label, icon: Icon }) => (
          <button type="button" key={label} title={label} aria-label={label}
            className={`school-mobile-navbar-button ${label === mobileNavbarHighlight ? 'is-highlight' : ''} ${active === label ? 'is-active' : ''}`}
            onClick={() => selectMenu(label)}>
            <Icon size={19} aria-hidden="true" />
          </button>
        ))}
      </nav>}
      {profileEditorOpen && <SchoolProfileEditor
        profile={profile}
        onClose={() => setProfileEditorOpen(false)}
        onProfileUpdated={handleProfileUpdated}
      />}
    </div>
  );
}
