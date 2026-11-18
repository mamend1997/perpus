import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Check, LoaderCircle, Search } from 'lucide-react';
import CameraBarcodeScanner from './CameraBarcodeScanner.jsx';
import {
  createRackTransfer, fetchRackTransferHistory, fetchRackTransferOptions
} from './schoolBookApi.js';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function SchoolRackTransfersPage({ rights }) {
  const canEdit = Boolean(rights?.edit);
  const [queryInput, setQueryInput] = useState('');
  const [search, setSearch] = useState('');
  const [books, setBooks] = useState([]);
  const [racks, setRacks] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [fromRackId, setFromRackId] = useState('');
  const [toRackId, setToRackId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(queryInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([
      fetchRackTransferOptions(search, controller.signal),
      fetchRackTransferHistory(controller.signal)
    ]).then(([options, transfers]) => {
      if (controller.signal.aborted) return;
      const groupedBooks = new Map();
      (options.books || []).forEach((stock) => {
        const key = String(stock.book_id);
        const book = groupedBooks.get(key) || {
          id: key,
          title: stock.title,
          kode_buku: stock.kode_buku,
          nomor_induk: stock.nomor_induk,
          stocks: []
        };
        book.stocks.push(stock);
        groupedBooks.set(key, book);
      });
      setBooks([...groupedBooks.values()]);
      setRacks(options.racks || []);
      setHistory(transfers);
    }).catch((loadError) => {
      if (!controller.signal.aborted) setError(loadError.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [search, refreshKey]);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) || null,
    [books, selectedBookId]
  );
  const sourceStocks = selectedBook?.stocks || [];
  const sourceStock = sourceStocks.find((stock) => stock.rack_id === fromRackId);
  const targetRack = racks.find((rack) => rack.id === toRackId);
  const targetCapacityLeft = targetRack?.capacity == null
    ? null
    : Math.max(targetRack.capacity - targetRack.used, 0);
  const maximumQuantity = sourceStock
    ? Math.min(sourceStock.available_qty, targetCapacityLeft == null ? sourceStock.available_qty : targetCapacityLeft)
    : 0;

  function chooseBook(book) {
    setSelectedBookId(book.id);
    const sourceRack = book.stocks.length === 1 ? book.stocks[0].rack_id : '';
    setFromRackId(sourceRack);
    setToRackId('');
    setQuantity('');
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await createRackTransfer({
        bookId: selectedBookId,
        fromRackId,
        toRackId,
        quantity: Number(quantity),
        note
      });
      setNotice(result.message);
      setQueryInput('');
      setSearch('');
      setSelectedBookId('');
      setFromRackId('');
      setToRackId('');
      setQuantity('');
      setNote('');
      setRefreshKey((value) => value + 1);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="library-module-page rack-transfers-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">PENGELOLAAN KOLEKSI</span>
        <h1>Pindah Rak</h1>
        <p>Atur lokasi eksemplar yang tersedia, dengan riwayat perpindahan setiap buku.</p>
      </header>
      {notice && <div className="book-stock-success" role="status"><Check size={16} />{notice}</div>}
      {error && <div className="library-error" role="alert">{error}</div>}
      {!canEdit && <div className="book-stock-readonly" role="note">Akun Anda hanya dapat melihat riwayat perpindahan rak.</div>}

      <form className="library-panel rack-transfer-form" onSubmit={submit}>
        <div className="library-panel-heading"><div><span className="library-eyebrow">TRANSAKSI LOKASI</span><h2>Data pemindahan buku</h2></div><ArrowRightLeft size={19} /></div>
        <div className="rack-transfer-grid">
          <label className="rack-transfer-book-field">
            Cari nama buku atau scan barcode
            <CameraBarcodeScanner label="Scan barcode" onScan={(value) => setQueryInput(value)} />
            <div className="master-search"><Search size={16} /><input value={queryInput} onChange={(event) => {
              setQueryInput(event.target.value);
              setSelectedBookId('');
              setFromRackId('');
              setToRackId('');
              setQuantity('');
            }} placeholder="Judul, kode, nomor induk, atau barcode eksemplar" autoComplete="off" disabled={!canEdit} /></div>
            {queryInput.trim().length >= 2 && !selectedBook && <div className="rack-transfer-book-options" role="listbox">
              {books.map((book) => <button type="button" role="option" key={book.id} onClick={() => chooseBook(book)}>
                <b>{book.title}</b><small>{book.kode_buku || book.nomor_induk || 'Kode belum tersedia'} · {book.stocks.reduce((total, stock) => total + stock.available_qty, 0)} eksemplar tersedia</small>
              </button>)}
              {!loading && !books.length && <span>Tidak ada buku tersedia yang cocok.</span>}
            </div>}
          </label>
          {selectedBook && <div className="rack-transfer-selected"><b>{selectedBook.title}</b><small>{selectedBook.kode_buku || selectedBook.nomor_induk || 'Kode belum tersedia'}</small></div>}
          <label>Rak asal
            <select value={fromRackId} onChange={(event) => { setFromRackId(event.target.value); setToRackId(''); setQuantity(''); }} required disabled={!selectedBook || !canEdit}>
              <option value="">Pilih rak asal</option>
              {sourceStocks.map((stock) => <option key={stock.rack_id || 'unassigned'} value={stock.rack_id}>{stock.rack_name} · {stock.available_qty} tersedia</option>)}
            </select>
          </label>
          <label>Rak tujuan
            <select value={toRackId} onChange={(event) => { setToRackId(event.target.value); setQuantity(''); }} required disabled={!fromRackId || !canEdit}>
              <option value="">Pilih rak tujuan</option>
              {racks.filter((rack) => rack.id !== fromRackId).map((rack) => <option key={rack.id} value={rack.id}>{rack.name}{rack.capacity == null ? ' · tidak dibatasi' : ` · sisa ${Math.max(rack.capacity - rack.used, 0)} tempat`}</option>)}
            </select>
          </label>
          <label>Jumlah pindah
            <input type="number" min="1" max={Math.max(maximumQuantity, 1)} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required disabled={!fromRackId || !toRackId || !canEdit || maximumQuantity < 1} />
            {fromRackId && toRackId && <small>Maksimal {maximumQuantity} eksemplar dapat dipindahkan.</small>}
          </label>
          <label className="rack-transfer-note">Keterangan <small>(opsional)</small>
            <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Catatan pemindahan" disabled={!canEdit} />
          </label>
        </div>
        {racks.length < 2 && <p className="rack-transfer-empty-note">Tambahkan minimal dua rak aktif melalui menu Master Data → Rak.</p>}
        {canEdit && <footer className="rack-transfer-actions">
          <button type="submit" className="master-button master-button-primary" disabled={saving || !selectedBook || !fromRackId || !toRackId || !quantity || maximumQuantity < 1}>
            {saving ? <><LoaderCircle size={15} className="book-stock-spinner" />Memindahkan...</> : <><ArrowRightLeft size={15} />Pindahkan Buku</>}
          </button>
        </footer>}
      </form>

      <section className="master-data-panel rack-transfer-history">
        <div className="school-settings-panel-heading"><div><h2>Riwayat Pindah Rak</h2><p>Menampilkan hingga 100 transaksi terbaru.</p></div></div>
        <div className="master-table-scroll"><table className="master-table">
          <thead><tr><th>Tanggal</th><th>Buku</th><th>Rak Asal</th><th>Rak Tujuan</th><th>Jumlah</th><th>Petugas</th><th>Keterangan</th></tr></thead>
          <tbody>{loading ? <tr><td className="master-empty-cell" colSpan={7}>Memuat riwayat...</td></tr>
            : history.length ? history.map((transfer) => <tr key={transfer.id}>
              <td>{formatDate(transfer.moved_at)}</td><td><b>{transfer.book_title}</b><small>{transfer.kode_buku || ''}</small></td>
              <td>{transfer.from_rack}</td><td>{transfer.to_rack}</td><td>{transfer.quantity.toLocaleString('id-ID')}</td>
              <td>{transfer.moved_by || '—'}</td><td>{transfer.note || '—'}</td>
            </tr>) : <tr><td className="master-empty-cell" colSpan={7}>Belum ada riwayat perpindahan rak.</td></tr>}</tbody>
        </table></div>
      </section>
    </div>
  );
}
