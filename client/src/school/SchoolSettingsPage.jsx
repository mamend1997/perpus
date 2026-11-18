import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Check, Plus, Save, ShieldCheck, UserPlus, Users, X
} from 'lucide-react';
import {
  createSchoolUser, fetchRolePermissions, fetchSchoolUsers, saveRolePermissions
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

  return (
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
    </div>
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
      ) : (
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
      )}

      {accountModalOpen && <AccountModal onClose={() => setAccountModalOpen(false)} onCreated={handleCreated} />}
    </div>
  );
}
