import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '../features/auth/session';

export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();

  if (session.isLoading) {
    return (
      <main className="container">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (session.isError || !session.data) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
