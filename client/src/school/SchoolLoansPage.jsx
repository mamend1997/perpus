import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check, ChevronLeft, ChevronRight, Clock3, LoaderCircle, Plus, RefreshCw,
  RotateCcw, Search, X
} from 'lucide-react';
import {
  createLoan, fetchLoans, returnLoan, searchLoanItems, searchLoanMembers,
  updateLoanStatus
} from './schoolLoanApi.js';
import CameraBarcodeScanner from './CameraBarcodeScanner.jsx';
import { fetchBarcodeLabelSettings } from './schoolSettingsApi.js';

const pageSize = 25;
const numberFormat = new Intl.NumberFormat('id-ID');
const currencyFormat = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

function LoanSearchPicker({
  label, placeholder, query, selected, results, loading, onQueryChange, onChoose, onClear,
  getTitle, getSubtitle, getExactValues, onScan, onBarcodeScan, inputRef, keepSearchWhenSelected = false, fixed = false
}) {
  const term = query.trim().toLocaleLowerCase('id-ID');
  const barcodeMatch = getExactValues && results.find((result) => getExactValues(result)
    .some((value) => String(value || '').toLocaleLowerCase('id-ID') === term));
  const matchingResult = results.find((result) => {
    const text = `${getTitle(result)} ${getSubtitle(result)}`.toLocaleLowerCase('id-ID');
    return text === term;
  });

  return (
    <div className="loan-picker">
      <span className="loan-form-label">{label}</span>
      {onScan && <CameraBarcodeScanner label="Scan kamera" onScan={onScan} />}
      {selected && (
        <div className="loan-picker-selected">
          <div><b>{getTitle(selected)}</b><small>{getSubtitle(selected)}</small></div>
          {!fixed && <button type="button" onClick={onClear} aria-label={`Ganti ${label}`} title={`Ganti ${label}`}><X size={15} /></button>}
        </div>
      )}
      {(!selected || keepSearchWhenSelected) && (
        <>
          <label className="master-search loan-picker-search">
            <Search size={16} />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  const exactMatch = barcodeMatch || matchingResult || (results.length === 1 ? results[0] : null);
                  if (exactMatch) {
                    if (barcodeMatch && onBarcodeScan) onBarcodeScan(exactMatch);
                    else onChoose(exactMatch);
                  }
                }
              }}
              placeholder={placeholder}
              autoComplete="off"
            />
            {loading && <LoaderCircle size={15} className="book-stock-spinner" />}
          </label>
          {results.length > 0 && (
            <div className="loan-picker-options" role="listbox" aria-label={label}>
              {results.map((result) => (
                <button type="button" role="option" key={result.id} onClick={() => onChoose(result)}>
                  <b>{getTitle(result)}</b><small>{getSubtitle(result)}</small>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NewLoanModal({ account, role, durationDays, scanBehavior, onClose, onSave }) {
  const isMember = role === 'member';
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState(() => isMember && account?.id
    ? { id: account.id, name: account.name, nis_nisn: account.nis_nisn || '' }
    : null);
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState([]);
  const [itemLoading, setItemLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const itemSearchInputRef = useRef(null);
  const scanPendingRef = useRef(false);
  const [quantity, setQuantity] = useState('1');
  const [manualDuration, setManualDuration] = useState(String(durationDays));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const duration = Number(manualDuration);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (Number.isInteger(duration) && duration > 0 ? duration : durationDays));
  const dueDateValue = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;

  useEffect(() => {
    if (isMember || memberSearch.trim().length < 2) {
      setMemberResults([]);
      setMemberLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setMemberLoading(true);
      searchLoanMembers(memberSearch.trim(), controller.signal)
        .then((results) => {
          setMemberResults(results);
          const term = memberSearch.trim().toLocaleLowerCase('id-ID');
          const exactMatches = results.filter((member) => [member.name, member.nis_nisn, member.member_code]
            .some((value) => String(value || '').toLocaleLowerCase('id-ID') === term));
          if (exactMatches.length === 1) {
            setSelectedMember(exactMatches[0]);
            setMemberSearch('');
            setMemberResults([]);
          }
        })
        .catch((searchError) => {
          if (searchError.name !== 'AbortError') setError(searchError.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setMemberLoading(false);
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isMember, memberSearch]);

  useEffect(() => {
    if (!itemSearch.trim()) {
      setItemResults([]);
      setItemLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setItemLoading(true);
      searchLoanItems(itemSearch.trim(), controller.signal)
        .then((results) => {
          setItemResults(results);
          const term = itemSearch.trim().toLocaleLowerCase('id-ID');
          const exactMatches = results.filter((item) => [item.serial_number, item.barcode_value]
            .some((value) => String(value || '').toLocaleLowerCase('id-ID') === term));
          if (exactMatches.length === 1) {
            setSelectedItem(exactMatches[0]);
            setQuantity('1');
            setItemSearch('');
            setItemResults([]);
          } else if (scanPendingRef.current && exactMatches.length === 0) {
            scanPendingRef.current = false;
            setError('Barcode tidak cocok dengan eksemplar yang tersedia.');
          }
        })
        .catch((searchError) => {
          if (searchError.name !== 'AbortError') {
            scanPendingRef.current = false;
            setError(searchError.message);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setItemLoading(false);
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [itemSearch]);

  async function submitLoan() {
    if (!selectedMember || !selectedItem) {
      setError('Pilih anggota dan eksemplar yang akan dipinjam.');
      return;
    }
    const count = Number(quantity);
    if (!Number.isInteger(count) || count < 1 || count > Number(selectedItem.available_count || 1)) {
      setError(`Jumlah pinjam harus antara 1 dan ${selectedItem.available_count || 1} eksemplar yang tersedia.`);
      return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 365) {
      setError('Durasi peminjaman harus antara 1 sampai 365 hari.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ userId: selectedMember.id, bookItemId: selectedItem.id, quantity: count, durationDays: duration });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!scanPendingRef.current || !selectedItem) return;
    if (scanBehavior === 'focus') {
      scanPendingRef.current = false;
      window.requestAnimationFrame(() => itemSearchInputRef.current?.focus());
      return;
    }
    if (!selectedMember) {
      setError('Pilih anggota agar peminjaman dapat dikirim otomatis.');
      return;
    }
    scanPendingRef.current = false;
    void submitLoan();
  }, [selectedItem, selectedMember, scanBehavior]);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  async function submit(event) {
    event.preventDefault();
    await submitLoan();
  }

  return createPortal(
    <div className="master-modal-backdrop loan-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="master-modal loan-modal" role="dialog" aria-modal="true" aria-labelledby="loan-modal-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">TRANSAKSI BARU</span><h2 id="loan-modal-title">Peminjaman Buku</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={18} /></button>
        </header>
        <form className="loan-modal-form" onSubmit={submit}>
          <LoanSearchPicker
            label="Anggota / NIS"
            placeholder="Cari nama atau scan/ketik NIS"
            query={memberSearch}
            selected={selectedMember}
            results={memberResults}
            loading={memberLoading}
            onQueryChange={(value) => { setMemberSearch(value); setSelectedMember(null); setError(''); }}
            onChoose={(member) => { setSelectedMember(member); setMemberSearch(''); setMemberResults([]); }}
            onClear={() => setSelectedMember(null)}
            onScan={!isMember ? (value) => { setMemberSearch(value); setSelectedMember(null); setError(''); } : undefined}
            getTitle={(member) => member.name}
            getSubtitle={(member) => member.member_code ? `Barcode ${member.member_code} · NIS/NISN ${member.nis_nisn || '—'}` : member.nis_nisn ? `NIS/NISN ${member.nis_nisn}` : 'Anggota perpustakaan'}
            fixed={isMember}
          />
          <LoanSearchPicker
            label="Buku / Barcode Eksemplar"
            placeholder="Cari judul, kode, atau scan serial buku"
            query={itemSearch}
            selected={selectedItem}
            results={itemResults}
            loading={itemLoading}
            onQueryChange={(value) => {
              scanPendingRef.current = false;
              setItemSearch(value);
              setItemResults([]);
              setSelectedItem(null);
              setQuantity('1');
              setError('');
            }}
            onChoose={(item) => { setSelectedItem(item); setItemSearch(''); setItemResults([]); setQuantity('1'); }}
            onClear={() => { scanPendingRef.current = false; setSelectedItem(null); setQuantity('1'); }}
            onScan={(value) => {
              scanPendingRef.current = true;
              setItemSearch(value);
              setItemResults([]);
              setSelectedItem(null);
              setQuantity('1');
              setError('');
            }}
            onBarcodeScan={(item) => {
              scanPendingRef.current = true;
              setSelectedItem(item);
              setItemSearch('');
              setItemResults([]);
              setQuantity('1');
              setError('');
            }}
            getExactValues={(item) => [item.serial_number, item.barcode_value]}
            inputRef={itemSearchInputRef}
            keepSearchWhenSelected
            getTitle={(item) => item.book_title}
            getSubtitle={(item) => `${item.serial_number} · Barcode ${item.barcode_value}${item.kode_buku ? ` · ${item.kode_buku}` : ''}`}
          />
          {selectedItem && <label className="loan-form-field">
            <span className="loan-form-label">Jumlah dipinjam</span>
            <input type="number" min="1" max={Math.min(Number(selectedItem.available_count || 1), 100)} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
            <small>{selectedItem.available_count || 1} eksemplar tersedia; maksimal 100 per transaksi.</small>
          </label>}
          <label className="loan-form-field">
            <span className="loan-form-label">Durasi pinjam (hari)</span>
            <input type="number" min="1" max="365" step="1" value={manualDuration} onChange={(event) => setManualDuration(event.target.value)} required />
            <small>Durasi standar sekolah: {durationDays} hari. Anda dapat mengubahnya untuk transaksi ini.</small>
          </label>
          <label className="loan-form-field">
            <span className="loan-form-label">Tanggal harus dikembalikan</span>
            <input type="date" value={dueDateValue} readOnly aria-readonly="true" />
            <small>Dihitung otomatis berdasarkan tanggal pinjam dan durasi.</small>
          </label>
          <p className="loan-modal-note">{isMember
            ? 'Permintaan akan berstatus Pending sampai disetujui petugas perpustakaan.'
            : 'Peminjaman akan langsung aktif dan status eksemplar berubah menjadi Dipinjam.'}</p>
          {error && <p className="master-form-error" role="alert">{error}</p>}
          <footer className="master-modal-actions">
            <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving || !selectedMember || !selectedItem}>
              {saving ? 'Menyimpan...' : isMember ? 'Ajukan Peminjaman' : 'Simpan Peminjaman'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}

function statusClass(status) {
  if (status === 'Pending') return 'is-pending';
  if (status === 'Terlambat') return 'is-overdue';
  if (status === 'Dikembalikan') return 'is-returned';
  if (status === 'Ditolak') return 'is-rejected';
  return 'is-borrowed';
}

export default function SchoolLoansPage({ rights, role, account }) {
  const canEdit = Boolean(rights?.edit);
  const canManage = canEdit && role !== 'member';
  const [loans, setLoans] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyLoanId, setBusyLoanId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [loanDurationDays, setLoanDurationDays] = useState(7);
  const [finePerDay, setFinePerDay] = useState(1000);
  const [scanBehavior, setScanBehavior] = useState('focus');
  const [scanSettingsError, setScanSettingsError] = useState('');
  const [scanSettingsRefresh, setScanSettingsRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setScanSettingsError('');
    fetchBarcodeLabelSettings(controller.signal)
      .then(({ settings }) => {
        if (!controller.signal.aborted) setScanBehavior(settings.scanBehavior);
      })
      .catch((settingsError) => {
        if (!controller.signal.aborted) setScanSettingsError(settingsError.message);
      });
    return () => controller.abort();
  }, [scanSettingsRefresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchLoans({ page, limit: pageSize, search, status: statusFilter, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setLoans(result.loans || []);
        setPagination(result.pagination || { page: 1, total: 0, totalPages: 0 });
        setLoanDurationDays(result.loanDurationDays || 7);
        setFinePerDay(result.finePerDay ?? 1000);
        if (result.pagination?.totalPages && page > result.pagination.totalPages) {
          setPage(result.pagination.totalPages);
        }
      })
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, search, statusFilter, refreshKey]);

  async function submitLoan(data) {
    const result = await createLoan(data);
    setCreateOpen(false);
    setNotice(result.message);
    setPage(1);
    setRefreshKey((current) => current + 1);
  }

  async function runAction(id, action) {
    setBusyLoanId(String(id));
    setError('');
    setNotice('');
    try {
      const result = await action();
      setNotice(result.message);
      setRefreshKey((current) => current + 1);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusyLoanId('');
    }
  }

  function processPending(loan, status) {
    const action = status === 'Borrowed' ? 'setujui' : 'tolak';
    if (!window.confirm(`${action[0].toUpperCase()}${action.slice(1)} permintaan peminjaman ${loan.book_title}?`)) return;
    runAction(loan.id, () => updateLoanStatus(loan.id, status));
  }

  function processReturn(loan) {
    if (!window.confirm(`Proses pengembalian "${loan.book_title}" dari ${loan.member_name}?`)) return;
    runAction(loan.id, () => returnLoan(loan.id));
  }

  return (
    <div className="library-module-page loans-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">SIRKULASI BUKU</span>
        <h1>Peminjaman</h1>
        <p>Catat transaksi pinjam, pantau tenggat, dan proses pengembalian eksemplar.</p>
      </header>

      {notice && <div className="book-stock-success" role="status"><Check size={16} />{notice}</div>}
      {error && <div className="library-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRefreshKey((current) => current + 1)}><RefreshCw size={14} />Coba lagi</button></div>}
      {scanSettingsError && <div className="library-error" role="alert">
        <span>Pengaturan scan tidak dapat dimuat; pemindaian memakai fokus ulang. {scanSettingsError}</span>
        <button type="button" onClick={() => setScanSettingsRefresh((current) => current + 1)}>Coba lagi</button>
      </div>}

      <section className="catalog-toolbar-panel loan-toolbar">
        <div className="loan-toolbar-top">
          <label className="master-search loan-table-search">
            <Search size={16} />
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Cari anggota, NIS, judul, atau serial..." aria-label="Cari transaksi peminjaman" />
          </label>
          <div className="loan-toolbar-actions">
            <label className="loan-status-filter">Status
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
                <option value="">Semua status</option>
                <option value="Pending">Pending</option>
                <option value="Dipinjam">Dipinjam</option>
                <option value="Terlambat">Terlambat</option>
                <option value="Dikembalikan">Dikembalikan</option>
                <option value="Ditolak">Ditolak</option>
              </select>
            </label>
            {canEdit && <button type="button" className="master-button master-button-primary" onClick={() => setCreateOpen(true)}><Plus size={16} />Peminjaman Baru</button>}
          </div>
        </div>
        <div className="loan-policy-note"><Clock3 size={14} />Durasi pinjam {loanDurationDays} hari <span>·</span> Denda {currencyFormat.format(finePerDay)} per hari keterlambatan</div>
      </section>

      <section className="library-panel loan-table-panel">
        <div className="catalog-table-heading">
          <div><span className="library-eyebrow">DAFTAR TRANSAKSI</span><h2>Transaksi Peminjaman</h2></div>
          <span>{numberFormat.format(pagination.total)} transaksi</span>
        </div>
        <div className="loan-table-scroll">
          <table className="loan-table">
            <thead>
              <tr>
                <th>No</th><th>ID Pinjam</th><th>Anggota / NIS</th><th>Buku / Serial</th>
                <th>Tanggal Pinjam</th><th>Batas Pengembalian</th><th>Tanggal Kembali</th>
                <th>Status</th><th>Denda</th><th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="loan-table-empty" colSpan={10}><LoaderCircle size={17} className="book-stock-spinner" />Memuat transaksi peminjaman...</td></tr>
              ) : loans.length ? loans.map((loan, index) => (
                <tr key={loan.id}>
                  <td>{(page - 1) * pageSize + index + 1}</td>
                  <td><span className="loan-id-badge">PJM-{String(loan.id).padStart(5, '0')}</span></td>
                  <td><div className="loan-member-cell"><b>{loan.member_name}</b><small>{loan.nis_nisn ? `NIS/NISN ${loan.nis_nisn}` : 'NIS belum diisi'}</small></div></td>
                  <td><div className="loan-book-cell"><b>{loan.book_title}</b><small>Serial {loan.serial_number}</small></div></td>
                  <td>{formatDate(loan.borrow_date)}</td>
                  <td>{formatDate(loan.due_date)}</td>
                  <td>{formatDate(loan.return_date)}</td>
                  <td><span className={`loan-status-badge ${statusClass(loan.status)}`}>{loan.status}</span></td>
                  <td>
                    <div className="loan-fine-cell">
                      <b>{currencyFormat.format(loan.display_fine)}</b>
                      {loan.status === 'Dikembalikan' && loan.display_fine > 0 && <small>{loan.fine_status === 'paid' ? 'Lunas' : loan.fine_status === 'waived' ? 'Dibebaskan' : 'Belum dibayar'}</small>}
                      {loan.status === 'Terlambat' && loan.display_fine > 0 && <small>Estimasi berjalan</small>}
                    </div>
                  </td>
                  <td>
                    <div className="loan-row-actions">
                      {canManage && loan.status === 'Pending' && (
                        <>
                          <button type="button" className="loan-action-button is-approve" title="Setujui peminjaman" aria-label={`Setujui peminjaman ${loan.id}`} disabled={busyLoanId === loan.id} onClick={() => processPending(loan, 'Borrowed')}><Check size={15} /></button>
                          <button type="button" className="loan-action-button is-reject" title="Tolak peminjaman" aria-label={`Tolak peminjaman ${loan.id}`} disabled={busyLoanId === loan.id} onClick={() => processPending(loan, 'Rejected')}><X size={15} /></button>
                        </>
                      )}
                      {canManage && ['Dipinjam', 'Terlambat'].includes(loan.status) && (
                        <button type="button" className="loan-action-button is-return" title="Proses pengembalian" aria-label={`Proses pengembalian ${loan.id}`} disabled={busyLoanId === loan.id} onClick={() => processReturn(loan)}><RotateCcw size={15} /></button>
                      )}
                      {(!canManage || !['Pending', 'Dipinjam', 'Terlambat'].includes(loan.status)) && '—'}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td className="loan-table-empty" colSpan={10}>{search || statusFilter ? 'Tidak ada transaksi yang sesuai dengan pencarian atau filter.' : 'Belum ada transaksi peminjaman.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="catalog-pagination">
          <span>Halaman {pagination.totalPages ? page : 0} dari {pagination.totalPages} · {numberFormat.format(pagination.total)} transaksi</span>
          <div>
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={loading || page <= 1} aria-label="Halaman sebelumnya"><ChevronLeft size={15} /></button>
            <button type="button" onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={loading || page >= pagination.totalPages} aria-label="Halaman berikutnya"><ChevronRight size={15} /></button>
          </div>
        </footer>
      </section>

      {createOpen && <NewLoanModal
        account={account}
        role={role}
        durationDays={loanDurationDays}
        scanBehavior={scanBehavior}
        onClose={() => setCreateOpen(false)}
        onSave={submitLoan}
      />}
    </div>
  );
}
