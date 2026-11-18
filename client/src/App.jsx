import { useEffect, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, BookOpen, Building2,
  Check, ChevronDown, ChevronRight, CircleHelp, ClipboardList,
  CreditCard, Database, FileText, Headphones, LayoutDashboard,
  LogOut, Menu, MessageSquare, MoreHorizontal, PanelLeftClose, PanelLeftOpen,
  Search, Settings2, ShieldCheck, Sparkles, Ticket, Users, X
} from 'lucide-react';

const groups = [
  { title: 'RINGKASAN', items: [{ label: 'Dashboard', icon: LayoutDashboard }] },
  { title: 'TENANT', items: [
    { label: 'Daftar Sekolah', icon: Building2, badge: 'schools' },
    { label: 'Pembayaran & Penagihan', icon: CreditCard, badge: 'pendingVerification' },
    { label: 'Paket Langganan', icon: ClipboardList }
  ] },
  { title: 'AKUN', items: [{ label: 'Pengaturan Profil', icon: Users }] },
  { title: 'KUSTOMISASI', items: [
    { label: 'Default Menu Sekolah', icon: Settings2 },
    { label: 'Branding Sistem', icon: Sparkles },
    { label: 'QRIS & Harga', icon: CreditCard },
    { label: 'Syarat & SLA', icon: FileText }
  ] },
  { title: 'OPERASIONAL', items: [
    { label: 'Pusat Tiket', icon: Ticket, badge: 'newTickets' },
    { label: 'Pengumuman & Maintenance', icon: Bell },
    { label: 'Petunjuk Pengguna', icon: CircleHelp },
    { label: 'Audit Logs', icon: Activity }
  ] },
  { title: 'INTEGRASI', items: [{ label: 'WhatsApp Gateway', icon: MessageSquare }] },
  { title: 'SISTEM', items: [{ label: 'Backup & Restore', icon: Database }] }
];

const number = (value) => new Intl.NumberFormat('id-ID').format(value || 0);
const rupiah = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0
}).format(value || 0);

async function request(path, options = {}) {
  const token = localStorage.getItem('super-admin-token');
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Permintaan gagal.');
  return body;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await request('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password })
      });
      localStorage.setItem('super-admin-token', result.token);
      onLogin(result.admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark"><BookOpen size={22} /></div>
        <p className="eyebrow">PERPUSKITA · PLATFORM OWNER</p>
        <h1>Selamat datang kembali</h1>
        <p className="muted">Masuk untuk mengelola platform dan sekolah.</p>
        <label>Email administrator<input autoComplete="username" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@platform.id" /></label>
        <label>Kata sandi<input autoComplete="current-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan kata sandi" /></label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary-button login-submit" disabled={busy}>{busy ? 'Memeriksa...' : 'Masuk ke Dashboard'}</button>
      </form>
    </main>
  );
}

function StatCard({ title, value, note, icon: Icon, tone, trend }) {
  return (
    <article className="stat-card">
      <div className="stat-top"><span className={`stat-icon ${tone}`}><Icon size={19} /></span><button className="icon-button" aria-label="Opsi statistik"><MoreHorizontal size={19} /></button></div>
      <p className="stat-label">{title}</p>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{trend && <span className="trend"><ArrowUpRight size={14} />{trend}</span>}{note}</div>
    </article>
  );
}

