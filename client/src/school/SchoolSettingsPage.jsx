import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, Bell, BookOpen, Check, Clock3, MoveDown, MoveUp, Pencil, Plus,
  Save, ScanLine, ShieldCheck, Smartphone, Star, Trash2, UserPlus, Users, Wallet, X
} from 'lucide-react';
import {
  createSchoolUser, deleteSchoolUser, deleteSchoolUsers, fetchLibrarySettings, fetchMobileNavbarSettings,
  fetchRolePermissions, fetchSchoolUsers, saveLibrarySettings, saveMobileNavbarSettings,
  saveRolePermissions, updateSchoolUser
} from './schoolSettingsApi.js';
import {
  defaultSchoolPermissions, schoolPermissionFeatures, schoolPermissionRoles
} from './schoolPermissions.js';
import { defaultMobileNavbarSettings, mobileNavbarOptions } from './schoolNavigation.js';
import SchoolConfirmDialog from './SchoolConfirmDialog.jsx';
import BarcodeLabelSettingsPanel from './BarcodeLabelSettingsPanel.jsx';

const roleLabels = Object.fromEntries(schoolPermissionRoles.map(({ key, label }) => [key, label]));

function AccountModal({ account, onClose, onSaved }) {
  const availableRoles = schoolPermissionRoles.filter(({ key }) => key !== 'member' || account?.role === 'member');
  const [form, setForm] = useState(() => ({
    name: account?.name || '',
    email: account?.email || '',
    role: account?.role || 'kepsek',
    phone: account?.phone || '',
    nis_nisn: account?.nis_nisn || '',
    rombel: account?.rombel || '',
    gender: account?.gender || '',
    status: account?.status || 'active',
    password: ''
  }));
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
      const { user } = account
        ? await updateSchoolUser(account.id, form)
        : await createSchoolUser(form);
      onSaved(user, account ? 'Akun berhasil diperbarui.' : 'Akun berhasil ditambahkan.');
    } catch (saveError) {
      setError(saveError.message);
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
          <div><span className="library-eyebrow">AKUN SEKOLAH</span><h2 id="school-account-title">{account ? 'Edit Akun' : 'Tambah Akun'}</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={18} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="master-form-grid">
            <label className="master-form-wide">Nama lengkap
              <input name="name" value={form.name} onChange={update} maxLength={180} required autoFocus />
            </label>
            <label className="master-form-wide">Email
              <input name="email" type="email" value={form.email} onChange={update} maxLength={190} required={!account} />
            </label>
            <label>Role
              <select name="role" value={form.role} onChange={update}>
                {availableRoles.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
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
                <label>Jenis Kelamin
                  <select name="gender" value={form.gender} onChange={update}><option value="">Pilih</option><option value="male">Laki-laki</option><option value="female">Perempuan</option><option value="other">Lainnya</option></select>
                </label>
              </>
            )}
            {account && <label>Status Akun
              <select name="status" value={form.status} onChange={update}><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="blocked">Diblokir</option></select>
            </label>}
            <label className="master-form-wide">{account ? 'Kata sandi baru (opsional)' : 'Kata sandi awal'}
              <input name="password" type="password" autoComplete="new-password" value={form.password} onChange={update} minLength={8} maxLength={128} required={!account} />
              <small>{account ? 'Kosongkan jika tidak ingin mengganti kata sandi. Jika diisi, gunakan minimal 8 karakter, huruf besar, angka, dan simbol.' : 'Minimal 8 karakter, huruf besar, angka, dan simbol.'}</small>
            </label>
          </div>
          {error && <p className="master-form-error" role="alert"><AlertCircle size={15} />{error}</p>}
          <footer className="master-modal-actions">
            <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving}>
              {account ? <Check size={15} /> : <UserPlus size={15} />}{saving ? 'Menyimpan...' : account ? 'Simpan Perubahan' : 'Buat Akun'}
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

