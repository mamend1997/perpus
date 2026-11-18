import { randomInt } from 'node:crypto';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateSchoolCode() {
  return Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
}
