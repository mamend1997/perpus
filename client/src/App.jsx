import { useEffect, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, BookOpen, Building2,
  Check, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Copy, Eye, EyeOff,
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

function currentPage() {
  const path = window.location.pathname;
  const routes = ['/school/login', '/school/register', '/super-admin/login'];
  if (routes.includes(path)) return path;
  window.history.replaceState({}, '', '/school/login');
  return '/school/login';
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

function SchoolAuth({ mode, onNavigate, onLogin }) {
  const registering = mode === 'register';
  const [schoolName, setSchoolName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [address, setAddress] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [registration, setRegistration] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');
  const passwordRules = [
    { label: 'Minimal 8 karakter', valid: password.length >= 8 },
    { label: 'Minimal 1 huruf besar', valid: /[A-Z]/.test(password) },
    { label: 'Minimal 1 angka', valid: /\d/.test(password) },
    { label: 'Minimal 1 simbol', valid: /[^A-Za-z0-9\s]/.test(password) }
  ];

  async function submit(event) {
    event.preventDefault();
    setError('');
    const waNumber = phone.replace(/^0+/, '');
    if (registering && !passwordRules.every((rule) => rule.valid)) {
      setError('Kata sandi harus memenuhi semua persyaratan.');
      return;
    }
    if (registering && !/^\d{8,13}$/.test(waNumber)) {
      setError('Nomor WhatsApp harus berisi 8–13 angka setelah kode +62.');
      return;
    }

    setBusy(true);
    try {
      if (registering) {
        const result = await request('/api/auth/school/register', {
          method: 'POST',
          body: JSON.stringify({
            schoolName,
            adminName,
            address,
            email,
            phone: `+62${waNumber}`,
            password
          })
        });
        setRegistration(result);
      } else {
        const result = await request('/api/auth/school/login', {
          method: 'POST',
          body: JSON.stringify({ schoolCode, email, password })
        });
        localStorage.setItem('school-token', result.token);
        onLogin(result.account);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copySchoolCode() {
    if (!navigator.clipboard?.writeText) {
      setCopyStatus('Salin kode sekolah secara manual.');
      return;
    }
    try {
      await navigator.clipboard.writeText(registration.school.code);
      setCopyStatus('Kode sekolah berhasil disalin.');
    } catch {
      setCopyStatus('Kode gagal disalin. Silakan salin secara manual.');
    }
  }

  function enterSchoolDashboard() {
    localStorage.setItem('school-token', registration.token);
    onLogin(registration.account);
  }

  if (registration) {
    return (
      <main className="login-shell">
        <section className="login-card school-success registration-summary">
          <div className="brand-mark"><Check size={22} /></div>
          <p className="eyebrow">PENDAFTARAN BERHASIL</p>
          <h1>{registration.school.name}</h1>
          <p className="muted">Periksa ringkasan akun dan simpan kode sekolah untuk login berikutnya.</p>
          <div className="registration-summary-grid">
            <span>Alamat sekolah</span><b>{registration.school.address}</b>
            <span>Administrator</span><b>{registration.account.name}</b>
            <span>Email administrator</span><b>{registration.account.email}</b>
            <span>No. WhatsApp</span><b>{registration.account.phone}</b>
          </div>
          <div className="school-code-panel">
            <div><span>Kode sekolah</span><b className="school-code-display">{registration.school.code}</b></div>
            <button type="button" className="copy-code-button" onClick={copySchoolCode}>
              {copyStatus === 'Kode sekolah berhasil disalin.' ? <Check size={17} /> : <Copy size={17} />}
              {copyStatus === 'Kode sekolah berhasil disalin.' ? 'Tersalin' : 'Salin kode'}
            </button>
          </div>
          <p className="copy-status" aria-live="polite">{copyStatus || 'Kode ini akan diminta saat Anda login kembali.'}</p>
          <button className="primary-button login-submit" onClick={enterSchoolDashboard}>Masuk ke Dashboard <ArrowUpRight size={17} /></button>
        </section>
      </main>
    );
  }

  return (
    <main className="login-shell">
      <form className={`login-card school-auth-card ${registering ? 'school-register-card' : ''}`} onSubmit={submit}>
        <div className="brand-mark"><BookOpen size={22} /></div>
        <p className="eyebrow">PERPUSKITA · AKUN SEKOLAH</p>
        <h1>{registering ? 'Daftarkan sekolah' : 'Login akun sekolah'}</h1>
        {registering && <p className="muted">Buat ruang perpustakaan sekolah Anda. Kode sekolah dibuat otomatis.</p>}

        {registering ? (
          <>
            <label>Nama sekolah<input autoComplete="organization" required minLength={2} maxLength={180} value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Contoh: SMP Negeri 1" /></label>
            <label>Alamat sekolah<input autoComplete="street-address" required minLength={3} maxLength={1000} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Alamat lengkap sekolah" /></label>
            <label>Nama administrator<input autoComplete="name" required minLength={2} maxLength={180} value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Nama pengelola perpustakaan" /></label>
          </>
        ) : (
          <label>Kode sekolah
            <input autoComplete="organization" required minLength={4} maxLength={4} pattern="[A-Za-z0-9]{4}" value={schoolCode} onChange={(e) => setSchoolCode(e.target.value.toUpperCase())} placeholder="AB12" />
          </label>
        )}

        <label>Email administrator<input autoComplete="username" type="email" required maxLength={190} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@sekolah.sch.id" /></label>
        {registering && <label>No. WhatsApp
          <div className="phone-field">
            <span>+62</span>
            <input autoComplete="tel-national" type="tel" inputMode="numeric" pattern="[0-9]*" required minLength={8} maxLength={13} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="81234567890" />
          </div>
        </label>}
        {registering ? (
          <>
            <label htmlFor="school-register-password">Kata sandi</label>
            <div className="password-field">
              <input id="school-register-password" autoComplete="new-password" type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Buat kata sandi" />
              <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
            <ul className="password-rules" aria-live="polite">
              {passwordRules.map((rule) => <li className={rule.valid ? 'valid' : ''} key={rule.label}><span className="password-rule-mark">{rule.valid && <Check size={12} />}</span>{rule.label}</li>)}
            </ul>
          </>
        ) : <label>Kata sandi<input autoComplete="current-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan kata sandi" /></label>}
        {error && <div className="error-box">{error}</div>}
        <button className="primary-button login-submit" disabled={busy}>{busy ? 'Memproses...' : registering ? 'Buat Akun Sekolah' : 'Masuk ke Akun Sekolah'}</button>
        <div className="login-alternatives">
          {registering ? <><span>Sudah punya akun?</span><button type="button" onClick={() => onNavigate('/school/login')}>Login sekolah</button></> : <><span>Belum punya akun?</span><button type="button" onClick={() => onNavigate('/school/register')}>Daftarkan sekolah</button></>}
        </div>
      </form>
    </main>
  );
}

function SchoolWelcome({ account, onLogout }) {
  return (
    <main className="login-shell">
      <section className="login-card school-success">
        <div className="brand-mark"><Check size={22} /></div>
        <p className="eyebrow">DASHBOARD SEKOLAH</p>
        <h1>Selamat datang, {account.name}</h1>
        <p className="muted">Ringkasan akun administrator untuk {account.school.name}.</p>
        <div className="school-account-details">
          <span>Kode sekolah</span><b>{account.school.code}</b>
          <span>Email</span><b>{account.email}</b>
        </div>
        <p className="school-dashboard-note">Akun sekolah Anda aktif. Modul katalog, sirkulasi, dan laporan akan tersedia di dashboard sekolah.</p>
        <button className="auth-text-button" onClick={onLogout}>Keluar</button>
      </section>
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
  const [schoolAccount, setSchoolAccount] = useState(null);
  const [page, setPage] = useState(currentPage);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState('Dashboard');
  const [billing, setBilling] = useState(null);
  const [toastText, setToastText] = useState('');

  useEffect(() => {
    const handlePopState = () => setPage(currentPage());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigate(path) {
    window.history.pushState({}, '', path);
    setPage(path);
  }

  function toast(message) {
    setToastText(message);
    window.setTimeout(() => setToastText(''), 2800);
  }

  useEffect(() => {
    if (!page.startsWith('/school/')) return;
    const token = localStorage.getItem('school-token');
    if (!token) return;
    request('/api/auth/school/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(({ account }) => setSchoolAccount(account))
      .catch(() => localStorage.removeItem('school-token'));
  }, [page]);

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

  function schoolLogout() {
    localStorage.removeItem('school-token');
    setSchoolAccount(null);
    navigate('/school/login');
  }

  if (page.startsWith('/school/')) {
    if (schoolAccount) return <SchoolWelcome account={schoolAccount} onLogout={schoolLogout} />;
    return <SchoolAuth mode={page === '/school/register' ? 'register' : 'login'} onNavigate={navigate} onLogin={setSchoolAccount} />;
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
