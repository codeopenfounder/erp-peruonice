"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getBranches,
  getBranchKPIs,
  getBranchesForSelect,
  createBranch,
  updateBranch,
  toggleBranchStatus,
} from "@/actions/branches";
import type { BranchFilters, CreateBranchInput, UpdateBranchInput } from "@/types/branch";

const CATALOG_STALE_MS = 10 * 60 * 1000;

// Queries
export function useBranches(filters: BranchFilters = {}) {
  return useQuery({
    queryKey: ["branches", filters],
    queryFn: () => getBranches(filters),
    staleTime: CATALOG_STALE_MS,
  });
}

export function useBranchKPIs() {
  return useQuery({
    queryKey: ["branch-kpis"],
    queryFn: () => getBranchKPIs(),
    staleTime: CATALOG_STALE_MS,
  });
}

export function useBranchesForSelect() {
  return useQuery({
    queryKey: ["branches-select"],
    queryFn: () => getBranchesForSelect(),
    staleTime: 10 * 60 * 1000,
  });
}

// Mutations
export function useCreateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBranchInput) => createBranch(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["branch-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["branches-select"] });
    },
  });
}

export function useUpdateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBranchInput }) =>
      updateBranch(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["branch-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["branches-select"] });
    },
  });
}

export function useToggleBranchStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => toggleBranchStatus(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["branch-kpis"] });
    },
  });
}
