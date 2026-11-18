import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, GraduationCap, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import SchoolConfirmDialog from './SchoolConfirmDialog.jsx';
import {
  activateAcademicYear, createAcademicYear, deleteAcademicYear, fetchAcademicYears,
  previewAcademicYearPromotion, updateAcademicYear
} from './schoolAcademicYearApi.js';

const emptyForm = {
  label: '', startDate: '', endDate: '', isActive: false, copyPreviousYearData: false
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

export default function SchoolAcademicYearsPage({ rights }) {
  const [years, setYears] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editingYear, setEditingYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [promotionPreview, setPromotionPreview] = useState(null);
  const [promotionPreviewOpen, setPromotionPreviewOpen] = useState(false);
  const [promotionPreviewLoading, setPromotionPreviewLoading] = useState(false);
  const [promotionError, setPromotionError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const canEdit = Boolean(rights?.edit);
  const canDelete = Boolean(rights?.delete);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchAcademicYears(controller.signal)
      .then(({ years: results }) => {
        if (!controller.signal.aborted) setYears(results || []);
      })
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshKey]);

  function openCreateForm() {
    setEditingYear(null);
    setForm(emptyForm);
    setError('');
    setPromotionError('');
    setPromotionPreview(null);
    setFormOpen(true);
  }

  function openEditForm(year) {
    setEditingYear(year);
    setForm({
      label: year.label,
      startDate: String(year.startDate).slice(0, 10),
      endDate: String(year.endDate).slice(0, 10),
      isActive: year.isActive,
      copyPreviousYearData: false
    });
    setError('');
    setFormOpen(true);
  }

  function closeForm() {
    if (saving || promotionPreviewLoading) return;
    setFormOpen(false);
    setEditingYear(null);
    setForm(emptyForm);
    setPromotionPreview(null);
    setPromotionPreviewOpen(false);
    setPromotionError('');
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    if (editingYear) {
      try {
        const result = await updateAcademicYear(editingYear.id, form);
        setNotice(result.message);
        setFormOpen(false);
        setEditingYear(null);
        setForm(emptyForm);
        setRefreshKey((value) => value + 1);
      } catch (saveError) {
        setError(saveError.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (form.copyPreviousYearData) {
      setSaving(false);
      setPromotionPreviewLoading(true);
      setPromotionError('');
      try {
        const result = await previewAcademicYearPromotion();
        setPromotionPreview(result);
        setPromotionPreviewOpen(true);
      } catch (previewError) {
        setError(previewError.message);
      } finally {
        setPromotionPreviewLoading(false);
      }
      return;
    }

    try {
      const result = await createAcademicYear(form);
      setNotice(result.message);
      setFormOpen(false);
      setForm(emptyForm);
      setRefreshKey((value) => value + 1);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmPromotion() {
    if (!promotionPreview || promotionPreview.counts.unmapped > 0) return;
    setSaving(true);
    setPromotionError('');
    try {
      const result = await createAcademicYear({
        ...form,
        isActive: true,
        previewToken: promotionPreview.previewToken
      });
      setNotice(result.message);
      setForm({ label: '', startDate: '', endDate: '', isActive: false, copyPreviousYearData: false });
      setPromotionPreviewOpen(false);
      setPromotionPreview(null);
      setFormOpen(false);
      setForm(emptyForm);
      setRefreshKey((value) => value + 1);
    } catch (saveError) {
      setPromotionError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function refreshPromotionPreview() {
    setPromotionPreviewLoading(true);
    setPromotionError('');
    try {
      const result = await previewAcademicYearPromotion();
      setPromotionPreview(result);
    } catch (previewError) {
      setPromotionError(previewError.message);
    } finally {
      setPromotionPreviewLoading(false);
    }
  }

  async function activate(year) {
    setActionId(year.id);
    setError('');
    setNotice('');
    try {
      const result = await activateAcademicYear(year.id);
      setNotice(result.message);
      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionId('');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setActionId(deleteTarget.id);
    setError('');
    try {
      const result = await deleteAcademicYear(deleteTarget.id);
      setNotice(result.message);
      setDeleteTarget(null);
      setRefreshKey((value) => value + 1);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setActionId('');
    }
  }

  return (
    <div className="library-module-page school-academic-years-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">MASTER DATA</span>
        <h1>Tahun Pelajaran</h1>
        <p>Kelola rentang periode akademik yang dapat digunakan untuk menyaring laporan perpustakaan.</p>
      </header>
      {notice && <div className="master-message master-message-success" role="status"><Check size={15} />{notice}</div>}
      {error && <div className="library-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw size={14} />Coba lagi</button></div>}

      <section className="master-data-panel">
        <div className="school-settings-panel-heading">
          <div><h2>Daftar Tahun Pelajaran</h2><p>{years.length} periode tercatat</p></div>
          {canEdit && <button type="button" className="master-button master-button-primary" onClick={openCreateForm}><Plus size={15} />Tambah Tahun</button>}
        </div>
        <div className="master-table-scroll">
          <table className="master-table academic-year-table">
            <thead><tr><th>Nama Periode</th><th>Tanggal Mulai</th><th>Tanggal Akhir</th><th>Status</th>{(canEdit || canDelete) && <th>Aksi</th>}</tr></thead>
            <tbody>
              {loading ? <tr><td className="master-empty-cell" colSpan={canEdit || canDelete ? 5 : 4}>Memuat tahun pelajaran...</td></tr>
                : years.length === 0 ? <tr><td className="master-empty-cell" colSpan={canEdit || canDelete ? 5 : 4}>Belum ada tahun pelajaran.</td></tr>
                  : years.map((year) => (
                    <tr key={year.id}>
                      <td><b className="master-primary-text">{year.label}</b></td>
                      <td>{formatDate(year.startDate)}</td>
                      <td>{formatDate(year.endDate)}</td>
                      <td><span className={`master-status ${year.isActive ? 'is-active' : 'is-inactive'}`}>{year.isActive ? 'Aktif' : year.hasArchive ? 'Arsip' : 'Nonaktif'}</span></td>
                      {(canEdit || canDelete) && <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {canEdit && <button type="button" className="master-button master-button-light" disabled={Boolean(actionId)} onClick={() => openEditForm(year)}><Pencil size={14} />Edit</button>}
                          {canEdit && !year.isActive && !year.hasArchive && <button type="button" className="master-button master-button-light" disabled={Boolean(actionId)} onClick={() => activate(year)}>Jadikan Aktif</button>}
                          {canDelete && <button type="button" className="master-button master-button-muted" disabled={Boolean(actionId) || year.isActive || year.hasArchive} title={year.isActive ? 'Tahun aktif tidak dapat dihapus' : year.hasArchive ? 'Tahun yang memiliki arsip tidak dapat dihapus' : 'Hapus tahun pelajaran'} onClick={() => setDeleteTarget(year)}><Trash2 size={14} />Hapus</button>}
                        </div>
                      </td>}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>

      {formOpen && createPortal(<div className="master-modal-backdrop academic-year-form-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeForm();
      }}>
        <section className="master-modal academic-year-form-modal" role="dialog" aria-modal="true" aria-labelledby="academic-year-form-title">
          <header className="master-modal-heading">
            <div><span className="library-eyebrow">MASTER DATA</span><h2 id="academic-year-form-title">{editingYear ? 'Edit Tahun Pelajaran' : 'Tambah Tahun Pelajaran'}</h2></div>
            <button type="button" className="master-icon-button" onClick={closeForm} disabled={saving || promotionPreviewLoading} aria-label="Tutup form"><X size={17} /></button>
          </header>
          <form onSubmit={submit}>
            <div className="master-form-grid">
              <label className="master-form-wide">Nama Tahun Pelajaran
                <input value={form.label} onChange={(event) => setForm((value) => ({ ...value, label: event.target.value }))} maxLength={40} placeholder="Contoh: 2026/2027" required />
              </label>
              <label>Tanggal Mulai
                <input type="date" value={form.startDate} onChange={(event) => setForm((value) => ({ ...value, startDate: event.target.value }))} required />
              </label>
              <label>Tanggal Akhir
                <input type="date" value={form.endDate} onChange={(event) => setForm((value) => ({ ...value, endDate: event.target.value }))} min={form.startDate || undefined} required />
              </label>
            </div>
            {!editingYear && <>
              <label className="academic-year-copy-option">
                <span><input type="checkbox" checked={form.isActive || form.copyPreviousYearData} disabled={form.copyPreviousYearData} onChange={(event) => setForm((value) => ({ ...value, isActive: event.target.checked }))} />
                  <span><b>{form.copyPreviousYearData ? 'Periode baru otomatis menjadi aktif' : 'Jadikan periode aktif'}</b></span>
                </span>
              </label>
              <label className="academic-year-copy-option">
                <span><input type="checkbox" checked={form.copyPreviousYearData} onChange={(event) => {
                  setForm((value) => ({ ...value, copyPreviousYearData: event.target.checked }));
                  setPromotionPreview(null);
                  setPromotionError('');
                }} />
                  <span><b>Salin data siswa dan naikkan kelas</b><small>Arsipkan daftar siswa pada tahun aktif saat ini. Siswa tingkat akhir menjadi nonaktif tanpa menghapus arsip.</small></span>
                </span>
              </label>
              <label className="academic-year-copy-option">
                <span><input type="checkbox" checked disabled />
                  <span><b>Gunakan data master dan stok buku</b><small>Katalog dan stok dipakai bersama lintas tahun; persediaan yang tersisa otomatis tetap tersedia tanpa menggandakan buku.</small></span>
                </span>
              </label>
            </>}
            {error && <div className="master-form-error" role="alert">{error}</div>}
            <footer className="master-modal-actions">
              <button type="button" className="master-button master-button-muted" onClick={closeForm} disabled={saving || promotionPreviewLoading}>Batal</button>
              <button type="submit" className="master-button master-button-primary" disabled={saving || promotionPreviewLoading}>
                {saving || promotionPreviewLoading ? <LoaderCircle size={15} className="book-stock-spinner" /> : editingYear ? <Check size={15} /> : form.copyPreviousYearData ? <GraduationCap size={15} /> : <Plus size={15} />}
                {saving ? 'Menyimpan...' : promotionPreviewLoading ? 'Menyiapkan pratinjau...' : editingYear ? 'Simpan Perubahan' : form.copyPreviousYearData ? 'Pratinjau Kenaikan Kelas' : 'Tambah Periode'}
              </button>
            </footer>
          </form>
        </section>
      </div>, document.body)}

      {promotionPreviewOpen && promotionPreview && createPortal(<div className="master-modal-backdrop academic-year-form-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) setPromotionPreviewOpen(false);
      }}>
        <section className="master-modal academic-year-promotion-modal" role="dialog" aria-modal="true" aria-labelledby="academic-year-promotion-title">
          <header className="master-modal-heading">
            <div><span className="library-eyebrow">ARSIP &amp; KENAIKAN KELAS</span><h2 id="academic-year-promotion-title">Pratinjau {form.label || 'Tahun Pelajaran Baru'}</h2></div>
            <button type="button" className="master-icon-button" onClick={() => setPromotionPreviewOpen(false)} disabled={saving} aria-label="Tutup pratinjau">×</button>
          </header>
          <p className="academic-year-promotion-intro">
            Data <b>{promotionPreview.sourceYear.label}</b> akan disimpan sebagai arsip. Daftar siswa yang lolos akan dinaikkan ke kelas berikutnya; siswa tingkat akhir menjadi nonaktif.
          </p>
          <div className="academic-year-promotion-summary">
            <div><b>{promotionPreview.counts.total}</b><span>Siswa aktif</span></div>
            <div><b>{promotionPreview.counts.promoted}</b><span>Naik kelas</span></div>
            <div><b>{promotionPreview.counts.graduated}</b><span>Lulus / nonaktif</span></div>
            <div className={promotionPreview.counts.unmapped ? 'has-issue' : ''}><b>{promotionPreview.counts.unmapped}</b><span>Rombel perlu diperbaiki</span></div>
          </div>
          {promotionError && <div className="library-error" role="alert">{promotionError}</div>}
          {promotionPreview.counts.unmapped > 0 && <div className="academic-year-promotion-warning" role="alert">
            Perbaiki rombel yang tidak dikenali pada menu Data Siswa. Kenaikan kelas tidak dapat diproses selama masih ada rombel yang belum sesuai dengan jenjang {promotionPreview.educationLevel}.
          </div>}
          {promotionPreview.students.length > 0 ? <div className="academic-year-promotion-roster">
            <div className="master-table-scroll"><table className="master-table">
              <thead><tr><th>NIS / NISN</th><th>Nama Siswa</th><th>Rombel Sekarang</th><th>Hasil</th></tr></thead>
              <tbody>{promotionPreview.students.map((student) => <tr key={student.id}>
                <td>{student.nis_nisn || '—'}</td><td>{student.name}</td><td>{student.rombel || 'Belum diatur'}</td>
                <td>{student.promotionStatus === 'graduated' ? 'Lulus · akun nonaktif'
                  : student.promotionStatus === 'unmapped' ? 'Perlu diperbaiki'
                    : `Naik ke ${student.nextRombel}`}</td>
              </tr>)}</tbody>
            </table></div>
            {promotionPreview.truncated && <small>Pratinjau menampilkan 250 siswa pertama. Kenaikan akan diterapkan pada seluruh {promotionPreview.counts.total} siswa.</small>}
          </div> : <div className="master-empty-cell">Belum ada siswa aktif untuk diarsipkan pada tahun ini.</div>}
          <footer className="master-modal-actions">
            <button type="button" className="master-button master-button-muted" onClick={() => setPromotionPreviewOpen(false)} disabled={saving}>Batal</button>
            {promotionError.includes('berubah setelah pratinjau') && <button type="button" className="master-button master-button-light" onClick={refreshPromotionPreview} disabled={promotionPreviewLoading || saving}>
              <RefreshCw size={15} />{promotionPreviewLoading ? 'Memperbarui...' : 'Perbarui Pratinjau'}
            </button>}
            <button type="button" className="master-button master-button-primary" onClick={confirmPromotion} disabled={saving || promotionPreviewLoading || promotionPreview.counts.unmapped > 0}>
              {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <GraduationCap size={15} />}
              {saving ? 'Menyimpan dan mengarsipkan...' : 'Konfirmasi & Buat Tahun'}
            </button>
          </footer>
        </section>
      </div>, document.body)}

      {deleteTarget && <SchoolConfirmDialog
        title="Hapus tahun pelajaran?"
        message="Periode ini akan dihapus dari data sekolah."
        itemName={deleteTarget.label}
        loading={actionId === deleteTarget.id}
        error={error}
        onClose={() => { setDeleteTarget(null); setError(''); }}
        onConfirm={confirmDelete}
      />}
    </div>
  );
}
