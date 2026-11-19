import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import {
  BookOpen, Check, ChevronLeft, ChevronRight, Download, LoaderCircle,
  Pencil, Printer, Search, Trash2, X
} from 'lucide-react';
import { deleteBookItem, fetchBookItems, updateBookItem } from './schoolBookApi.js';
import { downloadBookItemsExcel } from './schoolBookItemsExcel.js';
import SchoolConfirmDialog from './SchoolConfirmDialog.jsx';

const pageSize = 25;

function EditBookItemModal({ item, onClose, onSave }) {
  const [serialNumber, setSerialNumber] = useState(item.serial_number);
  const [status, setStatus] = useState(item.status);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({ serial_number: serialNumber, status });
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
      <section className="master-modal book-item-edit-modal" role="dialog" aria-modal="true" aria-labelledby="book-item-edit-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">MANAJEMEN EKSEMPLAR</span><h2 id="book-item-edit-title">Edit Eksemplar</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={18} /></button>
        </header>
        {error && <div className="library-error" role="alert">{error}</div>}
        <form className="book-item-edit-form" onSubmit={submit}>
          <label>Serial Number
            <input
              value={serialNumber}
              onChange={(event) => setSerialNumber(event.target.value)}
              maxLength={50}
              pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,49}"
              required
              autoFocus
            />
          </label>
          <label>Status
            <select value={status} onChange={(event) => setStatus(event.target.value)} required>
              {item.status === 'Dipinjam' && <option value="Dipinjam" disabled>Dipinjam (dikelola melalui peminjaman)</option>}
              <option value="Tersedia">Tersedia</option>
              <option value="Rusak">Rusak</option>
            </select>
          </label>
          <p>Status Dipinjam mengikuti transaksi peminjaman dan tidak dapat diatur manual.</p>
          <footer className="book-item-edit-actions">
            <button type="button" className="master-button master-button-light" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving}>
              {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Check size={15} />}
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}

function itemBarcodeValue(item) {
  return String(item.serial_number || `I${item.id}`).replace(/[^\x20-\x7e]/g, '').trim().slice(0, 80) || `I${item.id}`;
}

function BookItemBarcodePrint({ items, schoolName, onClose }) {
  const svgRefs = useRef({});

  useEffect(() => {
    document.body.classList.add('is-printing-barcode');
    items.forEach((item) => {
      const svg = svgRefs.current[String(item.id)];
      if (svg) JsBarcode(svg, itemBarcodeValue(item), { format: 'CODE128', displayValue: false, height: 42, width: 1.5, margin: 0 });
    });
    const printTimer = window.setTimeout(() => window.print(), 250);
    const afterPrint = () => onClose();
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.clearTimeout(printTimer);
      window.removeEventListener('afterprint', afterPrint);
      document.body.classList.remove('is-printing-barcode');
    };
  }, [items, onClose]);

  return createPortal(
    <div className="barcode-print-layout">
      <div className="barcode-print-controls"><button type="button" onClick={onClose}>Tutup</button></div>
      <div className="barcode-print-grid">
        {items.map((item) => (
          <article className="barcode-print-label" key={item.id}>
            <small className="barcode-print-kicker">PERPUSTAKAAN SEKOLAH</small>
            <b>{schoolName}</b>
            <span>{item.book_title}</span>
            <svg ref={(element) => { if (element) svgRefs.current[String(item.id)] = element; }} aria-label={`Barcode ${item.serial_number}`} />
            <small>{itemBarcodeValue(item)}</small>
          </article>
        ))}
      </div>
    </div>,
    document.body
  );
}

