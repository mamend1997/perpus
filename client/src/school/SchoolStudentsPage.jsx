import { useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import {
  Download, FileSpreadsheet, LoaderCircle, Pencil, Plus, Printer, Search, Trash2, Upload, Users
} from 'lucide-react';
import SchoolConfirmDialog from './SchoolConfirmDialog.jsx';
import {
  createStudent, deleteStudent, deleteStudents, fetchStudentClasses, fetchStudents,
  importStudents, updateStudent
} from './schoolStudentApi.js';

const pageSize = 25;
const templateHeaders = ['NIS/NISN', 'Nama Lengkap', 'Email', 'Kata Sandi', 'Kelas/Rombel', 'Jenis Kelamin', 'No. WhatsApp', 'Status'];
const emptyStudent = { nis_nisn: '', name: '', email: '', password: '', rombel: '', gender: '', phone: '', status: 'active' };

function studentStatusLabel(status) {
  return ({ active: 'Aktif', inactive: 'Nonaktif', blocked: 'Diblokir' })[status] || status;
}

function genderLabel(gender) {
  return ({ male: 'Laki-laki', female: 'Perempuan', other: 'Lainnya' })[gender] || '—';
}

function cellText(cell) {
  if (cell?.text != null) return String(cell.text).trim();
  if (cell?.value == null) return '';
  if (typeof cell.value === 'object' && cell.value.text) return String(cell.value.text).trim();
  return String(cell.value).trim();
}

function StudentForm({ student, onClose, onSave }) {
  const [form, setForm] = useState(student ? { ...emptyStudent, ...student, password: '' } : emptyStudent);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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
      <section className="master-modal student-form-modal" role="dialog" aria-modal="true" aria-labelledby="student-form-title">
        <header className="master-modal-heading"><div><span className="library-eyebrow">DATA ANGGOTA</span><h2 id="student-form-title">{student ? 'Edit Data Siswa' : 'Tambah Siswa'}</h2></div><button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form">×</button></header>
        {error && <div className="library-error" role="alert">{error}</div>}
        <form className="student-form-grid" onSubmit={submit}>
          <label>NIS / NISN<input value={form.nis_nisn || ''} onChange={(event) => setForm((value) => ({ ...value, nis_nisn: event.target.value }))} maxLength={40} required /></label>
          <label>Nama Lengkap<input value={form.name || ''} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} maxLength={180} required /></label>
          <label>Email (opsional)<input type="email" value={form.email || ''} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} maxLength={190} /></label>
          <label>Kelas / Rombel<input value={form.rombel || ''} onChange={(event) => setForm((value) => ({ ...value, rombel: event.target.value }))} maxLength={80} placeholder="Contoh: X TKJ 1" /></label>
          <label>Jenis Kelamin<select value={form.gender || ''} onChange={(event) => setForm((value) => ({ ...value, gender: event.target.value }))}><option value="">Pilih</option><option value="male">Laki-laki</option><option value="female">Perempuan</option><option value="other">Lainnya</option></select></label>
          <label>Kontak WhatsApp<input type="tel" value={form.phone || ''} onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))} maxLength={30} /></label>
          <label>Status Akun<select value={form.status || 'active'} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value }))}><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="blocked">Diblokir</option></select></label>
          <label className="student-form-wide">Kata Sandi {student ? '(isi hanya jika ingin mengganti)' : ''}
            <input type="password" autoComplete="new-password" value={form.password || ''} onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))} minLength={8} required={!student} />
            <small>Minimal 8 karakter, huruf besar, angka, dan simbol.</small>
          </label>
          <footer className="master-modal-actions student-form-wide">
            <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving}>{saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Plus size={15} />}{saving ? 'Menyimpan...' : 'Simpan Data'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function ImportStudentsModal({ onClose, onImport }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function parseFile(file) {
    setError('');
    setRows([]);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 5 * 1024 * 1024) {
      setError('Pilih file .xlsx dengan ukuran maksimal 5 MB.');
      return;
    }
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet || sheet.rowCount < 2) throw new Error('File belum memiliki baris data siswa.');
      const headers = sheet.getRow(1).values.slice(1).map((value) => String(value || '').trim().toLocaleLowerCase('id-ID'));
      const requiredHeaders = ['nis/nisn', 'nama lengkap', 'kata sandi', 'kelas/rombel', 'jenis kelamin', 'no. whatsapp', 'status'];
      const indexes = Object.fromEntries(requiredHeaders.map((header) => [header, headers.indexOf(header)]));
      const missingHeaders = requiredHeaders.filter((header) => indexes[header] < 0);
      if (missingHeaders.length) throw new Error(`Kolom wajib tidak ditemukan: ${missingHeaders.join(', ')}.`);
      const emailIndex = headers.indexOf('email');
      const importedRows = [];
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const values = row.values.slice(1);
        if (values.every((value) => value == null || value === '')) continue;
        const genderRaw = cellText(row.getCell(indexes['jenis kelamin'] + 1)).toLocaleLowerCase('id-ID');
        const statusRaw = cellText(row.getCell(indexes.status + 1)).toLocaleLowerCase('id-ID');
        const gender = genderRaw === 'laki-laki' || genderRaw === 'male' ? 'male'
          : genderRaw === 'perempuan' || genderRaw === 'female' ? 'female'
            : genderRaw === 'lainnya' || genderRaw === 'other' ? 'other' : '';
        const status = !statusRaw || statusRaw === 'aktif' || statusRaw === 'active' ? 'active'
          : statusRaw === 'nonaktif' || statusRaw === 'inactive' ? 'inactive'
            : statusRaw === 'diblokir' || statusRaw === 'blocked' ? 'blocked' : '';
        if (genderRaw && !gender) throw new Error(`Baris ${rowNumber}: jenis kelamin tidak dikenali.`);
        if (!status) throw new Error(`Baris ${rowNumber}: status harus Aktif, Nonaktif, atau Diblokir.`);
        importedRows.push({
          nis_nisn: cellText(row.getCell(indexes['nis/nisn'] + 1)),
          name: cellText(row.getCell(indexes['nama lengkap'] + 1)),
          email: emailIndex < 0 ? '' : cellText(row.getCell(emailIndex + 1)),
          password: cellText(row.getCell(indexes['kata sandi'] + 1)),
          rombel: cellText(row.getCell(indexes['kelas/rombel'] + 1)),
          gender,
          phone: cellText(row.getCell(indexes['no. whatsapp'] + 1)),
          status
        });
      }
      if (!importedRows.length || importedRows.length > 500) throw new Error('Jumlah baris data harus antara 1 sampai 500 siswa.');
      setRows(importedRows);
      setFileName(file.name);
    } catch (parseError) {
      setError(parseError.message || 'File Excel tidak dapat dibaca.');
    }
  }

  async function downloadTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data Siswa');
    sheet.addRow(templateHeaders);
    sheet.columns = templateHeaders.map(() => ({ width: 22 }));
    const output = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'template-data-siswa.xlsx';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await onImport(rows);
    } catch (importError) {
      setError(importError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="master-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="master-modal student-import-modal" role="dialog" aria-modal="true" aria-labelledby="student-import-title">
        <header className="master-modal-heading"><div><span className="library-eyebrow">IMPORT SISWA</span><h2 id="student-import-title">Import Data Siswa</h2></div><button type="button" className="master-icon-button" onClick={onClose} disabled={busy} aria-label="Tutup import">×</button></header>
        <button type="button" className="master-button master-button-light" onClick={downloadTemplate}><Download size={15} />Unduh Template Excel (.xlsx)</button>
        <label className={`student-import-drop ${dragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void parseFile(event.dataTransfer.files?.[0]); }}>
          <Upload size={23} /><b>Seret file ke sini atau klik untuk mencari</b><span>{fileName || 'Format .xlsx, maksimal 5 MB; data akan ditinjau sebelum diimpor.'}</span>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { void parseFile(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
        {error && <div className="library-error" role="alert">{error}</div>}
        {rows.length > 0 && <div className="student-import-preview">
          <div className="catalog-table-heading"><div><h3>Pratinjau {rows.length} siswa</h3><p>Periksa kolom sebelum menekan tombol import.</p></div></div>
          <div className="master-table-scroll"><table className="master-table"><thead><tr>{templateHeaders.filter((header) => header !== 'Kata Sandi').map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 10).map((row, index) => <tr key={`${row.nis_nisn}-${index}`}><td>{row.nis_nisn}</td><td>{row.name}</td><td>{row.email || '—'}</td><td>{row.rombel || '—'}</td><td>{genderLabel(row.gender)}</td><td>{row.phone || '—'}</td><td>{studentStatusLabel(row.status)}</td></tr>)}</tbody>
          </table></div>
          {rows.length > 10 && <small>Menampilkan 10 baris pertama; total {rows.length} siswa akan diimpor.</small>}
        </div>}
        <footer className="master-modal-actions">
          <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={busy}>Batal</button>
          <button type="button" className="master-button master-button-primary" onClick={submit} disabled={busy || !rows.length}>{busy ? <LoaderCircle size={15} className="book-stock-spinner" /> : <FileSpreadsheet size={15} />}{busy ? 'Mengimpor...' : `Import ${rows.length || ''} Siswa`}</button>
        </footer>
      </section>
    </div>
  );
}

export default function SchoolStudentsPage({ rights }) {
  const canEdit = Boolean(rights?.edit);
  const canDelete = Boolean(rights?.delete);
  const [tab, setTab] = useState('students');
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState({});
  const [editor, setEditor] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [pdfRows, setPdfRows] = useState(null);
  const selectedIds = Object.keys(selected);
  const allVisibleSelected = students.length > 0 && students.every((student) => Boolean(selected[String(student.id)]));
  const columnCount = 7 + (canDelete ? 1 : 0) + (canEdit || canDelete ? 1 : 0);

  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(queryInput.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timeout);
  }, [queryInput]);

  useEffect(() => {
    setSelected({});
  }, [page, search, classFilter, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    fetchStudentClasses(controller.signal)
      .then(({ classes: result }) => { if (!controller.signal.aborted) setClasses(result || []); })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); });
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchStudents({ page, limit: pageSize, search, rombel: classFilter, status: statusFilter, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setStudents(result.students || []);
        setPagination(result.pagination || { page: 1, total: 0, totalPages: 0 });
        if (result.pagination?.totalPages && page > result.pagination.totalPages) setPage(result.pagination.totalPages);
      })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, search, classFilter, statusFilter, refreshKey]);

  useEffect(() => {
    if (!pdfRows) return undefined;
    const timer = window.setTimeout(() => window.print(), 100);
    return () => window.clearTimeout(timer);
  }, [pdfRows]);

  useEffect(() => {
    function clearPrintRows() {
      setPdfRows(null);
    }
    window.addEventListener('afterprint', clearPrintRows);
    return () => window.removeEventListener('afterprint', clearPrintRows);
  }, []);

  async function saveStudent(data) {
    if (editor?.id) await updateStudent(editor.id, data);
    else await createStudent(data);
    setEditor(null);
    setNotice(editor?.id ? 'Data siswa berhasil diperbarui.' : 'Data siswa berhasil ditambahkan.');
    setRefreshKey((value) => value + 1);
  }

  async function runImport(rows) {
    const result = await importStudents(rows);
    setImportOpen(false);
    setNotice(result.message);
    setPage(1);
    setRefreshKey((value) => value + 1);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const result = deleteTarget === 'selected'
        ? await deleteStudents(selectedIds)
        : await deleteStudent(deleteTarget.id);
      setNotice(result.message);
      setDeleteTarget(null);
      setSelected({});
      setRefreshKey((value) => value + 1);
    } catch (failure) {
      setDeleteError(failure.message);
    } finally {
      setDeleting(false);
    }
  }

  async function exportExcel() {
    setExporting(true);
    setError('');
    try {
      const first = await fetchStudents({ page: 1, limit: 100, search, rombel: classFilter, status: statusFilter });
      const allStudents = [...(first.students || [])];
      for (let currentPage = 2; currentPage <= (first.pagination?.totalPages || 0); currentPage += 1) {
        const result = await fetchStudents({ page: currentPage, limit: 100, search, rombel: classFilter, status: statusFilter });
        allStudents.push(...(result.students || []));
      }
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Data Siswa');
      sheet.addRow(['NIS/NISN', 'Nama Lengkap', 'Email', 'Kelas/Rombel', 'Jenis Kelamin', 'No. WhatsApp', 'Status Akun']);
      allStudents.forEach((student) => sheet.addRow([
        student.nis_nisn, student.name, student.email, student.rombel, genderLabel(student.gender), student.phone, studentStatusLabel(student.status)
      ]));
      sheet.columns = [18, 30, 30, 18, 18, 20, 16].map((width) => ({ width }));
      const output = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'data-siswa.xlsx';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(`Export Excel gagal: ${exportError.message}`);
    } finally {
      setExporting(false);
    }
  }

  async function exportPdf() {
    setExporting(true);
    setError('');
    try {
      const first = await fetchStudents({ page: 1, limit: 100, search, rombel: classFilter, status: statusFilter });
      const allStudents = [...(first.students || [])];
      for (let currentPage = 2; currentPage <= (first.pagination?.totalPages || 0); currentPage += 1) {
        const result = await fetchStudents({ page: currentPage, limit: 100, search, rombel: classFilter, status: statusFilter });
        allStudents.push(...(result.students || []));
      }
      setPdfRows(allStudents);
    } catch (exportError) {
      setError(`Export PDF gagal: ${exportError.message}`);
    } finally {
      setExporting(false);
    }
  }

  function toggleVisibleStudents(checked) {
    setSelected((current) => {
      const next = { ...current };
      students.forEach((student) => {
        const id = String(student.id);
        if (checked) next[id] = student;
        else delete next[id];
      });
      return next;
    });
  }

  const selectedClass = useMemo(() => classes.find((item) => item.className === classFilter), [classes, classFilter]);

  return (
    <div className="library-module-page school-students-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">MASTER DATA</span>
        <h1>Data Siswa &amp; Rombel</h1>
        <p>Kelola akun anggota perpustakaan, kelompokkan berdasarkan kelas, dan pantau status akun.</p>
      </header>
      {notice && <div className="master-message master-message-success" role="status">{notice}</div>}
      {error && <div className="library-error" role="alert">{error}</div>}

      <div className="school-student-tabs" role="tablist" aria-label="Data siswa dan rombel">
        <button type="button" role="tab" aria-selected={tab === 'students'} className={tab === 'students' ? 'selected' : ''} onClick={() => setTab('students')}><Users size={16} />Data Siswa <span>{pagination.total}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'classes'} className={tab === 'classes' ? 'selected' : ''} onClick={() => setTab('classes')}>Data Rombel / Kelas <span>{classes.length}</span></button>
      </div>

      {tab === 'students' ? (
        <>
          <section className="catalog-toolbar-panel student-toolbar">
            <label className="master-search student-search"><Search size={16} /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Cari Siswa..." maxLength={100} /></label>
            <label>Kelas / Rombel
              <select value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setPage(1); }}>
                <option value="">Semua Kelas</option>{classes.map((item) => <option key={item.className} value={item.className}>{item.className}</option>)}
              </select>
            </label>
            <label>Status
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">Semua Status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="blocked">Diblokir</option></select>
            </label>
            <div className="student-toolbar-actions">
              <button type="button" className="master-button master-button-light" onClick={exportExcel} disabled={exporting}><Download size={15} />{exporting ? 'Mengekspor...' : 'Export Excel'}</button>
              <button type="button" className="master-button master-button-light" onClick={exportPdf} disabled={exporting}><Printer size={15} />Export PDF</button>
              {canEdit && <button type="button" className="master-button master-button-light" onClick={() => setImportOpen(true)}><FileSpreadsheet size={15} />Import Excel</button>}
              {canEdit && <button type="button" className="master-button master-button-primary" onClick={() => setEditor({ ...emptyStudent })}><Plus size={15} />Tambah Siswa</button>}
              {canDelete && selectedIds.length > 0 && <button type="button" className="master-button procurement-delete-selected" onClick={() => { setDeleteError(''); setDeleteTarget('selected'); }}><Trash2 size={15} />Hapus Terpilih ({selectedIds.length})</button>}
            </div>
          </section>

          <section className="master-data-panel student-table-panel">
            <div className="school-settings-panel-heading"><div><h2>Daftar Siswa</h2><p>{pagination.total.toLocaleString('id-ID')} anggota perpustakaan</p></div></div>
            <div className="master-table-scroll">
              <table className="master-table student-table">
                <thead><tr>{canDelete && <th className="student-checkbox"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleVisibleStudents(event.target.checked)} aria-label="Pilih semua siswa di halaman ini" /></th>}
                  <th>No</th><th>NIS / NISN</th><th>Nama Lengkap</th><th>Kelas / Rombel</th><th>Jenis Kelamin</th><th>Kontak WhatsApp</th><th>Status Akun</th>{(canEdit || canDelete) && <th>Aksi</th>}
                </tr></thead>
                <tbody>
                  {loading ? <tr><td className="master-empty-cell" colSpan={columnCount}>Memuat data siswa...</td></tr>
                    : students.length === 0 ? <tr><td className="master-empty-cell" colSpan={columnCount}>Tidak ada data siswa yang cocok.</td></tr>
                      : students.map((student, index) => <tr key={student.id}>
                        {canDelete && <td className="student-checkbox"><input type="checkbox" checked={Boolean(selected[String(student.id)])} onChange={(event) => setSelected((current) => {
                          const next = { ...current };
                          if (event.target.checked) next[String(student.id)] = student;
                          else delete next[String(student.id)];
                          return next;
                        })} aria-label={`Pilih ${student.name}`} /></td>}
                        <td>{(page - 1) * pageSize + index + 1}</td><td>{student.nis_nisn}</td><td><b>{student.name}</b></td><td>{student.rombel || 'Belum diatur'}</td>
                        <td>{genderLabel(student.gender)}</td><td>{student.phone || '—'}</td><td><span className={`master-status ${student.status === 'active' ? 'is-active' : 'is-inactive'}`}>{studentStatusLabel(student.status)}</span></td>
                        {(canEdit || canDelete) && <td><div className="student-row-actions">{canEdit && <button type="button" className="master-icon-button" title="Edit siswa" onClick={() => setEditor(student)}><Pencil size={15} /></button>}{canDelete && <button type="button" className="master-icon-button" title="Hapus siswa" onClick={() => { setDeleteError(''); setDeleteTarget(student); }}><Trash2 size={15} /></button>}</div></td>}
                      </tr>)}
                </tbody>
              </table>
            </div>
            <footer className="catalog-pagination"><span>Halaman {pagination.totalPages ? page : 0} dari {Math.max(1, pagination.totalPages)}</span><div>
              <button type="button" className="master-icon-button" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Halaman sebelumnya">‹</button>
              <button type="button" className="master-icon-button" disabled={loading || page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)} aria-label="Halaman berikutnya">›</button>
            </div></footer>
          </section>
        </>
      ) : (
        <section className="master-data-panel student-classes-panel">
          <div className="school-settings-panel-heading"><div><h2>Data Rombel / Kelas</h2><p>Jumlah siswa dikelompokkan berdasarkan nama kelas.</p></div></div>
          <div className="master-table-scroll"><table className="master-table"><thead><tr><th>No</th><th>Nama Rombel</th><th>Jumlah Siswa</th><th>Akun Aktif</th><th>Aksi</th></tr></thead>
            <tbody>{classes.length ? classes.map((item, index) => <tr key={item.className}><td>{index + 1}</td><td><b>{item.className}</b></td><td>{item.studentCount}</td><td>{item.activeCount}</td><td><button type="button" className="master-button master-button-light" onClick={() => { setClassFilter(item.className); setPage(1); setTab('students'); }}>Lihat Siswa</button></td></tr>)
              : <tr><td className="master-empty-cell" colSpan={5}>Belum ada data rombel.</td></tr>}</tbody>
          </table></div>
        </section>
      )}

      <section className="school-student-print-heading"><h1>Data Siswa {selectedClass ? `· ${selectedClass.className}` : ''}</h1><p>PerpusKita · Rekapitulasi anggota perpustakaan</p></section>
      {pdfRows && <section className="school-student-print-sheet">
        <header><h1>Rekapitulasi Data Siswa</h1><p>PerpusKita · {classFilter || 'Semua Kelas'} · {new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}</p></header>
        <table className="master-table"><thead><tr><th>No</th><th>NIS / NISN</th><th>Nama Lengkap</th><th>Kelas / Rombel</th><th>Jenis Kelamin</th><th>Kontak WhatsApp</th><th>Status Akun</th></tr></thead>
          <tbody>{pdfRows.length ? pdfRows.map((student, index) => <tr key={student.id}><td>{index + 1}</td><td>{student.nis_nisn}</td><td>{student.name}</td><td>{student.rombel || 'Belum diatur'}</td><td>{genderLabel(student.gender)}</td><td>{student.phone || '—'}</td><td>{studentStatusLabel(student.status)}</td></tr>)
            : <tr><td colSpan={7}>Tidak ada data siswa yang cocok.</td></tr>}</tbody>
        </table>
      </section>}
      {editor && <StudentForm student={editor.id ? editor : null} onClose={() => setEditor(null)} onSave={saveStudent} />}
      {importOpen && <ImportStudentsModal onClose={() => setImportOpen(false)} onImport={runImport} />}
      {deleteTarget && <SchoolConfirmDialog
        title={deleteTarget === 'selected' ? 'Hapus siswa terpilih?' : 'Hapus data siswa?'}
        message={deleteTarget === 'selected' ? `${selectedIds.length} siswa akan dihapus permanen.` : 'Data siswa akan dihapus permanen jika tidak terikat pada riwayat transaksi.'}
        itemName={deleteTarget === 'selected' ? `${selectedIds.length} siswa terpilih` : deleteTarget.name}
        loading={deleting}
        error={deleteError}
        onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(''); } }}
        onConfirm={confirmDelete}
      />}
    </div>
  );
}
