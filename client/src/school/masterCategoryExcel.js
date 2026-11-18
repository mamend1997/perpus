const workbookMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function loadExcelJS() {
  const module = await import('exceljs');
  return module.default || module;
}

function createWorkbookSheet(ExcelJS, title, columns) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PerpusKita';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(title);
  sheet.columns = columns;
  const header = sheet.getRow(1);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3156AB' } };
    cell.alignment = { vertical: 'middle' };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return { workbook, sheet };
}

async function downloadWorkbook(workbook, filename) {
  const data = await workbook.xlsx.writeBuffer();
  const blob = new Blob([data], { type: workbookMime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadMasterTemplate(type) {
  const isAuthor = type === 'pengarang';
  const isAgent = type === 'agen';
  const isCodeLess = type === 'jenis' || type === 'koleksi' || type === 'topik' || type === 'penerbit';
  const columns = isAgent
    ? [
      { header: 'Nama Agen', key: 'name', width: 32 },
      { header: 'Email', key: 'email', width: 34 },
      { header: 'No Telp', key: 'phone', width: 20 },
      { header: 'Alamat', key: 'address', width: 48 },
      { header: 'Status', key: 'status', width: 18 }
    ]
    : isAuthor
      ? [
        { header: 'Nama', key: 'name', width: 32 },
        { header: 'Biodata', key: 'description', width: 48 },
        { header: 'Status', key: 'status', width: 18 }
      ]
      : isCodeLess
        ? [
          { header: 'Nama', key: 'name', width: 32 },
          { header: 'Keterangan', key: 'description', width: 48 },
          { header: 'Status', key: 'status', width: 18 }
        ]
      : [
        { header: 'Kode', key: 'code', width: 20, style: { numFmt: '@' } },
        { header: 'Nama', key: 'name', width: 32 },
        { header: 'Keterangan', key: 'description', width: 48 },
        { header: 'Status', key: 'status', width: 18 }
      ];
  const ExcelJS = await loadExcelJS();
  const { workbook } = createWorkbookSheet(ExcelJS, 'Master Data', columns);
  await downloadWorkbook(workbook, `template-master-${type}.xlsx`);
}

export async function downloadMasterExport(type, rows) {
  const isAuthor = type === 'pengarang';
  const isAgent = type === 'agen';
  const isCodeLess = type === 'jenis' || type === 'koleksi' || type === 'topik' || type === 'penerbit';
  const columns = isAgent
    ? [
      { header: 'No', key: 'number', width: 9 },
      { header: 'Nama Agen', key: 'name', width: 32 },
      { header: 'Email', key: 'email', width: 34 },
      { header: 'No Telp', key: 'phone', width: 20 },
      { header: 'Alamat', key: 'address', width: 48 },
      { header: 'Status', key: 'status', width: 18 }
    ]
    : isAuthor
      ? [
      { header: 'No', key: 'number', width: 9 },
      { header: 'Nama', key: 'name', width: 32 },
      { header: 'Biodata', key: 'description', width: 48 },
      { header: 'Status', key: 'status', width: 18 }
      ]
    : isCodeLess
      ? [
        { header: 'No', key: 'number', width: 9 },
        { header: 'Nama', key: 'name', width: 32 },
        { header: 'Keterangan', key: 'description', width: 48 },
        { header: 'Status', key: 'status', width: 18 }
      ]
      : [
      { header: 'No', key: 'number', width: 9 },
      { header: 'Kode', key: 'code', width: 20, style: { numFmt: '@' } },
      { header: 'Nama', key: 'name', width: 32 },
      { header: 'Keterangan', key: 'description', width: 48 },
      { header: 'Status', key: 'status', width: 18 }
    ];
  const ExcelJS = await loadExcelJS();
  const { workbook, sheet } = createWorkbookSheet(ExcelJS, 'Master Data', columns);
  rows.forEach((row, index) => {
    const exportRow = {
      number: index + 1,
      name: row.name,
      description: row.description || '',
      email: row.email || '',
      phone: row.phone || '',
      address: row.address || '',
      status: row.status === 'active' ? 'Aktif' : 'Nonaktif'
    };
    if (!isAuthor && !isAgent && !isCodeLess) exportRow.code = row.code || '';
    sheet.addRow(exportRow);
  });
  await downloadWorkbook(workbook, `master-${type}.xlsx`);
}

function cellText(cell) {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text).trim();
    if ('richText' in value) return value.richText.map((item) => item.text).join('').trim();
    if ('result' in value) return String(value.result ?? '').trim();
    return '';
  }
  return String(value).trim();
}

function normalizeHeader(value) {
  return value.toLocaleLowerCase('id-ID').replace(/[\s_-]/g, '');
}

export async function parseMasterImport(file, type) {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Ukuran file maksimal 5 MB.');
  }
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    throw new Error('File Excel harus memiliki baris header dan minimal satu data.');
  }
  if (sheet.rowCount - 1 > 500) {
    throw new Error('Impor dibatasi maksimal 500 baris data.');
  }

  const headerColumns = new Map();
  sheet.getRow(1).eachCell((cell, column) => {
    headerColumns.set(normalizeHeader(cellText(cell)), column);
  });
  const columns = {
    code: headerColumns.get('kode') || headerColumns.get('code'),
    name: headerColumns.get('nama') || headerColumns.get('namaagen') || headerColumns.get('name'),
    description: headerColumns.get('keterangan') || headerColumns.get('biodata') || headerColumns.get('description'),
    email: headerColumns.get('email'),
    phone: headerColumns.get('notelp') || headerColumns.get('nomortelepon') || headerColumns.get('telepon') || headerColumns.get('phone'),
    address: headerColumns.get('alamat') || headerColumns.get('address'),
    status: headerColumns.get('status')
  };
  if (!columns.name) {
    throw new Error('Kolom Nama tidak ditemukan. Gunakan template Excel Master Data.');
  }

  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const imported = {
      name: cellText(row.getCell(columns.name)),
      code: type === 'agen' || type === 'pengarang' || type === 'jenis' || type === 'koleksi' || type === 'topik' || type === 'penerbit' ? '' : columns.code ? cellText(row.getCell(columns.code)) : '',
      description: type === 'agen' ? '' : columns.description ? cellText(row.getCell(columns.description)) : '',
      email: type === 'agen' && columns.email ? cellText(row.getCell(columns.email)) : '',
      phone: type === 'agen' && columns.phone ? cellText(row.getCell(columns.phone)) : '',
      address: type === 'agen' && columns.address ? cellText(row.getCell(columns.address)) : '',
      status: columns.status ? cellText(row.getCell(columns.status)) : ''
    };
    if (!imported.code && !imported.name && !imported.description && !imported.email && !imported.phone && !imported.address && !imported.status) continue;

    const status = imported.status.toLocaleLowerCase('id-ID');
    if (!status || ['aktif', 'active'].includes(status)) imported.status = 'active';
    else if (['nonaktif', 'tidak aktif', 'inactive'].includes(status)) imported.status = 'inactive';
    else throw new Error(`Status pada baris ${rowNumber} harus Aktif atau Nonaktif.`);
    rows.push(imported);
  }
  if (rows.length === 0) throw new Error('Tidak ada baris data untuk diimpor.');
  if (rows.length > 500) throw new Error('Impor dibatasi maksimal 500 baris data.');
  if (new Blob([JSON.stringify(rows)]).size > 900 * 1024) {
    throw new Error('Ukuran data terlalu besar untuk satu kali impor. Kurangi panjang keterangan atau jumlah baris.');
  }
  return rows;
}
