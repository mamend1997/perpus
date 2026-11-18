import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Eye, FileSpreadsheet,
  LoaderCircle, LogIn, Printer, RefreshCw, Search, Users, X
} from 'lucide-react';
import { checkInVisitor, fetchVisitorRecords, searchVisitorMembers } from './schoolVisitorApi.js';
import CameraBarcodeScanner from './CameraBarcodeScanner.jsx';
import SchoolPrintHeader from './SchoolPrintHeader.jsx';

const pageSize = 25;
const visitPurposes = [
  'Membaca Buku',
  'Meminjam / Mengembalikan Buku',
  'Mengerjakan Tugas / Browsing',
  'Diskusi Kelompok',
  'Lainnya'
];
const numberFormat = new Intl.NumberFormat('id-ID');

function localDateValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

function formatVisitTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function visitorClassName(visitor) {
  const classInfo = visitor.rombel ? ` · ${visitor.rombel}` : '';
  return `${visitor.nis_nisn ? `NIS/NISN ${visitor.nis_nisn}` : 'NIS belum diisi'}${classInfo}`;
}

function VisitorPreviewModal({ visit, onClose }) {
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
      <section className="master-modal visitor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="visitor-preview-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">DETAIL KUNJUNGAN</span><h2 id="visitor-preview-title">{visit.visitor_name}</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} aria-label="Tutup detail"><X size={18} /></button>
        </header>
        <dl className="master-preview-details">
          <div className="master-preview-detail"><dt>Waktu Masuk</dt><dd>{formatVisitTime(visit.visit_date)}</dd></div>
          <div className="master-preview-detail"><dt>NIS / NISN</dt><dd>{visit.nis_nisn || '—'}</dd></div>
          <div className="master-preview-detail"><dt>Rombel / Kelas</dt><dd>{visit.rombel || '—'}</dd></div>
          <div className="master-preview-detail"><dt>Keperluan</dt><dd>{visit.purpose || '—'}</dd></div>
        </dl>
        <footer className="master-modal-actions"><button type="button" className="master-button master-button-muted" onClick={onClose}>Tutup</button></footer>
      </section>
    </div>,
    document.body
  );
}