function Dashboard({ data, onBillingCheck, billing, toast }) {
  const stats = data.stats;
  const formattedDate = (date) => new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  }).format(new Date(date));
  const packageLabel = (value) => ({ trial: 'Uji Coba', basic: 'Basic', premium: 'Premium', lifetime: 'Lifetime' })[value] || value;

  return (
    <>
      <section className="welcome-banner">
        <div className="welcome-copy">
          <div className="welcome-kicker"><span className="live-dot" /> PLATFORM OVERVIEW</div>
          <h1>Selamat pagi, {data.adminName || 'Platform Owner'} <span>✦</span></h1>
          <p>Pantau pertumbuhan dan operasional seluruh sekolah dari satu tempat.</p>
          <div className="welcome-meta"><span><Building2 size={15} />{number(stats.schools)} sekolah terdaftar</span><i /><span><ShieldCheck size={15} />Platform beroperasi normal</span></div>
        </div>
        <div className="banner-art" aria-hidden="true"><div className="art-glow" /><BookOpen size={104} strokeWidth={1.2} /><span className="art-spark">✳</span></div>
        <div className="banner-date">{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</div>
      </section>

      <div className="section-heading"><div><h2>Ringkasan platform</h2><p>Ikhtisar tenant dan aktivitas terkini</p></div><button className="subtle-button" onClick={() => toast('Data dashboard diperbarui.')}>Terakhir diperbarui <span>·</span> Baru saja <ChevronDown size={15} /></button></div>
      <section className="stats-grid">
        <StatCard title="Total Sekolah" value={number(stats.schools)} note="seluruh tenant" icon={Building2} tone="orange" />
        <StatCard title="Sekolah Aktif" value={number(stats.activeSchools)} note={`${number(stats.trialSchools)} uji coba · ${number(stats.lifetimeSchools)} lifetime`} icon={ShieldCheck} tone="blue" />
        <StatCard title="Sekolah Terdaftar" value={number(stats.schools - stats.suspendedSchools)} note={`${number(stats.suspendedSchools)} ditangguhkan`} icon={Activity} tone="rose" />
        <StatCard title="Siswa Terkelola" value={number(stats.students)} note="di seluruh sekolah" icon={Users} tone="violet" />
      </section>

      <section className="stats-grid operational-grid">
        <StatCard title="Menunggu Verifikasi" value={number(stats.pendingVerification)} note="pembayaran perlu dicek" icon={CreditCard} tone="amber" />
        <StatCard title="Tagihan Terbuka" value={rupiah(stats.openAmount)} note="total belum dibayar" icon={FileText} tone="blue" />
        <StatCard title="Tiket Baru" value={number(stats.newTickets)} note="belum ditanggapi" icon={Headphones} tone="rose" />
        <StatCard title="Rata-rata Siswa / Sekolah" value={number(stats.averageStudents)} note="siswa per tenant" icon={Users} tone="green" />
      </section>

      <section className="billing-panel">
        <div className="billing-icon"><CreditCard size={21} /></div>
        <div className="billing-copy"><div className="billing-title">Penagihan & pembekuan otomatis <span className="scheduled-pill"><span /> TERJADWAL HARIAN</span></div><p>Notifikasi H-7 · Pembuatan tagihan otomatis · Penangguhan setelah masa aktif berakhir</p><div className="billing-stats"><span>Terakhir dijalankan <b>{billing?.checkedAt ? new Date(billing.checkedAt).toLocaleString('id-ID') : 'Belum pernah'}</b></span><i /><span>Tagihan terbuka <b>{billing ? number(billing.openInvoices) : '—'}</b></span><i /><span>Lewat jatuh tempo <b>{billing ? number(billing.overdueInvoices) : '—'}</b></span></div></div>
        <button className="primary-button billing-button" onClick={onBillingCheck} disabled={billing?.loading}>{billing?.loading ? 'Memeriksa...' : 'Jalankan Pemeriksaan'}<ArrowUpRight size={16} /></button>
      </section>
      {billing?.message && <div className="inline-notice"><Check size={15} />{billing.message}</div>}

      <section className="content-grid">
        <article className="panel schools-panel">
          <div className="panel-heading"><div><h3>Sekolah terbaru</h3><p>Tenant yang baru bergabung di platform</p></div><button className="text-button" onClick={() => toast('Modul Daftar Sekolah siap dikembangkan.')}>Lihat semua <ChevronRight size={16} /></button></div>
          {data.latestSchools.length ? <div className="school-list">{data.latestSchools.map((school, index) => <div className="school-row" key={school.id}><div className={`school-avatar avatar-${index % 5}`}>{school.name.slice(0, 1).toUpperCase()}</div><div className="school-name"><b>{school.name}</b><span>Bergabung {formattedDate(school.created_at)}</span></div><span className={`package-tag ${school.package_type}`}>{packageLabel(school.package_type)}</span><span className={`status-tag ${school.status}`}>{school.status === 'active' ? 'Aktif' : school.status === 'pending' ? 'Menunggu' : 'Ditangguhkan'}</span><button className="icon-button row-more" aria-label={`Opsi ${school.name}`}><MoreHorizontal size={18} /></button></div>)}</div> : <EmptyState text="Sekolah terbaru akan tampil di sini setelah tenant mendaftar." /> }
        </article>
        <article className="panel action-panel">
          <div className="panel-heading"><div><h3>Perlu tindakan</h3><p>Pembaruan yang memerlukan perhatian</p></div><span className="count-badge">{data.actions.length}</span></div>
          {data.actions.length ? <div className="action-list">{data.actions.map((action) => <div className="action-row" key={`${action.type}-${action.id}`}><span className={`action-icon ${action.type}`} >{action.type === 'invoice' ? <CreditCard size={16} /> : <Ticket size={16} />}</span><div><b>{action.description}</b><span>{action.school_name} · {formattedDate(action.created_at)}</span></div><ChevronRight size={16} className="action-arrow" /></div>)}</div> : <EmptyState text="Tidak ada tindakan yang tertunda." /> }
        </article>
      </section>
      <section className="panel activity-panel">
        <div className="panel-heading"><div><h3>Aktivitas terakhir</h3><p>Jejak audit aktivitas Super Admin</p></div><button className="text-button" onClick={() => toast('Modul Audit Logs siap dikembangkan.')}>Lihat semua <ChevronRight size={16} /></button></div>
        {data.activities.length ? <div className="activity-table"><div className="activity-header"><span>AKTIVITAS</span><span>ADMIN</span><span>ALAMAT IP</span><span>WAKTU</span></div>{data.activities.map((item) => <div className="activity-row" key={item.id}><span><span className="activity-dot" />{item.activity}</span><span>{item.admin_name || 'Platform'}</span><span>{item.ip_address || '—'}</span><span>{formattedDate(item.created_at)}</span></div>)}</div> : <EmptyState text="Aktivitas penting akan tercatat dan muncul di sini." />}
      </section>
      <footer className="page-footer"><span>© {new Date().getFullYear()} PerpusKita Platform</span><span><span className="live-dot" />Semua sistem beroperasi</span></footer>
    </>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state"><span><Search size={19} /></span>{text}</div>;
}

export default function App() {
  const [admin, setAdmin] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState('Dashboard');
  const [billing, setBilling] = useState(null);
  const [toastText, setToastText] = useState('');

  function toast(message) {
    setToastText(message);
    window.setTimeout(() => setToastText(''), 2800);
  }

  useEffect(() => {
    if (!localStorage.getItem('super-admin-token')) return;
    request('/api/super-admin/me')
      .then(({ admin: current }) => setAdmin(current))
      .catch(() => localStorage.removeItem('super-admin-token'));
  }, []);

  useEffect(() => {
    if (!admin) return;
    request('/api/super-admin/dashboard')
      .then(setData)
      .catch((err) => setError(err.message));
  }, [admin]);

  async function runBillingCheck() {
    setBilling({ loading: true });
    try {
      const result = await request('/api/super-admin/billing-check', { method: 'POST' });
      setBilling({ ...result, loading: false });
    } catch (err) {
      setBilling({ loading: false, message: err.message });
    }
  }

  function logout() {
    localStorage.removeItem('super-admin-token');
    setAdmin(null);
    setData(null);
  }

  if (!admin) return <Login onLogin={setAdmin} />;

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Tutup menu" />}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand"><div className="brand-mark"><BookOpen size={21} /></div>{!collapsed && <div className="brand-text"><b>perpuskita<span>.</span></b><small>PLATFORM ADMIN</small></div>}<button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label="Ciutkan sidebar">{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button></div>
        <div className="workspace-switch"><div className="workspace-logo">P</div>{!collapsed && <><div><b>PerpusKita</b><span>Platform Owner</span></div><ChevronDown size={15} className="workspace-chevron" /></>}</div>
        <nav className="side-nav">{groups.map((group) => <div className="nav-group" key={group.title}><div className="nav-group-title">{!collapsed ? group.title : <span className="nav-divider" />}</div>{group.items.map(({ label, icon: Icon, badge }) => <button key={label} title={collapsed ? label : undefined} onClick={() => { setActive(label); setMobileOpen(false); if (label !== 'Dashboard') toast(`${label}: modul ini siap dikembangkan.`); }} className={`nav-item ${active === label ? 'selected' : ''}`}><Icon size={17} /><span className="nav-label">{!collapsed && label}</span>{!collapsed && badge && data && <span className="nav-badge">{number(data.stats[badge])}</span>}</button>)}</div>)}</nav>
        <div className="sidebar-bottom"><button className="help-card" onClick={() => toast('Hubungi tim platform melalui Pusat Tiket.')}><span className="help-icon"><CircleHelp size={17} /></span>{!collapsed && <span><b>Butuh bantuan?</b><small>Kunjungi pusat bantuan</small></span>}{!collapsed && <ChevronRight size={15} />}</button><button className="profile-card" onClick={logout}><div className="profile-avatar">{admin.name?.slice(0, 1).toUpperCase() || 'P'}</div>{!collapsed && <><span className="profile-info"><b>{admin.name}</b><small>Super Admin</small></span><LogOut size={16} className="logout-icon" /></>}</button></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Buka menu"><Menu size={20} /></button><div className="breadcrumbs"><span>Platform</span><ChevronRight size={14} /><b>{active}</b></div></div><div className="topbar-right"><div className="search-box"><Search size={16} /><input placeholder="Cari apa saja..." aria-label="Cari" /><kbd>⌘ K</kbd></div><button className="icon-button notification-button" aria-label="Notifikasi"><Bell size={18} /><i /></button><div className="topbar-separator" /><button className="top-admin"><span className="top-admin-avatar">{admin.name?.slice(0, 1).toUpperCase() || 'P'}</span><span>{admin.name}</span><ChevronDown size={14} /></button></div></header>
        <div className="page-content">
          {error ? <div className="error-panel"><ShieldCheck size={20} /><div><b>Dashboard belum dapat dimuat</b><p>{error}. Pastikan database sudah disiapkan dan tersedia datanya.</p></div><button className="subtle-button" onClick={() => { setError(''); request('/api/super-admin/dashboard').then(setData).catch((err) => setError(err.message)); }}>Coba lagi</button></div> : data ? <Dashboard data={{ ...data, adminName: admin.name }} onBillingCheck={runBillingCheck} billing={billing} toast={toast} /> : <div className="loading-state"><div className="spinner" />Memuat ringkasan platform...</div>}
        </div>
      </main>
      {toastText && <div className="toast"><Check size={16} />{toastText}<button onClick={() => setToastText('')} aria-label="Tutup"><X size={15} /></button></div>}
    </div>
  );
}
