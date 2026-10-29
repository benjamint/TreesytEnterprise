import { useEffect, useState, type ReactNode } from 'react';
import { BatteryFull, Signal, Wifi } from 'lucide-react';

const SCREEN_H = 844;
const BEZEL = 12;

/** Shrinks the device to fit short desktop windows (the phone keeps its real 390×844 layout inside). */
function useFit() {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const fit = () => setZoom(window.innerWidth >= 768 ? Math.min(1, (window.innerHeight - 48) / (SCREEN_H + BEZEL * 2)) : 1);
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return zoom;
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return <>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '')}</>;
}

/** Phone status bar with the camera island (desktop preview only; a real phone draws its own). */
export function StatusBar() {
  return (
    <div className="relative hidden h-[50px] shrink-0 items-center justify-between px-8 pt-1 text-ink frame:flex" aria-hidden="true">
      <span className="tnum w-14 text-[15px] font-semibold tracking-[-0.01em]"><Clock /></span>
      <span className="absolute left-1/2 top-[11px] h-[34px] w-[122px] -translate-x-1/2 rounded-full bg-black" />
      <span className="flex w-14 items-center justify-end gap-1.5">
        <Signal className="h-[15px] w-[15px]" strokeWidth={2.5} />
        <Wifi className="h-[15px] w-[15px]" strokeWidth={2.5} />
        <BatteryFull className="h-[18px] w-[18px]" strokeWidth={2} />
      </span>
    </div>
  );
}

/**
 * Desktop device container (PRD 4.2): a titanium-edged phone with side buttons, status bar and
 * home indicator, scaled to fit the window. Below 768 px (a real phone or the phone-sized window) it
 * renders the screen full-bleed with no chrome.
 */
export function DeviceFrame({ children }: { children: ReactNode }) {
  const zoom = useFit();
  return (
    <div className="min-h-[100dvh] bg-canvas frame:flex frame:items-center frame:justify-center frame:overflow-hidden frame:bg-[radial-gradient(1200px_600px_at_50%_-10%,rgb(var(--brand-soft)),transparent_70%),radial-gradient(800px_500px_at_50%_120%,rgb(var(--line)/0.8),transparent_70%)] frame:py-6">
      <div className="frame:relative frame:rounded-[62px] frame:bg-[#0c0e0d] frame:p-3 frame:shadow-[0_0_0_1.5px_#4b514d,0_0_0_5px_#202422,0_0_0_6px_#5d6460,0_50px_100px_-30px_rgba(30,26,18,0.45),0_30px_60px_-20px_rgba(30,26,18,0.3)]" style={zoom < 1 ? { zoom } : undefined}>
        {/* Side buttons: action, volume up / down (left) and power (right). */}
        <span className="absolute -left-[8px] top-[120px] hidden h-8 w-[3px] rounded-l-full bg-[#3a403c] frame:block" aria-hidden="true" />
        <span className="absolute -left-[8px] top-[178px] hidden h-14 w-[3px] rounded-l-full bg-[#3a403c] frame:block" aria-hidden="true" />
        <span className="absolute -left-[8px] top-[248px] hidden h-14 w-[3px] rounded-l-full bg-[#3a403c] frame:block" aria-hidden="true" />
        <span className="absolute -right-[8px] top-[200px] hidden h-20 w-[3px] rounded-r-full bg-[#3a403c] frame:block" aria-hidden="true" />
        <div className="relative mx-auto flex h-[100dvh] w-full flex-col overflow-hidden bg-surface text-[16px] frame:h-[844px] frame:w-[390px] frame:rounded-[50px]">
          <StatusBar />
          {children}
          <span className="pointer-events-none absolute bottom-[7px] left-1/2 z-[70] hidden h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-ink/85 frame:block" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
