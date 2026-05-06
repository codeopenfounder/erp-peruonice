"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUsers,
  createUser,
  updateUser,
  updateUserPermissions,
  toggleUserActive,
  deleteUser,
} from "@/actions/users";
import type { CreateUserInput, UpdateUserInput, UserPermissionInput } from "@/lib/validators/user";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => getUsers(),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserInput) => createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: UpdateUserInput }) =>
      updateUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdatePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      permissions,
    }: {
      userId: string;
      permissions: UserPermissionInput[];
    }) => updateUserPermissions(userId, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useToggleUserActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => toggleUserActive(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
