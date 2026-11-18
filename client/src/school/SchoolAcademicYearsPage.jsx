import { useEffect, useState } from 'react';
import { CalendarDays, Check, LoaderCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import SchoolConfirmDialog from './SchoolConfirmDialog.jsx';
import {
  activateAcademicYear, createAcademicYear, deleteAcademicYear, fetchAcademicYears
} from './schoolAcademicYearApi.js';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

export default function SchoolAcademicYearsPage({ rights }) {
  const [years, setYears] = useState([]);
  const [form, setForm] = useState({ label: '', startDate: '', endDate: '', isActive: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
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

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await createAcademicYear(form);
      setNotice(result.message);
      setForm({ label: '', startDate: '', endDate: '', isActive: false });
      setRefreshKey((value) => value + 1);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
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
    <div className="library-module-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">MASTER DATA</span>
        <h1>Tahun Pelajaran</h1>
        <p>Kelola rentang periode akademik yang dapat digunakan untuk menyaring laporan perpustakaan.</p>
      </header>
      {notice && <div className="master-message master-message-success" role="status"><Check size={15} />{notice}</div>}
      {error && <div className="library-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw size={14} />Coba lagi</button></div>}

      {canEdit && (
        <section className="library-panel" style={{ padding: 18, marginBottom: 18 }}>
          <div className="catalog-table-heading"><div><h2>Tambah Tahun Pelajaran</h2><p>Masukkan label dan tanggal mulai hingga akhir periode.</p></div><CalendarDays size={20} /></div>
          <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
            <label>Nama Tahun Pelajaran
              <input value={form.label} onChange={(event) => setForm((value) => ({ ...value, label: event.target.value }))} maxLength={40} placeholder="Contoh: 2026/2027" required />
            </label>
            <label>Tanggal Mulai
              <input type="date" value={form.startDate} onChange={(event) => setForm((value) => ({ ...value, startDate: event.target.value }))} required />
            </label>
            <label>Tanggal Akhir
              <input type="date" value={form.endDate} onChange={(event) => setForm((value) => ({ ...value, endDate: event.target.value }))} required />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((value) => ({ ...value, isActive: event.target.checked }))} />
              Jadikan periode aktif
            </label>
            <button type="submit" className="master-button master-button-primary" disabled={saving}>
              {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Plus size={15} />}{saving ? 'Menyimpan...' : 'Tambah Periode'}
            </button>
          </form>
        </section>
      )}

      <section className="master-data-panel">
        <div className="school-settings-panel-heading"><div><h2>Daftar Tahun Pelajaran</h2><p>{years.length} periode tercatat</p></div></div>
        <div className="master-table-scroll">
          <table className="master-table">
            <thead><tr><th>Nama Periode</th><th>Tanggal Mulai</th><th>Tanggal Akhir</th><th>Status</th>{(canEdit || canDelete) && <th>Aksi</th>}</tr></thead>
            <tbody>
              {loading ? <tr><td className="master-empty-cell" colSpan={canEdit || canDelete ? 5 : 4}>Memuat tahun pelajaran...</td></tr>
                : years.length === 0 ? <tr><td className="master-empty-cell" colSpan={canEdit || canDelete ? 5 : 4}>Belum ada tahun pelajaran.</td></tr>
                  : years.map((year) => (
                    <tr key={year.id}>
                      <td><b className="master-primary-text">{year.label}</b></td>
                      <td>{formatDate(year.startDate)}</td>
                      <td>{formatDate(year.endDate)}</td>
                      <td><span className={`master-status ${year.isActive ? 'is-active' : 'is-inactive'}`}>{year.isActive ? 'Aktif' : 'Nonaktif'}</span></td>
                      {(canEdit || canDelete) && <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {canEdit && !year.isActive && <button type="button" className="master-button master-button-light" disabled={Boolean(actionId)} onClick={() => activate(year)}>Jadikan Aktif</button>}
                          {canDelete && !year.isActive && <button type="button" className="master-button master-button-muted" disabled={Boolean(actionId)} onClick={() => setDeleteTarget(year)}><Trash2 size={14} />Hapus</button>}
                        </div>
                      </td>}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>

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
