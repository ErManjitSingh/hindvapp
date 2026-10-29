/** Header accent themes — HindHolidays brand (#5D5FEF) first */
export const TOPBAR_ACCENTS = {
  brand: {
    wash: 'from-[#5D5FEF]/[0.07] via-transparent to-sky-500/[0.04]',
    border: 'border-[#5D5FEF]/15',
    stripe: 'from-[#5D5FEF] via-[#7B7DF5] to-[#C9A227]',
    searchFocus: 'focus:ring-[#5D5FEF]/20 focus:border-[#5D5FEF]/50',
    avatar: 'from-[#5D5FEF] to-[#4547D4]',
    addBtn: 'from-[#5D5FEF] to-[#4547D4] shadow-[#5D5FEF]/25 hover:from-[#6B6DF5] hover:to-[#5D5FEF]',
    iconHover: 'hover:bg-[#5D5FEF]/10 hover:text-[#4547D4]',
    activeIcon: 'text-[#5D5FEF]',
    ring: 'ring-[#5D5FEF]/15',
    roleText: 'text-[#5D5FEF]',
  },
  violet: {
    wash: 'from-[#5D5FEF]/[0.07] via-transparent to-indigo-500/[0.04]',
    border: 'border-[#5D5FEF]/15',
    stripe: 'from-[#5D5FEF] via-indigo-400 to-sky-400',
    searchFocus: 'focus:ring-[#5D5FEF]/20 focus:border-[#5D5FEF]/50',
    avatar: 'from-[#5D5FEF] to-indigo-600',
    addBtn: 'from-[#5D5FEF] to-indigo-600 shadow-[#5D5FEF]/25 hover:from-[#6B6DF5] hover:to-indigo-500',
    iconHover: 'hover:bg-[#5D5FEF]/10 hover:text-[#4547D4]',
    activeIcon: 'text-[#5D5FEF]',
    ring: 'ring-[#5D5FEF]/15',
    roleText: 'text-[#5D5FEF]',
  },
  teal: {
    wash: 'from-teal-500/[0.06] via-transparent to-emerald-500/[0.04]',
    border: 'border-teal-500/15',
    stripe: 'from-teal-500 via-emerald-500 to-cyan-500',
    searchFocus: 'focus:ring-teal-500/20 focus:border-teal-400/50',
    avatar: 'from-teal-500 to-emerald-600',
    addBtn: 'from-teal-600 to-emerald-600 shadow-teal-500/25 hover:from-teal-500 hover:to-emerald-500',
    iconHover: 'hover:bg-teal-500/10 hover:text-teal-600',
    activeIcon: 'text-teal-600',
    ring: 'ring-teal-100',
    roleText: 'text-teal-600',
  },
  sky: {
    wash: 'from-sky-500/[0.06] via-transparent to-[#5D5FEF]/[0.05]',
    border: 'border-sky-500/15',
    stripe: 'from-sky-500 via-[#5D5FEF] to-indigo-500',
    searchFocus: 'focus:ring-sky-500/20 focus:border-sky-400/50',
    avatar: 'from-sky-500 to-[#5D5FEF]',
    addBtn: 'from-sky-600 to-[#5D5FEF] shadow-sky-500/25 hover:from-sky-500 hover:to-[#6B6DF5]',
    iconHover: 'hover:bg-sky-500/10 hover:text-sky-600',
    activeIcon: 'text-sky-600',
    ring: 'ring-sky-100',
    roleText: 'text-sky-600',
  },
  amber: {
    wash: 'from-amber-500/[0.05] via-transparent to-[#5D5FEF]/[0.05]',
    border: 'border-amber-500/15',
    stripe: 'from-amber-500 via-[#C9A227] to-[#5D5FEF]',
    searchFocus: 'focus:ring-amber-500/20 focus:border-amber-400/50',
    avatar: 'from-amber-500 to-[#5D5FEF]',
    addBtn: 'from-amber-600 to-[#5D5FEF] shadow-amber-500/20 hover:from-amber-500 hover:to-[#6B6DF5]',
    iconHover: 'hover:bg-amber-500/10 hover:text-amber-700',
    activeIcon: 'text-amber-600',
    ring: 'ring-amber-100',
    roleText: 'text-amber-700',
  },
};

export function getTopBarAccent(pathname) {
  if (pathname.startsWith('/hr')) return TOPBAR_ACCENTS.violet;
  if (pathname.startsWith('/operations-manager')) return TOPBAR_ACCENTS.teal;
  if (pathname.startsWith('/sales-manager')) return TOPBAR_ACCENTS.brand;
  if (pathname.startsWith('/team-leader')) return TOPBAR_ACCENTS.brand;
  if (pathname.startsWith('/sales-executive')) return TOPBAR_ACCENTS.brand;
  return TOPBAR_ACCENTS.brand;
}
