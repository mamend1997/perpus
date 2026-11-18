export const defaultSchoolLetterhead = {
  mode: 'identity',
  logo: null,
  lines: Array.from({ length: 5 }, () => ({
    text: '',
    fontSize: 14,
    bold: false,
    italic: false,
    align: 'center'
  }))
};

const fontSizes = new Set([10, 12, 14, 16, 18, 20, 24, 28, 32]);

export function validateSchoolLetterhead(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !['identity', 'manual'].includes(value.mode)
    || !Array.isArray(value.lines) || value.lines.length !== 5) {
    return null;
  }
  const logo = value.logo == null || value.logo === '' ? null : value.logo;
  const validLogo = logo === null || (typeof logo === 'string'
    && logo.length <= 700000
    && (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo)
      || /^https?:\/\/\S+$/i.test(logo)));
  if (!validLogo) return null;
  const lines = value.lines.map((line) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)
      || typeof line.text !== 'string' || line.text.length > 180
      || !Number.isInteger(line.fontSize) || !fontSizes.has(line.fontSize)
      || typeof line.bold !== 'boolean' || typeof line.italic !== 'boolean'
      || !['left', 'center'].includes(line.align)) {
      return null;
    }
    return {
      text: line.text.trim(),
      fontSize: line.fontSize,
      bold: line.bold,
      italic: line.italic,
      align: line.align
    };
  });
  if (lines.some((line) => !line)) return null;
  return { mode: value.mode, logo, lines };
}

export function parseSchoolLetterhead(value) {
  if (value == null || value === '') return defaultSchoolLetterhead;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Konfigurasi kop sekolah tersimpan tidak valid.');
  }
  const validated = validateSchoolLetterhead(parsed);
  if (!validated) throw new Error('Konfigurasi kop sekolah tersimpan tidak valid.');
  return validated;
}
