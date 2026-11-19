import { useEffect, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, BookOpen, Building2,
  Check, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Copy, Eye, EyeOff,
  CreditCard, Database, FileText, Headphones, LayoutDashboard,
  KeyRound, LogOut, Menu, MessageSquare, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Palette, Plus,
  Search, Settings2, ShieldCheck, Sparkles, Ticket, Users, X
} from 'lucide-react';
import SchoolPortal from './school/SchoolPortal.jsx';
import PublicLibraryPortal from './school/PublicLibraryPortal.jsx';
import BackupRestorePanel from './school/BackupRestorePanel.jsx';
import PlatformAuditLogsPage from './PlatformAuditLogsPage.jsx';
import PlatformTicketsPage from './PlatformTicketsPage.jsx';
import PlatformUserGuidePage from './PlatformUserGuidePage.jsx';
import PlatformAppearancePage from './PlatformAppearancePage.jsx';
import PlatformPaymentSettingsPage from './PlatformPaymentSettingsPage.jsx';
import PlatformSubscriptionPackagesPage from './PlatformSubscriptionPackagesPage.jsx';
import './super-admin.css';

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
    { label: 'Tema', icon: Palette },
    { label: 'QRIS & Harga', icon: CreditCard },
    { label: 'Syarat & SLA', icon: FileText }
  ] },
  { title: 'OPERASIONAL', items: [
    { label: 'Pusat Tiket', icon: Ticket, badge: 'newTickets' },
    { label: 'Pengumuman & Maintenance', icon: Bell },
    { label: 'Petunjuk Pengguna', icon: CircleHelp },
    { label: 'Log Aktivitas', icon: Activity }
  ] },
  { title: 'INTEGRASI', items: [
    { label: 'WhatsApp Gateway', icon: MessageSquare },
    { label: 'AI Tutorial Edupoin', icon: Sparkles }
  ] },
  { title: 'SISTEM', items: [
    { label: 'Backup & Restore', icon: Database },
    { label: 'Database Manager', icon: Database },
    { label: 'Buka Panel Sekolah', icon: Building2 }
  ] }
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
  if (/^\/public\/[A-Za-z0-9]{4}(?:\/(?:booking|rating))?$/.test(path)) return path;
  const routes = ['/school/login', '/school/register', '/school/dashboard', '/super-admin/login'];
  if (routes.includes(path)) return path;
  window.history.replaceState({}, '', '/school/login');
  return '/school/login';
}

function Login({ onLogin }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await request('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ identifier, password })
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
        <label>Username atau email<input autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="username atau admin@platform.id" /></label>
        <label htmlFor="platform-login-password">Kata sandi</label>
        <div className="password-field">
          <input id="platform-login-password" autoComplete="current-password" type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan kata sandi" />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>
            {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>
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
  const emailInvalid = Boolean(registering && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const emailWarning = registering && emailInvalid
    ? 'Masukkan alamat email dengan format yang benar, misalnya nama@sekolah.sch.id.'
    : registering && email ? 'Pastikan email ini aktif dan dapat menerima notifikasi akun.' : '';

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
          body: JSON.stringify({ schoolCode, identifier: email, password })
        });
        localStorage.setItem('school-token', result.token);
        onLogin(result.account);
        onNavigate('/school/dashboard');
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
    onNavigate('/school/dashboard');
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

        <label>{registering ? 'Email administrator' : 'Username atau email'}
          <input autoComplete="username" type={registering ? 'email' : 'text'} required maxLength={190} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={registering ? 'admin@sekolah.sch.id' : 'username atau email'} aria-describedby={emailWarning ? 'school-email-hint' : undefined} />
        </label>
        {emailWarning && <small id="school-email-hint" className={`auth-email-hint ${emailInvalid ? 'is-warning' : ''}`} role="status">{emailWarning}</small>}
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
        ) : <>
          <label htmlFor="school-login-password">Kata sandi</label>
          <div className="password-field">
            <input id="school-login-password" autoComplete="current-password" type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan kata sandi" />
            <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
        </>}
        {error && <div className="error-box">{error}</div>}
        <button className="primary-button login-submit" disabled={busy}>{busy ? 'Memproses...' : registering ? 'Buat Akun Sekolah' : 'Masuk ke Akun Sekolah'}</button>
        <div className="login-alternatives">
          {registering ? <><span>Sudah punya akun?</span><button type="button" onClick={() => onNavigate('/school/login')}>Login sekolah</button></> : <><span>Belum punya akun?</span><button type="button" onClick={() => onNavigate('/school/register')}>Daftarkan sekolah</button></>}
        </div>
      </form>
    </main>
  );
}

