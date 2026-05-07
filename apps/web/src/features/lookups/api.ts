import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CountryCreate,
  CountryUpdate,
  RegionCreate,
  RegionUpdate,
  CityCreate,
  CityUpdate,
  LookupValueCreate,
  LookupValueUpdate,
} from '@streetlifting/domain';
import { api } from '../../lib/api-client.js';

export interface CountryDto {
  id: string;
  codeIso2: string;
  nameRu: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RegionDto {
  id: string;
  countryId: string;
  codeIso: string;
  nameRu: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CityDto {
  id: string;
  regionId: string;
  nameRu: string;
  nameEn: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LookupValueDto {
  id: string;
  kind: string;
  code: string;
  nameRu: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CityListResponse {
  cities: CityDto[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Countries ───────────────────────────────────────────────────────
export function useCountries() {
  return useQuery<{ countries: CountryDto[] }>({
    queryKey: ['references', 'countries'],
    queryFn: () => api.references.countries.list(),
  });
}

export function useCreateCountry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CountryCreate) => api.references.countries.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['references', 'countries'] }),
  });
}

export function useUpdateCountry(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CountryUpdate) => api.references.countries.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['references', 'countries'] }),
  });
}

// ─── Regions ─────────────────────────────────────────────────────────
export function useRegions(countryId?: string) {
  return useQuery<{ regions: RegionDto[] }>({
    queryKey: ['references', 'regions', { countryId }],
    queryFn: () =>
      api.references.regions.list(countryId !== undefined ? { countryId } : {}),
  });
}

export function useCreateRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RegionCreate) => api.references.regions.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['references', 'regions'] }),
  });
}

export function useUpdateRegion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RegionUpdate) => api.references.regions.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['references', 'regions'] }),
  });
}

// ─── Cities ──────────────────────────────────────────────────────────
export function useCities(params: { regionId?: string; countryId?: string; q?: string } = {}) {
  return useQuery<CityListResponse>({
    queryKey: ['references', 'cities', params],
    queryFn: () => api.references.cities.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useCreateCity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CityCreate) => api.references.cities.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['references', 'cities'] }),
  });
}

export function useUpdateCity(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CityUpdate) => api.references.cities.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['references', 'cities'] }),
  });
}

// ─── Lookup values ───────────────────────────────────────────────────
export function useLookups(kind?: string) {
  return useQuery<{ lookups: LookupValueDto[] }>({
    queryKey: ['references', 'lookups', { kind }],
    queryFn: () =>
      api.references.lookups.list(kind !== undefined ? { kind } : {}),
  });
}

export function useCreateLookup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: LookupValueCreate) => api.references.lookups.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['references', 'lookups'] }),
  });
}

export function useUpdateLookup(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: LookupValueUpdate) => api.references.lookups.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['references', 'lookups'] }),
  });
}
