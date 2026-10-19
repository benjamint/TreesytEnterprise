import { tilePath } from '@/mobile/flows/catalog';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useT } from '@/stores/hooks';
import { useMobileAgent } from './useMobileContext';

/** Glass bottom sheet for the Record (+) menu (PRD 4.1). */
export function RecordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tiles } = useMobileAgent();
  const navigate = useNavigate();
  const { t } = useT();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label={t('common.close')}
            className="absolute inset-0 z-30 bg-badge-dark/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('mobile.recordTitle')}
            className="glass absolute inset-x-0 bottom-0 z-40 rounded-t-panel px-5 pb-8 pt-3 shadow-soft dark:bg-surface/80"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[19px]">{t('mobile.recordTitle')}</h2>
              <button type="button" onClick={onClose} className="rounded-full p-2 text-muted hover:bg-white/60" aria-label={t('common.close')}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {tiles.map((tile) => (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => navigate(tilePath(tile))}
                  className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-card border border-white/70 bg-white/80 p-3 text-center shadow-soft transition-transform active:scale-[0.97] dark:border-line dark:bg-surface"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <tile.icon className="h-[22px] w-[22px]" aria-hidden="true" />
                  </span>
                  <span className="text-[13px] font-medium leading-tight text-ink">{t(`mobile.tile.${tile.key}`)}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
