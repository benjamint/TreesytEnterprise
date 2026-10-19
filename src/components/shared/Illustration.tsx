import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Landscape } from './Landscape';

/**
 * A painterly illustration from `public/illustrations/` (PRD 6.1b). Until the file exists, the
 * code-built landscape shows instead, so the layout and glass effect never break.
 */
export function Illustration({ name, className, variant }: { name: string; className?: string; variant?: 'shea' | 'cocoa' }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <Landscape className={className} variant={variant} />;
  return <img src={`/illustrations/${name}.webp`} alt="" aria-hidden="true" onError={() => setMissing(true)} className={cn('h-full w-full object-cover', className)} />;
}
