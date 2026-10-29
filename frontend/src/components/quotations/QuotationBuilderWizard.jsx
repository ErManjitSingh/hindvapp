import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Plus, Search } from 'lucide-react';
import API from '../../api/axios';
import { Button } from '../ui/button';
import Avatar from '../ui/Avatar';
import VirtualizedList from '../ui/VirtualizedList';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { buildListParams, unwrapPagination } from '../../utils/apiHelpers';
import { fetchPublicPackages, fetchPublicPackageDetail, matchesPackageNameSearch } from '../../lib/publicPackages';
import { logSelectedPackageDebug } from '../../lib/logPackageDebug';
import { resolvePackageItinerary, seedDayWiseHotelsFromItinerary } from '../../lib/packageItineraryMapper';
import { applyHotelSeasonToSelections } from '../../lib/mealPlanDefaults';
import {
  isLikelyMongoId,
  mapLocalHotelToCatalogDetail,
} from '../../lib/localHotelCatalog';

/** Refresh day-wise hotel room rates from Hotel Control (on + off season). */
async function enrichDayWiseHotelsFromCatalog(selections = []) {
  const list = Array.isArray(selections) ? selections : [];
  return Promise.all(
    list.map(async (entry) => {
      try {
        const localId =
          entry?.hotel?.localHotelId ||
          entry?.hotel?._id ||
          (isLikelyMongoId(entry?.hotel?.id) ? entry.hotel.id : null);
        let detail = null;
        if (localId) {
          const res = await API.get(`/hotels/${localId}`, { skipErrorToast: true });
          detail = mapLocalHotelToCatalogDetail(res.data);
        } else {
          const name = String(entry?.hotel?.name || '').trim();
          if (!name) return entry;
          const searchRes = await API.get('/hotels', {
            params: { status: 'active', search: name },
            skipErrorToast: true,
          });
          const items = Array.isArray(searchRes.data) ? searchRes.data : [];
          const needle = name.toLowerCase();
          const hit =
            items.find((h) => String(h.name || '').toLowerCase() === needle) ||
            items.find((h) => String(h.name || '').toLowerCase().includes(needle)) ||
            items[0];
          if (!hit?._id) return entry;
          const detailRes = await API.get(`/hotels/${hit._id}`, { skipErrorToast: true });
          detail = mapLocalHotelToCatalogDetail(detailRes.data);
        }
        if (!detail) return entry;
        const rooms = detail?.rooms || [];
        const match =
          rooms.find(
            (r) =>
              String(r.id) === String(entry?.room?.id) ||
              String(r._id) === String(entry?.room?.id) ||
              String(r.name || '').toLowerCase() === String(entry?.room?.name || '').toLowerCase()
          ) || rooms[0];
        if (!match?.rates) return entry;
        return {
          ...entry,
          hotel: {
            ...(entry.hotel || {}),
            localHotelId: detail.localHotelId || detail._id || detail.id,
            _id: detail._id || detail.id,
          },
          room: {
            ...(entry.room || {}),
            ...match,
            rates: match.rates,
            extraBedRates: match.extraBedRates || entry.room?.extraBedRates,
            extraBedRate: match.extraBedRate || entry.room?.extraBedRate,
          },
        };
      } catch {
        return entry;
      }
    })
  );
}
import { shortLeadMealPlan } from '../lead-wizard/leadWizardUtils';
import { resolvePackageCabs } from '../../lib/packageCabMapper';
import { suggestCompanionCabs } from '../../lib/packageCabCompanions';
import InclusionExclusionEditor, { cleanInclusionExclusionLines } from './InclusionExclusionEditor';
import { pickInclusionExclusionList } from '../../lib/inclusionExclusionLines';
import { buildSelectedCabSnapshot } from './CatalogCabSelector';
import { parsePackageNights } from './CatalogHotelSelector';
import { WIZARD_STEPS } from './constants';
import { applyAskDiscount, calculatePricing, bakeCompanyMarginIntoLineCosts, defaultItineraryDay, defaultWizardState, formatINR, hasExtraDiscountRequest, matchesResourceDestination } from './quotationUtils';
import { buildWebsiteAlignedQuoteCosts } from './partyCosting';
import { getPartyCapacityReadiness, expandDayWiseHotelsForParty } from './partyCapacityHints';
import { buildSelectedHotelsSnapshot, shiftYmd, toYmd } from './quotePdfHelpers';
import { hydrateWizardFromQuote } from './quotationHydrate';
import { unwrapList } from '../../utils/apiHelpers';
import PackageBuilderWorkspace from './PackageBuilderWorkspace';
import PackageBuilderOpeningOverlay from './PackageBuilderOpeningOverlay';
import PackageFormModal from '../packages/PackageFormModal';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { canAccess } from '../../lib/permissions';
import {
  invalidateLeadDetail,
  invalidateLeadLists,
  invalidateNavCounts,
} from '../../lib/queryInvalidation';
import { PACKAGES_PAGE_SIZE } from '../ui/TablePagination';

const ADMIN_CONFIG = {
  leadsPath: '/leads',
  leadViewPath: (id) => `/leads/${id}`,
  savePath: '/quotations',
  getPath: (id) => `/quotations/${id}`,
  editPath: (id) => `/quotations/${id}`,
  backPath: '/quotations',
  successPath: '/quotations',
  title: 'Package Builder',
  subtitle: 'Customize HindHolidays packages with live hotels, cabs, itinerary and pricing',
  draftStatus: 'draft',
  submitStatus: 'sent',
  draftLabel: 'Save Draft',
  submitLabel: 'Save & Send',
  approvalNote: null,
};

const EXECUTIVE_CONFIG = {
  leadsPath: '/sales-executive/leads/all',
  leadViewPath: (id) => `/sales-executive/leads/${id}/view`,
  savePath: '/sales-executive/quotations',
  getPath: (id) => `/sales-executive/quotations/${id}`,
  editPath: (id) => `/sales-executive/quotations/${id}`,
  backPath: '/sales-executive/quotations',
  successPath: '/sales-executive/quotations',
  title: 'Package Builder',
  subtitle: 'Lead auto-loads into a HindHolidays tour package builder with live hotels, cabs & pricing',
  draftStatus: 'draft',
  submitStatus: 'pending_approval',
  draftLabel: 'Save Draft',
  submitLabel: 'Submit Quotation',
  approvalNote: 'The first quotation for a lead is approved automatically. From the second quote onward, Team Leader approval is required — you must share a reason before you can submit.',
};

const TEAM_LEADER_CONFIG = {
  leadsPath: '/team-leader/leads',
  leadViewPath: (id) => `/team-leader/leads/${id}/view`,
  leadsParams: { filter: 'all', page: 1, limit: 50 },
  savePath: '/team-leader/quotations',
  getPath: (id) => `/team-leader/quotations/${id}`,
  editPath: (id) => `/team-leader/quotations/${id}`,
  backPath: '/team-leader/quotations/pending',
  successPath: '/team-leader/quotations/approved',
  title: 'Package Builder',
  subtitle: 'Build and approve a tour package for your team lead',
  draftStatus: 'draft',
  submitStatus: 'approved',
  draftLabel: 'Save Draft',
  submitLabel: 'Create & Approve',
  approvalNote: 'Executive can send the approved quote to the customer.',
};

