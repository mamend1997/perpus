import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Pencil, X } from 'lucide-react';
import SchoolDashboard from './SchoolDashboard.jsx';
import SchoolModulePage from './SchoolModulePage.jsx';
import SchoolMasterDataPage from './SchoolMasterDataPage.jsx';
import SchoolIdentityPage from './SchoolIdentityPage.jsx';
import SchoolBookCatalogPage from './SchoolBookCatalogPage.jsx';
import SchoolBookStockPage from './SchoolBookStockPage.jsx';
import SchoolBookDestructionPage from './SchoolBookDestructionPage.jsx';
import SchoolBookActivityPage from './SchoolBookActivityPage.jsx';
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
import SchoolSupportPage from './SchoolSupportPage.jsx';
import SchoolDocumentsPage from './SchoolDocumentsPage.jsx';
import SchoolAppearancePage from './SchoolAppearancePage.jsx';
import SchoolAnnouncementPopup from './SchoolAnnouncementPopup.jsx';
import SchoolAcademicYearsPage from './SchoolAcademicYearsPage.jsx';
import { fetchSchoolIdentity, fetchSchoolProfile } from './schoolAccountApi.js';
import { fetchMobileNavbarSettings, fetchMySchoolPermissions, fetchSchoolAppearance } from './schoolSettingsApi.js';
import { logSchoolPageView } from './schoolBookApi.js';
import { defaultMobileNavbarSettings, masterCategoryTypes, schoolNavigation } from './schoolNavigation.js';
import { defaultSchoolPermissions, schoolPermissionByLabel } from './schoolPermissions.js';
import SchoolPrintHeader from './SchoolPrintHeader.jsx';
import useSchoolFavicon from './useSchoolFavicon.js';
import './school.css';

const SchoolCirculationAnalyticsPage = lazy(() => import('./SchoolCirculationAnalyticsPage.jsx'));
const SchoolReportsPage = lazy(() => import('./SchoolReportsPage.jsx'));
const SchoolStudentsPage = lazy(() => import('./SchoolStudentsPage.jsx'));
const SchoolMembersPage = lazy(() => import('./SchoolMembersPage.jsx'));

const schoolOnboardingSteps = [
  {
    menu: 'Identitas Sekolah',
    title: 'Lengkapi identitas sekolah',
    description: 'Periksa nama sekolah, NPSN, jenjang, alamat, dan informasi kontak agar tercantum dengan benar pada layanan perpustakaan.'
  },
  {
    menu: 'Tahun Pelajaran',
    title: 'Atur tahun pelajaran',
    description: 'Tambahkan periode tahun pelajaran yang sedang berjalan dan tandai sebagai periode aktif.'
  },
  {
    menu: 'Data Siswa & Rombel',
    title: 'Masukkan data siswa dan rombel',
    description: 'Kelola daftar siswa dan kelas agar anggota perpustakaan dapat ditautkan ke data sekolah.'
  },
  {
    menu: 'Jenis',
    title: 'Siapkan master data koleksi',
    description: 'Mulai dengan jenis bahan pustaka. Setelah itu, lengkapi referensi lain seperti bahasa, koleksi, klasifikasi, rak, pengarang, dan penerbit melalui bagian Master Data.'
  }
];

class SchoolPageErrorBoundary extends Component {
  state = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="library-error" role="alert">
          <span>{this.props.pageLabel} gagal ditampilkan: {this.state.error.message || 'terjadi kesalahan saat memuat data.'}</span>
          <button type="button" onClick={() => this.setState((state) => ({ error: null, retryKey: state.retryKey + 1 }))}>Coba lagi</button>
        </div>
      );
    }
    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}

