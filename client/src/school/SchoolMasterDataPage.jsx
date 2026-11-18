import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, CheckCircle2, CircleX, Download, Eye, FileSpreadsheet, List, Pencil, Plus,
  Search, Trash2, Upload, X
} from 'lucide-react';
import {
  deleteMasterCategories, fetchMasterCategories, importMasterCategories, saveMasterCategory
} from './masterCategoryApi.js';
import SchoolConfirmDialog from './SchoolConfirmDialog.jsx';
import {
  downloadMasterExport, downloadMasterTemplate, parseMasterImport
} from './masterCategoryExcel.js';

function displayStatus(status) {
  return status === 'active' ? 'Aktif' : 'Nonaktif';
}

function MasterCategoryPreviewModal({ type, category, onClose }) {
  const isAuthor = type === 'pengarang';
  const isAgent = type === 'agen';
  const isCodeLess = type === 'koleksi' || type === 'topik' || type === 'penerbit';
  const details = [
    { label: isAgent ? 'Nama Agen' : isAuthor ? 'Nama Pengarang' : 'Nama', value: category.name },
    ...(type === 'rak' ? [{ label: 'Kapasitas Rak', value: category.capacity ? `${Number(category.capacity).toLocaleString('id-ID')} eksemplar` : 'Belum dibatasi' }] : []),
    ...(!isAgent && !isAuthor && !isCodeLess
      ? [{ label: 'Kode', value: category.code }]
      : []),
    ...(isAgent
      ? [
        { label: 'Email', value: category.email },
        { label: 'No. Telepon', value: category.phone },
        { label: 'Alamat', value: category.address }
      ]
      : [{ label: isAuthor ? 'Biodata' : 'Keterangan', value: category.description }]),
    { label: 'Status', value: displayStatus(category.status), isStatus: true }
  ];

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div className="master-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="master-modal master-preview-modal" role="dialog" aria-modal="true" aria-labelledby="master-preview-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">PRATINJAU MASTER DATA</span><h2 id="master-preview-title">{category.name}</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} aria-label="Tutup pratinjau"><X size={18} /></button>
        </header>
        <dl className="master-preview-details">
          {details.map(({ label, value, isStatus }) => (
            <div className="master-preview-detail" key={label}>
              <dt>{label}</dt>
              <dd>{isStatus
                ? <span className={`master-status ${category.status === 'active' ? 'is-active' : 'is-inactive'}`}>{value}</span>
                : value || '—'}</dd>
            </div>
          ))}
        </dl>
        <footer className="master-modal-actions">
          <button type="button" className="master-button master-button-muted" onClick={onClose}>Tutup</button>
        </footer>
      </section>
    </div>,
    document.body
  );
}

