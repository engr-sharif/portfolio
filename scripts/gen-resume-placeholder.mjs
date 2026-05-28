/**
 * Dev-only: write a valid one-page placeholder PDF so the résumé download works
 * in the demo. Nawaz replaces public/resume/Sharif_Resume.pdf with the real
 * file (see README). Run: node scripts/gen-resume-placeholder.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'resume');
mkdirSync(out, { recursive: true });

const lines = [
  'Mohammad "Nawaz" Sharif  —  Environmental Engineer, EIT',
  '',
  'PLACEHOLDER RESUME — replace this file with the real PDF.',
  'Drop your resume at public/resume/Sharif_Resume.pdf (keep the name).',
  '',
  'Sacramento, California',
];

const content =
  'BT /F1 16 Tf 70 760 Td 18 TL ' +
  lines.map((l) => `(${l.replace(/[()\\]/g, '\\$&')}) Tj T*`).join(' ') +
  ' ET';

const objs = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];

let pdf = '%PDF-1.4\n';
const offsets = [];
objs.forEach((body, i) => {
  offsets.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xrefStart = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
offsets.forEach((o) => {
  pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
});
pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

writeFileSync(join(out, 'Sharif_Resume.pdf'), pdf, 'latin1');
console.log('Wrote placeholder Sharif_Resume.pdf');
