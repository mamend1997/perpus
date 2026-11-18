import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, Bell, BookOpen, Check, Clock3, Plus, Save, ShieldCheck,
  UserPlus, Users, Wallet, X
} from 'lucide-react';
import {
  createSchoolUser, fetchLibrarySettings, fetchRolePermissions, fetchSchoolUsers,
  saveLibrarySettings, saveRolePermissions
} from './schoolSettingsApi.js';
import {
  defaultSchoolPermissions, schoolPermissionFeatures, schoolPermissionRoles
} from './schoolPermissions.js';

const roleLabels = Object.fromEntries(schoolPermissionRoles.map(({ key, label }) => [key, label]));

function AccountModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'kepsek',
    phone: '',
    nis_nisn: '',
    rombel: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { user } = await createSchoolUser(form);
      onCreated(user);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="master-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="master-modal school-account-modal" role="dialog" aria-modal="true" aria-labelledby="school-account-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">AKUN SEKOLAH</span><h2 id="school-account-title">Tambah Akun</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={18} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="master-form-grid">
            <label className="master-form-wide">Nama lengkap
              <input name="name" value={form.name} onChange={update} maxLength={180} required autoFocus />
            </label>
            <label className="master-form-wide">Email
              <input name="email" type="email" value={form.email} onChange={update} maxLength={190} required />
            </label>
            <label>Role
              <select name="role" value={form.role} onChange={update}>
                {schoolPermissionRoles.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label>No. telepon
              <input name="phone" type="tel" value={form.phone} onChange={update} maxLength={30} />
            </label>
            {form.role === 'member' && (
              <>
                <label>NIS/NISN
                  <input name="nis_nisn" value={form.nis_nisn} onChange={update} maxLength={40} />
                </label>
                <label>Kelas / Rombel
                  <input name="rombel" value={form.rombel} onChange={update} maxLength={80} />
                </label>
              </>
            )}
            <label className="master-form-wide">Kata sandi awal
              <input name="password" type="password" autoComplete="new-password" value={form.password} onChange={update} minLength={8} required />
              <small>Minimal 8 karakter, huruf besar, angka, dan simbol.</small>
            </label>
          </div>
          {error && <p className="master-form-error" role="alert"><AlertCircle size={15} />{error}</p>}
          <footer className="master-modal-actions">
            <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving}>
              <UserPlus size={15} />{saving ? 'Membuat...' : 'Buat Akun'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}

function PermissionToggle({ checked, label, onChange }) {
  return (
    <label className="school-permission-toggle" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden="true" />
    </label>
  );
}

const defaultLibrarySettings = {
  maxLoansPerMember: 3,
  loanDurationDays: 7,
  renewalsEnabled: false,
  maxRenewals: 1,
  finePerDay: 1000,
  automaticFines: true,
  whatsappEnabled: false,
  whatsappReminders: false,
  whatsappFineNotifications: false,
  whatsappOtp: false,
  whatsappTokenConfigured: false
};

