import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import { Camera, Check, LoaderCircle, Pencil, Plus, Printer, Search, Trash2, Upload, Users, X } from 'lucide-react';
import { fetchStudentClasses } from './schoolStudentApi.js';
import {
  addMembers, deleteMembers, fetchMemberCandidates, fetchMembers, updateMemberCredentials
} from './schoolMemberApi.js';
import { resizeSchoolImage } from './schoolImageUtils.js';
import SchoolConfirmDialog from './SchoolConfirmDialog.jsx';

const pageSize = 25;

function normalizePagination(value) {
  const page = Number(value?.page);
  const total = Number(value?.total);
  const totalPages = Number(value?.totalPages);
  return {
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    total: Number.isSafeInteger(total) && total >= 0 ? total : 0,
    totalPages: Number.isSafeInteger(totalPages) && totalPages >= 0 ? totalPages : 0
  };
}

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
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedCount = selected.size;
  const allVisibleSelected = students.length > 0 && students.every((student) => selected.has(String(student.id)));

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
    const studentIds = [...selected];
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

  function toggleVisibleStudents(checked) {
    setSelected((current) => {
      const next = new Set(current);
      students.forEach((student) => {
        const id = String(student.id);
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }

  return (
    <MemberDialog onClose={() => { if (!saving) onClose(); }} className="member-select-modal">
      <header className="master-modal-heading">
        <div><span className="library-eyebrow">DATA MEMBER</span><h2>Tambah Member</h2><p>Pilih satu atau beberapa siswa untuk didaftarkan sekaligus.</p></div>
        <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={17} /></button>
      </header>
      <div className="member-candidate-filters">
        <label className="master-search member-candidate-search"><Search size={16} /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Cari nama, NIS/NISN, atau kode member..." maxLength={100} /></label>
        <label className="member-class-filter">Filter kelas
          <select value={rombel} onChange={(event) => setRombel(event.target.value)}>
            <option value="">Semua Kelas</option>
            {classes.map((item) => <option value={item.className} key={item.className}>{item.className}</option>)}
          </select>
        </label>
      </div>
      <div className="member-candidate-toolbar">
        <div><b>Siswa tersedia</b><span>{loading ? 'Memuat daftar...' : `${students.length} hasil ditampilkan`}</span></div>
        {students.length > 0 && <button type="button" className="member-select-all" onClick={() => toggleVisibleStudents(!allVisibleSelected)} disabled={loading || saving}>
          <span className={`member-select-all-check ${allVisibleSelected ? 'is-checked' : ''}`}>{allVisibleSelected && <Check size={13} />}</span>
          {allVisibleSelected ? 'Batalkan pilihan hasil' : 'Pilih semua hasil'}
        </button>}
      </div>
      <div className="member-candidate-list" aria-label="Hasil pencarian siswa" aria-busy={loading}>
        {loading ? <div className="member-empty-state"><span className="member-empty-icon"><LoaderCircle size={22} className="book-stock-spinner" /></span><b>Memuat daftar siswa</b><span>Mohon tunggu sebentar.</span></div>
          : students.length === 0 ? <div className="member-empty-state"><span className="member-empty-icon"><Users size={22} /></span><b>{search || rombel ? 'Siswa tidak ditemukan' : 'Belum ada siswa tersedia'}</b><span>{search || rombel ? 'Coba ubah kata pencarian atau filter kelas.' : 'Tambahkan data siswa terlebih dahulu. Siswa yang sudah menjadi member tidak ditampilkan.'}</span></div>
            : students.map((student) => {
              const id = String(student.id);
              const isSelected = selected.has(id);
              return <label className={`member-candidate-option ${isSelected ? 'is-selected' : ''}`} key={id}>
                <input type="checkbox" checked={isSelected} disabled={saving} onChange={(event) => setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(id);
                  else next.delete(id);
                  return next;
                })} />
                {student.photo ? <img className="member-candidate-avatar" src={student.photo} alt="" /> : <span className="member-candidate-avatar member-candidate-avatar-fallback">{student.name?.trim()?.[0]?.toUpperCase() || '?'}</span>}
                <span className="member-candidate-copy"><b>{student.name}</b><small>NIS/NISN {student.nis_nisn || '—'} <i /> {student.rombel || 'Kelas belum diatur'}</small></span>
                <span className="member-candidate-status">{isSelected ? <><Check size={14} />Dipilih</> : 'Pilih'}</span>
              </label>;
            })}
      </div>
      {students.length === 100 && <small className="member-candidate-limit">Menampilkan 100 hasil. Pilihan tetap tersimpan saat Anda mengganti pencarian untuk memilih siswa lainnya.</small>}
      <div className={`member-selection-summary ${selectedCount ? 'has-selection' : ''}`}>
        <span className="member-selection-icon"><Users size={17} /></span>
        <div><b>{selectedCount} siswa dipilih</b><small>{selectedCount ? 'Semua pilihan akan ditambahkan sekaligus.' : 'Centang beberapa siswa untuk menambahkannya dalam satu proses.'}</small></div>
        {selectedCount > 0 && <button type="button" onClick={() => setSelected(new Set())} disabled={saving}>Kosongkan</button>}
      </div>
      {error && <div className="library-error" role="alert">{error}</div>}
      <footer className="master-modal-actions">
        <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
        <button type="button" className="master-button master-button-primary" onClick={submit} disabled={saving || loading || !selectedCount}>
          {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Plus size={15} />}
          {saving ? 'Menambahkan...' : `Jadikan ${selectedCount || ''} Member`}
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
    photo: member.photo || null,
    password: ''
  });
  const [saving, setSaving] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');

  async function choosePhoto(file) {
    if (!file) return;
    setPhotoLoading(true);
    setPhotoError('');
    try {
      const photo = await resizeSchoolImage(file);
      setForm((current) => ({ ...current, photo }));
    } catch (loadError) {
      setPhotoError(loadError.message);
    } finally {
      setPhotoLoading(false);
    }
  }

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
        <div className="member-photo-field member-credentials-wide">
          <span>Foto Member <small>(opsional)</small></span>
          <div className="member-photo-control">
            {form.photo
              ? <img src={form.photo} alt={`Pratinjau foto ${member.name}`} />
              : <div className="member-photo-placeholder"><Camera size={22} /><span>Belum ada foto</span></div>}
            <div>
              <label className="master-button master-button-light">{photoLoading ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Upload size={15} />}Pilih Foto
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={photoLoading || saving} onChange={(event) => { void choosePhoto(event.target.files?.[0]); event.target.value = ''; }} />
              </label>
              {form.photo && <button type="button" className="master-button master-button-muted" onClick={() => setForm((current) => ({ ...current, photo: null }))} disabled={photoLoading || saving}><X size={15} />Hapus Foto</button>}
              <small>JPG, PNG, atau WebP; maksimal 5 MB.</small>
            </div>
          </div>
          {photoError && <small className="library-error" role="alert">{photoError}</small>}
        </div>
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
          <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving || photoLoading}>Batal</button>
          <button type="submit" className="master-button master-button-primary" disabled={saving || photoLoading}>
            {saving || photoLoading ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Check size={15} />}
            {saving ? 'Menyimpan...' : photoLoading ? 'Memproses Foto...' : 'Simpan Akun Login'}
          </button>
        </footer>
      </form>
    </MemberDialog>
  );
}

