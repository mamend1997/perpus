import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, LoaderCircle, Pencil, Plus, Search, Users, X } from 'lucide-react';
import { fetchStudentClasses } from './schoolStudentApi.js';
import {
  addMembers, fetchMemberCandidates, fetchMembers, updateMemberCredentials
} from './schoolMemberApi.js';

const pageSize = 25;

function MemberDialog({ children, onClose, className = '' }) {
  return createPortal(
    <div className="master-modal-backdrop member-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={`master-modal member-modal ${className}`} role="dialog" aria-modal="true">
        {children}
      </section>
    </div>,
    document.body
  );
}

function AddMembersModal({ classes, onClose, onAdd }) {
  const [queryInput, setQueryInput] = useState('');
  const [search, setSearch] = useState('');
  const [rombel, setRombel] = useState('');
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(queryInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchMemberCandidates({ search, rombel, signal: controller.signal })
      .then(({ students: result }) => {
        if (!controller.signal.aborted) setStudents(result || []);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [search, rombel]);

  async function submit() {
    const studentIds = Object.keys(selected);
    if (!studentIds.length) return;
    setSaving(true);
    setError('');
    try {
      await onAdd(studentIds);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <MemberDialog onClose={onClose} className="member-select-modal">
      <header className="master-modal-heading">
        <div><span className="library-eyebrow">DATA MEMBER</span><h2>Tambah Member</h2></div>
        <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={17} /></button>
      </header>
      <p className="member-dialog-intro">Cari dan pilih siswa yang akan menjadi member perpustakaan.</p>
      <div className="member-candidate-filters">
        <label className="master-search"><Search size={16} /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Cari nama atau NIS/NISN..." maxLength={100} /></label>
        <label>Filter kelas
          <select value={rombel} onChange={(event) => setRombel(event.target.value)}>
            <option value="">Semua Kelas</option>
            {classes.map((item) => <option value={item.className} key={item.className}>{item.className}</option>)}
          </select>
        </label>
      </div>
      <div className="member-candidate-list" aria-label="Hasil pencarian siswa">
        {loading ? <div className="master-empty-cell">Mencari siswa...</div>
          : students.length === 0 ? <div className="master-empty-cell">Tidak ada siswa yang cocok atau semua sudah menjadi member.</div>
            : students.map((student) => {
              const id = String(student.id);
              return <label className="member-candidate-option" key={id}>
                <input type="checkbox" checked={Boolean(selected[id])} onChange={(event) => setSelected((current) => {
                  const next = { ...current };
                  if (event.target.checked) next[id] = student;
                  else delete next[id];
                  return next;
                })} />
                <span><b>{student.name}</b><small>{student.nis_nisn} · {student.rombel || 'Belum diatur'}</small></span>
              </label>;
            })}
      </div>
      {students.length === 100 && <small className="member-candidate-limit">Menampilkan 100 hasil. Gunakan pencarian atau filter kelas untuk mempersempit daftar.</small>}
      {error && <div className="library-error" role="alert">{error}</div>}
      <footer className="master-modal-actions">
        <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
        <button type="button" className="master-button master-button-primary" onClick={submit} disabled={saving || loading || !Object.keys(selected).length}>
          {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Plus size={15} />}
          {saving ? 'Menambahkan...' : `Jadikan Member (${Object.keys(selected).length})`}
        </button>
      </footer>
    </MemberDialog>
  );
}

function MemberCredentialsModal({ member, onClose, onSave }) {
  const [form, setForm] = useState({
    username: member.username || '',
    email: member.email || '',
    phone: member.phone || '',
    password: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <MemberDialog onClose={onClose} className="member-credentials-modal">
      <header className="master-modal-heading">
        <div><span className="library-eyebrow">AKUN MEMBER</span><h2>Atur Akun Login</h2></div>
        <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={17} /></button>
      </header>
      <p className="member-dialog-intro"><b>{member.name}</b> · {member.nis_nisn}</p>
      <form className="member-credentials-form" onSubmit={submit}>
        <label>Username
          <input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} autoComplete="username" minLength={3} maxLength={32} required />
        </label>
        <label>Email
          <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} autoComplete="email" maxLength={190} />
        </label>
        <label>No. Telepon
          <input type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} maxLength={30} />
        </label>
        <label className="member-credentials-wide">Kata Sandi {!member.has_login_password && <span>(wajib diisi)</span>}
          <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" minLength={8} required={!member.has_login_password} />
          <small>{member.has_login_password ? 'Kosongkan jika tidak ingin mengganti kata sandi.' : 'Minimal 8 karakter, huruf besar, angka, dan simbol.'}</small>
        </label>
        {error && <div className="library-error member-credentials-wide" role="alert">{error}</div>}
        <footer className="master-modal-actions member-credentials-wide">
          <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="master-button master-button-primary" disabled={saving}>
            {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Check size={15} />}
            {saving ? 'Menyimpan...' : 'Simpan Akun Login'}
          </button>
        </footer>
      </form>
    </MemberDialog>
  );
}

export default function SchoolMembersPage({ rights }) {
  const canEdit = Boolean(rights?.edit);
  const [members, setMembers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(queryInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    const controller = new AbortController();
    fetchStudentClasses(controller.signal)
      .then(({ classes: result }) => { if (!controller.signal.aborted) setClasses(result || []); })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchMembers({ page, limit: pageSize, search, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setMembers(result.members || []);
        setPagination(result.pagination || { page: 1, total: 0, totalPages: 0 });
      })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, search, refreshKey]);

  async function addSelectedMembers(studentIds) {
    const result = await addMembers(studentIds);
    setAddOpen(false);
    setNotice(result.message);
    setPage(1);
    setRefreshKey((current) => current + 1);
  }

  async function saveCredentials(credentials) {
    const result = await updateMemberCredentials(editingMember.id, credentials);
    setEditingMember(null);
    setNotice(result.message);
    setRefreshKey((current) => current + 1);
  }

  return (
    <div className="library-module-page school-members-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">MASTER DATA</span>
        <h1>Member</h1>
        <p>Kelola siswa yang menjadi member perpustakaan dan data akun loginnya.</p>
      </header>
      {notice && <div className="master-message master-message-success" role="status">{notice}</div>}
      {error && <div className="library-error" role="alert">{error}</div>}
      <section className="catalog-toolbar-panel member-toolbar">
        <label className="master-search"><Search size={16} /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Cari member..." maxLength={100} /></label>
        {canEdit && <button type="button" className="master-button master-button-primary" onClick={() => { setNotice(''); setAddOpen(true); }}><Plus size={15} />Tambah Member</button>}
      </section>
      <section className="master-data-panel member-table-panel">
        <div className="school-settings-panel-heading"><div><h2>Daftar Member</h2><p>{pagination.total.toLocaleString('id-ID')} siswa terpilih sebagai member</p></div></div>
        <div className="master-table-scroll">
          <table className="master-table member-table">
            <thead><tr><th>No</th><th>NIS / NISN</th><th>Nama Siswa</th><th>Kelas / Rombel</th><th>Username</th><th>Email</th><th>No. Telepon</th><th>Status Akun Login</th>{canEdit && <th>Aksi</th>}</tr></thead>
            <tbody>
              {loading ? <tr><td className="master-empty-cell" colSpan={canEdit ? 9 : 8}>Memuat data member...</td></tr>
                : members.length === 0 ? <tr><td className="master-empty-cell" colSpan={canEdit ? 9 : 8}>Belum ada siswa yang dipilih sebagai member.</td></tr>
                  : members.map((member, index) => <tr key={member.id}>
                    <td>{(page - 1) * pageSize + index + 1}</td>
                    <td>{member.nis_nisn}</td>
                    <td><b>{member.name}</b></td>
                    <td>{member.rombel || 'Belum diatur'}</td>
                    <td>{member.username || '—'}</td>
                    <td>{member.email || '—'}</td>
                    <td>{member.phone || '—'}</td>
                    <td><span className={`master-status ${member.has_login_password && member.username ? 'is-active' : 'is-inactive'}`}>
                      {member.has_login_password && member.username ? 'Siap login' : 'Belum diatur'}
                    </span></td>
                    {canEdit && <td><button type="button" className="master-row-edit" onClick={() => setEditingMember(member)} aria-label={`Edit akun ${member.name}`}><Pencil size={14} />Edit</button></td>}
                  </tr>)}
            </tbody>
          </table>
        </div>
        <footer className="master-table-footer">
          <span>Halaman {pagination.totalPages ? page : 0} dari {pagination.totalPages}</span>
          <div><button type="button" onClick={() => setPage((current) => current - 1)} disabled={page <= 1 || loading}>‹</button>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={!pagination.totalPages || page >= pagination.totalPages || loading}>›</button></div>
        </footer>
      </section>
      {addOpen && <AddMembersModal classes={classes} onClose={() => setAddOpen(false)} onAdd={addSelectedMembers} />}
      {editingMember && <MemberCredentialsModal key={editingMember.id} member={editingMember} onClose={() => setEditingMember(null)} onSave={saveCredentials} />}
    </div>
  );
}
