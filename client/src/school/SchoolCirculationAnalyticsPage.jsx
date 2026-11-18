import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, BookOpen, CalendarDays, Download, FileBarChart2, RefreshCw, RotateCcw, Wallet
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';
import { fetchCirculationAnalytics } from './schoolCirculationAnalyticsApi.js';

const palette = ['#f97316', '#3b82f6', '#14b8a6', '#8b5cf6', '#eab308', '#ec4899', '#06b6d4', '#84cc16'];
const countFormat = new Intl.NumberFormat('id-ID');
const currencyFormat = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

function localDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function initialCustomRange() {
  const today = new Date();
  return { start: localDateValue(new Date(today.getFullYear(), today.getMonth(), 1)), end: localDateValue(today) };
}

function getRange(period, customStart, customEnd) {
  const end = new Date();
  const start = new Date(end);
  if (period === 'week') {
    start.setDate(end.getDate() - ((end.getDay() + 6) % 7));
  } else if (period === 'month') {
    start.setDate(1);
  } else if (period === 'year') {
    start.setMonth(0, 1);
  } else if (period !== 'today') {
    return { startDate: customStart, endDate: customEnd };
  }
  return { startDate: localDateValue(start), endDate: localDateValue(end) };
}

function roleLabel(role) {
  return ({ member: 'Member', kepsek: 'Kepala Sekolah', kapus: 'Kepala Perpustakaan', admin: 'Admin' })[role] || role;
}

function number(value) {
  return countFormat.format(Number(value) || 0);
}