function MasterCategoryModal({ type, category, onClose, onSave }) {
  const isAuthor = type === 'pengarang';
  const isAgent = type === 'agen';
  const isCodeLess = type === 'jenis' || type === 'koleksi' || type === 'topik' || type === 'penerbit';
  const [form, setForm] = useState({
    code: isCodeLess ? '' : category?.code || '',
    name: category?.name || '',
    description: category?.description || '',
    email: category?.email || '',
    phone: category?.phone || '',
    address: category?.address || '',
    capacity: category?.capacity ?? '',
    status: category?.status || 'active'
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
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
    <div className="master-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="master-modal" role="dialog" aria-modal="true" aria-labelledby="master-modal-title">
        <header className="master-modal-heading">
          <div>
            <span className="library-eyebrow">{category ? 'PERBARUI DATA' : 'DATA BARU'}</span>
            <h2 id="master-modal-title">{category ? 'Edit' : 'Tambah'} {isAgent ? 'Agen' : isAuthor ? 'Pengarang' : type}</h2>
          </div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={18} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="master-form-grid">
            {!isAuthor && !isAgent && !isCodeLess && (
              <label>
                Kode
                <input name="code" value={form.code} onChange={updateField} maxLength={50} placeholder="Contoh: REF-01" />
              </label>
            )}
            <label className="master-form-wide">
              {isAgent ? 'Nama Agen' : isAuthor ? 'Nama Pengarang' : 'Nama'}
              <input name="name" value={form.name} onChange={updateField} maxLength={180} required autoFocus />
            </label>
            {type === 'rak' && <label className="master-form-wide">
              Kapasitas Rak (eksemplar)
              <input name="capacity" type="number" min="1" max="100000" step="1" value={form.capacity} onChange={updateField} placeholder="Kosongkan jika tidak dibatasi" />
              <small>Kapasitas tidak boleh lebih kecil dari stok tersedia yang sudah berada di rak.</small>
            </label>}
            {isAgent ? (
              <>
                <label>
                  Email
                  <input name="email" type="email" value={form.email} onChange={updateField} maxLength={190} />
                </label>
                <label>
                  No. Telp
                  <input name="phone" type="tel" value={form.phone} onChange={updateField} maxLength={30} />
                </label>
                <label className="master-form-wide">
                  Alamat
                  <textarea name="address" value={form.address} onChange={updateField} rows={3} />
                </label>
              </>
            ) : (
              <label className="master-form-wide">
                {isAuthor ? 'Biodata' : 'Keterangan'}
                <textarea name="description" value={form.description} onChange={updateField} rows={4} maxLength={65535} />
              </label>
            )}
            <label className="master-form-wide">
              Status
              <select name="status" value={form.status} onChange={updateField}>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
            </label>
          </div>
          {error && <p className="master-form-error" role="alert"><AlertCircle size={15} />{error}</p>}
          <footer className="master-modal-actions">
            <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving}>
              {saving ? 'Menyimpan...' : category ? 'Simpan Perubahan' : 'Simpan Data'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}

function MasterImportModal({ type, onClose, onImported }) {
  const isAuthor = type === 'pengarang';
  const isAgent = type === 'agen';
  const isCodeLess = type === 'jenis' || type === 'koleksi' || type === 'topik' || type === 'penerbit';
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [phase, setPhase] = useState('choose');
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const previewColumns = isAgent
    ? [['name', 'Nama Agen'], ['email', 'Email'], ['phone', 'No. Telp'], ['address', 'Alamat'], ['status', 'Status']]
    : isAuthor
      ? [['name', 'Nama Pengarang'], ['description', 'Biodata'], ['status', 'Status']]
      : [
        ...(!isCodeLess ? [['code', 'Kode']] : []),
        ['name', 'Nama'],
        ['description', 'Keterangan'],
        ['status', 'Status']
      ];

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !processing) onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, processing]);

  async function prepareFile(selectedFile) {
    if (!selectedFile) return;
    if (!selectedFile.name.toLocaleLowerCase('id-ID').endsWith('.xlsx')) {
      setError('Pilih file Excel dengan format .xlsx.');
      return;
    }
    setProcessing(true);
    setError('');
    setFile(selectedFile);
    try {
      const parsedRows = await parseMasterImport(selectedFile, type);
      setRows(parsedRows);
      setPhase('preview');
    } catch (parseError) {
      setFile(null);
      setRows([]);
      setError(parseError.message);
    } finally {
      setProcessing(false);
    }
  }

  function chooseFile(event) {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    prepareFile(selectedFile);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    prepareFile(event.dataTransfer.files?.[0]);
  }

  async function submit(event) {
    event.preventDefault();
    if (!rows.length) return;
    setProcessing(true);
    setError('');
    try {
      const result = await importMasterCategories(type, rows);
      onImported(result);
    } catch (importError) {
      setError(importError.message);
    } finally {
      setProcessing(false);
    }
  }

  function cellValue(row, key) {
    if (key === 'status') return displayStatus(row.status);
    return String(row[key] || '—');
  }

  return createPortal(
    <div className="master-modal-backdrop master-import-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !processing) onClose();
    }}>
      <section className="master-modal master-import-modal" role="dialog" aria-modal="true" aria-labelledby="master-import-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">IMPOR MASTER DATA</span><h2 id="master-import-title">Impor {isAgent ? 'Agen' : isAuthor ? 'Pengarang' : type}</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={processing} aria-label="Tutup impor"><X size={18} /></button>
        </header>
        <form onSubmit={submit}>
          <input
            ref={fileInputRef}
            className="master-file-input"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={chooseFile}
            aria-label="Pilih file Excel Master Data"
          />
          {phase === 'choose' ? (
            <label
              className={`master-import-drop ${dragging ? 'is-dragging' : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Pilih atau seret file Excel untuk diimpor"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
              onDrop={handleDrop}
            >
              <Upload size={24} />
              <b>{processing ? 'Membaca file...' : 'Seret file ke sini atau klik untuk mencari file'}</b>
              <span>{file?.name || 'Format .xlsx · maksimal 5 MB dan 500 baris'}</span>
            </label>
          ) : (
            <>
              <div className="master-import-preview-heading">
                <div><b>{rows.length} baris siap diimpor</b><span>{file?.name}</span></div>
                <button type="button" className="master-button master-button-light" disabled={processing} onClick={() => {
                  setPhase('choose');
                  setRows([]);
                  setFile(null);
                  setError('');
                  fileInputRef.current?.click();
                }}>Pilih file lain</button>
              </div>
              <div className="master-import-preview-scroll">
                <table className="master-import-preview-table">
                  <thead><tr>{previewColumns.map(([key, title]) => <th key={key}>{title}</th>)}</tr></thead>
                  <tbody>
                    {rows.slice(0, 10).map((row, index) => (
                      <tr key={`${row.name}-${index}`}>
                        {previewColumns.map(([key]) => <td key={key}>{cellValue(row, key)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 10 && <small className="master-import-preview-note">Menampilkan 10 dari {rows.length} baris. Semua baris akan diimpor setelah dikonfirmasi.</small>}
            </>
          )}
          {error && <p className="master-form-error" role="alert"><AlertCircle size={15} />{error}</p>}
          <footer className="master-modal-actions">
            <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={processing}>Batal</button>
            {phase === 'preview' && <button type="submit" className="master-button master-button-primary" disabled={processing || !rows.length}>{processing ? 'Mengimpor...' : `Impor ${rows.length} Data`}</button>}
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}

export default function SchoolMasterDataPage({ active, type, rights }) {
  const isAuthor = type === 'pengarang';
  const isAgent = type === 'agen';
  const isCodeLess = type === 'jenis' || type === 'koleksi' || type === 'topik' || type === 'penerbit';
  const canPreview = ['koleksi', 'klasifikasi', 'topik', 'rak', 'pengarang', 'penerbit', 'agen'].includes(type);
  const canEdit = Boolean(rights?.edit);
  const canDelete = Boolean(rights?.delete);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editingCategory, setEditingCategory] = useState(null);
  const [previewCategory, setPreviewCategory] = useState(null);
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyAction, setBusyAction] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchMasterCategories(type, controller.signal)
      .then((items) => {
        setCategories(items);
        setSelectedIds(new Set());
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [type, refreshKey]);

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID');
    return categories.filter((category) => {
      if (statusFilter !== 'all' && category.status !== statusFilter) return false;
      if (!query) return true;
      return [
        category.code, category.name, category.description,
        category.email, category.phone, category.address
      ].some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(query));
    });
  }, [categories, search, statusFilter]);

  const visibleIds = filteredCategories.map((category) => String(category.id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const activeCount = categories.filter((category) => category.status === 'active').length;
  const inactiveCount = categories.length - activeCount;

  async function saveCategory(form) {
    await saveMasterCategory(type, form, editingCategory?.id);
    setModalOpen(false);
    setEditingCategory(null);
    setNotice(`${isAgent ? 'Agen' : isAuthor ? 'Pengarang' : active} berhasil disimpan.`);
    setRefreshKey((key) => key + 1);
  }

  function removeCategories(ids) {
    const categoryIds = ids.map(String);
    if (!categoryIds.length) return;
    const label = isAgent ? 'agen' : isAuthor ? 'pengarang' : active.toLocaleLowerCase('id-ID');
    const itemName = categoryIds.length === 1
      ? categories.find((category) => String(category.id) === categoryIds[0])?.name
      : '';
    setError('');
    setDeleteRequest({ ids: categoryIds, label, itemName });
  }

  async function confirmRemoveCategories() {
    if (!deleteRequest) return;
    setBusyAction('delete');
    setError('');
    setNotice('');
    try {
      const result = await deleteMasterCategories(type, deleteRequest.ids);
      setDeleteRequest(null);
      setSelectedIds(new Set());
      setNotice(`${result.deleted} data berhasil dihapus.`);
      setRefreshKey((key) => key + 1);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusyAction('');
    }
  }

  function handleImportComplete(result) {
    setImportOpen(false);
    setNotice(`${result.imported} data berhasil diimpor.`);
    setRefreshKey((key) => key + 1);
  }

  async function handleTemplate() {
    setBusyAction('template');
    setError('');
    try {
      await downloadMasterTemplate(type);
    } catch (downloadError) {
      setError(`Template gagal dibuat: ${downloadError.message}`);
    } finally {
      setBusyAction('');
    }
  }

  async function handleExport() {
    setBusyAction('export');
    setError('');
    try {
      await downloadMasterExport(type, filteredCategories);
    } catch (downloadError) {
      setError(`Export gagal dibuat: ${downloadError.message}`);
    } finally {
      setBusyAction('');
    }
  }

  function toggleAllVisible(checked) {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }

  return (
    <div className="library-module-page master-data-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">MASTER DATA</span>
        <h1>{active}</h1>
        <p>{isAgent
          ? 'Kelola informasi agen pemasok koleksi perpustakaan.'
          : isAuthor
            ? 'Kelola nama, biodata, dan status pengarang.'
            : `Kelola data referensi ${active.toLocaleLowerCase('id-ID')} perpustakaan.`}</p>
      </header>

      <section className="master-summary-grid" aria-label="Ringkasan data">
        <article className="master-summary-card">
          <span className="master-summary-icon"><List size={18} /></span>
          <div><small>Total Data</small><b>{loading ? '—' : categories.length}</b></div>
        </article>
        <article className="master-summary-card is-active">
          <span className="master-summary-icon"><CheckCircle2 size={18} /></span>
          <div><small>Aktif</small><b>{loading ? '—' : activeCount}</b></div>
        </article>
        <article className="master-summary-card is-inactive">
          <span className="master-summary-icon"><CircleX size={18} /></span>
          <div><small>Nonaktif</small><b>{loading ? '—' : inactiveCount}</b></div>
        </article>
      </section>

      <div className="master-status-tabs" role="tablist" aria-label="Filter status data">
        {[
          { key: 'all', label: 'Semua', count: categories.length },
          { key: 'active', label: 'Aktif', count: activeCount },
          { key: 'inactive', label: 'Nonaktif', count: inactiveCount }
        ].map(({ key, label, count }) => (
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === key}
            className={statusFilter === key ? 'selected' : ''}
            key={key}
            onClick={() => setStatusFilter(key)}
          >
            {label}<span>{loading ? '—' : count}</span>
          </button>
        ))}
      </div>

      <section className="master-data-panel">
        <div className="master-toolbar">
          <label className="master-search">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari Disini" aria-label="Cari Master Data" />
          </label>
          <div className="master-toolbar-actions">
            {canDelete && (
              <button type="button" className="master-button master-button-danger" disabled={!selectedIds.size || Boolean(busyAction)} onClick={() => removeCategories([...selectedIds])}>
                <Trash2 size={16} />Hapus Terpilih{selectedIds.size ? ` (${selectedIds.size})` : ''}
              </button>
            )}
            {canEdit && <button type="button" className="master-button master-button-primary" disabled={Boolean(busyAction)} onClick={() => { setEditingCategory(null); setModalOpen(true); }}>
              <Plus size={16} />Tambah
            </button>}
            {canEdit && <button type="button" className="master-button master-button-teal" disabled={Boolean(busyAction)} onClick={() => { setError(''); setNotice(''); setImportOpen(true); }}>
              <Upload size={15} />Import Excel
            </button>}
            <button type="button" className="master-button master-button-light" disabled={Boolean(busyAction)} onClick={handleTemplate}>
              <FileSpreadsheet size={15} />Template
            </button>
            <button type="button" className="master-button master-button-violet" disabled={Boolean(busyAction)} onClick={handleExport}>
              <Download size={15} />Export
            </button>
          </div>
        </div>

        {error && <div className="master-message master-message-error" role="alert"><AlertCircle size={16} />{error}</div>}
        {notice && <div className="master-message master-message-success">{notice}</div>}

        <div className="master-table-scroll">
          <table className={`master-table ${isAgent ? 'master-table-agent' : ''}`}>
            <thead>
              {isAgent ? (
                <tr>
                  <th className="master-check-cell"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleAllVisible(event.target.checked)} aria-label="Pilih semua agen yang tampil" /></th>
                  <th>No</th><th>Nama Agen</th><th>Email</th><th>No. Telp</th><th>Alamat</th><th>Status</th><th>Aksi</th>
                </tr>
              ) : isAuthor ? (
                <tr>
                  <th className="master-check-cell"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleAllVisible(event.target.checked)} aria-label="Pilih semua pengarang yang tampil" /></th>
                  <th>No</th><th>Nama</th><th>Biodata</th><th>Status</th><th>Aksi</th>
                </tr>
              ) : isCodeLess ? (
                <tr>
                  <th className="master-check-cell"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleAllVisible(event.target.checked)} aria-label="Pilih semua data yang tampil" /></th>
                  <th>No</th><th>Nama / Keterangan</th><th>Status</th><th>Aksi</th>
                </tr>
              ) : (
                <tr>
                  <th className="master-check-cell"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleAllVisible(event.target.checked)} aria-label="Pilih semua data yang tampil" /></th>
                  <th>No</th><th>Kode</th><th>Nama / Keterangan</th><th>Status</th><th>Aksi</th>
                </tr>
              )}
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="master-empty-cell" colSpan={isAgent ? 8 : isAuthor ? 6 : isCodeLess ? 5 : 6}>Memuat data...</td></tr>
              ) : error && categories.length === 0 ? (
                <tr><td className="master-empty-cell" colSpan={isAgent ? 8 : isAuthor ? 6 : isCodeLess ? 5 : 6}>Data belum dapat dimuat.</td></tr>
              ) : filteredCategories.length === 0 ? (
                <tr><td className="master-empty-cell" colSpan={isAgent ? 8 : isAuthor ? 6 : isCodeLess ? 5 : 6}>{search || statusFilter !== 'all' ? 'Data tidak ditemukan.' : 'Belum ada data. Tambahkan data pertama Anda.'}</td></tr>
              ) : filteredCategories.map((category, index) => (
                <tr key={category.id}>
                  {isAgent ? (
                    <>
                      <td className="master-check-cell"><input type="checkbox" checked={selectedIds.has(String(category.id))} onChange={(event) => {
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(String(category.id));
                          else next.delete(String(category.id));
                          return next;
                        });
                      }} aria-label={`Pilih ${category.name}`} /></td>
                      <td>{index + 1}</td>
                      <td><b className="master-primary-text">{category.name}</b></td>
                      <td>{category.email || '—'}</td>
                      <td>{category.phone || '—'}</td>
                      <td className="master-description-cell">{category.address || '—'}</td>
                      <td><span className={`master-status ${category.status === 'active' ? 'is-active' : 'is-inactive'}`}>{displayStatus(category.status)}</span></td>
                      <td>
                        <div className="master-agent-actions">
                          {canPreview && <button type="button" className="master-row-icon is-preview" title="Pratinjau" aria-label={`Pratinjau ${category.name}`} onClick={() => setPreviewCategory(category)}><Eye size={14} /></button>}
                          {canEdit && <button type="button" className="master-row-icon is-edit" title="Edit" aria-label={`Edit ${category.name}`} onClick={() => { setEditingCategory(category); setModalOpen(true); }}><Pencil size={14} /></button>}
                          {canDelete && <button type="button" className="master-row-icon is-delete" title="Hapus" aria-label={`Hapus ${category.name}`} disabled={busyAction === 'delete'} onClick={() => removeCategories([category.id])}><Trash2 size={14} /></button>}
                          {!canPreview && !canEdit && !canDelete && '—'}
                        </div>
                      </td>
                    </>
                  ) : isAuthor ? (
                    <>
                      <td className="master-check-cell"><input type="checkbox" checked={selectedIds.has(String(category.id))} onChange={(event) => {
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(String(category.id));
                          else next.delete(String(category.id));
                          return next;
                        });
                      }} aria-label={`Pilih ${category.name}`} /></td>
                      <td>{index + 1}</td>
                      <td><b className="master-primary-text">{category.name}</b></td>
                      <td className="master-description-cell">{category.description || '—'}</td>
                      <td><span className={`master-status ${category.status === 'active' ? 'is-active' : 'is-inactive'}`}>{displayStatus(category.status)}</span></td>
                      <td>
                        <div className="master-agent-actions">
                          {canPreview && <button type="button" className="master-row-icon is-preview" title="Pratinjau" aria-label={`Pratinjau ${category.name}`} onClick={() => setPreviewCategory(category)}><Eye size={14} /></button>}
                          {canEdit && <button type="button" className="master-row-icon is-edit" title="Edit" aria-label={`Edit ${category.name}`} onClick={() => { setEditingCategory(category); setModalOpen(true); }}><Pencil size={14} /></button>}
                          {canDelete && <button type="button" className="master-row-icon is-delete" title="Hapus" aria-label={`Hapus ${category.name}`} disabled={busyAction === 'delete'} onClick={() => removeCategories([category.id])}><Trash2 size={14} /></button>}
                          {!canPreview && !canEdit && !canDelete && '—'}
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="master-check-cell"><input type="checkbox" checked={selectedIds.has(String(category.id))} onChange={(event) => {
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(String(category.id));
                          else next.delete(String(category.id));
                          return next;
                        });
                      }} aria-label={`Pilih ${category.name}`} /></td>
                      <td>{index + 1}</td>
                      {!isCodeLess && <td>{category.code || '—'}</td>}
                      <td><b className="master-primary-text">{category.name}</b>{type === 'rak' && <small className="master-secondary-text">Kapasitas: {category.capacity ? `${Number(category.capacity).toLocaleString('id-ID')} eksemplar` : 'Tidak dibatasi'}</small>}{category.description && <small className="master-secondary-text">{category.description}</small>}</td>
                      <td><span className={`master-status ${category.status === 'active' ? 'is-active' : 'is-inactive'}`}>{displayStatus(category.status)}</span></td>
                      <td>
                        <div className="master-agent-actions">
                          {canPreview && <button type="button" className="master-row-icon is-preview" title="Pratinjau" aria-label={`Pratinjau ${category.name}`} onClick={() => setPreviewCategory(category)}><Eye size={14} /></button>}
                          {canEdit && <button type="button" className="master-row-icon is-edit" title="Edit" aria-label={`Edit ${category.name}`} onClick={() => { setEditingCategory(category); setModalOpen(true); }}><Pencil size={14} /></button>}
                          {canDelete && <button type="button" className="master-row-icon is-delete" title="Hapus" aria-label={`Hapus ${category.name}`} disabled={busyAction === 'delete'} onClick={() => removeCategories([category.id])}><Trash2 size={14} /></button>}
                          {!canPreview && !canEdit && !canDelete && '—'}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="master-table-footer"><span>{filteredCategories.length} data ditampilkan</span><span><FileSpreadsheet size={14} /> Excel (.xlsx)</span></div>
      </section>

      {modalOpen && <MasterCategoryModal
        key={editingCategory?.id || 'new'}
        type={type}
        category={editingCategory}
        onClose={() => { setModalOpen(false); setEditingCategory(null); }}
        onSave={saveCategory}
      />}
      {previewCategory && <MasterCategoryPreviewModal
        type={type}
        category={previewCategory}
        onClose={() => setPreviewCategory(null)}
      />}
      {importOpen && <MasterImportModal
        type={type}
        onClose={() => setImportOpen(false)}
        onImported={handleImportComplete}
      />}
      {deleteRequest && <SchoolConfirmDialog
        title={deleteRequest.ids.length === 1 ? `Hapus ${deleteRequest.label}?` : 'Hapus Data Terpilih?'}
        message={deleteRequest.ids.length === 1
          ? 'Apakah Anda yakin ingin menghapus data ini?'
          : `Anda akan menghapus ${deleteRequest.ids.length} ${deleteRequest.label} yang dipilih.`}
        itemName={deleteRequest.itemName}
        confirmLabel="Hapus Data"
        loading={busyAction === 'delete'}
        error={error}
        onClose={() => { setDeleteRequest(null); setError(''); }}
        onConfirm={confirmRemoveCategories}
      />}
    </div>
  );
}
