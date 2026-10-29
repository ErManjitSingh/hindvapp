import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Plus, Bell, Sun, Moon, Menu, X, LogOut, User, LogIn, ChevronDown, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { NOTIFICATIONS_ENABLED } from '../config/notifications';
import { APP_BRAND_NAME } from '../config/branding';
import { getTopBarAccent } from './topbarAccent';
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { cn } from '../lib/utils';
import AttendanceTopBarAction from './attendance/AttendanceTopBarAction';
import HeaderLatestActivity from './HeaderLatestActivity';
import BrandLogo from './BrandLogo';
import { refreshAppData } from '../lib/appRefresh';
import { useSidebar } from '../context/SidebarContext';

function getInitials(name) {
  return (
    name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U'
  );
}

function getProfilePath(pathname) {
  if (pathname.startsWith('/hr')) return '/hr/profile';
  if (pathname.startsWith('/operations-manager')) return '/operations-manager/profile';
  if (pathname.startsWith('/sales-manager')) return '/sales-manager/profile';
  if (pathname.startsWith('/team-leader')) return '/team-leader/profile';
  if (pathname.startsWith('/sales-executive')) return '/sales-executive/profile';
  return '/profile';
}

function IconButton({ children, className, accent, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        'relative flex items-center justify-center h-8 w-8 rounded-lg',
        'bg-white text-slate-500 ring-1 ring-slate-200/80',
        'transition-all duration-150',
        accent.iconHover,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export default function TopBar({ onMenuClick }) {
  void onMenuClick;
  const { mobileOpen, toggleMobileOpen } = useSidebar();
  const queryClient = useQueryClient();
  const { toggleTheme, isDark } = useTheme();
  const { user, logout, hasPermission } = useAuth();
  const { unreadCount, openDrawer } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const accent = getTopBarAccent(location.pathname);
  const profilePath = getProfilePath(location.pathname);
  const isAdmin = user?.role === 'admin';
  const canAddLead = isAdmin || user?.role === 'lead_provider' || hasPermission?.('leads', 'create');
  const adminRoleLine = user?.roleName || user?.role;
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const handleAppRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ['header-activity'] });
    refreshAppData(queryClient).finally(() => {
      window.setTimeout(() => setIsRefreshing(false), 900);
    });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className={cn('absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r', accent.stripe)} />
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-r opacity-90',
          accent.wash
        )}
      />

      <div className="relative flex items-center gap-2.5 px-3 lg:px-5 h-14">
        <button
          type="button"
          onClick={() => toggleMobileOpen()}
          className={cn(
            'lg:hidden flex items-center justify-center h-8 w-8 rounded-lg',
            'bg-white text-slate-500 ring-1 ring-slate-200',
            accent.iconHover
          )}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>

        {/* HindHolidays brand lockup — always visible in header */}
        <Link
          to="/"
          className="hidden sm:flex items-center gap-2.5 shrink-0 min-w-0 mr-1"
          title={APP_BRAND_NAME}
        >
          <BrandLogo className="h-8 w-8 shadow-sm ring-1 ring-[#5D5FEF]/20" />
          <div className="min-w-0 leading-tight">
            <p className="text-[13px] font-bold tracking-tight text-slate-900 truncate">
              HindHolidays
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5D5FEF] truncate">
              Tours CRM
            </p>
          </div>
        </Link>

        <span className="hidden sm:block h-6 w-px bg-slate-200/90 shrink-0" />

        {user ? <HeaderLatestActivity /> : <div className="flex-1" />}

        <div className="flex items-center gap-1.5 shrink-0">
          {user && (
            <IconButton
              accent={accent}
              onClick={handleAppRefresh}
              disabled={isRefreshing}
              title="Refresh data"
              aria-label="Refresh data"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
            </IconButton>
          )}

          {canAddLead && (
            <Link
              to={user?.role === 'sales_executive' ? '/sales-executive/leads/add' : '/leads/new'}
              className={cn(
                'hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold text-white',
                'bg-gradient-to-r shadow-sm active:scale-[0.98] transition',
                accent.addBtn
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Lead
            </Link>
          )}

          <AttendanceTopBarAction accent={accent} />

          {canAddLead && (
            <Link
              to={user?.role === 'sales_executive' ? '/sales-executive/leads/add' : '/leads/new'}
              className="sm:hidden flex items-center justify-center h-8 w-8 rounded-lg text-white bg-[#5D5FEF] shadow-sm"
              aria-label="Add Lead"
            >
              <Plus className="w-4 h-4" />
            </Link>
          )}

          <span className="hidden sm:block mx-0.5 h-5 w-px bg-slate-200" />

          {NOTIFICATIONS_ENABLED && (
            <IconButton
              accent={accent}
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
              onClick={openDrawer}
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </IconButton>
          )}

          <IconButton accent={accent} onClick={toggleTheme} aria-label="Toggle theme">
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </IconButton>

          {user ? (
            <DropdownMenuRoot>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-2 pl-1 pr-1.5 h-8 rounded-lg bg-white ring-1 ring-slate-200',
                    'hover:bg-[#5D5FEF]/[0.06] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5D5FEF]/35'
                  )}
                >
                  <div className="relative">
                    <div
                      className={cn(
                        'w-6 h-6 rounded-md bg-gradient-to-br flex items-center justify-center text-[9px] font-bold text-white',
                        accent.avatar
                      )}
                    >
                      {getInitials(user.name)}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                  </div>
                  <div className="hidden lg:block text-left min-w-0 max-w-[110px]">
                    <p className="text-[11px] font-semibold text-slate-800 truncate leading-none">
                      {user.name}
                    </p>
                    <p
                      className={cn(
                        'mt-0.5 text-[9px] font-semibold truncate leading-none capitalize',
                        accent.roleText || 'text-[#5D5FEF]'
                      )}
                    >
                      {adminRoleLine}
                    </p>
                  </div>
                  <ChevronDown className="w-3 h-3 text-slate-400 hidden lg:block shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                <DropdownMenuLabel className="px-2 py-2">
                  <p className="font-bold text-content-primary truncate">{user.name}</p>
                  <p className="text-xs font-normal text-content-muted truncate mt-0.5">{user.email}</p>
                  <span className="inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700">
                    ● Online
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={profilePath} className="cursor-pointer rounded-lg">
                    <User className="w-4 h-4" />
                    My Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-red-600 focus:text-red-600 focus:bg-red-500/10 rounded-lg cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuRoot>
          ) : (
            <Link
              to="/login"
              className={cn(
                'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold text-white',
                'bg-gradient-to-r shadow-md transition-all',
                accent.addBtn
              )}
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
