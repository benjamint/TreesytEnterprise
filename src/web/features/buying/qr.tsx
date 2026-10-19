import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';

/** A scannable QR code for a bag code (PRD D2 "bag(s) with QR"). */
export function QrCode({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center justify-center rounded-ctl border border-line bg-white p-1.5', className)}>
      <QRCodeSVG value={value} className="h-full w-full" bgColor="#ffffff" fgColor="#0F2A20" level="M" title={value} />
    </span>
  );
}