function SchoolListPage() {
  const [schools, setSchools] = useState([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, trials: 0, suspended: 0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [schoolDetail, setSchoolDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [savingSchoolCode, setSavingSchoolCode] = useState(false);
  const [detailNotice, setDetailNotice] = useState('');
  const [resetTarget, setResetTarget] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetResult, setResetResult] = useState(null);
  const [copyNotice, setCopyNotice] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ search, status });
    request(`/api/super-admin/schools?${query}`)
      .then((result) => {
        if (!active) return;
        setSchools(result.schools);
        setSummary(result.summary);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [search, status, retryCount]);

  useEffect(() => {
    if (!selectedSchool) return undefined;
    let active = true;
    setSchoolDetail(null);
    setDetailLoading(true);
    setDetailError('');
    setDetailNotice('');
    setResetResult(null);
    setCopyNotice('');
    request(`/api/super-admin/schools/${encodeURIComponent(selectedSchool.id)}`)
      .then((result) => {
        if (!active) return;
        setSchoolDetail(result);
        setSchoolCode(result.school.school_code || '');
      })
      .catch((err) => {
        if (active) setDetailError(err.message);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => { active = false; };
  }, [selectedSchool?.id]);

  function openSchoolDetail(school) {
    setSelectedSchool(school);
    setSchoolCode(school.school_code || '');
    setDetailError('');
    setResetTarget(null);
    setResetError('');
  }

  async function saveSchoolCode() {
    if (!schoolDetail || savingSchoolCode) return;
    setSavingSchoolCode(true);
    setDetailError('');
    setDetailNotice('');
    try {
      const result = await request(`/api/super-admin/schools/${encodeURIComponent(schoolDetail.school.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ schoolCode })
      });
      setSchoolDetail((current) => ({ ...current, school: { ...current.school, ...result.school } }));
      setSelectedSchool((current) => current ? { ...current, school_code: result.school.school_code } : current);
      setSchools((current) => current.map((school) => String(school.id) === String(result.school.id)
        ? { ...school, school_code: result.school.school_code }
        : school));
      setSchoolCode(result.school.school_code);
      setDetailNotice(result.message);
    } catch (saveError) {
      setDetailError(saveError.message);
    } finally {
      setSavingSchoolCode(false);
    }
  }

  async function confirmPasswordReset() {
    if (!selectedSchool || !resetTarget || resettingPassword) return;
    setResettingPassword(true);
    setResetError('');
    setCopyNotice('');
    try {
      const result = await request(
        `/api/super-admin/schools/${encodeURIComponent(selectedSchool.id)}/admins/${encodeURIComponent(resetTarget.id)}/password-reset`,
        { method: 'POST' }
      );
      setResetResult({ ...result.admin, temporaryPassword: result.temporaryPassword });
      setResetTarget(null);
    } catch (resetRequestError) {
      setResetError(resetRequestError.message);
    } finally {
      setResettingPassword(false);
    }
  }

  async function copyTemporaryPassword() {
    if (!resetResult?.temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(resetResult.temporaryPassword);
      setCopyNotice('Kata sandi sementara berhasil disalin.');
    } catch {
      setCopyNotice('Gagal menyalin. Salin kata sandi secara manual.');
    }
  }

  const formatDate = (value) => value
    ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
    : '—';
  const packageLabel = (value) => ({ trial: 'Uji Coba', basic: 'Basic', premium: 'Premium', lifetime: 'Lifetime' })[value] || value;
  const schoolStatus = (school) => {
    if (school.status === 'suspended') return { label: 'Ditangguhkan', className: 'suspended' };
    if (school.status === 'pending') return { label: 'Menunggu', className: 'pending' };
    if (school.package_type === 'trial') return { label: 'Uji Coba', className: 'trial' };
    if (school.package_type === 'lifetime') return { label: 'Lifetime', className: 'lifetime' };
    return { label: 'Aktif', className: 'active' };
  };

  return (
    <section className="school-list-page">
      <header className="management-heading">
        <div><h1>Daftar Sekolah</h1><p>Manajemen tenant sekolah: paket, status, domain, akun admin, dan kontrol fitur.</p></div>
        <a className="primary-button school-add-button" href="/school/register" target="_blank" rel="noreferrer"><Plus size={16} />Tambah Sekolah</a>
      </header>
      <div className="school-summary-grid">
        <article className="school-summary-card total"><span>TOTAL</span><b>{number(summary.total)}</b><Building2 size={26} /></article>
        <article className="school-summary-card active"><span>AKTIF</span><b>{number(summary.active)}</b><ShieldCheck size={26} /></article>
        <article className="school-summary-card trials"><span>UJI COBA</span><b>{number(summary.trials)}</b><Sparkles size={26} /></article>
        <article className="school-summary-card suspended"><span>DITANGGUHKAN</span><b>{number(summary.suspended)}</b><ShieldCheck size={26} /></article>
      </div>
      <section className="panel school-directory-panel">
        <div className="school-directory-controls">
          <label className="school-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama sekolah, kode, email..." aria-label="Cari sekolah" /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter status sekolah">
            <option value="all">Semua status</option>
            <option value="active">Aktif</option>
            <option value="trial">Uji Coba</option>
            <option value="lifetime">Lifetime</option>
            <option value="pending">Menunggu</option>
            <option value="suspended">Ditangguhkan</option>
          </select>
        </div>
        {error ? (
          <div className="error-panel"><ShieldCheck size={20} /><div><b>Daftar sekolah belum dapat dimuat</b><p>{error}</p></div><button className="subtle-button" onClick={() => setRetryCount((current) => current + 1)}>Coba lagi</button></div>
        ) : loading ? (
          <div className="loading-state"><div className="spinner" />Memuat daftar sekolah...</div>
        ) : schools.length ? (
          <div className="school-directory-scroll">
            <table className="school-directory-table">
              <thead><tr><th>KODE</th><th>SEKOLAH</th><th>PAKET</th><th>STATUS</th><th>MASA AKTIF</th><th>DOMAIN</th><th>AKSI</th></tr></thead>
              <tbody>{schools.map((school) => {
                const currentStatus = schoolStatus(school);
                return (
                  <tr key={school.id}>
                    <td><span className="school-code-tag">{school.school_code || '—'}</span></td>
                    <td><div className="directory-school-name"><b>{school.name}</b><span>{school.admin_name || 'Admin belum tersedia'}{school.admin_email ? ` · ${school.admin_email}` : ''}</span></div></td>
                    <td><span className={`package-tag ${school.package_type}`}>{packageLabel(school.package_type)}</span></td>
                    <td><span className={`directory-status ${currentStatus.className}`}>{currentStatus.label}</span></td>
                    <td>{school.package_type === 'lifetime' ? 'Lifetime' : formatDate(school.created_at)}</td>
                    <td className="directory-domain">—</td>
                    <td><button type="button" className="school-detail-icon" onClick={() => openSchoolDetail(school)} title="Detail Sekolah" aria-label={`Detail sekolah ${school.name}`}><Eye size={16} /></button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : (
          <div className="school-directory-empty"><Building2 size={25} /><b>{search || status !== 'all' ? 'Sekolah tidak ditemukan' : 'Belum ada sekolah'}</b><span>{search || status !== 'all' ? 'Coba ubah kata kunci atau filter status.' : 'Sekolah yang mendaftar akan tampil di sini.'}</span></div>
        )}
      </section>
      {selectedSchool && (
        <div className="school-detail-backdrop" onClick={() => { setSelectedSchool(null); setResetResult(null); }}>
          <section className="panel school-detail-modal" role="dialog" aria-modal="true" aria-labelledby="school-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="school-detail-heading">
              <div><h2 id="school-detail-title">Detail Sekolah</h2><p>{schoolDetail?.school.name || selectedSchool.name}</p></div>
              <button type="button" className="icon-button" onClick={() => { setSelectedSchool(null); setResetResult(null); }} aria-label="Tutup detail"><X size={18} /></button>
            </div>
            {detailLoading && <div className="loading-state"><div className="spinner" />Memuat detail sekolah...</div>}
            {detailError && <div className="error-box school-detail-error" role="alert">{detailError}</div>}
            {schoolDetail && (
              <>
                {detailNotice && <div className="success-box school-detail-notice" role="status"><Check size={15} />{detailNotice}</div>}
                <section className="school-detail-section">
                  <h3>Informasi Sekolah</h3>
                  <div className="school-detail-grid">
                    <span>Nama sekolah</span><b>{schoolDetail.school.name}</b>
                    <span>Kode sekolah</span>
                    <form className="school-code-editor" onSubmit={(event) => { event.preventDefault(); saveSchoolCode(); }}>
                      <input
                        value={schoolCode}
                        onChange={(event) => { setSchoolCode(event.target.value.toUpperCase()); setDetailError(''); }}
                        maxLength={4}
                        pattern="[A-Za-z0-9]{4}"
                        aria-label="Kode sekolah"
                        required
                      />
                      <button
                        type="submit"
                        className="school-detail-save"
                        disabled={savingSchoolCode || !/^[A-Z0-9]{4}$/.test(schoolCode.trim().toUpperCase()) || schoolCode.trim().toUpperCase() === schoolDetail.school.school_code}
                      >
                        {savingSchoolCode ? 'Menyimpan...' : <><Check size={14} />Simpan</>}
                      </button>
                    </form>
                    <span>NPSN</span><b>{schoolDetail.school.npsn || '—'}</b>
                    <span>Telepon</span><b>{schoolDetail.school.phone || '—'}</b>
                    <span>Email</span><b>{schoolDetail.school.email || '—'}</b>
                    <span>Website</span><b>{schoolDetail.school.website || '—'}</b>
                    <span>Alamat</span><b>{schoolDetail.school.address || '—'}</b>
                    <span>Kepala sekolah</span><b>{schoolDetail.school.principal_name || '—'}</b>
                    <span>NIP kepala sekolah</span><b>{schoolDetail.school.principal_nip || '—'}</b>
                    <span>Kepala perpustakaan</span><b>{schoolDetail.school.librarian_name || '—'}</b>
                    <span>NIP kepala perpustakaan</span><b>{schoolDetail.school.librarian_nip || '—'}</b>
                    <span>Paket</span><b>{packageLabel(schoolDetail.school.package_type)}</b>
                    <span>Status</span><b>{schoolStatus(schoolDetail.school).label}</b>
                    <span>Terdaftar</span><b>{formatDate(schoolDetail.school.created_at)}</b>
                  </div>
                </section>
                <section className="school-detail-section">
                  <h3>Ringkasan</h3>
                  <div className="school-detail-summary-grid">
                    <article><span>Total akun</span><b>{number(schoolDetail.summary.totalUsers)}</b></article>
                    <article><span>Anggota aktif</span><b>{number(schoolDetail.summary.activeMembers)}</b></article>
                    <article><span>Judul buku</span><b>{number(schoolDetail.summary.bookTitles)}</b></article>
                    <article><span>Total stok katalog</span><b>{number(schoolDetail.summary.bookStock)}</b></article>
                    <article><span>Eksemplar fisik</span><b>{number(schoolDetail.summary.bookItems)}</b></article>
                    <article><span>Peminjaman aktif</span><b>{number(schoolDetail.summary.activeLoans)}</b></article>
                    <article><span>Usulan menunggu</span><b>{number(schoolDetail.summary.pendingProcurements)}</b></article>
                    <article><span>Total kunjungan</span><b>{number(schoolDetail.summary.totalVisitors)}</b></article>
                  </div>
                </section>
                <section className="school-detail-section">
                  <h3>Akun Admin Sekolah</h3>
                  {resetResult && (
                    <div className="school-temporary-password" role="status">
                      <div><b>Kata sandi sementara untuk {resetResult.name}</b><span>Sampaikan secara aman. Kata sandi ini hanya ditampilkan pada dialog ini.</span></div>
                      <code>{resetResult.temporaryPassword}</code>
                      <button type="button" className="school-detail-save" onClick={copyTemporaryPassword}><Copy size={14} />Salin</button>
                      {copyNotice && <small>{copyNotice}</small>}
                    </div>
                  )}
                  {schoolDetail.admins.length ? (
                    <div className="school-admin-account-list">
                      {schoolDetail.admins.map((admin) => (
                        <article key={admin.id}>
                          <div>
                            <b>{admin.name}</b>
                            <span>{admin.email || 'Email belum tersedia'}{admin.phone ? ` · ${admin.phone}` : ''}</span>
                            <small>{admin.status === 'active' ? 'Aktif' : admin.status === 'blocked' ? 'Diblokir' : 'Tidak aktif'} · Terdaftar {formatDate(admin.created_at)}</small>
                          </div>
                          <button
                            type="button"
                            className="school-admin-reset-button"
                            onClick={() => { setResetTarget(admin); setResetError(''); setResetResult(null); setCopyNotice(''); }}
                            aria-label={`Reset kata sandi ${admin.name}`}
                          >
                            <KeyRound size={15} />Reset sandi
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : <p className="school-detail-empty">Belum ada akun admin pada sekolah ini.</p>}
                </section>
              </>
            )}
            {resetTarget && (
              <div className="school-password-reset-backdrop" onClick={(event) => {
                event.stopPropagation();
                if (event.target === event.currentTarget && !resettingPassword) {
                  setResetTarget(null);
                  setResetError('');
                }
              }}>
                <section className="school-password-reset-dialog" role="alertdialog" aria-modal="true" aria-labelledby="school-password-reset-title" onClick={(event) => event.stopPropagation()}>
                  <ShieldCheck size={25} />
                  <h3 id="school-password-reset-title">Reset kata sandi admin?</h3>
                  <p>Kata sandi untuk <b>{resetTarget.name}</b> akan diganti dengan kata sandi sementara yang baru.</p>
                  {resetError && <div className="error-box" role="alert">{resetError}</div>}
                  <div>
                    <button type="button" className="subtle-button" onClick={() => { setResetTarget(null); setResetError(''); }} disabled={resettingPassword}>Batal</button>
                    <button type="button" className="primary-button" onClick={confirmPasswordReset} disabled={resettingPassword}>
                      {resettingPassword ? 'Mereset...' : 'Reset Kata Sandi'}
                    </button>
                  </div>
                </section>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function BillingPage({ billing, onBillingCheck }) {
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    request(`/api/super-admin/billing?status=${encodeURIComponent(filter)}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [filter, retryCount]);

  const summary = data?.summary || {};
  const statusLabel = (value) => ({
    pending_verification: ['Menunggu Verifikasi', 'pending'],
    paid: ['Disetujui', 'paid'],
    unpaid: ['Belum Dibayar', 'unpaid'],
    rejected: ['Ditolak', 'rejected']
  })[value] || [value, ''];
  const dateLabel = (value) => value
    ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
    : '—';

  return (
    <section className="billing-page">
      <header className="management-heading">
        <div><h1>Pembayaran & Penagihan</h1><p>Verifikasi bukti pembayaran sekolah dan pantau tagihan yang tercatat.</p></div>
        <button className="primary-button" onClick={onBillingCheck} disabled={billing?.loading}>{billing?.loading ? 'Memeriksa...' : 'Jalankan Pemeriksaan Tagihan'}</button>
      </header>
      <div className="billing-summary-grid">
        <article className="billing-summary-card pending"><span>MENUNGGU VERIFIKASI</span><b>{number(summary.pendingVerification)}</b></article>
        <article className="billing-summary-card approved"><span>DISETUJUI</span><b>{number(summary.approved)}</b><small>{rupiah(summary.approvedAmount)}</small></article>
        <article className="billing-summary-card rejected"><span>DITOLAK</span><b>—</b><small>Status penolakan belum tersedia</small></article>
        <article className="billing-summary-card open"><span>TAGIHAN TERBUKA</span><b>{number(summary.openInvoices)}</b><small>{rupiah(summary.openAmount)} belum dibayar</small></article>
      </div>
      <section className="panel billing-automation-panel">
        <div className="panel-heading"><div><h3>Pemeriksaan Tagihan</h3><p>Ringkasan status invoice dan jatuh tempo.</p></div></div>
        <div className="billing-check-grid">
          <div><span>PEMERIKSAAN TERAKHIR</span><b>{billing?.checkedAt ? new Date(billing.checkedAt).toLocaleString('id-ID') : 'Belum pernah'}</b></div>
          <div><span>TAGIHAN TERBUKA</span><b>{billing ? number(billing.openInvoices) : number(summary.openInvoices)}</b></div>
          <div><span>LEWAT JATUH TEMPO</span><b>{billing ? number(billing.overdueInvoices) : '—'}</b></div>
        </div>
        <p className="billing-readonly-note">Pemeriksaan ini hanya membaca data. Pembuatan invoice, pengiriman WhatsApp, dan penangguhan otomatis belum diaktifkan.</p>
        {billing?.error && <div className="error-box">{billing.error}</div>}
        {billing?.message && <div className="success-box">{billing.message}</div>}
      </section>
      <section className="panel billing-table-panel">
        <div className="billing-tabs" role="tablist" aria-label="Filter pembayaran">
          {[['pending', 'Menunggu Verifikasi'], ['approved', 'Disetujui'], ['rejected', 'Ditolak'], ['all', 'Semua']].map(([value, label]) => (
            <button type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'selected' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        {error ? (
          <div className="error-panel"><CreditCard size={20} /><div><b>Data pembayaran belum dapat dimuat</b><p>{error}</p></div><button className="subtle-button" onClick={() => setRetryCount((current) => current + 1)}>Coba lagi</button></div>
        ) : loading ? (
          <div className="loading-state"><div className="spinner" />Memuat data pembayaran...</div>
        ) : data?.invoices.length ? (
          <div className="billing-table-scroll">
            <table className="billing-table">
              <thead><tr><th>DIAJUKAN</th><th>SEKOLAH</th><th>PAKET</th><th>NOMINAL</th><th>JATUH TEMPO</th><th>STATUS</th></tr></thead>
              <tbody>{data.invoices.map((invoice) => {
                const [label, className] = statusLabel(invoice.status);
                return <tr key={invoice.id}><td>{dateLabel(invoice.created_at)}</td><td><b>{invoice.school_name}</b></td><td>{invoice.package_type}</td><td>{rupiah(invoice.amount)}</td><td>{dateLabel(invoice.due_date)}</td><td><span className={`billing-status ${className}`}>{label}</span></td></tr>;
              })}</tbody>
            </table>
          </div>
        ) : (
          <div className="school-directory-empty"><CreditCard size={25} /><b>Belum ada pembayaran</b><span>Tagihan dan pengajuan pembayaran sekolah akan tampil di sini.</span></div>
        )}
      </section>
    </section>
  );
}

const moduleDescriptions = {
  'Paket Langganan': 'Atur nama, keterangan, ketersediaan, dan harga paket Basic, Premium, serta Lifetime.',
  'Default Menu Sekolah': 'Atur nama, urutan, dan visibilitas menu bawaan untuk sekolah.',
  'Branding Sistem': 'Atur identitas aplikasi, logo, dan teks yang digunakan pada halaman platform.',
  'QRIS & Harga': 'Atur QRIS manual dan instruksi pembayaran untuk sekolah.',
  'Pusat Tiket': 'Kelola tiket bantuan yang dikirim oleh sekolah.',
  'Pengumuman & Maintenance': 'Kelola pengumuman dan informasi pemeliharaan sistem.',
  'Petunjuk Pengguna': 'Lihat dan kelola panduan penggunaan platform.',
  'Log Aktivitas': 'Telusuri perubahan data, login, dan halaman yang dibuka pada platform.',
  'WhatsApp Gateway': 'Atur koneksi WhatsApp untuk notifikasi platform.',
  'AI Tutorial Edupoin': 'Atur integrasi asisten AI dan tutorial otomatis Edupoin.',
  'Backup & Restore': 'Kelola informasi pencadangan dan pemulihan data platform.',
  'Database Manager': 'Kelola database platform melalui panel administrasi yang dibatasi.',
  'Buka Panel Sekolah': 'Pilih tenant untuk meninjau panel sekolah dalam mode dukungan.',
  'Pengaturan Profil': 'Kelola identitas dan keamanan akun Super Admin.',
  'Syarat & SLA': 'Kelola dokumen Syarat & Ketentuan dan Service Level Agreement.'
};

function AdminModulePage({ title }) {
  return (
    <section className="admin-module-page">
      <header className="management-heading"><div><h1>{title}</h1><p>{moduleDescriptions[title] || `Kelola ${title.toLowerCase()} pada platform.`}</p></div></header>
      <section className="panel admin-module-empty">
        <span><Settings2 size={22} /></span>
        <h2>{title}</h2>
        <p>Halaman menu dapat diakses. Data dan tindakan untuk modul ini belum tersedia.</p>
      </section>
    </section>
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

function Dashboard({ data, onBillingCheck, billing, toast, onShowSchools, onShowActivityLogs }) {
  const stats = data.stats;
  const lastBillingCheck = billing?.checkedAt ? billing : data.lastBillingCheck;
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
          <div className="welcome-meta"><span><Building2 size={15} />{number(stats.schools)} sekolah terdaftar</span><i /><span><ShieldCheck size={15} />{number(stats.activeSchools)} aktif</span><i /><span><Activity size={15} />{number(stats.trialSchools)} uji coba</span></div>
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
        <div className="billing-copy"><div className="billing-title">Kontrol cron penagihan & pembekuan <span className="scheduled-pill schedule-pending"><span /> CRON BELUM AKTIF</span></div><p>Rencana harian: notifikasi H-7 · pembuatan tagihan otomatis · penangguhan setelah masa aktif berakhir</p><div className="billing-stats"><span>Terakhir dijalankan <b>{lastBillingCheck?.checkedAt ? new Date(lastBillingCheck.checkedAt).toLocaleString('id-ID') : 'Belum pernah'}</b></span><i /><span>Tagihan baru (putaran terakhir) <b>{number(lastBillingCheck?.newInvoices)}</b></span><i /><span>Ditangguhkan (putaran terakhir) <b>{number(lastBillingCheck?.suspendedSchools)}</b></span></div></div>
        <button className="primary-button billing-button" onClick={onBillingCheck} disabled={billing?.loading}>{billing?.loading ? 'Memeriksa...' : 'Jalankan Pemeriksaan Tagihan Sekarang'}<ArrowUpRight size={16} /></button>
      </section>
      {billing?.error ? <div className="error-box">{billing.error}</div> : billing?.message && <div className="inline-notice"><Check size={15} />{billing.message}</div>}

      <section className="content-grid">
        <article className="panel schools-panel">
          <div className="panel-heading"><div><h3>Sekolah terbaru</h3><p>Tenant yang baru bergabung di platform</p></div><button className="text-button" onClick={onShowSchools}>Lihat semua <ChevronRight size={16} /></button></div>
          {data.latestSchools.length ? <div className="school-list">{data.latestSchools.map((school, index) => <div className="school-row" key={school.id}><div className={`school-avatar avatar-${index % 5}`}>{school.name.slice(0, 1).toUpperCase()}</div><div className="school-name"><b>{school.name}</b><span>Bergabung {formattedDate(school.created_at)}</span></div><span className={`package-tag ${school.package_type}`}>{packageLabel(school.package_type)}</span><span className={`status-tag ${school.status}`}>{school.status === 'active' ? 'Aktif' : school.status === 'pending' ? 'Menunggu' : 'Ditangguhkan'}</span><button className="icon-button row-more" aria-label={`Opsi ${school.name}`}><MoreHorizontal size={18} /></button></div>)}</div> : <EmptyState text="Sekolah terbaru akan tampil di sini setelah tenant mendaftar." /> }
        </article>
        <article className="panel action-panel">
          <div className="panel-heading"><div><h3>Perlu tindakan</h3><p>Pembaruan yang memerlukan perhatian</p></div><span className="count-badge">{data.actions.length}</span></div>
          {data.actions.length ? <div className="action-list">{data.actions.map((action) => <div className="action-row" key={`${action.type}-${action.id}`}><span className={`action-icon ${action.type}`} >{action.type === 'invoice' ? <CreditCard size={16} /> : <Ticket size={16} />}</span><div><b>{action.description}</b><span>{action.school_name} · {formattedDate(action.created_at)}</span></div><ChevronRight size={16} className="action-arrow" /></div>)}</div> : <EmptyState text="Tidak ada tindakan yang tertunda." /> }
        </article>
      </section>
      <section className="panel activity-panel">
        <div className="panel-heading"><div><h3>Aktivitas Terakhir Super Admin</h3><p>Jejak audit aktivitas platform</p></div><button className="text-button" onClick={onShowActivityLogs}>Lihat semua <ChevronRight size={16} /></button></div>
        {data.activities.length ? <div className="activity-table"><div className="activity-header"><span>AKTIVITAS</span><span>ADMIN</span><span>ALAMAT IP</span><span>WAKTU</span></div>{data.activities.map((item) => <div className="activity-row" key={item.id}><span><span className="activity-dot" />{item.activity}</span><span>{item.admin_name || 'Platform'}</span><span>{item.ip_address || '—'}</span><span>{formattedDate(item.created_at)}</span></div>)}</div> : <EmptyState text="Aktivitas penting akan tercatat dan muncul di sini." />}
      </section>
      <footer className="page-footer"><span>© {new Date().getFullYear()} PerpusKita Platform</span><span><span className="live-dot" />Semua sistem beroperasi</span></footer>
    </>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state"><span><Search size={19} /></span>{text}</div>;
}

function LegalDocumentsPage() {
  const [documents, setDocuments] = useState({
    terms: { title: 'Syarat & Ketentuan Layanan', content: '', updatedAt: null },
    sla: { title: 'Service Level Agreement', content: '', updatedAt: null }
  });
  const [activeDocument, setActiveDocument] = useState('terms');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const document = documents[activeDocument];

  useEffect(() => {
    let active = true;
    request('/api/super-admin/legal-documents')
      .then(({ documents: saved }) => {
        if (active) setDocuments(saved);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function saveDocument(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await request('/api/super-admin/legal-documents', {
        method: 'PUT',
        body: JSON.stringify({ type: activeDocument, ...document })
      });
      setDocuments(result.documents);
      setMessage(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const updatedDate = document.updatedAt
    ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(document.updatedAt))
    : 'Belum pernah disimpan';

  return (
    <section className="legal-page">
      <header className="management-heading">
        <div><h1>Syarat & Ketentuan / SLA</h1><p>Kelola dokumen kebijakan yang berlaku untuk sekolah.</p></div>
      </header>
      <div className="legal-tabs" role="tablist" aria-label="Dokumen legal">
        <button type="button" role="tab" aria-selected={activeDocument === 'terms'} className={activeDocument === 'terms' ? 'selected' : ''} onClick={() => { setActiveDocument('terms'); setError(''); setMessage(''); }}>Syarat & Ketentuan</button>
        <button type="button" role="tab" aria-selected={activeDocument === 'sla'} className={activeDocument === 'sla' ? 'selected' : ''} onClick={() => { setActiveDocument('sla'); setError(''); setMessage(''); }}>Service Level Agreement</button>
      </div>
      <form className="panel legal-document-panel" onSubmit={saveDocument}>
        <div className="panel-heading profile-panel-heading"><div><h3>{activeDocument === 'terms' ? 'Syarat & Ketentuan (TOS)' : 'Service Level Agreement (SLA)'}</h3><p>Terakhir diperbarui {updatedDate}</p></div></div>
        <div className="legal-document-fields">
          <label>Judul Dokumen<input required minLength={2} maxLength={200} value={document.title} onChange={(event) => setDocuments({ ...documents, [activeDocument]: { ...document, title: event.target.value } })} /></label>
          <label>Isi Dokumen<textarea rows={12} maxLength={30000} value={document.content} onChange={(event) => setDocuments({ ...documents, [activeDocument]: { ...document, content: event.target.value } })} /></label>
          <small>Satu paragraf per baris. Pastikan isi dokumen sudah ditinjau sebelum diterapkan.</small>
          {error && <div className="error-box">{error}</div>}
          {message && <div className="success-box">{message}</div>}
          <button className="primary-button legal-save-button" disabled={loading || busy}>{busy ? 'Menyimpan...' : 'Simpan Dokumen'}</button>
        </div>
      </form>
    </section>
  );
}

function ProfilePage({ admin, onUpdate }) {
  const [profile, setProfile] = useState({
    name: admin.name || '',
    username: admin.username || '',
    email: admin.email || '',
    phone: admin.phone || ''
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [accountInfo, setAccountInfo] = useState(admin);
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    let active = true;
    request('/api/super-admin/me')
      .then(({ admin: current }) => {
        if (!active) return;
        setProfile({
          name: current.name || '',
          username: current.username || '',
          email: current.email || '',
          phone: current.phone || ''
        });
        setAccountInfo(current);
        onUpdate(current);
      })
      .catch((err) => {
        if (active) setProfileError(err.message);
      });
    return () => { active = false; };
  }, []);

  async function saveProfile(event) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError('');
    setProfileMessage('');
    try {
      const result = await request('/api/super-admin/profile', {
        method: 'PUT',
        body: JSON.stringify(profile)
      });
      setProfile(result.admin);
      setAccountInfo((current) => ({ ...current, ...result.admin }));
      onUpdate(result.admin);
      setProfileMessage(result.message);
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileBusy(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    if (newPassword !== confirmPassword) {
      setPasswordError('Ulangi kata sandi baru dengan benar.');
      return;
    }
    if (newPassword.length < 8 || newPassword === currentPassword) {
      setPasswordError('Kata sandi baru minimal 8 karakter dan harus berbeda dari kata sandi lama.');
      return;
    }

    setPasswordBusy(true);
    try {
      const result = await request('/api/super-admin/profile/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setPasswordMessage(result.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordBusy(false);
    }
  }

  const formatLoginDate = (value) => value
    ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Belum tercatat';

  return (
    <section className="profile-page">
      <header className="management-heading">
        <div><h1>Pengaturan Profil Super Admin</h1><p>Ubah nama akun, username, email, nomor WhatsApp pemulihan, dan kata sandi.</p></div>
      </header>
      <div className="profile-settings-grid">
        <form className="panel profile-form" onSubmit={saveProfile}>
          <div className="panel-heading profile-panel-heading"><div><h3>Identitas Akun</h3><p>Nama tampilan dan username untuk masuk</p></div></div>
          <div className="profile-form-fields">
            <label>Nama Akun Super Admin<input required minLength={2} maxLength={150} value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
            <label>Username<input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9._-]+" value={profile.username} onChange={(event) => setProfile({ ...profile, username: event.target.value.toLowerCase() })} /><small>3–32 karakter: huruf kecil, angka, titik, garis bawah, atau strip.</small></label>
            <label>Email (opsional)<input type="email" maxLength={190} value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /><small>Bisa dipakai sebagai alternatif username saat masuk.</small></label>
            <label>Nomor WhatsApp Pemulihan<input type="tel" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} placeholder="6281234567890" /><small>Nomor ini disimpan untuk kebutuhan pemulihan akun.</small></label>
            {profileError && <div className="error-box">{profileError}</div>}
            {profileMessage && <div className="success-box">{profileMessage}</div>}
            <button className="primary-button profile-submit" disabled={profileBusy}>{profileBusy ? 'Menyimpan...' : 'Simpan Profil'}</button>
          </div>
        </form>

        <form className="panel profile-form" onSubmit={savePassword}>
          <div className="panel-heading profile-panel-heading"><div><h3>Perbarui Kata Sandi</h3><p>Wajib menyertakan kata sandi lama sebagai verifikasi</p></div></div>
          <div className="profile-form-fields">
            <label>Kata Sandi Lama<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
            <label>Kata Sandi Baru<input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><small>Minimal 8 karakter, tidak boleh sama dengan sandi lama.</small></label>
            <label>Ulangi Kata Sandi Baru<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
            {passwordError && <div className="error-box">{passwordError}</div>}
            {passwordMessage && <div className="success-box">{passwordMessage}</div>}
            <button className="primary-button profile-submit" disabled={passwordBusy}>{passwordBusy ? 'Menyimpan...' : 'Simpan Kata Sandi'}</button>
            <small className="profile-session-note">Sesi yang sedang aktif tetap berjalan sampai Anda keluar.</small>
          </div>
        </form>
      </div>

      <section className="panel profile-account-info">
        <div className="panel-heading profile-panel-heading"><div><h3>Informasi Akun</h3></div></div>
        <div className="account-info-grid">
          <div><span>Username aktif</span><b>{accountInfo.username || '—'}</b></div>
          <div><span>Terakhir masuk</span><b>{formatLoginDate(accountInfo.lastLoginAt)}</b></div>
          <div><span>Email</span><b>{accountInfo.email || 'Belum diisi'}</b></div>
          <div><span>WhatsApp pemulihan</span><b>{accountInfo.phone || 'Belum diisi'}</b></div>
          <div><span>Jumlah akun Super Admin</span><b>{number(accountInfo.totalAdmins)}</b></div>
        </div>
      </section>
    </section>
  );
}

export default function App() {
  const [admin, setAdmin] = useState(null);
  const [schoolAccount, setSchoolAccount] = useState(null);
  const [page, setPage] = useState(currentPage);
  const [adminSessionLoading, setAdminSessionLoading] = useState(() => Boolean(localStorage.getItem('super-admin-token')));
  const [schoolSessionLoading, setSchoolSessionLoading] = useState(() => (
    (window.location.pathname.startsWith('/school/') || window.location.pathname.startsWith('/public/'))
      && Boolean(localStorage.getItem('school-token'))
  ));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [active, setActive] = useState('Dashboard');
  const [billing, setBilling] = useState(null);
  const [toastText, setToastText] = useState('');
  const [branding, setBranding] = useState({
    title: 'PerpusKita',
    subtitle: 'PLATFORM ADMIN',
    primaryColor: '#f97316',
    logo: ''
  });

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
    if (!page.startsWith('/school/') && !page.startsWith('/public/')) {
      setSchoolSessionLoading(false);
      return undefined;
    }
    const token = localStorage.getItem('school-token');
    if (!token) {
      setSchoolSessionLoading(false);
      setSchoolAccount(null);
      return undefined;
    }
    if (schoolAccount) {
      setSchoolSessionLoading(false);
      return undefined;
    }
    let active = true;
    setSchoolSessionLoading(true);
    request('/api/auth/school/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(({ account }) => {
        if (active) setSchoolAccount(account);
      })
      .catch(() => {
        if (!active) return;
        localStorage.removeItem('school-token');
        setSchoolAccount(null);
      })
      .finally(() => {
        if (active) setSchoolSessionLoading(false);
      });
    return () => { active = false; };
  }, [page, schoolAccount]);

  useEffect(() => {
    const token = localStorage.getItem('super-admin-token');
    if (!token) {
      setAdminSessionLoading(false);
      return undefined;
    }
    let active = true;
    setAdminSessionLoading(true);
    request('/api/super-admin/me')
      .then(({ admin: current }) => {
        if (active) setAdmin(current);
      })
      .catch(() => {
        if (!active) return;
        localStorage.removeItem('super-admin-token');
        setAdmin(null);
      })
      .finally(() => {
        if (active) setAdminSessionLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!admin) return;
    request('/api/super-admin/dashboard')
      .then(setData)
      .catch((err) => setError(err.message));
  }, [admin]);

  useEffect(() => {
    if (!admin) return;
    let activeRequest = true;
    request('/api/super-admin/branding')
      .then(({ branding: savedBranding }) => {
        if (activeRequest) setBranding((current) => ({ ...current, ...savedBranding }));
      })
      .catch((brandingError) => {
        if (activeRequest) console.error('Gagal memuat branding platform:', brandingError);
      });
    return () => { activeRequest = false; };
  }, [admin]);

  useEffect(() => {
    document.title = branding.title || 'PerpusKita';
  }, [branding.title]);

  useEffect(() => {
    if (!admin) return;
    request('/api/super-admin/audit-logs/page-view', {
      method: 'POST',
      body: JSON.stringify({ pageName: active })
    }).catch((logError) => console.error('Gagal mencatat halaman Super Admin:', logError));
  }, [active, admin]);

  async function runBillingCheck() {
    setBilling({ loading: true });
    try {
      const result = await request('/api/super-admin/billing-check', { method: 'POST' });
      setBilling({ ...result, loading: false });
    } catch (err) {
      setBilling({ loading: false, error: err.message });
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
    setSchoolSessionLoading(false);
    navigate('/school/login');
  }

  if (page.startsWith('/public/')) {
    if (schoolSessionLoading) return <div className="loading-state"><div className="spinner" />Memulihkan sesi anggota...</div>;
    const [, , schoolCode, section] = page.split('/');
    return <PublicLibraryPortal
      schoolCode={schoolCode}
      section={section || 'check'}
      account={schoolAccount}
      onAccountUpdated={setSchoolAccount}
      onNavigate={navigate}
      onLogout={() => {
        localStorage.removeItem('school-token');
        setSchoolAccount(null);
      }}
    />;
  }

  if (page.startsWith('/school/')) {
    if (schoolAccount) return <SchoolPortal account={schoolAccount} onAccountUpdated={setSchoolAccount} onLogout={schoolLogout} />;
    if (schoolSessionLoading) return <div className="loading-state"><div className="spinner" />Memulihkan sesi sekolah...</div>;
    return <SchoolAuth mode={page === '/school/register' ? 'register' : 'login'} onNavigate={navigate} onLogin={setSchoolAccount} />;
  }

  if (!admin) {
    if (adminSessionLoading) return <div className="loading-state"><div className="spinner" />Memulihkan sesi Super Admin...</div>;
    return <Login onLogin={setAdmin} />;
  }

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`} style={{ '--platform-accent': branding.primaryColor }}>
      {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Tutup menu" />}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand"><div className="brand-mark">{branding.logo ? <img className="platform-brand-logo" src={branding.logo} alt="" /> : <BookOpen size={21} />}</div>{!collapsed && <div className="brand-text"><b>{branding.title}<span>.</span></b><small>{branding.subtitle}</small></div>}<button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label="Ciutkan sidebar">{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button></div>
        <div className="workspace-switch"><div className={`workspace-logo ${branding.logo ? 'has-logo' : ''}`}>{branding.logo ? <img src={branding.logo} alt="" /> : 'P'}</div>{!collapsed && <><div><b>{branding.title}</b><span>Platform Owner</span></div><ChevronDown size={15} className="workspace-chevron" /></>}</div>
        <nav className="side-nav">{groups.map((group) => <div className="nav-group" key={group.title}><div className="nav-group-title">{!collapsed ? group.title : <span className="nav-divider" />}</div>{group.items.map(({ label, icon: Icon, badge }) => <button key={label} title={collapsed ? label : undefined} onClick={() => { setActive(label); setMobileOpen(false); }} className={`nav-item ${active === label ? 'selected' : ''}`}><Icon size={17} /><span className="nav-label">{!collapsed && label}</span>{!collapsed && badge && data && <span className="nav-badge">{number(data.stats[badge])}</span>}</button>)}</div>)}</nav>
        <div className="sidebar-bottom"><button className="profile-card" onClick={logout} aria-label="Keluar dari akun Super Admin"><div className="profile-avatar" aria-hidden="true">{admin.name?.slice(0, 1).toUpperCase() || 'P'}</div><LogOut size={16} className="logout-icon" aria-hidden="true" /></button></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Buka menu"><Menu size={20} /></button><div className="breadcrumbs"><span>Platform</span><ChevronRight size={14} /><b>{active}</b></div></div><div className="topbar-right"><div className="search-box"><Search size={16} /><input placeholder="Cari apa saja..." aria-label="Cari" /><kbd>⌘ K</kbd></div><button className="icon-button notification-button" aria-label="Notifikasi"><Bell size={18} /><i /></button><div className="topbar-separator" /><div className="top-admin-menu-wrap"><button type="button" className="top-admin" aria-label={`Profil ${admin.name}`} aria-expanded={profileMenuOpen} aria-haspopup="menu" onClick={() => setProfileMenuOpen((open) => !open)}><span className="top-admin-avatar">{admin.name?.slice(0, 1).toUpperCase() || 'P'}</span><span>{admin.name}</span><ChevronDown size={14} /></button>{profileMenuOpen && <div className="top-admin-dropdown" role="menu"><div><b>{admin.name}</b><span>{admin.email || admin.username}</span></div><button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); setActive('Pengaturan Profil'); }}><Users size={15} />Pengaturan Profil</button><button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); logout(); }}><LogOut size={15} />Keluar</button></div>}</div></div></header>
        <div className="page-content">
          {active === 'Daftar Sekolah' ? <SchoolListPage />
            : active === 'Pembayaran & Penagihan' ? <BillingPage billing={billing} onBillingCheck={runBillingCheck} />
            : active === 'Paket Langganan' ? <PlatformSubscriptionPackagesPage />
            : active === 'QRIS & Harga' ? <PlatformPaymentSettingsPage />
            : active === 'Backup & Restore' ? <BackupRestorePanel scope="platform" />
            : active === 'Pengaturan Profil' ? <ProfilePage admin={admin} onUpdate={setAdmin} />
            : active === 'Syarat & SLA' ? <LegalDocumentsPage />
            : active === 'Log Aktivitas' ? <PlatformAuditLogsPage />
            : active === 'Pusat Tiket' ? <PlatformTicketsPage />
            : active === 'Petunjuk Pengguna' ? <PlatformUserGuidePage />
            : active === 'Branding Sistem' ? <PlatformAppearancePage mode="branding" onSaved={setBranding} />
            : active === 'Tema' ? <PlatformAppearancePage mode="theme" onSaved={setBranding} />
            : active === 'Dashboard' ? error ? <div className="error-panel"><ShieldCheck size={20} /><div><b>Dashboard belum dapat dimuat</b><p>{error}. Pastikan database sudah disiapkan dan tersedia datanya.</p></div><button className="subtle-button" onClick={() => { setError(''); request('/api/super-admin/dashboard').then(setData).catch((err) => setError(err.message)); }}>Coba lagi</button></div>
              : data ? <Dashboard data={{ ...data, adminName: admin.name }} onBillingCheck={runBillingCheck} billing={billing} toast={toast} onShowSchools={() => setActive('Daftar Sekolah')} onShowActivityLogs={() => setActive('Log Aktivitas')} />
                : <div className="loading-state"><div className="spinner" />Memuat ringkasan platform...</div>
            : <AdminModulePage title={active} />}
        </div>
      </main>
      {toastText && <div className="toast"><Check size={16} />{toastText}<button onClick={() => setToastText('')} aria-label="Tutup"><X size={15} /></button></div>}
    </div>
  );
}
