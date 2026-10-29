import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from '@/components/shared/RouteBoundary';
import { LogoBadge } from '@/components/shared/Logo';
import { Providers } from './providers';
import { router } from './router';

export function App() {
  return (
    <Providers>
      <ErrorBoundary>
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-canvas"><LogoBadge size={48} className="animate-pulse" /></div>}>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </Suspense>
      </ErrorBoundary>
    </Providers>
  );
}