const MANAGER_CONFIG = {
  leadsPath: '/sales-manager/leads',
  leadViewPath: (id) => `/sales-manager/leads/${id}/view`,
  leadsParams: { filter: 'all', page: 1, limit: 50 },
  savePath: '/sales-manager/quotations',
  getPath: (id) => `/sales-manager/quotations/${id}`,
  editPath: (id) => `/sales-manager/quotations/${id}`,
  backPath: '/sales-manager/quotations/pending',
  successPath: '/sales-manager/quotations/approved',
  title: 'Package Builder',
  subtitle: 'Build and approve a tour package for any team lead for your team',
  draftStatus: 'draft',
  submitStatus: 'approved',
  draftLabel: 'Save Draft',
  submitLabel: 'Create & Approve',
  approvalNote: 'Quote is approved on creation. Executive can send to customer.',
};

const CONFIG_BY_MODE = {
  executive: EXECUTIVE_CONFIG,
  team_leader: TEAM_LEADER_CONFIG,
  sales_manager: MANAGER_CONFIG,
  admin: ADMIN_CONFIG,
};

function emailEndpointForMode(mode) {
  if (mode === 'executive') return '/sales-executive/leads';
  return '/leads';
}

function leadDetailPathForMode(mode, leadId, leadsPath = '') {
  if (!leadId) return null;
  if (String(leadsPath || '').startsWith('/sales-executive')) {
    return `/sales-executive/leads/${leadId}`;
  }
  if (String(leadsPath || '').startsWith('/team-leader')) {
    return `/team-leader/leads/${leadId}`;
  }
  if (String(leadsPath || '').startsWith('/sales-manager')) {
    return `/sales-manager/leads/${leadId}`;
  }
  if (mode === 'executive') return `/sales-executive/leads/${leadId}`;
  return `/leads/${leadId}`;
}

function upsertLeadRow(list = [], lead) {
  if (!lead?._id) return Array.isArray(list) ? list : [];
  const rows = Array.isArray(list) ? list : [];
  const idx = rows.findIndex((l) => String(l._id) === String(lead._id));
  if (idx < 0) return [lead, ...rows];
  const next = rows.slice();
  next[idx] = { ...rows[idx], ...lead };
  return next;
}

