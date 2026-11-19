import { createHash } from 'node:crypto';

export const validEducationLevels = new Set(['SD', 'MI', 'SMP', 'MTs', 'SMA', 'MA', 'SMK']);

const promotionGrades = {
  SD: { numeric: ['1', '2', '3', '4', '5', '6'], roman: ['I', 'II', 'III', 'IV', 'V', 'VI'] },
  MI: { numeric: ['1', '2', '3', '4', '5', '6'], roman: ['I', 'II', 'III', 'IV', 'V', 'VI'] },
  SMP: { numeric: ['7', '8', '9'], roman: ['VII', 'VIII', 'IX'] },
  MTs: { numeric: ['7', '8', '9'], roman: ['VII', 'VIII', 'IX'] },
  SMA: { numeric: ['10', '11', '12'], roman: ['X', 'XI', 'XII'] },
  MA: { numeric: ['10', '11', '12'], roman: ['X', 'XI', 'XII'] },
  SMK: { numeric: ['10', '11', '12'], roman: ['X', 'XI', 'XII'] }
};

export function classGradeLevels(educationLevel) {
  return promotionGrades[educationLevel]?.roman || [];
}

export function classDetailsFromRombel(rombel, educationLevel) {
  const className = typeof rombel === 'string' ? rombel.trim() : '';
  if (!className) return null;
  const levels = classGradeLevels(educationLevel);
  const gradeLevel = levels.find((level) => new RegExp(`^${level}[\\s.-]+(.+)$`, 'i').test(className)) || null;
  const match = gradeLevel ? new RegExp(`^${gradeLevel}[\\s.-]+(.+)$`, 'i').exec(className) : null;
  return { className, gradeLevel, name: match ? match[1].trim() : className };
}

export function promoteRombel(rombel, educationLevel) {
  if (typeof rombel !== 'string') return null;
  const allowed = promotionGrades[educationLevel];
  if (!allowed) return null;
  const match = /^(\s*(?:kelas\s+)?)(VIII|VII|XII|XI|IX|VI|IV|V|X|III|II|I|[0-9]+)([A-Za-z]?)(?=$|[\s.-])(.*)$/i.exec(rombel);
  if (!match) return null;

  const [, prefix, rawGrade, groupSuffix, suffix] = match;
  const normalizedGrade = rawGrade.toUpperCase();
  const isRoman = allowed.roman.includes(normalizedGrade);
  const grades = isRoman ? allowed.roman : allowed.numeric;
  const index = grades.indexOf(isRoman ? normalizedGrade : rawGrade);
  if (index < 0) return null;
  if (index === grades.length - 1) return { action: 'graduated', nextRombel: null };
  return {
    action: 'promoted',
    nextRombel: `${prefix}${grades[index + 1]}${groupSuffix}${suffix}`
  };
}

export function buildPromotionPlan(students, educationLevel) {
  return students.map((student) => {
    const promotion = promoteRombel(student.rombel, educationLevel);
    return {
      ...student,
      promotion: promotion || { action: 'unmapped', nextRombel: null }
    };
  });
}

export function promotionToken(sourceYearId, educationLevel, students) {
  const snapshot = students.map((student) => [
    String(student.id), student.nis_nisn || '', student.name, student.email || '',
    student.rombel || '', student.phone || '', student.gender || '', student.status
  ]);
  return createHash('sha256')
    .update(JSON.stringify([String(sourceYearId), educationLevel, snapshot]))
    .digest('hex');
}
