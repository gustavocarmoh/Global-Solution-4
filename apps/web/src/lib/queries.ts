import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, getStoredUser, onSessionChange, SessionUser } from './api';

export interface CategoryItem {
  id: string;
  slug: string;
  name: string;
  icon: string;
  departmentId: string;
  departmentName: string;
  responseDeadlineDays?: number;
  executionDeadlineDays: number;
  active?: boolean;
}

export interface DepartmentItem {
  id: string;
  name: string;
  responseDeadlineDays: number;
  active: boolean;
  categories: Array<{ id: string; name: string; slug: string }>;
}

/** Centro aproximado de cada bairro, usado para posicionar o mapa. */
export const NEIGHBORHOOD_CENTERS: Record<string, [number, number]> = {
  Centro: [-23.5505, -46.6333],
  'Zona Norte': [-23.5015, -46.625],
  'Vila Nova': [-23.588, -46.672],
  'Jardim das Flores': [-23.564, -46.655],
};
export const CITY_CENTER: [number, number] = [-23.5505, -46.645];

/** Categorias ativas (rota pública). */
export function useCategories() {
  return useQuery<CategoryItem[]>({
    queryKey: ['categories'],
    queryFn: () => apiFetch('/categories'),
    staleTime: 5 * 60_000,
  });
}

/** Departamentos com suas categorias (rota administrativa). */
export function useDepartments() {
  return useQuery<DepartmentItem[]>({
    queryKey: ['admin-departments'],
    queryFn: () => apiFetch('/admin/departments'),
    staleTime: 60_000,
  });
}

/** Usuário da sessão, reativo a login, logout e expiração do token. */
export function useSessionUser(): SessionUser | null {
  const [user, setUser] = useState<SessionUser | null>(() => getStoredUser());
  useEffect(() => onSessionChange(() => setUser(getStoredUser())), []);
  return user;
}