export default function QuotationBuilderWizard({ mode = 'executive' }) {
  const config = CONFIG_BY_MODE[mode] || EXECUTIVE_CONFIG;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { id: routeQuoteId } = useParams();
  const [searchParams] = useSearchParams();
  const initialLeadId = searchParams.get('leadId');
  const editQuoteId = routeQuoteId || searchParams.get('edit') || null;
  const isEditMode = Boolean(editQuoteId);
  const [step, setStep] = useState(1);
  const [leads, setLeads] = useState([]);
  const [leadSearch, setLeadSearch] = useState('');
  const debouncedLeadSearch = useDebouncedValue(leadSearch, 500);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [flights, setFlights] = useState([]);
  const [activities, setActivities] = useState([]);
  const [selectedPackageCab, setSelectedPackageCab] = useState(null);
  const [state, setState] = useState({ ...defaultWizardState });
  const [customItinerary, setCustomItinerary] = useState([]);
  const [customInclusions, setCustomInclusions] = useState([]);
  const [customExclusions, setCustomExclusions] = useState([]);
  const [customizeTab, setCustomizeTab] = useState('itinerary');
  const [selectedPkgDetail, setSelectedPkgDetail] = useState(null);
  const [dayWiseHotels, setDayWiseHotels] = useState([]);
  const [extraCabs, setExtraCabs] = useState([]);
  const [stayWithMattress, setStayWithMattress] = useState(false);
  /** Global hotel rate season for quotation — onSeason | offSeason */
  const [hotelSeason, setHotelSeason] = useState('onSeason');
  const hotelSeasonInitRef = useRef(true);
  const [loadingPackageDetail, setLoadingPackageDetail] = useState(false);
  const [openingPackageMeta, setOpeningPackageMeta] = useState({ name: '', destination: '' });
  const [packageSearch, setPackageSearch] = useState('');
  const [packagePage, setPackagePage] = useState(0);
  const debouncedPackageSearch = useDebouncedValue(packageSearch, 350);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(isEditMode);
  const [editMeta, setEditMeta] = useState({ quoteNumber: '', status: '' });
  const [resubmissionReason, setResubmissionReason] = useState('');
  const [needsResubmissionReason, setNeedsResubmissionReason] = useState(false);
  const [createPackageOpen, setCreatePackageOpen] = useState(false);
  const [creatingPackage, setCreatingPackage] = useState(false);
  const hydratedEditRef = useRef(false);

  const canCreatePackage =
    canAccess(user, 'packages', 'create') || user?.role === 'admin' || mode === 'executive';

  const isMongoPackageId = (id) => id && /^[a-fA-F0-9]{24}$/.test(String(id));

  useEffect(() => {
    let cancelled = false;

    const loadResources = async () => {
      const requests = [
        API.get('/flights', { skipErrorToast: true }),
        API.get('/activities', { skipErrorToast: true }),
      ];

      const results = await Promise.allSettled(requests);
      if (cancelled) return;

      const pick = (index) => (results[index].status === 'fulfilled' ? results[index].value.data : []);

      setFlights(unwrapList(pick(0)));
      setActivities(unwrapList(pick(1)));
    };

    loadResources().catch(() => {
      if (!cancelled) {
        setFlights([]);
        setActivities([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchLeads = useCallback(async (searchTerm, { packageShared = false } = {}) => {
    setLoadingLeads(true);
    try {
      const baseParams = config.leadsParams || { page: 1, limit: 50 };
      const params = buildListParams({
        page: 1,
        limit: 50,
        filters: {
          ...baseParams,
          filter: packageShared ? 'package-shared' : baseParams.filter,
          packageShared: packageShared ? '1' : undefined,
          search: searchTerm?.trim() || undefined,
        },
      });
      const { data } = await API.get(config.leadsPath, { params, skipErrorToast: true });
      const rows = unwrapPagination(data).data || unwrapList(data);
      setLeads(rows);
      return rows;
    } catch {
      setLeads([]);
      return [];
    } finally {
      setLoadingLeads(false);
    }
  }, [config.leadsPath, config.leadsParams]);

  useEffect(() => {
    if (step !== 1) return;
    if (initialLeadId && !debouncedLeadSearch.trim()) {
      fetchLeads('');
      return;
    }
    if (debouncedLeadSearch.trim().length >= 2) {
      fetchLeads(debouncedLeadSearch);
    } else if (!initialLeadId) {
      // Default: leads that already had packages/quotations shared
      fetchLeads('', { packageShared: true });
    }
  }, [step, debouncedLeadSearch, initialLeadId, fetchLeads]);

  useEffect(() => {
    if (initialLeadId && !isEditMode) {
      setState((s) => ({ ...s, leadId: initialLeadId }));
      setStep(2);
    }
  }, [initialLeadId, isEditMode]);

  useEffect(() => {
    if (!editQuoteId || !config.getPath || hydratedEditRef.current) return undefined;
    let cancelled = false;
    setLoadingEdit(true);
    (async () => {
      try {
        const { data: quote } = await API.get(config.getPath(editQuoteId), { skipErrorToast: true });
        if (cancelled || !quote) return;
        const hydrated = hydrateWizardFromQuote(quote);
        if (!hydrated) return;

        hydratedEditRef.current = true;
        setEditMeta({ quoteNumber: hydrated.quoteNumber, status: hydrated.status });
        if (hydrated.lead) {
          setLeads((prev) => {
            const id = String(hydrated.lead._id);
            if (prev.some((l) => String(l._id) === id)) return prev;
            return [hydrated.lead, ...prev];
          });
        }
        setState((s) => ({
          ...s,
          leadId: hydrated.leadId,
          packageId: hydrated.packageId,
          customizations: hydrated.customizations,
          selectedFlightIds: hydrated.selectedFlightIds,
          selectedActivityIds: hydrated.selectedActivityIds,
          pricing: {
            ...s.pricing,
            ...hydrated.pricing,
            ...calculatePricing({ ...s.pricing, ...hydrated.pricing }),
          },
        }));
        setSelectedPkgDetail(hydrated.packageDetail);
        setCustomItinerary(hydrated.customItinerary);
        setCustomInclusions(hydrated.customInclusions);
        setCustomExclusions(hydrated.customExclusions);
        setDayWiseHotels(hydrated.dayWiseHotels);
        setSelectedPackageCab(hydrated.selectedPackageCab);
        setExtraCabs(Array.isArray(hydrated.extraCabs) ? hydrated.extraCabs : []);
        setStayWithMattress(Boolean(hydrated.pricing?.party?.stayWithMattress));
        setOpeningPackageMeta({
          name: hydrated.packageDetail?.name || 'Package',
          destination: hydrated.packageDetail?.destination || hydrated.lead?.destination || '',
        });
        setStep(3);
      } catch {
        if (!cancelled) navigate(config.backPath, { replace: true });
      } finally {
        if (!cancelled) setLoadingEdit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editQuoteId, config, navigate, isEditMode]);

  const dayWiseHotelsRef = useRef(dayWiseHotels);
  dayWiseHotelsRef.current = dayWiseHotels;

  // When On/Off season toggles, refresh rates from Hotel Control then remap rack.
  useEffect(() => {
    if (hotelSeasonInitRef.current) {
      hotelSeasonInitRef.current = false;
      return undefined;
    }
    let cancelled = false;

    (async () => {
      const current = Array.isArray(dayWiseHotelsRef.current) ? dayWiseHotelsRef.current : [];
      setDayWiseHotels(applyHotelSeasonToSelections(current, hotelSeason));
      const enriched = await enrichDayWiseHotelsFromCatalog(current);
      if (cancelled) return;
      setDayWiseHotels(applyHotelSeasonToSelections(enriched, hotelSeason));
    })();

    return () => {
      cancelled = true;
    };
  }, [hotelSeason]);

  useEffect(() => {
    if (!initialLeadId || isEditMode) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const tryPaths = [
          config.leadsPath ? `${config.leadsPath.replace(/\/$/, '')}` : null,
          `/leads/${initialLeadId}`,
          `/sales-executive/leads/${initialLeadId}`,
        ].filter(Boolean);

        const leadDetailPath = leadDetailPathForMode(mode, initialLeadId, config.leadsPath);
        try {
          const { data } = await API.get(leadDetailPath, { skipErrorToast: true });
          if (!cancelled && data?._id) {
            // Always merge detail over list stub so rooms/mattresses are present.
            setLeads((prev) => upsertLeadRow(prev, data));
            setState((s) => ({ ...s, leadId: data._id }));
            setStep(2);
            return;
          }
        } catch {
          /* fall through to list search */
        }

        const rows = await fetchLeads('');
        if (cancelled) return;
        const found = rows.find((l) => String(l._id) === String(initialLeadId));
        if (found) {
          setState((s) => ({ ...s, leadId: found._id }));
          setStep(2);
        }
        void tryPaths;
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialLeadId, fetchLeads, config.leadsPath, mode]);

  const selectedLead = leads.find((l) => String(l._id) === String(state.leadId));
  const selectedLeadHasStayFields =
    selectedLead &&
    Number.isFinite(Number(selectedLead.numberOfRooms)) &&
    Number.isFinite(Number(selectedLead.roomsWithMattress));

  // Ensure selected lead has full stay fields (rooms / mattresses) from detail API.
  useEffect(() => {
    if (!state.leadId || isEditMode || selectedLeadHasStayFields) return undefined;

    let cancelled = false;
    const path = leadDetailPathForMode(mode, state.leadId, config.leadsPath);
    (async () => {
      try {
        const { data } = await API.get(path, { skipErrorToast: true });
        if (!cancelled && data?._id) {
          setLeads((prev) => upsertLeadRow(prev, data));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    state.leadId,
    isEditMode,
    mode,
    config.leadsPath,
    selectedLeadHasStayFields,
  ]);

  // When lead rooms/mattresses arrive (or change), keep quotation hotel lines in sync.
  useEffect(() => {
    if (step !== 3 || isEditMode || !selectedLeadHasStayFields) return;
    setDayWiseHotels((prev) => {
      if (!Array.isArray(prev) || !prev.length) return prev;
      const next = expandDayWiseHotelsForParty(prev, selectedLead, customItinerary);
      const same =
        next.length === prev.length &&
        next.every(
          (row, i) =>
            Number(row.day) === Number(prev[i].day) &&
            Number(row.roomSlot || 1) === Number(prev[i].roomSlot || 1) &&
            Number(row.extraMattresses || 0) === Number(prev[i].extraMattresses || 0)
        );
      return same ? prev : next;
    });
  }, [
    step,
    isEditMode,
    selectedLeadHasStayFields,
    selectedLead?._id,
    selectedLead?.numberOfRooms,
    selectedLead?.roomsWithMattress,
    customItinerary,
  ]);

  useEffect(() => {
    if (mode !== 'executive' || !state.leadId) {
      setNeedsResubmissionReason(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await API.get(`/sales-executive/leads/${state.leadId}/quotations`, {
          skipErrorToast: true,
          skipSuccessToast: true,
        });
        const rows = Array.isArray(data)
          ? data
          : data?.quotations || data?.data || [];
        const prior = rows.filter((q) => {
          if (!q || q.status === 'draft') return false;
          if (editQuoteId && String(q._id) === String(editQuoteId)) return false;
          return true;
        });
        if (!cancelled) {
          setNeedsResubmissionReason(prior.length > 0);
          if (prior.length === 0) setResubmissionReason('');
        }
      } catch {
        if (!cancelled) setNeedsResubmissionReason(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, state.leadId, editQuoteId]);

  const packageDestination = selectedLead?.destination?.trim() || '';
  const packagesQuery = useQuery({
    queryKey: ['quotation-packages', packageDestination],
    enabled: step === 2 && Boolean(packageDestination),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async () => {
      const destination = packageDestination;
      const [catalogResult, localRes] = await Promise.all([
        fetchPublicPackages({
          limit: 50,
          page: 1,
          destination,
        }),
        API.get('/packages', {
          skipErrorToast: true,
        }).catch(() => ({ data: [] })),
      ]);
      const matchDest = (p) => {
        const hasDest = String(p.destination || p.destinationName || '').trim();
        return Boolean(hasDest) && matchesResourceDestination(p, destination);
      };
      const catalog = (catalogResult.items || [])
        .filter(matchDest)
        .map((p) => ({
          ...p,
          _id: p._id || p.id,
          catalogSource: 'catalog',
        }));
      const customs = unwrapList(localRes.data)
        .filter((p) => matchDest(p))
        .filter((p) => String(p.sourceType || '') !== 'catalog')
        .map((p) => ({ ...p, catalogSource: 'custom' }));
      return [...customs, ...catalog];
    },
  });

  const packages = packagesQuery.data || [];
  const loadingPackages = packagesQuery.isFetching && !packagesQuery.data;

  useEffect(() => {
    if (step === 2) setPackagePage(0);
  }, [step, packageDestination]);

  const filteredPackages = useMemo(() => {
    const q = debouncedPackageSearch.trim();
    if (!q) return packages;
    return packages.filter((p) => matchesPackageNameSearch(p, q));
  }, [packages, debouncedPackageSearch]);

  const selectedPkg = packages.find((p) => String(p._id) === String(state.packageId));
  const activePkg = selectedPkgDetail || selectedPkg;
  const packageNights = parsePackageNights(activePkg);
  const hotelDestination = selectedLead?.destination || activePkg?.destination || '';
  const availableActivities = activities.filter((activity) =>
    matchesResourceDestination(activity, hotelDestination)
  );

  const packagePageCount = Math.max(1, Math.ceil(filteredPackages.length / PACKAGES_PAGE_SIZE));
  const safePackagePage = Math.min(packagePage, packagePageCount - 1);
  const pagedPackages = useMemo(() => {
    const start = safePackagePage * PACKAGES_PAGE_SIZE;
    return filteredPackages.slice(start, start + PACKAGES_PAGE_SIZE);
  }, [filteredPackages, safePackagePage]);
  const packageShowingFrom = filteredPackages.length === 0 ? 0 : safePackagePage * PACKAGES_PAGE_SIZE + 1;
  const packageShowingTo = Math.min((safePackagePage + 1) * PACKAGES_PAGE_SIZE, filteredPackages.length);

  const skipActivities = () => {
    setState((s) => ({ ...s, selectedActivityIds: [], activitiesSkipped: true }));
    setStep(7);
  };

  const handleDayWiseHotelChange = (selections) => {
    setDayWiseHotels(selections);
    if (!selections.length || customItinerary.length === 0) return;

    setCustomItinerary((days) =>
      days.map((day, index) => {
        const dayNum = day.day || index + 1;
        const sel = selections.find((item) => item.day === dayNum);
        if (!sel?.hotel) return day;
        return {
          ...day,
          hotel: sel.hotel.name,
          meals: sel.mealPlan?.label || day.meals,
        };
      })
    );
  };

  const buildPackageSnapshot = (pkg) => {
    const travelDate = toYmd(selectedLead?.travelDate) || toYmd(pkg?.travelDate) || '';
    const rooms = Math.max(
      1,
      Number(selectedLead?.numberOfRooms ?? state.pricing?.party?.rooms) || 1
    );
    const mattresses = Math.max(
      0,
      Number(selectedLead?.roomsWithMattress ?? state.pricing?.party?.mattresses) || 0
    );
    return {
      ...pkg,
      itinerary: (customItinerary || []).map((day, index) => {
        const dayNum = Number(day.day) || index + 1;
        return {
          ...day,
          day: dayNum,
          date: travelDate ? shiftYmd(travelDate, dayNum - 1) : day.date || '',
        };
      }),
      inclusions: cleanInclusionExclusionLines(customInclusions),
      exclusions: cleanInclusionExclusionLines(customExclusions),
      cabCategory: selectedPackageCab?.cabCategory || selectedPackageCab?.vehicleType || pkg?.cabCategory || '',
      guestName: selectedLead?.name || selectedLead?.customerName || pkg?.guestName || '',
      preparedFor: selectedLead?.name || selectedLead?.customerName || pkg?.preparedFor || '',
      guestPhone: selectedLead?.phone || '',
      guestEmail: selectedLead?.email || '',
      travelDate,
      adults: selectedLead?.adults,
      children: selectedLead?.children,
      numberOfRooms: rooms,
      rooms: rooms,
      roomsWithMattress: mattresses,
      extraBeds: mattresses,
    };
  };

  const selectLead = async (lead) => {
    setState({ ...defaultWizardState, leadId: lead._id });
    setLeads((prev) => upsertLeadRow(prev, lead));
    setSelectedPkgDetail(null);
    setCustomItinerary([]);
    setCustomInclusions([]);
    setCustomExclusions([]);
    setCustomizeTab('itinerary');
    setDayWiseHotels([]);
    setSelectedPackageCab(null);
    setExtraCabs([]);
    setStayWithMattress(false);
    setStep(2);
    // Load full lead detail so quotation hotels get exact rooms + mattresses.
    try {
      const path = leadDetailPathForMode(mode, lead._id, config.leadsPath);
      const { data } = await API.get(path, { skipErrorToast: true });
      if (data?._id) setLeads((prev) => upsertLeadRow(prev, data));
    } catch {
      /* list fields may already include rooms after API fix */
    }
  };

  const buildFallbackItinerary = (detail) => {
    const days = Math.max(1, Number(detail.duration) || 1);
    const destination = detail.destination || 'Destination';
    return Array.from({ length: days }, (_, index) =>
      defaultItineraryDay(index + 1, destination)
    );
  };

  const applyPackageDetail = (detail, meta = {}) => {
    const cloned = JSON.parse(JSON.stringify(detail));
    const rawItinerary = resolvePackageItinerary(cloned);
    const itinerarySource = rawItinerary.length > 0 ? rawItinerary : buildFallbackItinerary(cloned);
    const itinerary = itinerarySource.map((d, index) => ({
      ...d,
      id: d.id || `day-${d.day || index + 1}`,
      day: d.day || index + 1,
    }));
    const packageCabs = resolvePackageCabs(cloned);
    const listMargin = Number(meta.listItem?.destinationMarginPercent || 0) || 0;
    const detailMargin = Number(cloned.destinationMarginPercent || 0) || 0;
    const normalized = {
      ...cloned,
      itinerary,
      packageCabs,
      // Prefer detail margin; fall back to list card margin so admin % is never dropped
      destinationMarginPercent: detailMargin || listMargin,
      destinationMarginApplied:
        Boolean(cloned.destinationMarginApplied) || listMargin > 0,
      baseStartingPrice: Number(
        cloned.baseStartingPrice ??
          meta.listItem?.baseStartingPrice ??
          cloned.startingPrice ??
          meta.listItem?.startingPrice ??
          0
      ),
    };
    logSelectedPackageDebug(normalized, meta);
    const inclusions = pickInclusionExclusionList(
      normalized.inclusions,
      normalized.includes,
      normalized._apiRaw?.package?.inclusions,
      normalized._apiRaw?.package?.includes
    );
    const exclusions = pickInclusionExclusionList(
      normalized.exclusions,
      normalized.excludes,
      normalized._apiRaw?.package?.exclusions,
      normalized._apiRaw?.package?.excludes
    );
    setSelectedPkgDetail({ ...normalized, inclusions, exclusions });
    setCustomItinerary(itinerary.map((d) => ({ ...d })));
    setCustomInclusions(inclusions.length ? [...inclusions] : ['']);
    setCustomExclusions(exclusions.length ? [...exclusions] : ['']);
    setCustomizeTab('itinerary');

    // Seed day-wise hotels — package MAP (same as website), not lead meal override
    const seededHotels = expandDayWiseHotelsForParty(
      seedDayWiseHotelsFromItinerary(
        itinerary,
        'map',
        normalized._apiRaw?.dayOptions?.stays || normalized.stays || []
      ),
      selectedLead,
      itinerary
    );
    setDayWiseHotels(seededHotels);
    // Pull real on/off season racks from Hotel Control (package seed often lacks offSeason).
    enrichDayWiseHotelsFromCatalog(seededHotels).then((enriched) => {
      setDayWiseHotels(
        expandDayWiseHotelsForParty(
          applyHotelSeasonToSelections(enriched, hotelSeason),
          selectedLead,
          itinerary
        )
      );
    });
    // Volvo packages: keep Alto (default) as primary + auto-attach Volvo bus as extra cab(s)
    const defaultCab = packageCabs.find((c) => c.isDefault) || packageCabs[0] || null;
    const companions = suggestCompanionCabs(packageCabs, defaultCab);
    setExtraCabs(companions);
    setStayWithMattress(false);

    // Auto-select default package cab from day-options
    setSelectedPackageCab(defaultCab);

    setState((s) => {
      const packageStart = Number(
        normalized.baseStartingPrice ?? normalized.startingPrice ?? 0
      );
      const adminMarginPct = Number(normalized.destinationMarginPercent || 0) || 0;
      const capacity = getPartyCapacityReadiness({
        lead: selectedLead,
        dayWiseHotels: seededHotels,
        itinerary,
        selectedCab: defaultCab,
        extraCabs: companions,
        cabSeats: defaultCab?.seatingCapacity || 4,
        stayWithMattress: false,
      });
      const aligned = buildWebsiteAlignedQuoteCosts({
        packageAnchor: packageStart,
        dayWiseHotels: seededHotels,
        selectedCab: defaultCab,
        packageCabs,
        lead: selectedLead,
        pkg: {
          ...normalized,
          startingPrice: packageStart,
          baseStartingPrice: packageStart,
        },
        cabSeats: defaultCab?.seatingCapacity || 4,
        extraCabs: companions,
        capacityReady: capacity.ready,
        roomsReady: capacity.roomsReady,
        cabReady: capacity.cabReady,
        capacityMessage: capacity.message,
        requiredRooms: capacity.requiredRooms,
        requiredCabs: capacity.requiredCabs,
        occupancyOverride: capacity.occupancyOverride,
      });
      const party = aligned.party;
      const rawPricing = {
        ...s.pricing,
        baseCost: 0,
        hotelCost: aligned.hotelCost,
        cabCost: aligned.cabCost,
        flightCost: 0,
        activityCost: 0,
        markupPercent: Number(s.pricing.markupPercent || 0) || 0,
        party: {
          adults: party.adults,
          children: party.children,
          travelers: party.travelers,
          rooms: party.rooms,
          mattresses: party.mattresses,
          cabCount: party.cabCount,
          cabSeats: party.cabSeats,
          perPersonRate: party.perPersonRate,
          hotelRackSum: party.hotelRackSum,
          mattressCost: party.mattressCost,
          capacityPending: party.capacityPending,
          capacityReady: party.capacityReady,
          roomsReady: party.roomsReady,
          cabReady: party.cabReady,
          capacityMessage: party.capacityMessage,
          requiredRooms: party.requiredRooms,
          requiredCabs: party.requiredCabs,
          stayWithMattress: Boolean(party.stayWithMattress),
        },
      };
      const baked = bakeCompanyMarginIntoLineCosts(rawPricing, adminMarginPct);
      const priced = applyAskDiscount(baked);
      return {
        ...s,
        pricing: {
          ...priced,
          ...calculatePricing(priced),
          party: rawPricing.party,
        },
      };
    });
  };

  const selectPackage = async (pkg) => {
    const id = pkg._id || pkg.id;
    setState((s) => ({ ...s, packageId: id }));
    setCustomItinerary([]);
    setCustomInclusions([]);
    setCustomExclusions([]);
    setCustomizeTab('itinerary');
    setSelectedPkgDetail(null);
    setDayWiseHotels([]);
    setSelectedPackageCab(null);
    setExtraCabs([]);
    setStayWithMattress(false);
    setOpeningPackageMeta({
      name: pkg.name || 'Your package',
      destination: pkg.destination || pkg.routing || selectedLead?.destination || '',
    });
    setLoadingPackageDetail(true);
    try {
      if (pkg.catalogSource === 'custom' || isMongoPackageId(id)) {
        const res = await API.get(`/packages/${id}`, { skipErrorToast: true });
        applyPackageDetail(res.data, { source: 'local_crm', listItem: pkg, apiPath: `/packages/${id}` });
      } else {
        const detail = await fetchPublicPackageDetail(pkg.slug || id, {
          travelDate: toYmd(selectedLead?.travelDate),
          adults: selectedLead?.adults || 2,
          rooms: selectedLead?.numberOfRooms || 1,
        });
        applyPackageDetail(detail, {
          source: 'catalog',
          listItem: pkg,
          apiPath: `/public-packages/${pkg.slug || id}`,
        });
      }
    } catch {
      applyPackageDetail(pkg, { source: 'list_fallback', listItem: pkg });
    } finally {
      setLoadingPackageDetail(false);
      setStep(3);
    }
  };

  const handleCreatePackageSubmit = async (data) => {
    if (creatingPackage) return;
    setCreatingPackage(true);
    try {
      const packageCabs = Array.isArray(data.packageCabs) ? data.packageCabs : [];
      const res = await API.post('/packages', {
        ...data,
        sourceType: 'local',
        destination: data.destination || selectedLead?.destination || '',
        packageCabs,
        fullData: {
          ...data,
          itinerary: data.itinerary || [],
          packageCabs,
        },
      });
      const created = {
        ...res.data,
        catalogSource: 'custom',
        _id: res.data._id || res.data.id,
      };
      setCreatePackageOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['quotation-packages'] });
      await selectPackage(created);
    } catch {
      /* axios toast */
    } finally {
      setCreatingPackage(false);
    }
  };

  const toggleId = (key, id) => {
    setState((s) => {
      const arr = s[key].includes(id) ? s[key].filter((x) => x !== id) : [...s[key], id];
      const next = { ...s, [key]: arr };
      if (key === 'selectedActivityIds') next.activitiesSkipped = false;
      return next;
    });
  };

  useEffect(() => {
    const packageAnchor = Number(
      selectedPkgDetail?.baseStartingPrice ?? selectedPkgDetail?.startingPrice ?? 0
    );
    const packageCabs = resolvePackageCabs(selectedPkgDetail || {});
    const flightCost = flights
      .filter((f) => state.selectedFlightIds.includes(f._id))
      .reduce((s, f) => s + (f.cost || 0), 0);
    const activityCost = activities
      .filter((a) => state.selectedActivityIds.includes(a._id))
      .reduce((s, a) => s + (a.price || 0), 0);
    const adminMarginPct =
      Number(
        selectedPkgDetail?.destinationMarginPercent ??
          state.pricing.companyMarginBakedPercent ??
          state.pricing.adminMarginPercent ??
          0
      ) || 0;
    const capacity = getPartyCapacityReadiness({
      lead: selectedLead,
      dayWiseHotels,
      itinerary: customItinerary,
      selectedCab: selectedPackageCab,
      extraCabs,
      cabSeats: selectedPackageCab?.seatingCapacity || 4,
      stayWithMattress,
    });
    const aligned = buildWebsiteAlignedQuoteCosts({
      packageAnchor,
      dayWiseHotels,
      selectedCab: selectedPackageCab,
      packageCabs,
      lead: selectedLead,
      pkg: {
        ...(selectedPkgDetail || {}),
        startingPrice: packageAnchor,
        baseStartingPrice: packageAnchor,
      },
      cabSeats: selectedPackageCab?.seatingCapacity || 4,
      flightCost,
      activityCost,
      extraCabs,
      capacityReady: capacity.ready,
      roomsReady: capacity.roomsReady,
      cabReady: capacity.cabReady,
      capacityMessage: capacity.message,
      requiredRooms: capacity.requiredRooms,
      requiredCabs: capacity.requiredCabs,
      occupancyOverride: capacity.occupancyOverride,
      hotelSeason,
    });
    const party = aligned.party;
    const rawPricing = {
      baseCost: 0,
      hotelCost: aligned.hotelCost,
      cabCost: aligned.cabCost,
      flightCost: party.flightCost,
      activityCost: party.activityCost,
      markupPercent: Number(state.pricing.markupPercent || 0) || 0,
      discount: Number(state.pricing.discount || 0) || 0,
      askDiscount: isEditMode ? Boolean(state.pricing.askDiscount) : false,
      autoDiscountAmount: isEditMode ? Number(state.pricing.autoDiscountAmount || 0) || 0 : 0,
      extraDiscount: isEditMode ? Number(state.pricing.extraDiscount || 0) || 0 : 0,
      extraDiscountPending: isEditMode ? Boolean(state.pricing.extraDiscountPending) : false,
      gstEnabled: Boolean(state.pricing.gstEnabled),
      markup: 0,
    };
    const baked = bakeCompanyMarginIntoLineCosts(rawPricing, adminMarginPct);
    const priced = applyAskDiscount(baked);
    const calc = calculatePricing(priced);

    setState((s) => {
      const nextPricing = {
        ...s.pricing,
        baseCost: 0,
        hotelCost: baked.hotelCost,
        cabCost: baked.cabCost,
        flightCost: baked.flightCost,
        activityCost: baked.activityCost,
        adminMarginPercent: baked.adminMarginPercent,
        companyMarginBaked: baked.companyMarginBaked,
        companyMarginBakedPercent: baked.companyMarginBakedPercent,
        discount: priced.discount,
        askDiscount: Boolean(priced.askDiscount),
        autoDiscountAmount: Number(priced.autoDiscountAmount || 0) || 0,
        extraDiscount: Number(priced.extraDiscount || 0) || 0,
        extraDiscountPending: Boolean(priced.extraDiscountPending),
        taxes: calc.taxes,
        markup: calc.markup,
        total: calc.total,
        profitMargin: calc.profitMargin,
        party: {
          adults: party.adults,
          children: party.children,
          travelers: party.travelers,
          rooms: party.rooms,
          mattresses: party.mattresses,
          cabCount: party.cabCount,
          cabSeats: party.cabSeats,
          perPersonRate: party.perPersonRate,
          hotelRackSum: party.hotelRackSum,
          mattressCost: party.mattressCost,
          capacityPending: party.capacityPending,
          capacityReady: party.capacityReady,
          roomsReady: party.roomsReady,
          cabReady: party.cabReady,
          capacityMessage: party.capacityMessage,
          requiredRooms: party.requiredRooms,
          requiredCabs: party.requiredCabs,
          stayWithMattress: Boolean(party.stayWithMattress),
        },
      };

      const prev = s.pricing || {};
      const same =
        Number(prev.baseCost || 0) === Number(nextPricing.baseCost || 0) &&
        Number(prev.hotelCost || 0) === Number(nextPricing.hotelCost || 0) &&
        Number(prev.cabCost || 0) === Number(nextPricing.cabCost || 0) &&
        Number(prev.flightCost || 0) === Number(nextPricing.flightCost || 0) &&
        Number(prev.activityCost || 0) === Number(nextPricing.activityCost || 0) &&
        Number(prev.companyMarginBakedPercent || 0) === Number(nextPricing.companyMarginBakedPercent || 0) &&
        Boolean(prev.companyMarginBaked) === Boolean(nextPricing.companyMarginBaked) &&
        Number(prev.taxes || 0) === Number(nextPricing.taxes || 0) &&
        Number(prev.markup || 0) === Number(nextPricing.markup || 0) &&
        Number(prev.total || 0) === Number(nextPricing.total || 0) &&
        Number(prev.discount || 0) === Number(nextPricing.discount || 0) &&
        Boolean(prev.askDiscount) === Boolean(nextPricing.askDiscount) &&
        Number(prev.extraDiscount || 0) === Number(nextPricing.extraDiscount || 0) &&
        Number(prev.party?.rooms || 0) === Number(nextPricing.party?.rooms || 0) &&
        Number(prev.party?.cabCount || 0) === Number(nextPricing.party?.cabCount || 0) &&
        Number(prev.party?.adults || 0) === Number(nextPricing.party?.adults || 0) &&
        Boolean(prev.party?.capacityPending) === Boolean(nextPricing.party?.capacityPending) &&
        Boolean(prev.party?.stayWithMattress) === Boolean(nextPricing.party?.stayWithMattress) &&
        String(prev.party?.capacityMessage || '') === String(nextPricing.party?.capacityMessage || '');

      if (same) return s;
      return { ...s, pricing: nextPricing };
    });
    // Intentionally omit taxes/markup/total — those are outputs of this effect
  }, [
    selectedPackageCab,
    selectedPkgDetail,
    selectedLead,
    state.selectedFlightIds,
    state.selectedActivityIds,
    flights,
    activities,
    state.pricing.discount,
    state.pricing.askDiscount,
    state.pricing.extraDiscount,
    state.pricing.gstEnabled,
    state.pricing.markupPercent,
    dayWiseHotels,
    extraCabs,
    customItinerary,
    stayWithMattress,
    hotelSeason,
    isEditMode,
  ]);

  const handleSave = async (saveAs) => {
    if (!state.leadId || !state.packageId) return;
    const status = saveAs === 'draft' ? config.draftStatus : config.submitStatus;
    if (
      mode === 'executive' &&
      saveAs === 'submit' &&
      needsResubmissionReason &&
      !resubmissionReason.trim()
    ) {
      return;
    }
    setSaving(true);
    try {
      const pricingPayload = applyAskDiscount(
        isEditMode
          ? state.pricing || {}
          : {
              ...(state.pricing || {}),
              askDiscount: false,
              discount: 0,
              autoDiscountAmount: 0,
              extraDiscount: 0,
              extraDiscountPending: false,
            }
      );
      const extraDiscountReason = hasExtraDiscountRequest(pricingPayload)
        ? `Extra discount requested beyond auto 5% (₹${Number(pricingPayload.extraDiscount || 0).toLocaleString('en-IN')}) — pending manager approval`
        : '';
      const payload = {
        quoteNumber: isEditMode && editMeta.quoteNumber
          ? editMeta.quoteNumber
          : `Q-${Date.now().toString().slice(-6)}`,
        leadId: state.leadId,
        packageId: isMongoPackageId(state.packageId) ? state.packageId : null,
        status,
        pricing: pricingPayload,
        selectedHotels: buildSelectedHotelsSnapshot(dayWiseHotels, {
          rooms: state.pricing?.party?.rooms || 1,
          mattresses: state.pricing?.party?.mattresses || 0,
        }),
        selectedCabs: buildSelectedCabSnapshot(selectedPackageCab, {
          vehicleCount: state.pricing?.party?.cabCount || selectedPackageCab?._vehicleCount || 1,
          travelers: state.pricing?.party?.travelers,
          extraCabs,
        }),
        selectedFlights: flights.filter((f) => state.selectedFlightIds.includes(f._id)),
        selectedActivities: activities.filter((a) => state.selectedActivityIds.includes(a._id)),
        package: buildPackageSnapshot(activePkg),
        customizations: state.customizations,
        ...(mode === 'executive' && saveAs === 'submit'
          ? {
              resubmissionReason: (
                needsResubmissionReason
                  ? resubmissionReason.trim()
                  : extraDiscountReason
              ) || extraDiscountReason,
            }
          : {}),
      };

      let res;
      if (isEditMode && editQuoteId && config.editPath) {
        if (mode === 'executive') {
          res = await API.put(config.editPath(editQuoteId), {
            action: 'edit',
            data: payload,
          });
        } else {
          res = await API.put(config.editPath(editQuoteId), payload);
        }
      } else {
        res = await API.post(config.savePath, payload);
      }

      const savedStatus = res.data?.status;
      const leadId = state.leadId || res.data?.lead?._id || res.data?.lead;
      const message = isEditMode
        ? savedStatus === 'draft'
          ? 'Quotation updated and saved as draft.'
          : savedStatus === 'pending_approval'
            ? 'Quotation updated and submitted for approval.'
            : savedStatus === 'approved'
              ? 'Quotation updated and approved.'
              : savedStatus === 'sent'
                ? 'Quotation updated and sent.'
                : 'Quotation updated.'
        : savedStatus === 'approved'
          ? 'First quotation created and approved. You can send it to the customer.'
          : savedStatus === 'pending_approval'
            ? hasExtraDiscountRequest(pricingPayload)
              ? 'Extra discount requested. Quotation saved and sent to manager — status Pending until approved.'
              : 'Quotation submitted for approval. It is now on the lead activity timeline.'
            : savedStatus === 'sent'
              ? 'Quotation saved and sent. Check the lead activity timeline.'
              : 'Quotation saved as draft.';

      if (leadId) {
        await Promise.all([
          invalidateLeadDetail(queryClient, leadId),
          invalidateLeadLists(queryClient),
          invalidateNavCounts(queryClient),
          queryClient.invalidateQueries({ queryKey: ['lead-quotations'] }),
        ]);
      }

      const successUrl = leadId
        ? config.leadViewPath(String(leadId))
        : mode === 'executive'
          ? config.successPath
          : `${config.successPath}?view=${res.data._id}`;

      navigate(successUrl, {
        replace: true,
        state: {
          message,
          focusTimeline: Boolean(leadId),
          quotationId: res.data?._id || editQuoteId,
        },
      });
    } catch (err) {
      /* toast via axios */
    } finally {
      setSaving(false);
    }
  };

  const draftQuote = selectedLead && activePkg ? {
    quoteNumber: isEditMode && editMeta.quoteNumber ? editMeta.quoteNumber : 'PREVIEW',
    createdAt: new Date().toISOString(),
    lead: {
      ...selectedLead,
      name: selectedLead.name || selectedLead.customerName || selectedLead.fullName || '',
      phone: selectedLead.phone || selectedLead.mobile || selectedLead.whatsapp || '',
    },
    leadName: selectedLead.name || selectedLead.customerName || selectedLead.fullName || '',
    package: buildPackageSnapshot(activePkg),
    packageSnapshot: buildPackageSnapshot(activePkg),
    pricing: state.pricing,
    selectedHotels: buildSelectedHotelsSnapshot(dayWiseHotels, {
      rooms: state.pricing?.party?.rooms || 1,
      mattresses: state.pricing?.party?.mattresses || 0,
    }),
    selectedCabs: buildSelectedCabSnapshot(selectedPackageCab, {
      vehicleCount: state.pricing?.party?.cabCount || 1,
      travelers: state.pricing?.party?.travelers,
      extraCabs,
    }),
    tripPlanner: {
      name: selectedLead.assignedTo?.name || user?.name || '',
      phone: selectedLead.assignedTo?.phone || user?.phone || '',
      email: selectedLead.assignedTo?.email || user?.email || '',
    },
    createdBy: user
      ? { name: user.name, phone: user.phone, email: user.email }
      : undefined,
  } : null;

  const inBuilder = step >= 3 && Boolean(activePkg);

  if (loadingEdit) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
        <p className="text-sm text-slate-500">Loading quotation for edit…</p>
      </div>
    );
  }

  return (
    <div className={cn(
      inBuilder
        ? 'mx-auto max-w-[1440px] pb-0'
        : 'mx-auto max-w-5xl px-3 pt-3 pb-28 sm:px-4 sm:pt-4 xl:pb-12',
    )}
    >
      {!inBuilder && (
        <>
          <div className="mb-3 flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-950 px-3 py-2.5 sm:px-4">
            <Link
              to={config.backPath}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white hover:bg-white/20"
              aria-label="Back"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-bold text-white sm:text-base">
                {isEditMode ? 'Edit Quotation' : config.title}
              </h1>
              <p className="truncate text-[11px] text-slate-400">
                {isEditMode && editMeta.quoteNumber
                  ? `Updating ${editMeta.quoteNumber}`
                  : 'Lead → Package → Builder'}
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              {WIZARD_STEPS.filter((s) => s.id <= 3 || s.id === 8).map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => s.id <= step && setStep(s.id === 8 ? 3 : s.id)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-bold',
                    step === s.id || (s.id === 3 && step >= 3)
                      ? 'bg-teal-400 text-slate-950'
                      : s.id < step
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-white/10 text-slate-400',
                    s.id > step && 'opacity-50 cursor-default'
                  )}
                >
                  <span>{idx + 1}</span>
                  <span className="hidden md:inline">
                    {s.id === 3 ? 'Builder' : s.id === 1 ? 'Lead' : s.id === 2 ? 'Package' : s.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {config.approvalNote && !isEditMode && (
            <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 sm:text-xs">
              {config.approvalNote}
            </p>
          )}
        </>
      )}

      {inBuilder ? (
        <PackageBuilderWorkspace
          lead={selectedLead}
          pkg={activePkg}
          itinerary={customItinerary}
          onItineraryChange={setCustomItinerary}
          inclusions={customInclusions}
          exclusions={customExclusions}
          onInclusionsChange={setCustomInclusions}
          onExclusionsChange={setCustomExclusions}
          dayWiseHotels={dayWiseHotels}
          onDayWiseHotelsChange={handleDayWiseHotelChange}
          selectedPackageCab={selectedPackageCab}
          onCabChange={setSelectedPackageCab}
          extraCabs={extraCabs}
          onExtraCabsChange={setExtraCabs}
          stayWithMattress={stayWithMattress}
          onStayWithMattressChange={setStayWithMattress}
          hotelSeason={hotelSeason}
          onHotelSeasonChange={setHotelSeason}
          packageCabs={resolvePackageCabs(activePkg || {})}
          pricing={state.pricing}
          onPricingChange={(p) => setState((s) => ({ ...s, pricing: p }))}
          nights={packageNights}
          hotelDestination={hotelDestination}
          draftQuote={draftQuote}
          onBack={() => setStep(2)}
          onSaveDraft={() => handleSave('draft')}
          onSubmit={() => handleSave('submit')}
          saving={saving}
          draftLabel={isEditMode ? 'Update Draft' : config.draftLabel}
          submitLabel={isEditMode ? 'Update & Submit' : config.submitLabel}
          emailEndpoint={emailEndpointForMode(mode)}
          needsResubmissionReason={mode === 'executive' && needsResubmissionReason}
          resubmissionReason={resubmissionReason}
          onResubmissionReasonChange={setResubmissionReason}
          allowAskDiscount={isEditMode}
          disableSubmit={
            mode === 'executive' && needsResubmissionReason && !resubmissionReason.trim()
          }
        />
      ) : (
      <div className="min-h-[360px] rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.35)] sm:min-h-[400px] sm:p-7">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {step === 1 && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">Select Lead</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {debouncedLeadSearch.trim().length >= 2
                        ? 'Search results'
                        : 'Leads that already received a package / quotation — search to find others'}
                    </p>
                  </div>
                  {state.leadId && config.leadViewPath && (
                    <Link
                      to={config.leadViewPath(state.leadId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                    >
                      View Lead <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
                {selectedLead && (
                  <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-white px-4 py-3.5 text-sm">
                    <p className="font-bold text-slate-900">{selectedLead.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{selectedLead.destination} · {shortLeadMealPlan(selectedLead)}</p>
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    placeholder="Search name, phone, destination…"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100"
                  />
                </div>
                {loadingLeads ? (
                  <p className="py-8 text-center text-sm text-slate-500">Searching leads…</p>
                ) : leads.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    {debouncedLeadSearch.trim().length >= 2
                      ? 'No leads found'
                      : 'No package-shared leads yet — type at least 2 characters to search all leads'}
                  </p>
                ) : (
                <VirtualizedList
                  items={leads}
                  estimateSize={76}
                  maxHeight="min(50dvh, 400px)"
                  className="grid gap-2"
                  renderItem={(l) => (
                    <button
                      type="button"
                      onClick={() => selectLead(l)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-all sm:p-4',
                        state.leadId === l._id
                          ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-200/70 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-teal-200 hover:bg-slate-50',
                      )}
                    >
                      <Avatar name={l.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900">{l.name}</p>
                        <p className="text-xs text-slate-500">{l.destination} · {formatINR(l.budget)}</p>
                      </div>
                    </button>
                  )}
                />
                )}
              </div>
            )}
            {step === 2 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold sm:text-lg">Select Package</h2>
                    <p className="text-xs text-slate-500">
                      Packages related to lead destination
                      {selectedLead?.destination ? (
                        <> — <span className="font-medium text-slate-800">{selectedLead.destination}</span></>
                      ) : null}
                    </p>
                  </div>
                  {canCreatePackage ? (
                    <Button
                      type="button"
                      className="shrink-0 gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white border-0 font-semibold"
                      onClick={() => setCreatePackageOpen(true)}
                      disabled={creatingPackage || loadingPackageDetail}
                    >
                      <Plus className="h-4 w-4" />
                      Create new package
                    </Button>
                  ) : null}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={packageSearch}
                    onChange={(e) => {
                      setPackageSearch(e.target.value);
                      setPackagePage(0);
                    }}
                    placeholder="Search by name or days (e.g. Goa, 3 days, 3D)…"
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>
                {loadingPackages ? (
                  <p className="py-8 text-center text-sm text-slate-500">Loading packages...</p>
                ) : (
                <>
                <div className="max-h-[min(50dvh,420px)] space-y-2 overflow-y-auto">
                  {filteredPackages.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                      <p className="text-sm text-slate-500">
                        {packages.length === 0
                          ? 'No packages found for this lead destination.'
                          : 'No packages match your search. Try another keyword from the package name.'}
                      </p>
                      {canCreatePackage ? (
                        <Button
                          type="button"
                          className="mt-4 gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white border-0 font-semibold"
                          onClick={() => setCreatePackageOpen(true)}
                          disabled={creatingPackage || loadingPackageDetail}
                        >
                          <Plus className="h-4 w-4" />
                          Create new package
                        </Button>
                      ) : null}
                    </div>
                  ) : pagedPackages.map((p) => (
                    <button
                      key={`${p.catalogSource || 'pkg'}-${p._id}`}
                      type="button"
                      onClick={() => selectPackage(p)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
                        state.packageId === p._id
                          ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-200/70'
                          : 'border-slate-200 hover:bg-slate-50',
                      )}
                    >
                      {p.coverImage ? (
                        <img src={p.coverImage} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover" loading="lazy" />
                      ) : (
                        <div className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 bg-slate-100" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-semibold text-slate-900">{p.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {p.destination} · {p.durationLabel || `${p.duration}D`} · from {formatINR(p.startingPrice)}
                        </p>
                      </div>
                      {p.catalogSource === 'custom' && (
                        <span className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-bold uppercase text-teal-800">
                          Your copy
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {filteredPackages.length > PACKAGES_PAGE_SIZE && (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-xs text-slate-500">
                      Showing {packageShowingFrom}–{packageShowingTo} of {filteredPackages.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={safePackagePage <= 0}
                        onClick={() => setPackagePage((p) => Math.max(0, p - 1))}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Prev
                      </button>
                      <span className="px-2 text-xs font-semibold tabular-nums text-slate-600">
                        {safePackagePage + 1}/{packagePageCount}
                      </span>
                      <button
                        type="button"
                        disabled={safePackagePage >= packagePageCount - 1}
                        onClick={() => setPackagePage((p) => Math.min(packagePageCount - 1, p + 1))}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium disabled:opacity-40"
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                </>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Desktop footer */}
        <div className="mt-8 hidden justify-between border-t border-slate-100 pt-6 xl:flex">
          <Button type="button" variant="outline" className="gap-2 rounded-2xl h-11 border-slate-200" disabled={step === 1} onClick={() => setStep((s) => s - 1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
          {step === 1 ? (
            <Button type="button" className="gap-2 rounded-2xl h-11 bg-teal-600 hover:bg-teal-500 text-white border-0 font-bold shadow-lg shadow-teal-700/20" onClick={() => setStep(2)} disabled={!state.leadId}>Continue <ArrowRight className="h-4 w-4" /></Button>
          ) : (
            <Button type="button" className="gap-2 rounded-2xl h-11 bg-orange-500 hover:bg-orange-400 text-slate-950 border-0 font-bold shadow-lg shadow-orange-600/25" disabled={!state.packageId || loadingPackageDetail} onClick={() => state.packageId && setStep(3)}>
              Open Builder <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      )}

      {!inBuilder ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 px-3 pt-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] shadow-[0_-10px_32px_rgba(15,23,42,0.14)] backdrop-blur-md xl:hidden">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 gap-1.5 rounded-2xl px-3 border-slate-200"
              disabled={step === 1}
              onClick={() => setStep((s) => s - 1)}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {step === 1 ? (
              <Button
                type="button"
                className="h-11 flex-1 gap-2 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white border-0 font-bold"
                onClick={() => setStep(2)}
                disabled={!state.leadId}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                className="h-11 flex-1 gap-2 rounded-2xl bg-orange-500 hover:bg-orange-400 text-slate-950 border-0 font-bold"
                disabled={!state.packageId || loadingPackageDetail}
                onClick={() => state.packageId && setStep(3)}
              >
                Open Builder <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <PackageBuilderOpeningOverlay
        open={loadingPackageDetail}
        packageName={openingPackageMeta.name}
        destination={openingPackageMeta.destination}
      />

      {canCreatePackage ? (
        <PackageFormModal
          open={createPackageOpen}
          onClose={() => {
            if (creatingPackage) return;
            setCreatePackageOpen(false);
          }}
          onSubmit={handleCreatePackageSubmit}
          editPackage={null}
          isCreate
          defaultDestination={selectedLead?.destination || ''}
        />
      ) : null}
    </div>
  );
}
