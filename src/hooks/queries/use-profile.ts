"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCurrentProfile,
  updateProfile,
  updatePassword,
} from "@/actions/profile";

export function useCurrentProfile() {
  return useQuery({
    queryKey: ["current-profile"],
    queryFn: () => getCurrentProfile(),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { first_name?: string; last_name?: string; phone?: string }) =>
      updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current-profile"] });
    },
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      updatePassword(data),
  });
}
