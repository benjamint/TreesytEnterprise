import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { signOutThisTab } from '@/services/authService';
import { useOrgSettings, useT } from '@/stores/hooks';
import { useAccessStore } from '@/stores/accessStore';
import { useSessionStore } from '@/stores/sessionStore';

export const TIMEOUT_PREVIEW_EVENT = 'treesyt:timeout-preview';
const WARN_SECONDS = 60;

/**
 * Session timeout (PRD A2): after the company's session length without activity, warn for 60 s,
 * then sign out. Also signs this tab out if its session was ended elsewhere ("Sign out all").
 */
export function SessionTimeout() {
  const settings = useOrgSettings();
  const sessionId = useSessionStore((s) => s.sessionId);
  const revoked = useAccessStore((s) => !!s.sessions.find((x) => x.id === sessionId)?.revokedAt);
  const touchSession = useAccessStore((s) => s.touchSession);
  const [warning, setWarning] = useState(false);
  const [left, setLeft] = useState(WARN_SECONDS);
  const last = useRef(Date.now());
  const lastTouch = useRef(0);
  const navigate = useNavigate();
  const { t } = useT();
  const minutes = settings?.security.sessionMinutes ?? 60;

  const end = (key: string) => {
    setWarning(false);
    signOutThisTab();
    toast(t(key));
    navigate('/sign-in');
  };

  useEffect(() => {
    if (revoked) end('auth.sessionEnded');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revoked]);

  useEffect(() => {
    const activity = () => {
      if (warning) return;
      last.current = Date.now();
      if (sessionId && Date.now() - lastTouch.current > 60_000) {
        lastTouch.current = Date.now();
        touchSession(sessionId);
      }
    };
    const preview = () => {
      setLeft(WARN_SECONDS);
      setWarning(true);
    };
    const events = ['mousemove', 'keydown', 'pointerdown', 'scroll'];
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    window.addEventListener(TIMEOUT_PREVIEW_EVENT, preview);
    const id = setInterval(() => {
      if (!warning && Date.now() - last.current > (minutes * 60 - WARN_SECONDS) * 1000) {
        setLeft(WARN_SECONDS);
        setWarning(true);
      }
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, activity));
      window.removeEventListener(TIMEOUT_PREVIEW_EVENT, preview);
      clearInterval(id);
    };
  }, [minutes, warning, sessionId, touchSession]);

  useEffect(() => {
    if (!warning) return;
    if (left <= 0) {
      end('auth.timedOut');
      return;
    }
    const id = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warning, left]);

  return (
    <Dialog open={warning} onOpenChange={(o) => !o && (last.current = Date.now(), setWarning(false))}>
      <DialogContent hideClose>
        <DialogHeader>
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning">
            <Clock className="h-6 w-6" aria-hidden="true" />
          </span>
          <DialogTitle>{t('auth.timeoutTitle')}</DialogTitle>
          <DialogDescription>{t('auth.timeoutBody', { seconds: left, minutes })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => end('shell.signedOut')}>{t('shell.signOut')}</Button>
          <Button
            onClick={() => {
              last.current = Date.now();
              setWarning(false);
            }}
          >
            {t('auth.staySignedIn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