function MobileNavbarSettingsPanel({ onSettingsSaved }) {
  const [settings, setSettings] = useState(() => ({
    items: [...defaultMobileNavbarSettings.items],
    highlight: defaultMobileNavbarSettings.highlight
  }));
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    fetchMobileNavbarSettings()
      .then(({ settings: result }) => {
        if (!active) return;
        setSettings({ items: [...result.items], highlight: result.highlight });
        setLoaded(true);
      })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function updateItem(index, value) {
    setSettings((current) => {
      const previousItem = current.items[index];
      return {
        items: current.items.map((item, itemIndex) => itemIndex === index ? value : item),
        highlight: current.highlight === previousItem ? value : current.highlight
      };
    });
    setError('');
    setNotice('');
  }

  function moveItem(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= settings.items.length) return;
    setSettings((current) => {
      const items = [...current.items];
      [items[index], items[targetIndex]] = [items[targetIndex], items[index]];
      return { ...current, items };
    });
    setNotice('');
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await saveMobileNavbarSettings(settings);
      const saved = { items: [...result.settings.items], highlight: result.settings.highlight };
      setSettings(saved);
      onSettingsSaved?.(saved);
      setNotice(result.message || 'Pengaturan navbar ponsel berhasil disimpan.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="master-data-panel school-mobile-navbar-settings" onSubmit={submit}>
      <div className="school-settings-panel-heading">
        <div><h2>Navbar Ponsel</h2><p>Pilih lima menu, atur urutannya, lalu tentukan satu tombol sorotan berwarna biru.</p></div>
      </div>
      {error && <div className="master-message master-message-error" role="alert"><AlertCircle size={16} />{error}</div>}
      {notice && <div className="master-message master-message-success" role="status"><Check size={16} />{notice}</div>}
      <div className="school-mobile-navbar-preview" aria-hidden="true">
        {settings.items.map((item) => <span className={item === settings.highlight ? 'is-highlight' : ''} key={item}>{item}</span>)}
      </div>
      <ol className="school-mobile-navbar-settings-list">
        {settings.items.map((item, index) => (
          <li key={`navbar-position-${index}`}>
            <span className="school-mobile-navbar-position">{index + 1}</span>
            <label>
              <span>Menu posisi {index + 1}</span>
              <select value={item} onChange={(event) => updateItem(index, event.target.value)} disabled={loading || saving}>
                {mobileNavbarOptions.filter((option) => !settings.items.includes(option) || option === item)
                  .map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <button type="button" className={`school-mobile-navbar-highlight ${settings.highlight === item ? 'selected' : ''}`}
              onClick={() => { setSettings((current) => ({ ...current, highlight: item })); setNotice(''); }}
              disabled={loading || saving} aria-pressed={settings.highlight === item} title={`Jadikan ${item} sebagai tombol highlight`}>
              <Star size={15} fill={settings.highlight === item ? 'currentColor' : 'none'} />
              <span>{settings.highlight === item ? 'Highlight' : 'Sorot'}</span>
            </button>
            <div className="school-mobile-navbar-order">
              <button type="button" onClick={() => moveItem(index, -1)} disabled={loading || saving || index === 0} aria-label={`Naikkan ${item}`} title="Naikkan posisi"><MoveUp size={16} /></button>
              <button type="button" onClick={() => moveItem(index, 1)} disabled={loading || saving || index === settings.items.length - 1} aria-label={`Turunkan ${item}`} title="Turunkan posisi"><MoveDown size={16} /></button>
            </div>
          </li>
        ))}
      </ol>
      <div className="school-library-settings-savebar">
        <span><Clock3 size={14} />{loading ? 'Memuat konfigurasi navbar...' : 'Navbar tampil pada layar ponsel.'}</span>
        <button type="submit" className="master-button master-button-primary" disabled={loading || !loaded || saving}>
          <Save size={15} />{saving ? 'Menyimpan...' : 'Simpan Navbar'}
        </button>
      </div>
    </form>
  );
}

export default function SchoolSettingsPage({ onMobileNavbarSettingsSaved }) {
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
  const [editingAccount, setEditingAccount] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const [usersNotice, setUsersNotice] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState(() => new Set());
  const deletableUsers = users.filter((user) => user.role !== 'admin'
    && (user.role !== 'member' || Boolean(user.is_library_member)));
  const allAccountsSelected = deletableUsers.length > 0
    && deletableUsers.every((user) => selectedAccountIds.has(String(user.id)));

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

  function handleAccountSaved(user, message) {
    setUsers((current) => {
      const exists = current.some((account) => String(account.id) === String(user.id));
      const next = exists
        ? current.map((account) => String(account.id) === String(user.id) ? user : account)
        : [...current, user];
      return next.sort((a, b) => a.name.localeCompare(b.name, 'id'));
    });
    setAccountModalOpen(false);
    setEditingAccount(null);
    setSelectedAccountIds(new Set());
    setUsersError('');
    setUsersNotice(message);
  }

  async function confirmDeleteAccount() {
    if (!deleteTarget) return;
    setDeletingAccount(true);
    setDeleteAccountError('');
    try {
      const ids = Array.isArray(deleteTarget) ? deleteTarget : [String(deleteTarget.id)];
      const result = Array.isArray(deleteTarget)
        ? await deleteSchoolUsers(ids)
        : await deleteSchoolUser(deleteTarget.id);
      setUsers((current) => current.filter((user) => !ids.includes(String(user.id))));
      setSelectedAccountIds(new Set());
      setDeleteTarget(null);
      setUsersError('');
      setUsersNotice(result.message || 'Akun berhasil dihapus.');
    } catch (deleteError) {
      setDeleteAccountError(deleteError.message);
    } finally {
      setDeletingAccount(false);
    }
  }

  function toggleVisibleAccounts(checked) {
    setSelectedAccountIds((current) => {
      const next = new Set(current);
      deletableUsers.forEach((user) => {
        const id = String(user.id);
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
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
        <button type="button" role="tab" aria-selected={tab === 'navbar'} className={tab === 'navbar' ? 'selected' : ''} onClick={() => setTab('navbar')}>
          <Smartphone size={16} />Navbar Ponsel
        </button>
        <button type="button" role="tab" aria-selected={tab === 'barcode'} className={tab === 'barcode' ? 'selected' : ''} onClick={() => setTab('barcode')}>
          <ScanLine size={16} />Barcode &amp; Label
        </button>
      </div>

      {tab === 'accounts' ? (
        <section className="master-data-panel school-accounts-panel">
          <div className="school-settings-panel-heading">
            <div><h2>Akun Sekolah</h2><p>Akun siswa hanya ditampilkan setelah siswa terdaftar sebagai member melalui menu Member.</p></div>
            <button type="button" className="master-button master-button-primary" onClick={() => setAccountModalOpen(true)}><Plus size={16} />Tambah Akun</button>
          </div>
          {usersError && <div className="master-message master-message-error" role="alert"><AlertCircle size={16} />{usersError}</div>}
          {usersNotice && <div className="master-message master-message-success" role="status"><Check size={16} />{usersNotice}</div>}
          <div className="master-table-scroll">
            <table className="master-table school-users-table">
              <thead><tr><th className="student-checkbox"><input type="checkbox" checked={allAccountsSelected} onChange={(event) => toggleVisibleAccounts(event.target.checked)} disabled={!deletableUsers.length || usersLoading || deletingAccount} aria-label="Pilih semua akun yang dapat dihapus" /></th><th>Nama</th><th>Email</th><th>Role</th><th>No. Telp</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>
                {usersLoading ? (
                  <tr><td className="master-empty-cell" colSpan={7}>Memuat akun...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td className="master-empty-cell" colSpan={7}>Belum ada akun.</td></tr>
                ) : users.map((user) => (
                  <tr key={user.id}>
                    <td className="student-checkbox">{user.role !== 'admin' && (user.role !== 'member' || user.is_library_member) && <input type="checkbox" checked={selectedAccountIds.has(String(user.id))} onChange={(event) => setSelectedAccountIds((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(String(user.id));
                      else next.delete(String(user.id));
                      return next;
                    })} aria-label={`Pilih akun ${user.name}`} />}</td>
                    <td><b className="master-primary-text">{user.name}</b></td>
                    <td>{user.email || '—'}</td>
                    <td><span className="school-role-badge">{user.role === 'admin' ? 'Admin Sekolah' : roleLabels[user.role]}</span></td>
                    <td>{user.phone || '—'}</td>
                    <td><span className={`master-status ${user.status === 'active' ? 'is-active' : 'is-inactive'}`}>{user.status === 'active' ? 'Aktif' : user.status === 'blocked' ? 'Diblokir' : 'Nonaktif'}</span></td>
                    <td><div className="student-row-actions">
                      {user.role !== 'admin' && <button type="button" className="master-icon-button" title="Edit akun" aria-label={`Edit akun ${user.name}`} onClick={() => { setEditingAccount(user); setAccountModalOpen(true); }}><Pencil size={15} /></button>}
                      {user.role !== 'admin' && <button type="button" className="master-icon-button" title="Hapus akun" aria-label={`Hapus akun ${user.name}`} onClick={() => { setDeleteAccountError(''); setDeleteTarget(user); }}><Trash2 size={15} /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="master-table-footer"><span>{users.length} akun terdaftar · {selectedAccountIds.size} dipilih</span>
            <div className="school-account-bulk-actions">
              <button type="button" className="master-button master-button-danger" disabled={!selectedAccountIds.size || deletingAccount} onClick={() => { setDeleteAccountError(''); setDeleteTarget([...selectedAccountIds]); }}><Trash2 size={15} />Hapus Terpilih ({selectedAccountIds.size})</button>
              <span>Akun dibatasi untuk sekolah ini</span>
            </div>
          </div>
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
      ) : tab === 'navbar' ? (
        <MobileNavbarSettingsPanel onSettingsSaved={onMobileNavbarSettingsSaved} />
      ) : tab === 'barcode' ? (
        <BarcodeLabelSettingsPanel />
      ) : <LibrarySettingsPanel />}

      {accountModalOpen && <AccountModal key={editingAccount?.id || 'new-account'} account={editingAccount} onClose={() => { setAccountModalOpen(false); setEditingAccount(null); }} onSaved={handleAccountSaved} />}
      {deleteTarget && <SchoolConfirmDialog
        title={Array.isArray(deleteTarget) ? 'Hapus akun terpilih?' : 'Hapus akun pengguna?'}
        message={Array.isArray(deleteTarget)
          ? `${deleteTarget.length} akun akan dihapus. Akun dengan riwayat transaksi tidak dapat dihapus.`
          : 'Akun ini akan dihapus dari sekolah. Akun dengan riwayat transaksi tidak dapat dihapus.'}
        itemName={Array.isArray(deleteTarget) ? `${deleteTarget.length} akun terpilih` : deleteTarget.name}
        loading={deletingAccount}
        error={deleteAccountError}
        onClose={() => { if (!deletingAccount) { setDeleteTarget(null); setDeleteAccountError(''); } }}
        onConfirm={confirmDeleteAccount}
      />}
    </div>
  );
}
