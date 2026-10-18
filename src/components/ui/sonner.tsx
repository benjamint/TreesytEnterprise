import { Toaster as Sonner } from 'sonner';

export function Toaster({ theme, position = 'bottom-right' }: { theme: 'light' | 'dark'; position?: 'bottom-right' | 'top-center' | 'top-right' }) {
  return (
    <Sonner
      theme={theme}
      position={position}
      toastOptions={{
        classNames: {
          toast: 'rounded-card border border-line bg-surface text-ink shadow-soft font-sans',
          description: 'text-muted',
          actionButton: 'bg-brand text-white',
        },
      }}
    />
  );
}
