"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getLectorUsers,
  createLectorAssignment,
  updateLectorAssignment,
  deleteLectorAssignment,
  getEmployeesForLectorAssignment,
} from "@/actions/lector-config";

export function useLectorUsers() {
  return useQuery({
    queryKey: ["lector-users"],
    queryFn: () => getLectorUsers(),
  });
}

export function useEmployeesForLector() {
  return useQuery({
    queryKey: ["employees-for-lector"],
    queryFn: () => getEmployeesForLectorAssignment(),
  });
}

export function useCreateLectorAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { user_id: string; branch_id: string }) =>
      createLectorAssignment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lector-users"] });
      queryClient.invalidateQueries({ queryKey: ["employees-for-lector"] });
    },
  });
}

export function useUpdateLectorAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { branch_id: string } }) =>
      updateLectorAssignment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lector-users"] });
    },
  });
}

export function useDeleteLectorAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLectorAssignment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lector-users"] });
      queryClient.invalidateQueries({ queryKey: ["employees-for-lector"] });
    },
  });
}
