import qrcode from 'qrcode-generator';
import { SUPPORT } from '#lib/config.ts';
import type { PageServerLoad } from './$types';

/**
 * The donation address as a QR code, drawn at build time (the page is prerendered), so the
 * browser gets a plain SVG path and no QR library or remote service is involved.
 */
export const load: PageServerLoad = () => {
  const { address } = SUPPORT.crypto;
  if (!address) return { qr: null };
  const qr = qrcode(0, 'M');
  qr.addData(address);
  qr.make();
  const size = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
  return { qr: { size, path } };
};
