import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Package, RefreshCw, Plus } from 'lucide-react';
import API from '../../api/axios';
import { fetchPublicPackages, fetchPublicPackageDetail } from '../../lib/publicPackages';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDataRefresh } from '../../hooks/useDataRefresh';
import { useAuth } from '../../context/AuthContext';
import { canAccess } from '../../lib/permissions';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { toast } from '../../context/ToastContext';
import TablePagination, { PACKAGES_PAGE_SIZE } from '../ui/TablePagination';
import PackageListTable from './PackageListTable';
import PackageDetailModal from './PackageDetailModal';
import PackageFormModal from './PackageFormModal';
import { Button } from '../ui/button';

const TOUR_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'domestic', label: 'Domestic' },
  { value: 'international', label: 'International' },
];

export default function PackageManagementPage() {
  const { user } = useAuth();
  const canCreate = canAccess(user, 'packages', 'create');
  // Admin always gets delete — also honor packages.delete for ops roles.
  const canDelete = user?.role === 'admin' || canAccess(user, 'packages', 'delete');
  const { confirm, dialogNode } = useConfirmDialog();
  const [packages, setPackages] = useState([]);
  const [customCopies, setCustomCopies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PACKAGES_PAGE_SIZE });
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPackage, setEditPackage] = useState(null);
  const [cloningId, setCloningId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const debouncedSearch = useDebouncedValue(search, 350);

  const fetchCustomCopies = useCallback(async () => {
    try {
      const res = await API.get('/packages', { skipErrorToast: true });
      const rows = Array.isArray(res.data) ? res.data : [];
      // Admin / delete-capable users see all non-catalog packages so they can clean up.
      const filtered = canDelete
        ? rows
        : rows.filter((p) =>
            ['custom', 'clone', 'local', 'uno_clone'].includes(String(p.sourceType || ''))
          );
      setCustomCopies(filtered);
    } catch {
      setCustomCopies([]);
    }
  }, [canDelete]);

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchPublicPackages({
        page: pagination.pageIndex + 1,
        limit: pagination.pageSize,
        search: debouncedSearch || undefined,
      });
      const rows = result.items || [];
      const filteredByType = typeFilter ? rows.filter((p) => p.packageType === typeFilter) : rows;
      setPackages(filteredByType);
      setMeta({
        total: Number(result.total || filteredByType.length),
        totalPages: Number(result.totalPages || 1),
      });
    } catch {
      setPackages([]);
      setMeta({ total: 0, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, typeFilter, pagination.pageIndex, pagination.pageSize]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchPackages(), fetchCustomCopies()]);
  }, [fetchPackages, fetchCustomCopies]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  useEffect(() => {
    fetchCustomCopies();
  }, [fetchCustomCopies]);

  useDataRefresh(['packages'], fetchAll);

  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [debouncedSearch, typeFilter]);

  const openDetail = async (pkg) => {
    setSelectedPkg(pkg);
    setDetailOpen(true);
    setDetail(pkg);
    setDetailLoading(true);
    try {
      const data = await fetchPublicPackageDetail(pkg.slug || pkg._id || pkg.id);
      setDetail(data);
    } catch {
      setDetail(pkg);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedPkg(null);
    setDetail(null);
    setDetailLoading(false);
  };

  const handleEdit = async (pkg) => {
    const id = pkg._id || pkg.id;
    setCloningId(id);
    try {
      const res = await API.post(`/packages/clone-from-catalog/${id}`);
      setEditPackage(res.data);
      setModalOpen(true);
      fetchCustomCopies();
    } finally {
      setCloningId(null);
    }
  };

  const handleEditCopy = async (pkg) => {
    const id = pkg._id || pkg.id;
    if (!id) {
      setEditPackage(pkg);
      setModalOpen(true);
      return;
    }
    setCloningId(id);
    try {
      // List endpoint strips fullData (where packageCabs live) — load full doc for edit.
      const res = await API.get(`/packages/${id}`, { skipErrorToast: true });
      setEditPackage(res.data || pkg);
      setModalOpen(true);
    } catch {
      setEditPackage(pkg);
      setModalOpen(true);
    } finally {
      setCloningId(null);
    }
  };

  const handleCreate = () => {
    setEditPackage(null);
    setModalOpen(true);
  };

  const handleSave = async (data) => {
    if (editPackage?._id) {
      await API.put(`/packages/${editPackage._id}`, data);
    } else {
      await API.post('/packages', {
        ...data,
        sourceType: 'local',
        fullData: {
          ...data,
          itinerary: data.itinerary || [],
        },
      });
    }
    setModalOpen(false);
    setEditPackage(null);
    fetchCustomCopies();
  };

  const handleDelete = async (pkg) => {
    const id = pkg?._id || pkg?.id;
    if (!id || !canDelete) return;
    const ok = await confirm({
      title: 'Delete package?',
      message: `"${pkg.name || 'This package'}" permanently delete ho jayega. Yeh undo nahi hoga.`,
      confirmLabel: 'Delete package',
      tone: 'danger',
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      await API.delete(`/packages/${id}`);
      toast.success('Package deleted');
      if (editPackage?._id === id) {
        setModalOpen(false);
        setEditPackage(null);
      }
      if ((selectedPkg?._id || selectedPkg?.id) === id || (detail?._id || detail?.id) === id) {
        closeDetail();
      }
      setPackages((rows) => rows.filter((p) => String(p._id || p.id) !== String(id)));
      setCustomCopies((rows) => rows.filter((p) => String(p._id || p.id) !== String(id)));
      setMeta((m) => ({ ...m, total: Math.max(0, Number(m.total || 0) - 1) }));
      await fetchAll();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not delete package');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-8">
      {dialogNode}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-content-primary">Travel Packages</h1>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 text-sm font-bold">
              {meta.total}
            </span>
          </div>
          <p className="text-sm text-content-muted">
            HindHolidays catalog + your own packages. Create new or edit a private copy.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <Button type="button" onClick={handleCreate} className="rounded-xl gap-2">
              <Plus className="w-4 h-4" />
              Create Package
            </Button>
          )}
          <button
            type="button"
            onClick={fetchAll}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-subtle px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-elevated disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, destination, code..."
            className="input-premium w-full h-10 pl-10 rounded-xl text-sm"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="input-premium h-10 rounded-xl text-sm min-w-[140px]"
        >
          {TOUR_TYPES.map((t) => (
            <option key={t.value || 'all'} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-subtle overflow-hidden mb-8 animate-pulse">
          <div className="h-12 bg-surface-elevated border-b border-subtle" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 border-b border-subtle/50 bg-surface-elevated/40" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-subtle p-16 text-center mb-8">
          <Package className="w-12 h-12 text-content-muted mx-auto mb-3" />
          <p className="text-content-muted">No packages found. Try a different search or filter.</p>
        </div>
      ) : (
        <PackageListTable
          packages={packages}
          onView={openDetail}
          onEdit={handleEdit}
          onDelete={canDelete ? handleDelete : undefined}
          editingId={cloningId}
          deletingId={deletingId}
        />
      )}

      {!loading && packages.length > 0 && (
        <TablePagination
          pageIndex={pagination.pageIndex}
          pageSize={pagination.pageSize}
          total={meta.total}
          pageCount={meta.totalPages}
          onPageChange={(pageIndex) => setPagination((p) => ({ ...p, pageIndex }))}
          onPageSizeChange={(pageSize) => setPagination({ pageIndex: 0, pageSize })}
          totalLabel="packages"
          showPageNumbers
          accent="violet"
          className="rounded-2xl border border-amber-500/15 bg-gradient-to-r from-amber-500/[0.03] to-orange-500/[0.03] mb-8"
        />
      )}

      {customCopies.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold text-content-primary mb-1">
            {canDelete ? 'Managed packages' : 'Your packages'}
          </h2>
          <p className="text-sm text-content-muted mb-4">
            {canDelete
              ? 'Created / cloned packages — admin can delete unused ones from here'
              : 'Packages you created or cloned — safe to edit without changing the main catalog'}
          </p>
          <PackageListTable
            packages={customCopies.map((p) => ({
              ...p,
              durationLabel: p.durationLabel || `${p.duration}D`,
              packageType: p.packageType || 'domestic',
            }))}
            onView={(pkg) => {
              setDetail(pkg);
              setDetailOpen(true);
              setDetailLoading(false);
            }}
            onEdit={handleEditCopy}
            onDelete={canDelete ? handleDelete : undefined}
            editingId={cloningId}
            deletingId={deletingId}
          />
        </div>
      )}

      <PackageDetailModal
        open={detailOpen}
        onClose={closeDetail}
        pkg={detail || selectedPkg}
        loading={detailLoading}
      />

      <PackageFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditPackage(null);
        }}
        onSubmit={handleSave}
        editPackage={editPackage}
        isClone={
          !!editPackage &&
          (editPackage?.sourceType === 'custom' ||
            editPackage?.sourceType === 'clone' ||
            editPackage?.sourceType === 'local')
        }
        isCreate={!editPackage}
      />
    </motion.div>
  );
}
