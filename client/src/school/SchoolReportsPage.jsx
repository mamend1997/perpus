import { useEffect, useMemo, useState } from 'react';
import { Download, FileBarChart2, LoaderCircle, Printer, Search } from 'lucide-react';
import ExcelJS from 'exceljs';
import { fetchAcademicYears } from './schoolAcademicYearApi.js';
import { fetchSchoolReport } from './schoolReportApi.js';

const reportTypes = [
  { key: 'loans', label: 'Sirkulasi & Peminjaman' },
  { key: 'fines', label: 'Denda' },
  { key: 'visitors', label: 'Kunjungan' },
  { key: 'inventory', label: 'Inventaris Buku' }
];
const pageSize = 25;

function todayDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthStart() {
  return `${todayDate().slice(0, 8)}01`;
}

function formatValue(value, key) {
  if (value == null || value === '') return '—';
  if (['fine_amount', 'total_fine', 'collected', 'outstanding'].includes(key)) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value));
  }
  if (key === 'fine_status') return ({ paid: 'Lunas', unpaid: 'Belum lunas', waived: 'Dibebaskan' })[value] || value;
  return value;
}

function summaryCards(type, summary) {
  const formatMoney = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
  if (type === 'loans') return [
    ['Total Transaksi', summary.total],
    ['Peminjaman Berjalan', summary.active],
    ['Dikembalikan', summary.returned],
    ['Terlambat', summary.overdue]
  ];
  if (type === 'fines') return [
    ['Transaksi Berdenda', summary.total],
    ['Akumulasi Denda', formatMoney(summary.total_fine)],
    ['Denda Terkumpul', formatMoney(summary.collected)],
    ['Belum Lunas', formatMoney(summary.outstanding)]
  ];
  if (type === 'visitors') return [
    ['Total Kunjungan', summary.total],
    ['Pengunjung Unik', summary.unique_visitors]
  ];
  return [
    ['Judul Buku', summary.total_titles],
    ['Total Eksemplar', summary.total_items],
    ['Tersedia', summary.available_items],
    ['Dipinjam / Rusak', `${Number(summary.borrowed_items || 0)} / ${Number(summary.damaged_items || 0)}`]
  ];
}

