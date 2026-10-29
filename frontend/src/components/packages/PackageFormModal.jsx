import { Car, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import AppModal from '../ui/AppModal';
import { defaultItineraryDay } from '../quotations/quotationUtils';
import ItineraryBuilder from './ItineraryBuilder';
import InclusionExclusionEditor, { cleanInclusionExclusionLines } from '../quotations/InclusionExclusionEditor';
import { resolvePackageCabs } from '../../lib/packageCabMapper';

const emptyCab = () => ({
  id: `cab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  seatingCapacity: 4,
  absoluteFare: '',
  isDefault: false,
});

const empty = {
  name: '',
  destination: '',
  duration: 5,
  startingPrice: '',
  packageType: 'domestic',
  itinerary: [],
  inclusions: [''],
  exclusions: [''],
  packageCabs: [emptyCab()],
};

function normalizePackageCabs(cabs = []) {
  const list = (Array.isArray(cabs) ? cabs : [])
    .map((cab, index) => {
      const name = String(cab?.name || '').trim();
      if (!name) return null;
      const absoluteFare = Math.max(0, Number(cab.absoluteFare ?? cab.totalAmount ?? cab.cost ?? 0) || 0);
      const seats = Math.max(1, Number(cab.seatingCapacity ?? cab.seats ?? 4) || 4);
      return {
        id: cab.id || cab.packageCabId || `local-cab-${index + 1}`,
        packageCabId: cab.id || cab.packageCabId || `local-cab-${index + 1}`,
        name,
        vehicleType: name,
        cabCategory: name,
        seatingCapacity: seats,
        seats,
        absoluteFare,
        totalAmount: absoluteFare,
        cost: absoluteFare,
        price_delta: absoluteFare,
        priceDelta: 0,
        upgradePrice: 0,
        isDefault: Boolean(cab.isDefault),
        is_default: Boolean(cab.isDefault),
        isActive: true,
        isPackageCab: true,
        externalSource: 'local_package',
        tripType: 'full_day',
      };
    })
    .filter(Boolean);

  if (!list.length) return [];
  if (!list.some((c) => c.isDefault)) {
    list[0].isDefault = true;
    list[0].is_default = true;
  }
  return list;
}

export default function PackageFormModal({
  open,
  onClose,
  onSubmit,
  editPackage,
  isClone,
  isCreate,
  defaultDestination = '',
}) {
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (editPackage) {
      const resolved = resolvePackageCabs(editPackage);
      const existingCabs = resolved.length
        ? resolved
        : editPackage.packageCabs?.length
          ? editPackage.packageCabs
          : editPackage.fullData?.packageCabs?.length
            ? editPackage.fullData.packageCabs
            : [];
      setForm({
        ...editPackage,
        startingPrice: editPackage.startingPrice || '',
        inclusions: editPackage.inclusions?.length ? [...editPackage.inclusions] : [''],
        exclusions: editPackage.exclusions?.length ? [...editPackage.exclusions] : [''],
        itinerary: editPackage.itinerary?.length
          ? editPackage.itinerary.map((d) => ({ ...d }))
          : [defaultItineraryDay(1, editPackage.destination || '')],
        packageCabs: existingCabs.length
          ? existingCabs.map((c) => ({
              id: c.id || c.packageCabId || emptyCab().id,
              name: c.name || c.vehicleType || '',
              seatingCapacity: c.seatingCapacity || c.seats || 4,
              absoluteFare:
                c.absoluteFare ??
                c.totalAmount ??
                c.price_delta ??
                c.cost ??
                '',
              isDefault: Boolean(c.isDefault ?? c.is_default),
            }))
          : [emptyCab()],
      });
    } else {
      const dest = String(defaultDestination || '').trim();
      setForm({
        ...empty,
        destination: dest,
        packageCabs: [{ ...emptyCab(), isDefault: true }],
        itinerary: [
          defaultItineraryDay(1, dest),
          defaultItineraryDay(2, dest),
          defaultItineraryDay(3, dest),
          defaultItineraryDay(4, dest),
        ],
      });
    }
  }, [editPackage, open, defaultDestination]);

  const updateCab = (index, patch) => {
    setForm((prev) => {
      const packageCabs = [...(prev.packageCabs || [])];
      packageCabs[index] = { ...packageCabs[index], ...patch };
      if (patch.isDefault) {
        packageCabs.forEach((cab, i) => {
          if (i !== index) packageCabs[i] = { ...cab, isDefault: false };
        });
      }
      return { ...prev, packageCabs };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const packageCabs = normalizePackageCabs(form.packageCabs);
    onSubmit({
      ...form,
      startingPrice: Number(form.startingPrice),
      duration: form.itinerary.length || Number(form.duration),
      inclusions: cleanInclusionExclusionLines(form.inclusions),
      exclusions: cleanInclusionExclusionLines(form.exclusions),
      packageCabs,
    });
  };

  return (
    <AppModal open={open} onClose={onClose} size="2xl" className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-bold text-content-primary">
            {isCreate ? 'Create package' : 'Edit package'}
          </h3>
          {isClone && !isCreate && (
            <p className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1 mt-2 inline-block">
              This is your private copy — HindHolidays catalog original stays unchanged
            </p>
          )}
          {isCreate && (
            <p className="text-xs text-sky-700 bg-sky-500/10 border border-sky-500/20 rounded-lg px-2.5 py-1 mt-2 inline-block">
              New package will be saved in this CRM for quotations
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-surface-elevated">
          <X className="w-5 h-5" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-content-muted mb-1 block">Package Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-premium w-full h-11 rounded-xl"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-content-muted mb-1 block">Destination *</label>
            <input
              required
              value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
              className="input-premium w-full h-11 rounded-xl"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-content-muted mb-1 block">Starting Price (₹) *</label>
            <input
              required
              type="number"
              min={0}
              value={form.startingPrice}
              onChange={(e) => setForm({ ...form, startingPrice: e.target.value })}
              className="input-premium w-full h-11 rounded-xl"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-content-muted mb-1 block">Tour Type</label>
            <select
              value={form.packageType}
              onChange={(e) => setForm({ ...form, packageType: e.target.value })}
              className="input-premium w-full h-11 rounded-xl"
            >
              <option value="domestic">Domestic</option>
              <option value="international">International</option>
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-subtle bg-surface-base p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-content-primary flex items-center gap-2">
                <Car className="w-4 h-4 text-sky-600" />
                Package cabs
              </p>
              <p className="text-xs text-content-muted mt-0.5">
                Add at least one cab so quotations can select transport
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  packageCabs: [...(prev.packageCabs || []), emptyCab()],
                }))
              }
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-sky-200 bg-sky-50 text-xs font-bold text-sky-700 hover:bg-sky-100"
            >
              <Plus className="w-3.5 h-3.5" />
              Add cab
            </button>
          </div>

          <div className="space-y-2">
            {(form.packageCabs || []).map((cab, index) => (
              <div
                key={cab.id || index}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 rounded-xl border border-subtle bg-white p-3"
              >
                <div className="sm:col-span-4">
                  <label className="text-[10px] font-semibold text-content-muted mb-1 block">Vehicle name</label>
                  <input
                    value={cab.name}
                    onChange={(e) => updateCab(index, { name: e.target.value })}
                    className="input-premium w-full h-10 rounded-xl text-sm"
                    placeholder="Innova / Etios / Tempo"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-semibold text-content-muted mb-1 block">Seats</label>
                  <input
                    type="number"
                    min={1}
                    value={cab.seatingCapacity}
                    onChange={(e) => updateCab(index, { seatingCapacity: e.target.value })}
                    className="input-premium w-full h-10 rounded-xl text-sm"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="text-[10px] font-semibold text-content-muted mb-1 block">Trip fare (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={cab.absoluteFare}
                    onChange={(e) => updateCab(index, { absoluteFare: e.target.value })}
                    className="input-premium w-full h-10 rounded-xl text-sm"
                    placeholder="0"
                  />
                </div>
                <div className="sm:col-span-3 flex items-end gap-2">
                  <label className="flex-1 inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-subtle text-xs font-semibold text-content-secondary cursor-pointer">
                    <input
                      type="radio"
                      name="default-package-cab"
                      checked={Boolean(cab.isDefault)}
                      onChange={() => updateCab(index, { isDefault: true })}
                    />
                    Default
                  </label>
                  {(form.packageCabs || []).length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          packageCabs: prev.packageCabs.filter((_, i) => i !== index),
                        }))
                      }
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-100 text-rose-500 hover:bg-rose-50"
                      aria-label="Remove cab"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <ItineraryBuilder
          itinerary={form.itinerary}
          onChange={(itinerary) => setForm({ ...form, itinerary, duration: itinerary.length })}
          destination={form.destination}
        />

        <div className="rounded-2xl border border-subtle bg-surface-base p-4">
          <InclusionExclusionEditor
            mode="inclusions"
            inclusions={form.inclusions}
            exclusions={form.exclusions}
            onChangeInclusions={(inclusions) => setForm({ ...form, inclusions })}
            onChangeExclusions={(exclusions) => setForm({ ...form, exclusions })}
          />
        </div>

        <div className="rounded-2xl border border-subtle bg-surface-base p-4">
          <InclusionExclusionEditor
            mode="exclusions"
            inclusions={form.inclusions}
            exclusions={form.exclusions}
            onChangeInclusions={(inclusions) => setForm({ ...form, inclusions })}
            onChangeExclusions={(exclusions) => setForm({ ...form, exclusions })}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="amber" className="flex-1 rounded-xl">
            Save copy
          </Button>
        </div>
      </form>
    </AppModal>
  );
}
