"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPreferences, updatePreferences } from "@/actions/preferences";

export function usePreferences() {
  return useQuery({
    queryKey: ["preferences"],
    queryFn: () => getPreferences(),
    staleTime: 30 * 60 * 1000,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: {
      theme?: string;
      font_size?: string;
      locale?: string;
      push_enabled?: boolean;
      quick_access?: string[];
    }) => updatePreferences(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
  });
}