export default function SchoolReportsPage({ rights }) {
  const [type, setType] = useState('loans');
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(todayDate);
  const [academicYearId, setAcademicYearId] = useState('');
  const [className, setClassName] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [report, setReport] = useState(null);
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  function printReport() {
    const cleanup = () => {
      document.body.classList.remove('is-printing-school-reports');
      window.removeEventListener('afterprint', cleanup);
    };
    document.body.classList.add('is-printing-school-reports');
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(queryInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    const controller = new AbortController();
    fetchAcademicYears(controller.signal)
      .then(({ years: results }) => { if (!controller.signal.aborted) setYears(results || []); })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchSchoolReport({
      type, startDate, endDate, academicYearId, className: className.trim(), search, page, limit: pageSize
    }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setReport(result);
        if (result.pagination?.totalPages && page > result.pagination.totalPages) setPage(result.pagination.totalPages);
      })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [type, startDate, endDate, academicYearId, className, search, page]);

  const cards = useMemo(() => summaryCards(type, report?.summary || {}), [type, report]);
  const title = reportTypes.find((item) => item.key === type)?.label || 'Laporan';

  async function exportExcel() {
    if (!report) return;
    setExporting(true);
    setError('');
    try {
      const allRows = [];
      const totalPages = Math.ceil((report.pagination?.total || 0) / 100);
      for (let currentPage = 1; currentPage <= totalPages; currentPage += 1) {
        const pageResult = await fetchSchoolReport({
          type, startDate, endDate, academicYearId, className: className.trim(), search, page: currentPage, limit: 100
        });
        allRows.push(...(pageResult.rows || []));
      }
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(title.slice(0, 31));
      const addHeaderRow = (text, { fontSize = 12, bold = false, italic = false, align = 'center' } = {}) => {
        const row = sheet.addRow([text]);
        if (report.columns.length > 1) sheet.mergeCells(row.number, 1, row.number, report.columns.length);
        row.font = { size: fontSize, bold, italic };
        row.alignment = { horizontal: align };
      };
      if (report.school.letterhead?.mode === 'manual') {
        report.school.letterhead.lines.forEach((line) => addHeaderRow(line.text, {
          fontSize: line.fontSize,
          bold: line.bold,
          italic: line.italic,
          align: line.align
        }));
      } else {
        addHeaderRow(report.school.name, { fontSize: 16, bold: true });
        if (report.school.address || report.school.npsn) {
          addHeaderRow([report.school.address, report.school.npsn && `NPSN ${report.school.npsn}`].filter(Boolean).join(' · '), { fontSize: 10 });
        }
      }
      addHeaderRow(`Laporan ${title}`, { fontSize: 14, bold: true });
      addHeaderRow(`Periode ${report.dateRange.startDate} s.d. ${report.dateRange.endDate}`, { fontSize: 11 });
      sheet.addRow([]);
      sheet.addRow(report.columns.map((column) => column.label));
      allRows.forEach((row) => sheet.addRow(report.columns.map((column) => formatValue(row[column.key], column.key))));
      sheet.columns.forEach((column) => { column.width = Math.min(34, Math.max(14, ...sheet.getColumn(column.number).values.map((value) => String(value || '').length + 2))); });
      const output = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `laporan-${type}-${report.dateRange.startDate}-${report.dateRange.endDate}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(`Export Excel gagal: ${exportError.message}`);
    } finally {
      setExporting(false);
    }
  }

  if (!rights?.view) return <div className="library-error" role="alert">Anda tidak memiliki izin melihat laporan.</div>;

  return (
    <div className="library-module-page school-reports-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">ANALISIS PERPUSTAKAAN</span>
        <h1>Laporan Perpustakaan</h1>
        <p>Pratinjau dan ekspor laporan sirkulasi, denda, kunjungan, serta inventaris.</p>
      </header>
      {error && <div className="library-error" role="alert">{error}</div>}

      <div className="school-report-tabs" role="tablist" aria-label="Jenis laporan">
        {reportTypes.map((item) => <button type="button" key={item.key} role="tab" aria-selected={type === item.key} className={type === item.key ? 'selected' : ''} onClick={() => { setType(item.key); setPage(1); }}>
          <FileBarChart2 size={15} />{item.label}
        </button>)}
      </div>

      <section className="library-panel school-report-filter-panel">
        <label>Tahun Pelajaran
          <select value={academicYearId} onChange={(event) => { setAcademicYearId(event.target.value); setPage(1); }}>
            <option value="">Pilih rentang tanggal manual</option>
            {years.map((year) => <option key={year.id} value={year.id}>{year.label}{year.isActive ? ' · Aktif' : ''}</option>)}
          </select>
        </label>
        <label>Dari Tanggal
          <input type="date" value={startDate} onChange={(event) => { setAcademicYearId(''); setStartDate(event.target.value); setPage(1); }} disabled={Boolean(academicYearId)} />
        </label>
        <label>Sampai Tanggal
          <input type="date" value={endDate} onChange={(event) => { setAcademicYearId(''); setEndDate(event.target.value); setPage(1); }} disabled={Boolean(academicYearId)} />
        </label>
        {type !== 'inventory' && <label>Kelas / Rombel
          <input value={className} onChange={(event) => { setClassName(event.target.value); setPage(1); }} maxLength={80} placeholder="Semua kelas" />
        </label>}
        <label className="school-report-search"><span>Cari data</span><span className="master-search"><Search size={15} /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Kata kunci..." maxLength={100} /></span></label>
        <div className="school-report-actions">
          <button type="button" className="master-button master-button-light" onClick={printReport} disabled={!report}><Printer size={15} />Cetak / PDF</button>
          <button type="button" className="master-button master-button-primary" onClick={exportExcel} disabled={exporting || loading || !report}>
            {exporting ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Download size={15} />}{exporting ? 'Mengekspor...' : 'Export Excel'}
          </button>
        </div>
      </section>

      <section className="school-report-summary" aria-label="Ringkasan laporan">
        {cards.map(([label, value]) => <article className="library-stat-card" key={label}><div><small>{label}</small><b>{report ? value : '—'}</b></div></article>)}
      </section>

      <section className="library-panel school-report-table-panel">
        <div className="school-report-print-heading">
          {report?.school?.logo && <img src={report.school.logo} alt="" />}
          {report?.school?.letterhead?.mode === 'manual' ? (
            <div className="school-report-letterhead-content is-manual">
              {report.school.letterhead.lines.map((line, index) => <span key={`report-letterhead-${index + 1}`} style={{
                fontSize: `${line.fontSize}px`,
                fontWeight: line.bold ? 700 : 400,
                fontStyle: line.italic ? 'italic' : 'normal',
                textAlign: line.align
              }}>{line.text || '\u00a0'}</span>)}
              <b>LAPORAN {title.toUpperCase()}</b><small>Periode {report?.dateRange?.startDate} s.d. {report?.dateRange?.endDate}</small>
            </div>
          ) : <div className="school-report-letterhead-content">
            <h2>{report?.school?.name || 'Sekolah'}</h2>
            <p>{report?.school?.address || ''}{report?.school?.npsn ? ` · NPSN ${report.school.npsn}` : ''}</p>
            <b>LAPORAN {title.toUpperCase()}</b><small>Periode {report?.dateRange?.startDate} s.d. {report?.dateRange?.endDate}</small>
          </div>}
        </div>
        <div className="catalog-table-heading"><div><h2>Data Preview · {title}</h2><p>{report?.pagination?.total?.toLocaleString('id-ID') || 0} baris</p></div></div>
        <div className="master-table-scroll">
          <table className="master-table school-report-table">
            <thead><tr>{(report?.columns || []).map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td className="master-empty-cell" colSpan={report?.columns?.length || 1}>Memuat data laporan...</td></tr>
                : !report?.rows?.length ? <tr><td className="master-empty-cell" colSpan={report?.columns?.length || 1}>Tidak ada data pada periode dan filter ini.</td></tr>
                  : report.rows.map((row, index) => <tr key={row.id || `${page}-${index}`}>{report.columns.map((column) => <td key={column.key}>{formatValue(row[column.key], column.key)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
        <footer className="catalog-pagination">
          <span>Halaman {report?.pagination?.totalPages ? page : 0} dari {Math.max(1, report?.pagination?.totalPages || 0)}</span>
          <div>
            <button type="button" className="master-icon-button" aria-label="Halaman sebelumnya" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button>
            <button type="button" className="master-icon-button" aria-label="Halaman berikutnya" disabled={loading || page >= (report?.pagination?.totalPages || 0)} onClick={() => setPage((value) => value + 1)}>›</button>
          </div>
        </footer>
        <div className="school-report-signatures">
          <div><span>Mengetahui,</span><b>Kepala Sekolah</b><strong>{report?.school?.principal_name || '________________________'}</strong><small>NIP. {report?.school?.principal_nip || '________________'}</small></div>
          <div><span>{[report?.school?.letterhead?.signaturePlace, new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date())].filter(Boolean).join(', ')}</span><b>Kepala Perpustakaan</b><strong>{report?.school?.librarian_name || '________________________'}</strong><small>NIP. {report?.school?.librarian_nip || '________________'}</small></div>
        </div>
      </section>
    </div>
  );
}