function MemberCardPrint({ members, schoolIdentity, onClose }) {
  const barcodeRefs = useRef({});

  useEffect(() => {
    document.body.classList.add('is-printing-member-cards');
    members.forEach((member) => {
      const code = member.member_code || `MBR-${member.id}`;
      const svg = barcodeRefs.current[String(member.id)];
      if (svg) JsBarcode(svg, code, { format: 'CODE128', displayValue: false, height: 35, width: 1.35, margin: 0 });
    });
    const timer = window.setTimeout(() => window.print(), 250);
    window.addEventListener('afterprint', onClose);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', onClose);
      document.body.classList.remove('is-printing-member-cards');
    };
  }, [members, onClose]);

  return (
    <section className="member-card-print-sheet" aria-label="Kartu member perpustakaan">
      {members.map((member) => {
        const code = member.member_code || `MBR-${member.id}`;
        return <article className="member-id-card" key={member.id}>
          <header>
            {schoolIdentity?.logo && <img src={schoolIdentity.logo} alt="" />}
            <div><small>PERPUSTAKAAN SEKOLAH</small><b>{schoolIdentity?.name || 'Perpustakaan Sekolah'}</b></div>
            <span className="member-id-card-mark">MEMBER</span>
          </header>
          <main>
            {member.photo
              ? <img className="member-id-card-photo" src={member.photo} alt={`Foto ${member.name}`} />
              : <div className="member-id-card-photo member-id-card-photo-empty">{member.name?.trim()?.[0]?.toUpperCase() || '?'}</div>}
            <div className="member-id-card-details">
              <h2>{member.name || '—'}</h2>
              <div><span>NIS/NISN</span><b>{member.nis_nisn || '—'}</b></div>
              <div><span>Kelas</span><b>{member.rombel || '—'}</b></div>
              <div><span>Email</span><b>{member.email || '—'}</b></div>
              <div><span>No. Telepon</span><b>{member.phone || '—'}</b></div>
            </div>
          </main>
          <footer>
            <svg ref={(element) => {
              if (element) barcodeRefs.current[String(member.id)] = element;
            }} aria-label={`Barcode member ${code}`} />
            <b>{code}</b>
          </footer>
        </article>;
      })}
    </section>
  );
}

