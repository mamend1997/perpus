import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell, Check, Eye, LoaderCircle, Pencil, Plus, Search, Trash2, X
} from 'lucide-react';
import SchoolConfirmDialog from './SchoolConfirmDialog.jsx';
import {
  createAnnouncement, deleteAnnouncement, fetchAnnouncements, updateAnnouncement
} from './schoolAnnouncementApi.js';

const emptyForm = {
  title: '',
  content: '',
  category: 'Informasi',
  targetAudience: 'all',
  status: 'Draft',
  startDate: '',
  endDate: '',
  banner: null
};

function toInputDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function AnnouncementEditor({ initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function selectBanner(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1400000) {
      setError('Pilih banner JPG, PNG, atau WebP dengan ukuran maksimal 1,4 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, banner: reader.result }));
    reader.onerror = () => setError('File banner gagal dibaca.');
    reader.readAsDataURL(file);
    setError('');
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

  return createPortal(
    <div className="master-modal-backdrop catalog-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="master-modal announcement-editor-modal" role="dialog" aria-modal="true" aria-labelledby="announcement-editor-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">PENGUMUMAN SEKOLAH</span><h2 id="announcement-editor-title">{initial?.id ? 'Edit Pengumuman' : 'Buat Pengumuman'}</h2></div>
          <button type="button" className="master-icon-button" aria-label="Tutup form" onClick={onClose} disabled={saving}><X size={18} /></button>
        </header>
        {error && <div className="library-error" role="alert">{error}</div>}
        <form className="announcement-editor-form" onSubmit={submit}>
          <label>Judul Pengumuman
            <input name="title" value={form.title} onChange={update} maxLength={255} required autoFocus />
          </label>
          <div className="announcement-editor-grid">
            <label>Kategori
              <select name="category" value={form.category} onChange={update}>
                <option>Informasi</option><option>Aturan Perpustakaan</option><option>Denda / Keterlambatan</option><option>Promosi Buku</option><option>Layanan</option>
              </select>
            </label>
            <label>Target Audiens
              <select name="targetAudience" value={form.targetAudience} onChange={update}>
                <option value="all">Semua Pengguna</option><option value="students">Khusus Siswa</option><option value="staff">Petugas dan Pimpinan</option>
              </select>
            </label>
            <label>Tanggal Mulai Tayang
              <input name="startDate" type="datetime-local" value={form.startDate} onChange={update} />
            </label>
            <label>Tanggal Berakhir
              <input name="endDate" type="datetime-local" value={form.endDate} onChange={update} />
            </label>
            <label>Status
              <select name="status" value={form.status} onChange={update}>
                <option value="Draft">Draft</option><option value="Published">Published / Tayang</option>
              </select>
            </label>
            <label>Lampiran Banner
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectBanner} />
              <small>JPG, PNG, atau WebP; maksimal 1,4 MB.</small>
            </label>
          </div>
          {form.banner && <div className="announcement-banner-preview"><img src={form.banner} alt="Pratinjau banner pengumuman" /><button type="button" className="master-button master-button-muted" onClick={() => setForm((current) => ({ ...current, banner: null }))}>Hapus banner</button></div>}
          <label>Isi Pengumuman
            <textarea name="content" value={form.content} onChange={update} maxLength={20000} rows={8} required />
            <small>{form.content.length}/20.000 karakter. Baris baru akan dipertahankan saat ditampilkan.</small>
          </label>
          <footer className="master-modal-actions">
            <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving}>
              {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Check size={15} />}{saving ? 'Menyimpan...' : 'Simpan Pengumuman'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}

function AnnouncementPreview({ item, onClose }) {
  return createPortal(
    <div className="master-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="master-modal announcement-preview-modal" role="dialog" aria-modal="true" aria-labelledby="announcement-preview-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">PRATINJAU PENGUMUMAN</span><h2 id="announcement-preview-title">{item.title}</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} aria-label="Tutup pratinjau"><X size={18} /></button>
        </header>
        {item.banner && <img className="announcement-preview-image" src={item.banner} alt="" />}
        <div className="announcement-preview-meta">{item.category} · {formatDate(item.startDate || item.created_at)} · {item.targetAudience === 'students' ? 'Siswa' : item.targetAudience === 'staff' ? 'Petugas' : 'Semua Pengguna'}</div>
        <p className="announcement-preview-content">{item.content}</p>
        <footer className="master-modal-actions"><button type="button" className="master-button master-button-primary" onClick={onClose}>Tutup</button></footer>
      </section>
    </div>,
    document.body
  );
}

export default function SchoolAnnouncementsPage({ rights, role }) {
  const isStaff = role !== 'member';
  const canEdit = Boolean(rights?.edit) && isStaff;
  const canDelete = Boolean(rights?.delete) && isStaff;
  const [announcements, setAnnouncements] = useState([]);
  const [queryInput, setQueryInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editor, setEditor] = useState(null);
  const [preview, setPreview] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(queryInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchAnnouncements({ search, status: isStaff ? status : '', category: isStaff ? category : '', signal: controller.signal })
      .then(({ announcements: rows }) => { if (!controller.signal.aborted) setAnnouncements(rows || []); })
      .catch((fetchError) => { if (!controller.signal.aborted) setError(fetchError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, status, category, isStaff, refreshKey]);

  async function save(form) {
    const body = { ...form, startDate: form.startDate || null, endDate: form.endDate || null };
    if (editor?.id) await updateAnnouncement(editor.id, body);
    else await createAnnouncement(body);
    setEditor(null);
    setNotice('Pengumuman berhasil disimpan.');
    setRefreshKey((value) => value + 1);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAnnouncement(deleteTarget.id);
      setNotice('Pengumuman berhasil dihapus.');
      setDeleteTarget(null);
      setRefreshKey((value) => value + 1);
    } catch (deleteFailure) {
      setDeleteError(deleteFailure.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="library-module-page school-announcements-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">LAYANAN PERPUSTAKAAN</span>
        <h1>Pengumuman</h1>
        <p>{isStaff ? 'Kelola informasi layanan dan jadwalkan publikasi untuk warga sekolah.' : 'Informasi terbaru dari perpustakaan sekolah.'}</p>
      </header>
      {notice && <div className="master-message master-message-success" role="status"><Check size={15} />{notice}</div>}
      {error && <div className="library-error" role="alert">{error}</div>}

      <section className="catalog-toolbar-panel">
        <div className="procurement-toolbar-row">
          <label className="master-search procurement-search"><Search size={16} /><input type="search" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Cari pengumuman..." maxLength={100} /></label>
          {isStaff && <div className="procurement-toolbar-actions">
            <label className="procurement-filter"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua status</option><option value="Published">Published</option><option value="Draft">Draft</option></select></label>
            <label className="procurement-filter"><span>Kategori</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Semua kategori</option><option>Informasi</option><option>Aturan Perpustakaan</option><option>Denda / Keterlambatan</option><option>Promosi Buku</option><option>Layanan</option></select></label>
            {canEdit && <button type="button" className="master-button master-button-primary" onClick={() => setEditor(emptyForm)}><Plus size={15} />Tambah Pengumuman</button>}
          </div>}
        </div>
      </section>

      {isStaff ? (
        <section className="master-data-panel">
          <div className="school-settings-panel-heading"><div><h2>Daftar Pengumuman</h2><p>{announcements.length} pengumuman</p></div></div>
          <div className="master-table-scroll">
            <table className="master-table">
              <thead><tr><th>Judul Pengumuman</th><th>Kategori / Target</th><th>Tanggal Publikasi</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>
                {loading ? <tr><td className="master-empty-cell" colSpan={5}>Memuat pengumuman...</td></tr>
                  : announcements.length === 0 ? <tr><td className="master-empty-cell" colSpan={5}>Belum ada pengumuman.</td></tr>
                    : announcements.map((item) => (
                      <tr key={item.id}>
                        <td><b className="master-primary-text">{item.title}</b><small className="master-secondary-text">{item.content}</small></td>
                        <td>{item.category}<small>{item.targetAudience === 'students' ? 'Siswa' : item.targetAudience === 'staff' ? 'Petugas' : 'Semua Pengguna'}</small></td>
                        <td>{formatDate(item.startDate || item.created_at)}</td>
                        <td><span className={`master-status ${item.status === 'Published' ? 'is-active' : 'is-inactive'}`}>{item.status === 'Published' ? 'Published / Tayang' : 'Draft'}</span></td>
                        <td><div className="announcement-row-actions">
                          <button type="button" className="master-icon-button" title="Pratinjau" aria-label={`Pratinjau ${item.title}`} onClick={() => setPreview(item)}><Eye size={16} /></button>
                          {canEdit && <button type="button" className="master-icon-button" title="Edit" aria-label={`Edit ${item.title}`} onClick={() => setEditor({ ...item, startDate: toInputDate(item.startDate), endDate: toInputDate(item.endDate) })}><Pencil size={16} /></button>}
                          {canDelete && <button type="button" className="master-icon-button" title="Hapus" aria-label={`Hapus ${item.title}`} onClick={() => { setDeleteError(''); setDeleteTarget(item); }}><Trash2 size={16} /></button>}
                        </div></td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="announcement-card-grid">
          {loading ? <div className="library-empty-state">Memuat pengumuman...</div>
            : announcements.length === 0 ? <div className="library-empty-state">Belum ada pengumuman yang tayang.</div>
              : announcements.map((item) => (
                <article className="announcement-card" key={item.id}>
                  {item.banner && <img src={item.banner} alt="" />}
                  <div className="announcement-card-copy"><span>{item.category}</span><h2>{item.title}</h2><small>{formatDate(item.startDate || item.created_at)}</small><p>{item.content}</p><button type="button" className="master-button master-button-light" onClick={() => setPreview(item)}><Eye size={15} />Baca selengkapnya</button></div>
                </article>
              ))}
        </section>
      )}

      {editor && <AnnouncementEditor initial={editor.id ? editor : null} onClose={() => setEditor(null)} onSave={save} />}
      {preview && <AnnouncementPreview item={preview} onClose={() => setPreview(null)} />}
      {deleteTarget && <SchoolConfirmDialog
        title="Hapus pengumuman?"
        message="Pengumuman dan banner terkait akan dihapus dari daftar."
        itemName={deleteTarget.title}
        loading={deleting}
        error={deleteError}
        onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(''); } }}
        onConfirm={confirmDelete}
      />}
    </div>
  );
}