export default function SchoolPortal({ account, onLogout, onAccountUpdated }) {
  const [active, setActive] = useState('Dashboard');
  const [onboardingStep, setOnboardingStep] = useState(() => (
    localStorage.getItem('school-onboarding-pending') === String(account.id) ? 0 : null
  ));
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
  const [appearance, setAppearance] = useState({
    primaryColor: '#f97316',
    title: 'MACA',
    subtitle: 'PORTAL SEKOLAH'
  });
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
    let activeRequest = true;
    fetchSchoolAppearance()
      .then(({ appearance: savedAppearance }) => {
        if (activeRequest) setAppearance((current) => ({ ...current, ...savedAppearance }));
      })
      .catch((error) => {
        if (activeRequest) console.error('Gagal memuat tema sekolah:', error);
      });
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
    let activeRequest = true;
    logSchoolPageView(active).catch((error) => {
      if (activeRequest) console.error('Gagal mencatat halaman sekolah:', error);
    });
    return () => { activeRequest = false; };
  }, [active]);

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

  function closeOnboarding() {
    if (localStorage.getItem('school-onboarding-pending') === String(account.id)) {
      localStorage.removeItem('school-onboarding-pending');
    }
    setOnboardingStep(null);
  }

  function moveOnboardingStep(direction) {
    const nextStep = onboardingStep + direction;
    if (nextStep < 0) return;
    if (nextStep >= schoolOnboardingSteps.length) {
      closeOnboarding();
      return;
    }
    setOnboardingStep(nextStep);
    selectMenu(schoolOnboardingSteps[nextStep].menu);
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
    <div className={`school-app-shell library-app-frame ${collapsed ? 'sidebar-collapsed' : ''} ${active === 'Data Siswa & Rombel' ? 'is-printing-students' : ''} ${active === 'Buku Tamu Digital' ? 'is-printing-visitors' : ''}`} style={{ '--school-accent': appearance.primaryColor }}>
      <SchoolAnnouncementPopup key={`${school.id || school.code}:${account.id}`} />
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
          <div className="brand-mark">{school.logo ? <img src={school.logo} alt="" /> : <BookOpen size={21} />}</div>
          <div className="school-sidebar-brand-copy"><b>{appearance.title}<span>.</span></b><small>{appearance.subtitle}</small></div>
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
          {account.supportMode && <div className="school-support-mode-banner" role="status">
            <div><b>Mode pemeliharaan Super Admin</b><span>Perubahan di panel ini dicatat pada log aktivitas.</span></div>
            <button type="button" onClick={onLogout}>Akhiri Sesi</button>
          </div>}
          {onboardingStep !== null && (() => {
            const step = schoolOnboardingSteps[onboardingStep];
            return (
              <section className="school-onboarding-guide" aria-labelledby="school-onboarding-title">
                <div className="school-onboarding-copy">
                  <span className="library-eyebrow">PANDUAN AWAL · LANGKAH {onboardingStep + 1} DARI {schoolOnboardingSteps.length}</span>
                  <h2 id="school-onboarding-title">{step.title}</h2>
                  <p>{step.description}</p>
                  <span className="school-onboarding-destination">Menu tujuan: <b>Master Data / {step.menu}</b></span>
                </div>
                <div className="school-onboarding-actions">
                  {onboardingStep > 0 && <button type="button" className="school-onboarding-back" onClick={() => moveOnboardingStep(-1)}><ArrowLeft size={15} /> Sebelumnya</button>}
                  <button type="button" className="school-onboarding-next" onClick={() => {
                    if (active !== step.menu) selectMenu(step.menu);
                    else moveOnboardingStep(1);
                  }}>
                    {active !== step.menu
                      ? `Buka menu ${step.menu}`
                      : onboardingStep === schoolOnboardingSteps.length - 1
                        ? 'Selesai'
                        : 'Sudah, lanjutkan'}
                    {active !== step.menu || onboardingStep < schoolOnboardingSteps.length - 1
                      ? <ArrowRight size={15} />
                      : null}
                  </button>
                  <button type="button" className="school-onboarding-skip" onClick={closeOnboarding}><X size={14} /> Lewati panduan</button>
                </div>
              </section>
            );
          })()}
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
            ) : active === 'Pemusnahan Buku' ? (
              <SchoolBookDestructionPage rights={activeRights} />
            ) : active === 'Log Aktivitas' ? (
              <SchoolBookActivityPage rights={activeRights} />
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
            ) : active === 'Bantuan & Tiket Kendala' ? (
              <SchoolSupportPage rights={activeRights} appName={appearance.title} />
            ) : active === 'Petunjuk Pengguna' ? (
              <SchoolDocumentsPage type="guide" />
            ) : active === 'Syarat & SLA' ? (
              <SchoolDocumentsPage type="legal" />
            ) : active === 'Tema & Branding' && role === 'admin' ? (
              <SchoolAppearancePage
                schoolLogo={school.logo}
                onEditIdentity={() => selectMenu('Identitas Sekolah')}
                onSaved={setAppearance}
              />
            ) : active === 'Laporan' ? (
              <Suspense fallback={<div className="library-empty-state">Memuat laporan...</div>}>
                <SchoolReportsPage rights={activeRights} />
              </Suspense>
            ) : active === 'Tahun Pelajaran' ? (
              <SchoolAcademicYearsPage rights={activeRights} />
            ) : active === 'Data Siswa & Rombel' ? (
              <SchoolPageErrorBoundary pageLabel="Halaman Data Siswa">
                <Suspense fallback={<div className="library-empty-state">Memuat data siswa...</div>}>
                  <SchoolStudentsPage rights={activeRights} schoolIdentity={printIdentity} appName={appearance.title} />
                </Suspense>
              </SchoolPageErrorBoundary>
            ) : active === 'Member' ? (
              <SchoolPageErrorBoundary pageLabel="Halaman Member">
                <Suspense fallback={<div className="library-empty-state">Memuat data member...</div>}>
                  <SchoolMembersPage rights={activeRights} schoolIdentity={printIdentity} />
                </Suspense>
              </SchoolPageErrorBoundary>
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
              <SchoolPageErrorBoundary key={active} pageLabel={`Master Data ${active}`}>
                <SchoolMasterDataPage active={active} type={activeMasterType} rights={activeRights} />
              </SchoolPageErrorBoundary>
            ) : (
              <SchoolModulePage active={active} />
            )}
          </div>
          <footer className="page-footer"><span>© {new Date().getFullYear()} {appearance.title}</span><span>{schoolName}</span></footer>
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
