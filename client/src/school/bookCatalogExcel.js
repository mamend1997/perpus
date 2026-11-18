const columns = [
  ['Tanggal Terima', 'received_date'],
  ['Nomor Terima', 'no_terima'],
  ['Nomor Induk', 'nomor_induk'],
  ['Kode/Nomor Panggil', 'kode_buku'],
  ['Judul Buku', 'title'],
  ['Deskripsi Fisik', 'physical_description'],
  ['Pengarang', 'author_name'],
  ['Penerbit', 'publisher_name'],
  ['Agen', 'agent_name'],
  ['Topik', 'topic_name'],
  ['Koleksi', 'collection_name'],
  ['Jenis', 'type_name'],
  ['Bahasa', 'language_name'],
  ['Rak', 'rack_name'],
  ['GMD', 'gmd'],
  ['ISBN', 'isbn'],
  ['Tahun Terbit', 'year'],
  ['Kota Terbit', 'city'],
  ['Asal Barang', 'source'],
  ['Halaman', 'pages'],
  ['Harga', 'price'],
  ['Jumlah', 'qty'],
  ['Deskripsi', 'description'],
  ['Sinopsis', 'synopsis']
];

function normalizeHeader(value) {
  return String(value || '').trim().toLocaleLowerCase('id-ID').replace(/[^a-z0-9]/g, '');
}

function cellValue(cell) {
  const value = cell.value;
  if (value == null) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (value.text != null) return value.text;
    if (value.result != null) return value.result;
    if (Array.isArray(value.richText)) return value.richText.map((item) => item.text || '').join('');
    return '';
  }
  return value;
}

function dateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && value > 0) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return text;
}

export async function downloadBookTemplate() {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Daftar Buku');
  worksheet.columns = columns.map(([header, key]) => ({ header, key, width: Math.min(32, Math.max(16, header.length + 3)) }));
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  const instructions = workbook.addWorksheet('Petunjuk');
  instructions.addRows([
    ['Petunjuk Impor Daftar Pustaka'],
    ['Isi satu buku per baris pada sheet Daftar Buku. Jangan mengubah judul kolom.'],
    ['Nama Pengarang, Penerbit, Agen, Topik, Koleksi, Jenis, Bahasa, dan Rak harus sama dengan Master Data sekolah.'],
    ['Tanggal Terima menggunakan format YYYY-MM-DD. Harga, Tahun Terbit, Halaman, dan Jumlah diisi sebagai angka.'],
    ['Kolom Jumlah adalah jumlah eksemplar yang akan dibuat. Maksimal 500 baris dan 10.000 eksemplar per file.'],
    ['Unggah kembali file berformat .xlsx melalui menu Impor Excel.']
  ]);
  instructions.getRow(1).font = { bold: true, size: 14, color: { argb: 'FFF97316' } };
  instructions.getColumn(1).width = 110;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'template-daftar-pustaka.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}

export async function parseBookImport(file) {
  if (!file || !file.name.toLocaleLowerCase('id-ID').endsWith('.xlsx')) {
    throw new Error('Pilih file Excel dengan format .xlsx.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Ukuran file Excel maksimal 10 MB.');
  }

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) throw new Error('Sheet pertama belum berisi data buku.');

  const headerMap = new Map(columns.map(([header, key]) => [normalizeHeader(header), key]));
  const indexes = new Map();
  worksheet.getRow(1).eachCell((cell, columnNumber) => {
    const key = headerMap.get(normalizeHeader(cellValue(cell)));
    if (key) indexes.set(columnNumber, key);
  });
  if (![...indexes.values()].includes('title')) {
    throw new Error('Kolom "Judul Buku" tidak ditemukan. Gunakan template yang disediakan.');
  }

  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const item = {};
    for (const [columnNumber, key] of indexes) {
      const value = cellValue(row.getCell(columnNumber));
      item[key] = key === 'received_date' ? dateValue(value) : value;
    }
    if (Object.values(item).some((value) => String(value ?? '').trim() !== '')) rows.push(item);
  });
  if (rows.length === 0) throw new Error('Tidak ada baris buku untuk diimpor.');
  if (rows.length > 500) throw new Error('Impor dibatasi maksimal 500 baris buku.');
  return rows;
}
