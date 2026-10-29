import { useState } from 'react';
import { Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sun, Moon, Lock, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { AuthError } from '../../auth/authService';
import { cn } from '../../lib/utils';
import BrandLogo from '../../components/BrandLogo';

const HR_PRESET = {
  name: 'HR Admin',
  email: 'hr@example.com',
  password: '123456',
  roleName: 'HR Admin',
};

export default function HrLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activePreset, setActivePreset] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, logout, user, getDashboardPath } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  if (user) {
    if (user.role === 'hr_admin') {
      return <Navigate to="/hr/dashboard" replace />;
    }
    const dest = user.dashboardPath || getDashboardPath(user.role);
    return <Navigate to={dest} replace />;
  }

  const fillPreset = () => {
    setEmail(HR_PRESET.email);
    setPassword(HR_PRESET.password);
    setActivePreset(true);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const sessionUser = await login(email, password);
      if (sessionUser.role !== 'hr_admin') {
        await logout();
        setError('This login is for HR staff only. Use the main CRM login for other roles.');
        setLoading(false);
        return;
      }
      navigate(location.state?.from || '/hr/dashboard', { replace: true });
    } catch (err) {
      const msg =
        err instanceof AuthError
          ? err.message
          : err.response?.data?.message
            || (err.message === 'Network Error'
              ? 'Cannot reach API. Check that the backend is running.'
              : err.message)
            || 'Login failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-5 sm:p-8 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-orange-100 via-rose-50 to-violet-100" />
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px]" />
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-[#5D5FEF]/10" />

      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-5 right-5 z-20 p-2.5 rounded-xl bg-white/60 backdrop-blur-md border border-white/50 text-slate-600 hover:bg-white/80 shadow-sm transition-all"
        aria-label="Toggle theme"
      >
        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="text-center mb-6">
          <BrandLogo className="mx-auto mb-4 h-16 w-16 shadow-lg shadow-black/20" />
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">HindHolidays HR</h1>
          <p className="text-sm text-slate-600 mt-1">HR Management Portal — sign in to continue</p>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/55 backdrop-blur-xl shadow-xl shadow-[#5D5FEF]/10 p-7 sm:p-8">
          {error && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-400/30 text-rose-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setActivePreset(false); }}
                  required
                  autoComplete="email"
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/70 border border-white/80 text-slate-800 placeholder:text-slate-400 text-sm outline-none transition-all focus:border-[#5D5FEF] focus:ring-2 focus:ring-[#5D5FEF]/25 focus:bg-white/90"
                  placeholder="hr@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/70 border border-white/80 text-slate-800 placeholder:text-slate-400 text-sm outline-none transition-all focus:border-[#5D5FEF] focus:ring-2 focus:ring-[#5D5FEF]/25 focus:bg-white/90"
                  placeholder="••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 mt-1 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-[#5D5FEF] to-indigo-600 hover:from-[#4F51E0] hover:to-indigo-500 shadow-md shadow-[#5D5FEF]/25 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? 'Signing in…' : (<>Sign In to HR Portal <ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>
        </div>

        <div className="mt-5 rounded-2xl border border-white/50 bg-white/40 backdrop-blur-lg p-4 shadow-lg shadow-[#5D5FEF]/5">
          <p className="text-xs font-semibold text-slate-600 mb-3 text-center uppercase tracking-wider">
            Demo HR login
          </p>
          <button
            type="button"
            onClick={fillPreset}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all',
              activePreset
                ? 'border-[#5D5FEF]/60 bg-white/80 ring-2 ring-[#5D5FEF]/30 shadow-sm'
                : 'border-white/60 bg-white/50 hover:bg-white/75 hover:border-[#5D5FEF]/30',
            )}
          >
            <span className="font-semibold text-slate-800 block truncate text-xs">{HR_PRESET.roleName}</span>
            <span className="text-[11px] text-slate-500 truncate block">{HR_PRESET.email}</span>
          </button>
          <p className="text-xs text-slate-500 text-center mt-3">
            Password: <span className="font-mono font-semibold text-slate-700">123456</span>
          </p>
        </div>

        <p className="text-center text-xs text-slate-500 mt-4">
          CRM admin / sales login?{' '}
          <Link to="/login" className="font-semibold text-[#5D5FEF] hover:underline">
            Go to main login
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
