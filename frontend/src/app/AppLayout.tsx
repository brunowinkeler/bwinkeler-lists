import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useLogout, useSession } from '../features/auth/session';
import { NotificationsMenu } from '../features/notifications/NotificationsMenu';
import { RealtimeSync } from './RealtimeSync';

export function AppLayout() {
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  async function onLogout(): Promise<void> {
    await logout.mutateAsync();
    navigate('/login');
  }

  return (
    <>
      <RealtimeSync />
      <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="container row" style={{ justifyContent: 'space-between' }}>
          <Link to="/" style={{ fontWeight: 600, textDecoration: 'none' }}>
            BWinkeler Lists
          </Link>
          <div className="row">
            <NotificationsMenu />
            <span className="muted">{session.data?.user.displayName}</span>
            <button onClick={onLogout} disabled={logout.isPending}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </>
  );
}
