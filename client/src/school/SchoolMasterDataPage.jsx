import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Download, FileSpreadsheet, MoreHorizontal, Pencil, Plus,
  Search, Trash2, Upload, X
} from 'lucide-react';
import {
  deleteMasterCategories, fetchMasterCategories, importMasterCategories, saveMasterCategory
} from './masterCategoryApi.js';
import {
  downloadMasterExport, downloadMasterTemplate, parseMasterImport
} from './masterCategoryExcel.js';

function displayStatus(status) {
  return status === 'active' ? 'Aktif' : 'Nonaktif';
}

function MasterCategoryModal({ type, category, onClose, onSave }) {
  const isAuthor = type === 'pengarang';
  const isAgent = type === 'agen';
  const [form, setForm] = useState({
    code: category?.code || '',
    name: category?.name || '',
    description: category?.description || '',
    email: category?.email || '',
    phone: category?.phone || '',
    address: category?.address || '',
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

  return (
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
            {!isAuthor && !isAgent && (
              <label>
                Kode
                <input name="code" value={form.code} onChange={updateField} maxLength={50} placeholder="Contoh: REF-01" />
              </label>
            )}
            <label className="master-form-wide">
              {isAgent ? 'Nama Agen' : isAuthor ? 'Nama Pengarang' : 'Nama'}
              <input name="name" value={form.name} onChange={updateField} maxLength={180} required autoFocus />
            </label>
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
    </div>
  );
}

export default function SchoolMasterDataPage({ active, type, rights }) {
  const isAuthor = type === 'pengarang';
  const isAgent = type === 'agen';
  const canEdit = Boolean(rights?.edit);
  const canDelete = Boolean(rights?.delete);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [menuId, setMenuId] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyAction, setBusyAction] = useState('');
  const fileInputRef = useRef(null);

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
    if (!query) return categories;
    return categories.filter((category) => [
      category.code, category.name, category.description,
      category.email, category.phone, category.address
    ].some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(query)));
  }, [categories, search]);

  const visibleIds = filteredCategories.map((category) => String(category.id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  async function saveCategory(form) {
    await saveMasterCategory(type, form, editingCategory?.id);
    setModalOpen(false);
    setEditingCategory(null);
    setNotice(`${isAgent ? 'Agen' : isAuthor ? 'Pengarang' : active} berhasil disimpan.`);
    setRefreshKey((key) => key + 1);
  }

  async function removeCategories(ids) {
    const label = isAgent ? 'agen' : isAuthor ? 'pengarang' : 'data';
    const confirmation = ids.length === 1
      ? `Hapus ${label} ini?`
      : `Hapus ${ids.length} ${label} terpilih?`;
    if (!window.confirm(confirmation)) return;
    setBusyAction('delete');
    setError('');
    setNotice('');
    try {
      const result = await deleteMasterCategories(type, ids);
      setSelectedIds(new Set());
      setNotice(`${result.deleted} data berhasil dihapus.`);
      setRefreshKey((key) => key + 1);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusyAction('');
      setMenuId(null);
    }
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusyAction('import');
    setError('');
    setNotice('');
    try {
      const rows = await parseMasterImport(file, type);
      const result = await importMasterCategories(type, rows);
      setNotice(`${result.imported} data berhasil diimpor.`);
      setRefreshKey((key) => key + 1);
    } catch (importError) {
      setError(importError.message);
    } finally {
      setBusyAction('');
    }
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

      <section className="master-data-panel">
        <div className="master-toolbar">
          <label className="master-search">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari Disini" aria-label="Cari Master Data" />
          </label>
          <div className="master-toolbar-actions">
            {!isAuthor && !isAgent && canDelete && (
              <button type="button" className="master-button master-button-danger" disabled={!selectedIds.size || Boolean(busyAction)} onClick={() => removeCategories([...selectedIds])}>
                <Trash2 size={16} />Hapus Terpilih{selectedIds.size ? ` (${selectedIds.size})` : ''}
              </button>
            )}
            {canEdit && <button type="button" className="master-button master-button-primary" disabled={Boolean(busyAction)} onClick={() => { setEditingCategory(null); setModalOpen(true); }}>
              <Plus size={16} />Tambah
            </button>}
            <input ref={fileInputRef} className="master-file-input" type="file" accept=".xlsx" onChange={handleImport} aria-label="Pilih file Excel" />
            {canEdit && <button type="button" className="master-button master-button-teal" disabled={Boolean(busyAction)} onClick={() => fileInputRef.current?.click()}>
              <Upload size={15} />{busyAction === 'import' ? 'Mengimpor...' : 'Import Excel'}
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
                <tr><th>No</th><th>Nama Agen</th><th>Email</th><th>No. Telp</th><th>Alamat</th><th>Status</th><th>Aksi</th></tr>
              ) : isAuthor ? (
                <tr><th>No</th><th>Nama</th><th>Biodata</th><th>Status</th><th>Aksi</th></tr>
              ) : (
                <tr>
                  <th className="master-check-cell"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleAllVisible(event.target.checked)} aria-label="Pilih semua data yang tampil" /></th>
                  <th>No</th><th>Kode</th><th>Nama / Keterangan</th><th>Status</th><th>Aksi</th>
                </tr>
              )}
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="master-empty-cell" colSpan={isAgent ? 7 : isAuthor ? 5 : 6}>Memuat data...</td></tr>
              ) : error && categories.length === 0 ? (
                <tr><td className="master-empty-cell" colSpan={isAgent ? 7 : isAuthor ? 5 : 6}>Data belum dapat dimuat.</td></tr>
              ) : filteredCategories.length === 0 ? (
                <tr><td className="master-empty-cell" colSpan={isAgent ? 7 : isAuthor ? 5 : 6}>{search ? 'Data tidak ditemukan.' : 'Belum ada data. Tambahkan data pertama Anda.'}</td></tr>
              ) : filteredCategories.map((category, index) => (
                <tr key={category.id}>
                  {isAgent ? (
                    <>
                      <td>{index + 1}</td>
                      <td><b className="master-primary-text">{category.name}</b></td>
                      <td>{category.email || '—'}</td>
                      <td>{category.phone || '—'}</td>
                      <td className="master-description-cell">{category.address || '—'}</td>
                      <td><span className={`master-status ${category.status === 'active' ? 'is-active' : 'is-inactive'}`}>{displayStatus(category.status)}</span></td>
                      <td>
                        <div className="master-agent-actions">
                          {canEdit && <button type="button" className="master-row-edit" onClick={() => { setEditingCategory(category); setModalOpen(true); }}><Pencil size={14} />Edit</button>}
                          {canDelete && <button type="button" className="master-row-delete" disabled={busyAction === 'delete'} onClick={() => removeCategories([category.id])}><Trash2 size={14} />Hapus</button>}
                          {!canEdit && !canDelete && '—'}
                        </div>
                      </td>
                    </>
                  ) : isAuthor ? (
                    <>
                      <td>{index + 1}</td>
                      <td><b className="master-primary-text">{category.name}</b></td>
                      <td className="master-description-cell">{category.description || '—'}</td>
                      <td><span className={`master-status ${category.status === 'active' ? 'is-active' : 'is-inactive'}`}>{displayStatus(category.status)}</span></td>
                      <td>{canEdit
                        ? <button type="button" className="master-row-edit" onClick={() => { setEditingCategory(category); setModalOpen(true); }}><Pencil size={14} />Edit</button>
                        : '—'}</td>
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
                      <td>{category.code || '—'}</td>
                      <td><b className="master-primary-text">{category.name}</b>{category.description && <small className="master-secondary-text">{category.description}</small>}</td>
                      <td><span className={`master-status ${category.status === 'active' ? 'is-active' : 'is-inactive'}`}>{displayStatus(category.status)}</span></td>
                      <td className="master-menu-cell">
                        {(canEdit || canDelete) && <button type="button" className="master-icon-button" aria-label={`Aksi ${category.name}`} aria-expanded={menuId === category.id} onClick={() => setMenuId((current) => current === category.id ? null : category.id)}><MoreHorizontal size={18} /></button>}
                        {menuId === category.id && <div className="master-row-menu">
                          {canEdit && <button type="button" onClick={() => { setEditingCategory(category); setModalOpen(true); setMenuId(null); }}><Pencil size={14} />Edit</button>}
                          {canDelete && <button type="button" className="is-danger" onClick={() => removeCategories([category.id])}><Trash2 size={14} />Hapus</button>}
                        </div>}
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
    </div>
  );
}
