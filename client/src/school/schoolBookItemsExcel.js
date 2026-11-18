export async function downloadBookItemsExcel(items) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Eksemplar');
  worksheet.columns = [
    { header: 'No', key: 'number', width: 8 },
    { header: 'Serial Number', key: 'serial_number', width: 20 },
    { header: 'Judul Buku', key: 'book_title', width: 42 },
    { header: 'Nomor Induk', key: 'nomor_induk', width: 20 },
    { header: 'Kode/Nomor Panggil', key: 'kode_buku', width: 24 },
    { header: 'Status', key: 'status', width: 16 }
  ];
  items.forEach((item, index) => {
    worksheet.addRow({ number: index + 1, ...item });
  });
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = { from: 'A1', to: `F${Math.max(items.length + 1, 1)}` };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `data-eksemplar-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