function LibrarySettingsPanel() {
  const [settings, setSettings] = useState(defaultLibrarySettings);
  const [whatsappToken, setWhatsappToken] = useState('');
  const [clearWhatsappToken, setClearWhatsappToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    fetchLibrarySettings()
      .then(({ settings: result }) => { if (active) setSettings({ ...defaultLibrarySettings, ...result }); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function update(event) {
    const { name, value, type, checked } = event.target;
    setSettings((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setError('');
    setNotice('');
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        ...settings,
        maxLoansPerMember: Number(settings.maxLoansPerMember),
        loanDurationDays: Number(settings.loanDurationDays),
        maxRenewals: Number(settings.maxRenewals),
        finePerDay: Number(settings.finePerDay),
        clearWhatsappToken
      };
      if (whatsappToken.trim()) payload.whatsappToken = whatsappToken.trim();
      const result = await saveLibrarySettings(payload);
      setSettings({ ...defaultLibrarySettings, ...result.settings });
      setWhatsappToken('');
      setClearWhatsappToken(false);
      setNotice(result.message || 'Pengaturan berhasil disimpan.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="master-data-panel school-library-settings-panel" onSubmit={submit}>
      <div className="school-settings-panel-heading">
        <div><h2>Aturan Perpustakaan</h2><p>Perubahan langsung diterapkan pada transaksi peminjaman dan denda baru.</p></div>
      </div>
      {error && <div className="master-message master-message-error" role="alert"><AlertCircle size={16} />{error}</div>}
      {notice && <div className="master-message master-message-success" role="status"><Check size={16} />{notice}</div>}

      <section className="school-library-settings-section">
        <h3><BookOpen size={17} />Aturan Sirkulasi &amp; Peminjaman</h3>
        <div className="school-library-settings-grid">
          <label>Batas maksimal pinjaman per siswa
            <input name="maxLoansPerMember" type="number" min="1" max="50" value={settings.maxLoansPerMember} onChange={update} disabled={loading || saving} required />
            <small>Menghitung permintaan Pending dan transaksi Dipinjam.</small>
          </label>
          <label>Durasi pinjam standar (hari)
            <input name="loanDurationDays" type="number" min="1" max="60" value={settings.loanDurationDays} onChange={update} disabled={loading || saving} required />
          </label>
          <label className="school-settings-check">
            <input name="renewalsEnabled" type="checkbox" checked={Boolean(settings.renewalsEnabled)} onChange={update} disabled={loading || saving} />
            Izinkan perpanjangan masa pinjam
          </label>
          <label>Jumlah maksimal perpanjangan
            <input name="maxRenewals" type="number" min="0" max="5" value={settings.maxRenewals} onChange={update} disabled={loading || saving || !settings.renewalsEnabled} />
          </label>
        </div>
      </section>

      <section className="school-library-settings-section">
        <h3><Wallet size={17} />Konfigurasi Denda</h3>
        <div className="school-library-settings-grid">
          <label>Tarif denda keterlambatan per hari (Rp)
            <input name="finePerDay" type="number" min="0" max="1000000" step="100" value={settings.finePerDay} onChange={update} disabled={loading || saving} required />
          </label>
          <label className="school-settings-check">
            <input name="automaticFines" type="checkbox" checked={Boolean(settings.automaticFines)} onChange={update} disabled={loading || saving} />
            Aktifkan perhitungan denda otomatis saat pengembalian
          </label>
        </div>
      </section>

      <section className="school-library-settings-section">
        <h3><Bell size={17} />Notifikasi &amp; Integrasi WhatsApp</h3>
        <div className="school-library-settings-grid">
          <label className="school-settings-check">
            <input name="whatsappEnabled" type="checkbox" checked={Boolean(settings.whatsappEnabled)} onChange={update} disabled={loading || saving} />
            Aktifkan integrasi WhatsApp Gateway / Fonnte
          </label>
          <label>Token API Fonnte
            <input type="password" autoComplete="new-password" value={whatsappToken} onChange={(event) => { setWhatsappToken(event.target.value); setClearWhatsappToken(false); }} maxLength={500} placeholder={settings.whatsappTokenConfigured ? 'Token tersimpan — isi hanya untuk mengganti' : 'Masukkan token API'} disabled={loading || saving} />
            <small>{settings.whatsappTokenConfigured ? 'Token tersimpan terenkripsi dan tidak ditampilkan kembali.' : 'Token akan dienkripsi sebelum disimpan.'}</small>
          </label>
          <label className="school-settings-check">
            <input name="whatsappReminders" type="checkbox" checked={Boolean(settings.whatsappReminders)} onChange={update} disabled={loading || saving || !settings.whatsappEnabled} />
            Pengingat batas pengembalian buku
          </label>
          <label className="school-settings-check">
            <input name="whatsappFineNotifications" type="checkbox" checked={Boolean(settings.whatsappFineNotifications)} onChange={update} disabled={loading || saving || !settings.whatsappEnabled} />
            Notifikasi denda dan keterlambatan
          </label>
          <label className="school-settings-check">
            <input name="whatsappOtp" type="checkbox" checked={Boolean(settings.whatsappOtp)} onChange={update} disabled={loading || saving || !settings.whatsappEnabled} />
            Pengiriman OTP melalui WhatsApp
          </label>
          {settings.whatsappTokenConfigured && <label className="school-settings-check school-settings-clear-token">
            <input type="checkbox" checked={clearWhatsappToken} onChange={(event) => { setClearWhatsappToken(event.target.checked); if (event.target.checked) setWhatsappToken(''); }} disabled={loading || saving} />
            Hapus token tersimpan
          </label>}
        </div>
      </section>

      <div className="school-library-settings-savebar">
        <span><Clock3 size={14} />{loading ? 'Memuat konfigurasi...' : 'Pengaturan berlaku untuk transaksi baru.'}</span>
        <button type="submit" className="master-button master-button-primary" disabled={loading || saving}>
          <Save size={15} />{saving ? 'Menyimpan...' : 'Simpan Perubahan'}
        </button>
      </div>
    </form>
  );
}

export default function SchoolSettingsPage() {
  const [tab, setTab] = useState('accounts');
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [role, setRole] = useState(schoolPermissionRoles[0].key);
  const [permissions, setPermissions] = useState(defaultSchoolPermissions);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [permissionsError, setPermissionsError] = useState('');
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [permissionNotice, setPermissionNotice] = useState('');
  const [accountModalOpen, setAccountModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setUsersLoading(true);
    fetchSchoolUsers()
      .then(({ users: results }) => { if (active) setUsers(results); })
      .catch((error) => { if (active) setUsersError(error.message); })
      .finally(() => { if (active) setUsersLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setPermissionsLoading(true);
    setPermissionsError('');
    setPermissionNotice('');
    fetchRolePermissions(role)
      .then((result) => { if (active) setPermissions(result.permissions); })
      .catch((error) => { if (active) setPermissionsError(error.message); })
      .finally(() => { if (active) setPermissionsLoading(false); });
    return () => { active = false; };
  }, [role]);

  const groupedFeatures = useMemo(() => schoolPermissionFeatures.reduce((groups, feature) => {
    groups[feature.section] = [...(groups[feature.section] || []), feature];
    return groups;
  }, {}), []);

  function togglePermission(featureKey, action, enabled) {
    setPermissions((current) => ({
      ...current,
      [featureKey]: { ...current[featureKey], [action]: enabled }
    }));
    setPermissionNotice('');
  }

  async function savePermissions() {
    setSavingPermissions(true);
    setPermissionsError('');
    setPermissionNotice('');
    try {
      const items = schoolPermissionFeatures.map(({ key }) => ({
        featureKey: key,
        view: Boolean(permissions[key]?.view),
        edit: Boolean(permissions[key]?.edit),
        delete: Boolean(permissions[key]?.delete)
      }));
      const result = await saveRolePermissions(role, items);
      setPermissions(result.permissions);
      setPermissionNotice(`Hak akses ${roleLabels[role]} berhasil disimpan.`);
    } catch (error) {
      setPermissionsError(error.message);
    } finally {
      setSavingPermissions(false);
    }
  }

  function handleCreated(user) {
    setUsers((current) => [...current, user].sort((a, b) => a.name.localeCompare(b.name, 'id')));
    setAccountModalOpen(false);
    setUsersError('');
  }

  return (
    <div className="library-module-page school-settings-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">ADMINISTRASI SEKOLAH</span>
        <h1>Pengaturan</h1>
        <p>Kelola akun pengguna dan hak akses fitur berdasarkan role.</p>
      </header>

      <div className="school-settings-tabs" role="tablist" aria-label="Bagian pengaturan">
        <button type="button" role="tab" aria-selected={tab === 'accounts'} className={tab === 'accounts' ? 'selected' : ''} onClick={() => setTab('accounts')}>
          <Users size={16} />Akun
        </button>
        <button type="button" role="tab" aria-selected={tab === 'permissions'} className={tab === 'permissions' ? 'selected' : ''} onClick={() => setTab('permissions')}>
          <ShieldCheck size={16} />Hak Akses
        </button>
        <button type="button" role="tab" aria-selected={tab === 'library'} className={tab === 'library' ? 'selected' : ''} onClick={() => setTab('library')}>
          <BookOpen size={16} />Aturan Perpustakaan
        </button>
      </div>

      {tab === 'accounts' ? (
        <section className="master-data-panel school-accounts-panel">
          <div className="school-settings-panel-heading">
            <div><h2>Akun Sekolah</h2><p>Tambah akun Kepala Sekolah, Kepala Perpustakaan, dan Member Perpus.</p></div>
            <button type="button" className="master-button master-button-primary" onClick={() => setAccountModalOpen(true)}><Plus size={16} />Tambah Akun</button>
          </div>
          {usersError && <div className="master-message master-message-error" role="alert"><AlertCircle size={16} />{usersError}</div>}
          <div className="master-table-scroll">
            <table className="master-table school-users-table">
              <thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>No. Telp</th><th>Status</th></tr></thead>
              <tbody>
                {usersLoading ? (
                  <tr><td className="master-empty-cell" colSpan={5}>Memuat akun...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td className="master-empty-cell" colSpan={5}>Belum ada akun.</td></tr>
                ) : users.map((user) => (
                  <tr key={user.id}>
                    <td><b className="master-primary-text">{user.name}</b></td>
                    <td>{user.email}</td>
                    <td><span className="school-role-badge">{user.role === 'admin' ? 'Admin Sekolah' : roleLabels[user.role]}</span></td>
                    <td>{user.phone || '—'}</td>
                    <td><span className={`master-status ${user.status === 'active' ? 'is-active' : 'is-inactive'}`}>{user.status === 'active' ? 'Aktif' : 'Nonaktif'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="master-table-footer"><span>{users.length} akun terdaftar</span><span>Akun dibatasi untuk sekolah ini</span></div>
        </section>
      ) : tab === 'permissions' ? (
        <section className="master-data-panel school-permissions-panel">
          <div className="school-settings-panel-heading">
            <div><h2>Kontrol Hak Akses</h2><p>Atur izin Lihat, Edit, dan Hapus untuk setiap fitur.</p></div>
            <label className="school-role-selector">Role
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                {schoolPermissionRoles.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
          </div>
          {permissionsError && <div className="master-message master-message-error" role="alert"><AlertCircle size={16} />{permissionsError}</div>}
          {permissionNotice && <div className="master-message master-message-success"><Check size={16} />{permissionNotice}</div>}
          <div className="school-permission-table-wrap">
            {permissionsLoading ? <div className="master-empty-cell">Memuat hak akses...</div> : Object.entries(groupedFeatures).map(([section, features]) => (
              <section className="school-permission-group" key={section}>
                <h3>{section}</h3>
                <div className="school-permission-row school-permission-header">
                  <span>Fitur</span><span>Lihat</span><span>Edit</span><span>Hapus</span>
                </div>
                {features.map(({ key, label }) => (
                  <div className="school-permission-row" key={key}>
                    <span className="school-permission-feature">{label}</span>
                    {['view', 'edit', 'delete'].map((action) => (
                      <PermissionToggle
                        key={action}
                        label={`${label}: ${action}`}
                        checked={Boolean(permissions[key]?.[action])}
                        onChange={(enabled) => togglePermission(key, action, enabled)}
                      />
                    ))}
                  </div>
                ))}
              </section>
            ))}
          </div>
          <div className="school-permission-savebar">
            <span>Hak akses setiap tindakan diatur secara terpisah.</span>
            <button type="button" className="master-button master-button-primary" onClick={savePermissions} disabled={savingPermissions || permissionsLoading || Boolean(permissionsError)}>
              <Save size={15} />{savingPermissions ? 'Menyimpan...' : 'Simpan Hak Akses'}
            </button>
          </div>
        </section>
      ) : <LibrarySettingsPanel />}

      {accountModalOpen && <AccountModal onClose={() => setAccountModalOpen(false)} onCreated={handleCreated} />}
    </div>
  );
}