export default function SchoolVisitorsPage({ rights, role, account, schoolName, schoolIdentity }) {
  const canEdit = Boolean(rights?.edit);
  const canViewRecords = Boolean(rights?.view) && role !== 'member';
  const isMember = role === 'member';
  const [activeTab, setActiveTab] = useState('kiosk');
  const [memberSearch, setMemberSearch] = useState('');
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(() => isMember && account?.id
    ? { id: account.id, name: account.name, nis_nisn: account.nis_nisn || '', rombel: account.rombel || '' }
    : null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [otherPurpose, setOtherPurpose] = useState('');
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInError, setCheckInError] = useState('');
  const [successVisit, setSuccessVisit] = useState(null);
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(localDateValue);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [exporting, setExporting] = useState('');
  const [previewVisit, setPreviewVisit] = useState(null);
  const [printRows, setPrintRows] = useState(null);
  const memberInputRef = useRef(null);

  useEffect(() => {
    if (isMember || !canEdit || memberSearch.trim().length < 2) {
      setMembers([]);
      setMemberLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setMemberLoading(true);
      searchVisitorMembers(memberSearch.trim(), controller.signal)
        .then((results) => {
          if (controller.signal.aborted) return;
          setMembers(results);
          const term = memberSearch.trim().toLocaleLowerCase('id-ID');
          const exact = results.filter((member) => [member.name, member.nis_nisn]
            .some((value) => String(value || '').toLocaleLowerCase('id-ID') === term));
          if (exact.length === 1) {
            setSelectedMember(exact[0]);
            setMemberSearch('');
            setMembers([]);
          }
        })
        .catch((error) => {
          if (error.name !== 'AbortError') setCheckInError(error.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setMemberLoading(false);
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canEdit, isMember, memberSearch]);

  useEffect(() => {
    if (!successVisit) return undefined;
    const timer = window.setTimeout(() => setSuccessVisit(null), 6000);
    return () => window.clearTimeout(timer);
  }, [successVisit]);

  useEffect(() => {
    if (!isMember && activeTab === 'kiosk' && !selectedMember) memberInputRef.current?.focus();
  }, [activeTab, isMember, selectedMember]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (activeTab !== 'records' || !canViewRecords) return undefined;
    const controller = new AbortController();
    setRecordsLoading(true);
    setRecordsError('');
    fetchVisitorRecords({ page, limit: pageSize, search, date, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setRecords(result.visits || []);
        setPagination(result.pagination || { page: 1, total: 0, totalPages: 0 });
        if (result.pagination?.totalPages && page > result.pagination.totalPages) {
          setPage(result.pagination.totalPages);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setRecordsError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRecordsLoading(false);
      });
    return () => controller.abort();
  }, [activeTab, canViewRecords, page, search, date, refreshKey]);

  useEffect(() => {
    if (!printRows) return undefined;
    const timer = window.setTimeout(() => window.print(), 150);
    const afterPrint = () => {
      setPrintRows(null);
      setExporting('');
    };
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', afterPrint);
    };
  }, [printRows]);

  function chooseMember(member) {
    setSelectedMember(member);
    setMemberSearch('');
    setMembers([]);
    setCheckInError('');
  }

  async function submitCheckIn(event) {
    event.preventDefault();
    if (!canEdit) {
      setCheckInError('Anda tidak memiliki izin untuk mencatat kunjungan.');
      return;
    }
    const visitPurpose = purpose === 'Lainnya' ? otherPurpose.trim() : purpose;
    if (!selectedMember || !visitPurpose) {
      setCheckInError('Pilih anggota dan keperluan kunjungan terlebih dahulu.');
      return;
    }
    setCheckInLoading(true);
    setCheckInError('');
    try {
      const result = await checkInVisitor({ userId: selectedMember.id, purpose: visitPurpose });
      setSuccessVisit(result.visit);
      setPurpose('');
      setOtherPurpose('');
      if (!isMember) {
        setSelectedMember(null);
        memberInputRef.current?.focus();
      }
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setCheckInError(error.message);
    } finally {
      setCheckInLoading(false);
    }
  }

  async function loadAllRecords() {
    const first = await fetchVisitorRecords({ page: 1, limit: 100, search, date });
    const allRecords = [...(first.visits || [])];
    for (let currentPage = 2; currentPage <= (first.pagination?.totalPages || 0); currentPage += 1) {
      const result = await fetchVisitorRecords({ page: currentPage, limit: 100, search, date });
      allRecords.push(...(result.visits || []));
    }
    return allRecords;
  }

  async function exportExcel() {
    setExporting('excel');
    setRecordsError('');
    try {
      const allRecords = await loadAllRecords();
      const module = await import('exceljs');
      const ExcelJS = module.default || module;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'PerpusKita';
      const sheet = workbook.addWorksheet('Kunjungan');
      sheet.columns = [
        { header: 'No', key: 'number', width: 8 },
        { header: 'Waktu Masuk', key: 'visitTime', width: 25 },
        { header: 'Nama Pengunjung', key: 'name', width: 30 },
        { header: 'NIS / NISN', key: 'nis', width: 20 },
        { header: 'Rombel / Kelas', key: 'rombel', width: 20 },
        { header: 'Keperluan', key: 'purpose', width: 38 }
      ];
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
      allRecords.forEach((visit, index) => sheet.addRow({
        number: index + 1,
        visitTime: formatVisitTime(visit.visit_date),
        name: visit.visitor_name,
        nis: visit.nis_nisn || '',
        rombel: visit.rombel || '',
        purpose: visit.purpose
      }));
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `laporan-kunjungan-${date || 'semua-tanggal'}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setRecordsError(error.message || 'Ekspor Excel gagal dibuat.');
    } finally {
      setExporting('');
    }
  }

  async function printReport() {
    setExporting('pdf');
    setRecordsError('');
    try {
      setPrintRows(await loadAllRecords());
    } catch (error) {
      setRecordsError(error.message || 'Laporan gagal disiapkan untuk dicetak.');
      setExporting('');
    }
  }

  const printExporting = exporting === 'pdf';

  return (
    <div className="library-module-page visitors-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">LAYANAN PERPUSTAKAAN</span>
        <h1>Buku Tamu Digital</h1>
        <p>Catat kunjungan dengan cepat dan pantau rekap aktivitas pengunjung perpustakaan.</p>
      </header>

      <div className="visitor-tabs" role="tablist" aria-label="Buku tamu">
        <button type="button" role="tab" aria-selected={activeTab === 'kiosk'} className={activeTab === 'kiosk' ? 'selected' : ''} onClick={() => setActiveTab('kiosk')}>
          <LogIn size={15} />Check-in
        </button>
        {canViewRecords && <button type="button" role="tab" aria-selected={activeTab === 'records'} className={activeTab === 'records' ? 'selected' : ''} onClick={() => setActiveTab('records')}>
          <Users size={15} />Rekap Kunjungan
        </button>}
      </div>

      {activeTab === 'kiosk' ? (
        <section className="visitor-kiosk-panel">
          <div className="visitor-kiosk-heading">
            <span className="visitor-kiosk-icon"><Users size={22} /></span>
            <div><span className="library-eyebrow">CHECK-IN MANDIRI</span><h2>Selamat datang di perpustakaan</h2><p>Masukkan NIS/NISN atau scan barcode kartu pelajar.</p></div>
          </div>
          {successVisit && <div className="visitor-welcome-card" role="status" aria-live="polite">
            <span className="visitor-welcome-check"><Check size={23} /></span>
            <div><b>Selamat Datang, {successVisit.visitor_name}!</b><small>Kunjungan tercatat pukul {formatVisitTime(successVisit.visit_date)}.</small></div>
          </div>}
          <form className="visitor-checkin-form" onSubmit={submitCheckIn}>
            {isMember ? (
              <div className="visitor-member-selected">
                <div><small>Anggota</small><b>{selectedMember?.name || 'Akun anggota'}</b><span>{selectedMember ? visitorClassName(selectedMember) : ''}</span></div>
                <Check size={17} />
              </div>
            ) : selectedMember ? (
              <div className="visitor-member-selected">
                <div><small>Pengunjung terpilih</small><b>{selectedMember.name}</b><span>{visitorClassName(selectedMember)}</span></div>
                <button type="button" onClick={() => { setSelectedMember(null); memberInputRef.current?.focus(); }} aria-label="Ganti pengunjung"><X size={16} /></button>
              </div>
            ) : (
              <div className="visitor-picker">
                <label className="visitor-input-label" htmlFor="visitor-member-search">NIS / NISN / Nama</label>
                <label className="master-search visitor-search">
                  <Search size={17} />
                  <input
                    id="visitor-member-search"
                    ref={memberInputRef}
                    value={memberSearch}
                    onChange={(event) => { setMemberSearch(event.target.value); setCheckInError(''); }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        if (!members.length) return;
                        const term = memberSearch.trim().toLocaleLowerCase('id-ID');
                        const exact = members.find((member) => [member.name, member.nis_nisn]
                          .some((value) => String(value || '').toLocaleLowerCase('id-ID') === term));
                        if (exact || members.length === 1) chooseMember(exact || members[0]);
                      }
                    }}
                    placeholder="Ketik NIS/NISN atau scan barcode kartu"
                    autoComplete="off"
                    required
                    disabled={!canEdit}
                  />
                  {memberLoading && <LoaderCircle size={16} className="book-stock-spinner" />}
                </label>
                <CameraBarcodeScanner label="Scan kamera kartu anggota" onScan={(value) => {
                  setMemberSearch(value);
                  setSelectedMember(null);
                  setCheckInError('');
                }} />
                {members.length > 0 && <div className="visitor-member-results" role="listbox" aria-label="Hasil pencarian anggota">
                  {members.map((member) => <button type="button" key={member.id} role="option" onClick={() => chooseMember(member)}>
                    <b>{member.name}</b><small>{visitorClassName(member)}</small>
                  </button>)}
                </div>}
              </div>
            )}

            <label className="visitor-purpose-field">Keperluan Kunjungan
              <select value={purpose} onChange={(event) => {
                setPurpose(event.target.value);
                if (event.target.value !== 'Lainnya') setOtherPurpose('');
              }} required disabled={!canEdit}>
                <option value="">Pilih keperluan kunjungan</option>
                {visitPurposes.map((visitPurpose) => <option key={visitPurpose} value={visitPurpose}>{visitPurpose}</option>)}
              </select>
            </label>
            {purpose === 'Lainnya' && <label className="visitor-purpose-field">Tuliskan keperluan kunjungan
              <input value={otherPurpose} onChange={(event) => setOtherPurpose(event.target.value)} maxLength={255} required disabled={!canEdit} placeholder="Masukkan keperluan lainnya" />
            </label>}
            {checkInError && <p className="master-form-error" role="alert">{checkInError}</p>}
            {!canEdit && <p className="visitor-readonly-note">Akun Anda belum diberi izin untuk mencatat kunjungan.</p>}
            <button type="submit" className="master-button master-button-primary visitor-checkin-button" disabled={!canEdit || checkInLoading || !selectedMember}>
              {checkInLoading ? <><LoaderCircle size={17} className="book-stock-spinner" />Mencatat...</> : <><LogIn size={17} />Check-in / Masuk</>}
            </button>
          </form>
        </section>
      ) : (
        <section className="library-panel visitor-records-panel">
          <div className="visitor-records-toolbar">
            <label className="master-search visitor-record-search">
              <Search size={16} />
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Cari nama, NIS/NISN, kelas, atau keperluan..." aria-label="Cari kunjungan" />
            </label>
            <label className="visitor-date-filter"><CalendarDays size={15} />Tanggal
              <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} />
            </label>
            <div className="visitor-export-actions">
              <button type="button" className="master-button master-button-violet" onClick={exportExcel} disabled={Boolean(exporting)}><FileSpreadsheet size={15} />{exporting === 'excel' ? 'Mengekspor...' : 'Export Excel'}</button>
              <button type="button" className="master-button master-button-light" onClick={printReport} disabled={Boolean(exporting)}><Printer size={15} />{printExporting ? 'Menyiapkan...' : 'Cetak / PDF'}</button>
            </div>
          </div>

          {recordsError && <div className="library-error" role="alert"><span>{recordsError}</span><button type="button" onClick={() => setRefreshKey((current) => current + 1)}><RefreshCw size={14} />Coba lagi</button></div>}
          <div className="catalog-table-heading">
            <div><span className="library-eyebrow">REKAPITULASI</span><h2>Kunjungan {date ? formatDate(date) : 'Semua Tanggal'}</h2></div>
            <span>{numberFormat.format(pagination.total)} kunjungan</span>
          </div>
          <div className="visitor-table-scroll">
            <table className="visitor-table">
              <thead><tr><th>No</th><th>Waktu Masuk</th><th>Nama Pengunjung</th><th>NIS / Rombel</th><th>Perlunya</th><th>Aksi</th></tr></thead>
              <tbody>
                {recordsLoading ? (
                  <tr><td className="loan-table-empty" colSpan={6}><LoaderCircle size={17} className="book-stock-spinner" />Memuat rekap kunjungan...</td></tr>
                ) : records.length ? records.map((visit, index) => (
                  <tr key={visit.id}>
                    <td>{(page - 1) * pageSize + index + 1}</td>
                    <td>{formatVisitTime(visit.visit_date)}</td>
                    <td><b className="visitor-record-name">{visit.visitor_name}</b></td>
                    <td><div className="loan-member-cell"><b>{visit.nis_nisn || '—'}</b><small>{visit.rombel || 'Rombel belum diisi'}</small></div></td>
                    <td>{visit.purpose || '—'}</td>
                    <td><button type="button" className="master-row-icon is-preview" title="Pratinjau" aria-label={`Pratinjau kunjungan ${visit.visitor_name}`} onClick={() => setPreviewVisit(visit)}><Eye size={14} /></button></td>
                  </tr>
                )) : (
                  <tr><td className="loan-table-empty" colSpan={6}>{search || date ? 'Tidak ada kunjungan yang sesuai dengan filter.' : 'Belum ada data kunjungan.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="catalog-pagination">
            <span>Halaman {pagination.totalPages ? page : 0} dari {pagination.totalPages} · {numberFormat.format(pagination.total)} kunjungan</span>
            <div>
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={recordsLoading || page <= 1} aria-label="Halaman sebelumnya"><ChevronLeft size={15} /></button>
              <button type="button" onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={recordsLoading || page >= pagination.totalPages} aria-label="Halaman berikutnya"><ChevronRight size={15} /></button>
            </div>
          </footer>
        </section>
      )}

      {previewVisit && <VisitorPreviewModal visit={previewVisit} onClose={() => setPreviewVisit(null)} />}
      {printRows && <section className="visitor-print-report" aria-hidden="true">
        <SchoolPrintHeader
          identity={schoolIdentity || { name: schoolName }}
          title="Laporan Kunjungan Perpustakaan"
          subtitle={`Periode: ${date ? formatDate(date) : 'Semua tanggal'} · Total ${numberFormat.format(printRows.length)} kunjungan`}
        />
        <table>
          <thead><tr><th>No</th><th>Waktu Masuk</th><th>Nama Pengunjung</th><th>NIS / NISN</th><th>Rombel / Kelas</th><th>Keperluan</th></tr></thead>
          <tbody>{printRows.map((visit, index) => <tr key={visit.id}>
            <td>{index + 1}</td><td>{formatVisitTime(visit.visit_date)}</td><td>{visit.visitor_name}</td>
            <td>{visit.nis_nisn || '—'}</td><td>{visit.rombel || '—'}</td><td>{visit.purpose || '—'}</td>
          </tr>)}</tbody>
        </table>
      </section>}
    </div>
  );
}
