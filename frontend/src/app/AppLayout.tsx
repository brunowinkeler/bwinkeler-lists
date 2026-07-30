import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useLogout, useSession } from '../features/auth/session';
import { NotificationsMenu } from '../features/notifications/NotificationsMenu';
import { BrandMark } from '../components/BrandMark';
import { ThemeToggle } from '../components/ThemeToggle';
import { LogoutIcon } from '../components/icons';
import { APP_NAME } from '../config/brand';
import { RealtimeSync } from './RealtimeSync';

export function AppLayout() {
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  async function onLogout(): Promise<void> {
    await logout.mutateAsync();
    navigate('/login');
  }

  const displayName = session.data?.user.displayName ?? '';
  const initial = displayName.charAt(0).toUpperCase() || '?';

  return (
    <>
      <RealtimeSync />
      <header className="app-header">
        <div className="app-header__inner">
          <Link to="/" className="brand" aria-label={`${APP_NAME} home`}>
            <BrandMark />
          </Link>
          <div className="row">
            <ThemeToggle />
            <NotificationsMenu />
            <span className="user-chip">
              <span className="avatar" aria-hidden="true">
                {initial}
              </span>
              <span className="muted">{displayName}</span>
            </span>
            <button
              className="ghost btn-sm"
              onClick={onLogout}
              disabled={logout.isPending}
              aria-label="Sign out"
            >
              <LogoutIcon />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </>
  );
}