async function exportAnalytics(data) {
  const module = await import('exceljs');
  const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PerpusKita';
  workbook.created = new Date();
  const headerStyle = (sheet) => {
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
    header.alignment = { vertical: 'middle' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const summary = workbook.addWorksheet('Ringkasan');
  summary.columns = [
    { header: 'Metrik', key: 'metric', width: 34 },
    { header: 'Nilai', key: 'value', width: 24 }
  ];
  summary.addRows([
    { metric: 'Periode', value: `${data.period.startDate} s.d. ${data.period.endDate}` },
    { metric: 'Total buku dipinjam', value: data.stats.totalBorrowed },
    { metric: 'Dikembalikan tepat waktu', value: data.stats.returnedOnTime },
    { metric: 'Dikembalikan terlambat', value: data.stats.returnedLate },
    { metric: 'Akumulasi denda', value: data.stats.fineAmount },
    { metric: 'Denda dibayar', value: data.stats.finePaidAmount },
    { metric: 'Eksemplar aktif', value: data.stats.totalCopies },
    { metric: 'Tingkat perputaran koleksi (%)', value: data.stats.turnoverRate }
  ]);
  headerStyle(summary);

  const trend = workbook.addWorksheet('Tren Sirkulasi');
  trend.columns = [
    { header: 'Periode', key: 'bucket', width: 16 },
    { header: 'Peminjaman', key: 'borrowed', width: 18 },
    { header: 'Pengembalian', key: 'returned', width: 18 }
  ];
  trend.addRows(data.trend);
  headerStyle(trend);

  const collections = workbook.addWorksheet('Koleksi Terfavorit');
  collections.columns = [
    { header: 'Koleksi', key: 'name', width: 34 },
    { header: 'Jumlah peminjaman', key: 'borrowCount', width: 22 }
  ];
  collections.addRows(data.topCollections);
  headerStyle(collections);

  const members = workbook.addWorksheet('Anggota Teraktif');
  members.columns = [
    { header: 'Nama anggota', key: 'name', width: 32 },
    { header: 'Role', key: 'role', width: 24 },
    { header: 'Jumlah peminjaman', key: 'borrowCount', width: 22 }
  ];
  members.addRows(data.topMembers.map((member) => ({ ...member, role: roleLabel(member.role) })));
  headerStyle(members);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `analitik-sirkulasi-${data.period.startDate}-${data.period.endDate}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

function AnalyticsPrintReport({ data, schoolName, onClose }) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 250);
    window.addEventListener('afterprint', onClose);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div className="circulation-print-report">
      <header>
        <h1>{schoolName || 'Perpustakaan Sekolah'}</h1>
        <h2>Laporan Analitik Sirkulasi</h2>
        <p>Periode {data.period.startDate} s.d. {data.period.endDate}</p>
      </header>
      <h3>Ringkasan</h3>
      <table>
        <tbody>
          <tr><th>Total buku dipinjam</th><td>{number(data.stats.totalBorrowed)}</td></tr>
          <tr><th>Dikembalikan tepat waktu</th><td>{number(data.stats.returnedOnTime)}</td></tr>
          <tr><th>Dikembalikan terlambat</th><td>{number(data.stats.returnedLate)}</td></tr>
          <tr><th>Total denda dikenakan</th><td>{currencyFormat.format(data.stats.fineAmount)}</td></tr>
          <tr><th>Pendapatan denda</th><td>{currencyFormat.format(data.stats.finePaidAmount)}</td></tr>
          <tr><th>Tingkat perputaran koleksi</th><td>{data.stats.turnoverRate}%</td></tr>
        </tbody>
      </table>
      <h3>Tren Peminjaman dan Pengembalian</h3>
      <table>
        <thead><tr><th>Periode</th><th>Peminjaman</th><th>Pengembalian</th></tr></thead>
        <tbody>{data.trend.filter((row) => row.borrowed || row.returned).map((row) => (
          <tr key={row.bucket}><td>{row.label}</td><td>{number(row.borrowed)}</td><td>{number(row.returned)}</td></tr>
        ))}</tbody>
      </table>
      <h3>Koleksi Terfavorit</h3>
      <table>
        <thead><tr><th>Koleksi</th><th>Jumlah peminjaman</th></tr></thead>
        <tbody>{data.topCollections.map((row) => (
          <tr key={row.name}><td>{row.name}</td><td>{number(row.borrowCount)}</td></tr>
        ))}</tbody>
      </table>
      <h3>Anggota Teraktif</h3>
      <table>
        <thead><tr><th>Nama</th><th>Role</th><th>Jumlah peminjaman</th></tr></thead>
        <tbody>{data.topMembers.map((row) => (
          <tr key={row.id}><td>{row.name}</td><td>{roleLabel(row.role)}</td><td>{number(row.borrowCount)}</td></tr>
        ))}</tbody>
      </table>
    </div>,
    document.body
  );
}

export default function SchoolCirculationAnalyticsPage({ rights, schoolName }) {
  const [period, setPeriod] = useState('month');
  const [customRange, setCustomRange] = useState(initialCustomRange);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const range = useMemo(
    () => getRange(period, customRange.start, customRange.end),
    [period, customRange.start, customRange.end]
  );
  const validRange = Boolean(range.startDate && range.endDate && range.startDate <= range.endDate);
  const canView = Boolean(rights?.view);

  useEffect(() => {
    if (!validRange) {
      setLoading(false);
      setAnalytics(null);
      setError('Tanggal mulai harus terisi dan tidak boleh melewati tanggal akhir.');
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchCirculationAnalytics({ ...range, signal: controller.signal })
      .then(setAnalytics)
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range, retry, validRange]);

  async function handleExcelExport() {
    if (!analytics) return;
    setExporting(true);
    setError('');
    try {
      await exportAnalytics(analytics);
    } catch (exportError) {
      setError(`Laporan Excel gagal dibuat: ${exportError.message}`);
    } finally {
      setExporting(false);
    }
  }

  if (!canView) {
    return <div className="library-error" role="alert">Anda tidak memiliki izin untuk melihat analitik sirkulasi.</div>;
  }

  const stats = analytics?.stats;
  const cards = [
    { label: 'Total Buku Dipinjam', value: number(stats?.totalBorrowed), icon: BookOpen, tone: 'orange' },
    { label: 'Dikembalikan Tepat Waktu', value: number(stats?.returnedOnTime), icon: RotateCcw, tone: 'green' },
    { label: 'Dikembalikan Terlambat', value: number(stats?.returnedLate), icon: CalendarDays, tone: 'blue' },
    { label: 'Pendapatan Denda', value: currencyFormat.format(stats?.finePaidAmount || 0), icon: Wallet, tone: 'violet' },
    { label: 'Perputaran Koleksi', value: `${number(stats?.turnoverRate)}%`, icon: Activity, tone: 'teal' }
  ];

  return (
    <div className="library-module-page circulation-analytics-page">
      <header className="library-module-heading circulation-analytics-heading">
        <div>
          <span className="library-eyebrow">SIRKULASI BUKU</span>
          <h1>Analitik Sirkulasi</h1>
          <p>Ringkasan peminjaman, pengembalian, denda, dan aktivitas anggota perpustakaan.</p>
        </div>
        <div className="circulation-report-actions">
          <button type="button" className="master-button master-button-light" disabled={!analytics || loading || exporting} onClick={handleExcelExport}>
            <Download size={15} />{exporting ? 'Menyiapkan...' : 'Export Excel'}
          </button>
          <button type="button" className="master-button master-button-primary" disabled={!analytics || loading} onClick={() => setPrintOpen(true)}>
            <FileBarChart2 size={15} />Cetak / PDF
          </button>
        </div>
      </header>

      <section className="circulation-filter-panel">
        <label>
          Periode
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="today">Hari ini</option>
            <option value="week">Minggu ini</option>
            <option value="month">Bulan ini</option>
            <option value="year">Tahun ini</option>
            <option value="custom">Rentang tanggal</option>
          </select>
        </label>
        {period === 'custom' && (
          <>
            <label>Tanggal mulai<input type="date" value={customRange.start} onChange={(event) => setCustomRange((current) => ({ ...current, start: event.target.value }))} /></label>
            <label>Tanggal akhir<input type="date" value={customRange.end} onChange={(event) => setCustomRange((current) => ({ ...current, end: event.target.value }))} /></label>
          </>
        )}
        {analytics && <span className="circulation-filter-range"><CalendarDays size={15} />{analytics.period.startDate} — {analytics.period.endDate}</span>}
        {error && <button type="button" className="circulation-retry-button" onClick={() => setRetry((current) => current + 1)}><RefreshCw size={14} />Coba lagi</button>}
      </section>

      {error && <div className="master-message master-message-error circulation-error" role="alert">{error}</div>}

      <section className="circulation-kpi-grid" aria-label="Ringkasan metrik sirkulasi">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <article className={`circulation-kpi-card ${tone}`} key={label}>
            <span className="circulation-kpi-icon"><Icon size={18} /></span>
            <div><small>{label}</small><b>{loading && !analytics ? 'Memuat…' : value}</b></div>
          </article>
        ))}
      </section>

      <section className="circulation-charts-grid">
        <article className="library-panel circulation-chart-panel circulation-trend-panel">
          <div className="library-panel-heading"><div><span className="library-eyebrow">AKTIVITAS</span><h2>Tren Peminjaman &amp; Pengembalian</h2></div></div>
          {analytics?.trend.length ? (
            <div className="circulation-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.trend} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}>
                  <CartesianGrid stroke="#edf0f5" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#8791a3', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fill: '#8791a3', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value, name) => [name === 'Peminjaman' || name === 'Pengembalian' ? number(value) : value, name]} />
                  <Legend />
                  <Bar dataKey="borrowed" name="Peminjaman" fill="#f97316" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="returned" name="Pengembalian" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="circulation-chart-empty">{loading ? 'Memuat grafik…' : 'Belum ada aktivitas pada periode ini.'}</div>}
        </article>

        <article className="library-panel circulation-chart-panel">
          <div className="library-panel-heading"><div><span className="library-eyebrow">KOLEKSI</span><h2>Kategori Terfavorit</h2></div></div>
          {analytics?.topCollections.length ? (
            <div className="circulation-chart circulation-donut-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={analytics.topCollections} dataKey="borrowCount" nameKey="name" innerRadius="54%" outerRadius="78%" paddingAngle={3}>
                    {analytics.topCollections.map((entry, index) => <Cell key={entry.name} fill={palette[index % palette.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => [number(value), 'Peminjaman']} />
                  <Legend verticalAlign="bottom" height={40} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="circulation-chart-empty">{loading ? 'Memuat grafik…' : 'Belum ada data koleksi untuk periode ini.'}</div>}
        </article>
      </section>

      <section className="library-panel circulation-members-panel">
        <div className="library-panel-heading"><div><span className="library-eyebrow">ANGGOTA</span><h2>Peminjam Teraktif</h2></div><span className="circulation-top-count">Top {analytics?.topMembers.length || 0}</span></div>
        <div className="master-table-scroll">
          <table className="master-table circulation-members-table">
            <thead><tr><th>No</th><th>Nama Anggota</th><th>Role</th><th>Jumlah Peminjaman</th></tr></thead>
            <tbody>
              {analytics?.topMembers.length ? analytics.topMembers.map((member, index) => (
                <tr key={member.id}>
                  <td>{index + 1}</td><td><b className="master-primary-text">{member.name}</b></td>
                  <td><span className="circulation-role-badge">{roleLabel(member.role)}</span></td>
                  <td><b className="circulation-loan-count">{number(member.borrowCount)}</b></td>
                </tr>
              )) : <tr><td className="master-empty-cell" colSpan={4}>{loading ? 'Memuat anggota…' : 'Belum ada data peminjaman anggota.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {printOpen && analytics && <AnalyticsPrintReport data={analytics} schoolName={schoolName} onClose={() => setPrintOpen(false)} />}
    </div>
  );
}