export default function SchoolBookItemsPage({ rights, schoolName }) {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('serial');
  const [direction, setDirection] = useState('asc');
  const [status, setStatus] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editingItem, setEditingItem] = useState(null);
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [deletingItemId, setDeletingItemId] = useState('');
  const [printItems, setPrintItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const selectAllRef = useRef(null);
  const canEdit = Boolean(rights?.edit);
  const canDelete = Boolean(rights?.delete);
  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(String(item.id)));
  const partiallySelected = !allSelected && items.some((item) => selectedIds.has(String(item.id)));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partiallySelected;
  }, [partiallySelected]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSelectedIds(new Set());
    fetchBookItems({ page, limit: pageSize, search, sort, direction, status, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setItems(result.items || []);
        setPagination(result.pagination || { page: 1, total: 0, totalPages: 0 });
      })
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, search, sort, direction, status, refreshKey]);

  function toggleItem(itemId) {
    const id = String(itemId);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCurrentPage() {
    setSelectedIds(allSelected ? new Set() : new Set(items.map((item) => String(item.id))));
  }

  async function saveItem(changes) {
    await updateBookItem(editingItem.id, changes);
    setNotice(`Eksemplar ${changes.serial_number} berhasil diperbarui.`);
    setEditingItem(null);
    setRefreshKey((key) => key + 1);
  }

  function removeItem(item) {
    setError('');
    setDeleteRequest(item);
  }

  async function confirmRemoveItem() {
    if (!deleteRequest) return;
    setDeletingItemId(String(deleteRequest.id));
    setError('');
    setNotice('');
    try {
      await deleteBookItem(deleteRequest.id);
      setDeleteRequest(null);
      setNotice(`Eksemplar ${deleteRequest.serial_number} berhasil dihapus.`);
      setRefreshKey((key) => key + 1);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeletingItemId('');
    }
  }

  async function exportItems() {
    setExporting(true);
    setError('');
    setNotice('');
    try {
      const firstPage = await fetchBookItems({ page: 1, limit: 100, search, sort, direction, status });
      const allItems = [...(firstPage.items || [])];
      const totalPages = firstPage.pagination?.totalPages || 0;
      for (let currentPage = 2; currentPage <= totalPages; currentPage += 1) {
        const result = await fetchBookItems({ page: currentPage, limit: 100, search, sort, direction, status });
        allItems.push(...(result.items || []));
      }
      await downloadBookItemsExcel(allItems);
      setNotice(`${allItems.length.toLocaleString('id-ID')} data eksemplar berhasil diekspor.`);
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setExporting(false);
    }
  }

  const selectedItems = items.filter((item) => selectedIds.has(String(item.id)));

  return (
    <div className="library-module-page catalog-page book-items-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">PENGELOLAAN KOLEKSI FISIK</span>
        <h1>Eksemplar Buku</h1>
        <p>Kelola serial number dan status setiap salinan fisik yang tersedia di perpustakaan.</p>
      </header>

      {notice && <div className="book-stock-success" role="status"><Check size={16} />{notice}</div>}
      {error && <div className="library-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRefreshKey((key) => key + 1)}>Coba lagi</button></div>}

      <section className="catalog-toolbar-panel book-items-toolbar">
        <div className="book-items-toolbar-top">
          <label className="master-search book-items-search">
            <Search size={16} />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari di sini..." maxLength={100} />
          </label>
          <div className="book-items-toolbar-actions">
            <label className="book-items-sort">
              <span>Urutkan</span>
              <select
                value={`${sort}-${direction}`}
                onChange={(event) => {
                  const [nextSort, nextDirection] = event.target.value.split('-');
                  setSort(nextSort);
                  setDirection(nextDirection);
                  setPage(1);
                }}
              >
                <option value="serial-asc">Serial Number A-Z</option>
                <option value="serial-desc">Serial Number Z-A</option>
                <option value="title-asc">Judul Buku A-Z</option>
                <option value="title-desc">Judul Buku Z-A</option>
              </select>
            </label>
            <label className="book-items-sort">
              <span>Status</span>
              <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="">Semua status</option>
                <option value="Tersedia">Tersedia</option>
                <option value="Dipinjam">Dipinjam</option>
                <option value="Rusak">Rusak</option>
              </select>
            </label>
            <button type="button" className="master-button master-button-light" onClick={exportItems} disabled={exporting || loading || pagination.total === 0}>
              {exporting ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Download size={15} />}
              {exporting ? 'Mengekspor...' : 'Export Excel'}
            </button>
            <button type="button" className="master-button master-button-primary" onClick={() => setPrintItems(selectedItems)} disabled={selectedItems.length === 0}>
              <Printer size={15} />Cetak Label ({selectedItems.length})
            </button>
          </div>
        </div>
        {selectedIds.size > 0 && <div className="book-items-selection-note">{selectedIds.size} eksemplar dipilih pada halaman ini.</div>}
      </section>

      <section className="library-panel book-items-table-panel">
        <div className="catalog-table-heading">
          <div><span className="library-eyebrow">DAFTAR FISIK</span><h2>Data Eksemplar</h2></div>
          <span>{pagination.total.toLocaleString('id-ID')} eksemplar</span>
        </div>
        <div className="book-items-table-scroll">
          <table className="book-items-table">
            <thead>
              <tr>
                <th>No</th>
                <th className="book-items-checkbox-cell">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleCurrentPage}
                    aria-label="Pilih semua eksemplar pada halaman ini"
                    disabled={items.length === 0 || loading}
                  />
                </th>
                <th>Serial Number</th>
                <th>Judul Buku</th>
                <th>Status</th>
                {(canEdit || canDelete) && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canEdit || canDelete ? 6 : 5} className="book-items-empty"><LoaderCircle size={17} className="book-stock-spinner" />Memuat data eksemplar...</td></tr>
              ) : items.length ? items.map((item, index) => (
                <tr key={item.id}>
                  <td>{(page - 1) * pageSize + index + 1}</td>
                  <td className="book-items-checkbox-cell">
                    <input type="checkbox" checked={selectedIds.has(String(item.id))} onChange={() => toggleItem(item.id)} aria-label={`Pilih eksemplar ${item.serial_number}`} />
                  </td>
                  <td><span className="book-items-serial">{item.serial_number}</span></td>
                  <td><div className="book-items-title"><b>{item.book_title}</b><small>{item.kode_buku || item.nomor_induk || 'Kode buku belum tersedia'}</small></div></td>
                  <td><span className={`book-item-status ${item.status === 'Tersedia' ? 'is-available' : item.status === 'Dipinjam' ? 'is-loaned' : 'is-damaged'}`}>{item.status}</span></td>
                  {(canEdit || canDelete) && <td>
                    <div className="book-items-row-actions">
                      {canEdit && <button type="button" className="master-row-edit" onClick={() => setEditingItem(item)} aria-label={`Edit ${item.serial_number}`}><Pencil size={14} /></button>}
                      {canDelete && <button type="button" className="book-items-delete" onClick={() => removeItem(item)} aria-label={`Hapus ${item.serial_number}`}><Trash2 size={14} /></button>}
                    </div>
                  </td>}
                </tr>
              )) : (
                <tr><td colSpan={canEdit || canDelete ? 6 : 5} className="book-items-empty"><BookOpen size={20} />{search || status ? 'Tidak ada eksemplar yang cocok dengan pencarian atau filter.' : 'Belum ada data eksemplar buku.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="catalog-pagination">
          <span>Halaman {pagination.totalPages ? page : 0} dari {pagination.totalPages} · {pagination.total.toLocaleString('id-ID')} data</span>
          <div>
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={loading || page <= 1} aria-label="Halaman sebelumnya"><ChevronLeft size={15} /></button>
            <button type="button" onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={loading || page >= pagination.totalPages} aria-label="Halaman berikutnya"><ChevronRight size={15} /></button>
          </div>
        </footer>
      </section>

      {editingItem && <EditBookItemModal item={editingItem} onClose={() => setEditingItem(null)} onSave={saveItem} />}
      {printItems && <BookItemBarcodePrint items={printItems} schoolName={schoolName || 'Perpustakaan Sekolah'} onClose={() => setPrintItems(null)} />}
      {deleteRequest && <SchoolConfirmDialog
        title="Hapus Eksemplar?"
        message="Menghapus eksemplar akan mengurangi jumlah stok buku tersebut satu."
        itemName={`${deleteRequest.serial_number} · ${deleteRequest.book_title}`}
        confirmLabel="Hapus Eksemplar"
        loading={deletingItemId === String(deleteRequest.id)}
        error={error}
        onClose={() => { setDeleteRequest(null); setError(''); }}
        onConfirm={confirmRemoveItem}
      />}
    </div>
  );
}
