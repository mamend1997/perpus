import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultSchoolLetterhead, parseSchoolLetterhead, validateSchoolLetterhead
} from './school-letterhead.js';

test('accepts a manual letterhead with five formatted lines', () => {
  const letterhead = {
    mode: 'manual',
    logo: null,
    signaturePlace: '',
    lines: defaultSchoolLetterhead.lines.map((line, index) => ({
      ...line,
      text: `Baris ${index + 1}`,
      bold: index === 0,
      align: index === 1 ? 'left' : 'center'
    }))
  };
  assert.deepEqual(validateSchoolLetterhead(letterhead), letterhead);
});

test('preserves a configured signature place and trims surrounding whitespace', () => {
  const letterhead = {
    ...defaultSchoolLetterhead,
    signaturePlace: '  Cikoneng  '
  };
  assert.equal(validateSchoolLetterhead(letterhead).signaturePlace, 'Cikoneng');
});

test('rejects invalid line count and formatting values', () => {
  assert.equal(validateSchoolLetterhead({ mode: 'manual', lines: [] }), null);
  const invalid = {
    mode: 'manual',
    lines: defaultSchoolLetterhead.lines.map((line) => ({ ...line, align: 'right' }))
  };
  assert.equal(validateSchoolLetterhead(invalid), null);
});

test('uses identity mode for an unset setting and reports malformed stored JSON', () => {
  assert.deepEqual(parseSchoolLetterhead(null), defaultSchoolLetterhead);
  assert.throws(() => parseSchoolLetterhead('{invalid'), /Konfigurasi kop sekolah tersimpan tidak valid/);
});