export default function SchoolMembersPage({ rights, schoolIdentity }) {
  const canEdit = Boolean(rights?.edit);
  const canDelete = Boolean(rights?.delete);
  const [members, setMembers] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState(() => new Set());
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
  const [memberCards, setMemberCards] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [printingCards, setPrintingCards] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const selectedIds = [...selectedMembers];
  const allVisibleSelected = members.length > 0 && members.every((member) => selectedMembers.has(String(member.id)));
  const closeMemberCards = useCallback(() => setMemberCards(null), []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(queryInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    setSelectedMembers(new Set());
  }, [page, search, refreshKey]);

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
        const nextPagination = normalizePagination(result.pagination);
        setPagination(nextPagination);
        if (page > Math.max(1, nextPagination.totalPages)) setPage(Math.max(1, nextPagination.totalPages));
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

  async function printAllMemberCards() {
    setPrintingCards(true);
    setError('');
    try {
      const allMembers = [];
      let currentPage = 1;
      while (true) {
        const result = await fetchMembers({ page: currentPage, limit: 100, search });
        const pageMembers = result.members || [];
        allMembers.push(...pageMembers);
        if (pageMembers.length < 100) break;
        currentPage += 1;
      }
      if (allMembers.length) setMemberCards(allMembers);
    } catch (printError) {
      setError(printError.message);
    } finally {
      setPrintingCards(false);
    }
  }

  async function removeSelectedMembers() {
    if (!deleteTarget?.length) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const result = await deleteMembers(deleteTarget);
      setDeleteTarget(null);
      setSelectedMembers(new Set());
      setNotice(result.message);
      setRefreshKey((current) => current + 1);
    } catch (removeError) {
      setDeleteError(removeError.message);
    } finally {
      setDeleting(false);
    }
  }

  function toggleVisibleMembers(checked) {
    setSelectedMembers((current) => {
      const next = new Set(current);
      members.forEach((member) => {
        const id = String(member.id);
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }

  function printSelectedMemberCards() {
    const selected = members.filter((member) => selectedMembers.has(String(member.id)));
    if (selected.length) setMemberCards(selected);
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
        <button type="button" className="master-button master-button-light" onClick={printAllMemberCards} disabled={loading || printingCards || !pagination.total}>
          {printingCards ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Printer size={15} />}
          {printingCards ? 'Menyiapkan kartu...' : `Cetak Kartu Member${search ? '' : ` (${pagination.total})`}`}
        </button>
        {canEdit && <button type="button" className="master-button master-button-primary" onClick={() => { setNotice(''); setAddOpen(true); }}><Plus size={15} />Tambah Member</button>}
      </section>
      <section className="master-data-panel member-table-panel">
        <div className="school-settings-panel-heading member-table-heading">
          <div><h2>Daftar Member</h2><p>{pagination.total.toLocaleString('id-ID')} siswa sebagai member · {selectedIds.length.toLocaleString('id-ID')} dipilih</p></div>
          {canDelete && <div className="member-table-heading-actions">
            <button type="button" className="master-button master-button-light" disabled={!selectedIds.length || loading} onClick={printSelectedMemberCards}>
              <Printer size={15} />Cetak Kartu Terpilih ({selectedIds.length})
            </button>
            <button type="button" className="master-button master-button-danger" disabled={!selectedIds.length || deleting} onClick={() => { setDeleteError(''); setDeleteTarget(selectedIds); }}>
              <Trash2 size={15} />Hapus Terpilih ({selectedIds.length})
            </button>
          </div>}
        </div>
        <div className="master-table-scroll">
          <table className="master-table member-table">
            <thead><tr>
              {canDelete && <th className="member-table-checkbox"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleVisibleMembers(event.target.checked)} aria-label="Pilih semua member pada halaman ini" /></th>}
              <th>No</th><th>NIS / NISN</th><th>Nama Siswa</th><th>Kelas / Rombel</th><th>Username</th><th>Email</th><th>No. Telepon</th><th>Status Akun Login</th><th>Aksi</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td className="master-empty-cell" colSpan={9 + (canDelete ? 1 : 0)}>Memuat data member...</td></tr>
                : members.length === 0 ? <tr><td className="master-empty-cell" colSpan={9 + (canDelete ? 1 : 0)}>Belum ada siswa yang dipilih sebagai member.</td></tr>
                  : members.map((member, index) => <tr key={member.id}>
                    {canDelete && <td className="member-table-checkbox"><input type="checkbox" checked={selectedMembers.has(String(member.id))} onChange={(event) => setSelectedMembers((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(String(member.id));
                      else next.delete(String(member.id));
                      return next;
                    })} aria-label={`Pilih ${member.name}`} /></td>}
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
                    <td><div className="student-row-actions">
                      <button type="button" className="master-icon-button member-print-row-action" onClick={() => setMemberCards([member])} aria-label={`Cetak kartu ${member.name}`} title="Cetak kartu member"><Printer size={14} /></button>
                      {canEdit && <button type="button" className="master-icon-button" onClick={() => setEditingMember(member)} aria-label={`Edit akun ${member.name}`} title="Edit akun"><Pencil size={14} /></button>}
                      {canDelete && <button type="button" className="master-icon-button" onClick={() => { setDeleteError(''); setDeleteTarget([String(member.id)]); }} aria-label={`Hapus keanggotaan ${member.name}`} title="Hapus keanggotaan"><Trash2 size={14} /></button>}
                    </div></td>
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
      {memberCards && <MemberCardPrint members={memberCards} schoolIdentity={schoolIdentity} onClose={closeMemberCards} />}
      {deleteTarget && <SchoolConfirmDialog
        title={deleteTarget.length > 1 ? 'Hapus keanggotaan terpilih?' : 'Hapus keanggotaan member?'}
        message="Siswa akan dilepas dari keanggotaan perpustakaan. Data siswa dan akun login tetap tersimpan; akun tidak dapat digunakan sampai siswa ditambahkan kembali sebagai member."
        itemName={`${deleteTarget.length} member`}
        loading={deleting}
        error={deleteError}
        onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(''); } }}
        onConfirm={removeSelectedMembers}
      />}
    </div>
  );
}
