export const defaultBarcodeLabelSettings = {
  barcodeFormat: 'CODE128',
  serialPrefix: 'S',
  scanBehavior: 'focus',
  labelSize: 'A4',
  columns: 3,
  showLibraryName: true,
  showBarcodeValue: true,
  showSerialNumber: true,
  showBookTitle: true,
  showRackCode: true
};

const barcodeFormats = new Set(['CODE128', 'CODE39', 'EAN13']);
const scanBehaviors = new Set(['focus', 'auto-submit']);
const labelSizes = new Set(['thermal', 'A4', 'F4']);
const labelElements = [
  'showLibraryName',
  'showBarcodeValue',
  'showSerialNumber',
  'showBookTitle',
  'showRackCode'
];

export function normalizeBarcodeLabelSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Pengaturan barcode dan label tidak valid.' };
  }
  const serialPrefix = typeof input.serialPrefix === 'string'
    ? input.serialPrefix.trim().toUpperCase()
    : '';
  const columns = Number(input.columns);
  if (!barcodeFormats.has(input.barcodeFormat)
      || !/^(?:[A-Z0-9][A-Z0-9._-]{0,19})?$/.test(serialPrefix)
      || !scanBehaviors.has(input.scanBehavior)
      || !labelSizes.has(input.labelSize)
      || !Number.isInteger(columns)
      || columns < 1
      || columns > 6
      || labelElements.some((key) => typeof input[key] !== 'boolean')) {
    return { error: 'Periksa format barcode, prefix serial, perilaku scan, ukuran label, kolom, dan elemen label.' };
  }
  return {
    value: {
      barcodeFormat: input.barcodeFormat,
      serialPrefix,
      scanBehavior: input.scanBehavior,
      labelSize: input.labelSize,
      columns,
      ...Object.fromEntries(labelElements.map((key) => [key, input[key]]))
    }
  };
}

export async function readBarcodeLabelSettings(connection, schoolId) {
  const [rows] = await connection.execute(
    'SELECT `value` FROM school_settings WHERE school_id = ? AND `key` = ? LIMIT 1',
    [schoolId, 'barcode_label']
  );
  if (!rows[0]) return { ...defaultBarcodeLabelSettings };

  let stored;
  try {
    stored = JSON.parse(rows[0].value);
  } catch {
    const error = new Error('Pengaturan barcode dan label tersimpan dalam format yang tidak valid.');
    error.status = 500;
    throw error;
  }
  const normalized = normalizeBarcodeLabelSettings(stored);
  if (normalized.error) {
    const error = new Error('Pengaturan barcode dan label tersimpan tidak valid.');
    error.status = 500;
    throw error;
  }
  return normalized.value;
}

export function barcodeValueFromItemId(id) {
  const digits = String(id);
  if (!/^\d+$/.test(digits) || digits.length > 12) {
    throw new Error('ID eksemplar tidak dapat diubah menjadi barcode EAN13.');
  }
  const payload = digits.padStart(12, '0');
  let sum = 0;
  for (let index = 0; index < payload.length; index += 1) {
    sum += Number(payload[index]) * (index % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${payload}${checkDigit}`;
}
