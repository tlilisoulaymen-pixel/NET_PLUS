"use client";

import { useQuery } from "@tanstack/react-query";
import { frappe } from "./client";

export function useLoggedUser() {
  return useQuery({
    queryKey: ["logged-user"],
    queryFn: () => frappe.getLoggedUser(),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useLoggedUserDoc() {
  const { data: username } = useLoggedUser();
  return useQuery({
    queryKey: ["doc", "User", username],
    queryFn: () => frappe.get("User", username!),
    enabled: !!username,
    staleTime: 5 * 60_000,
  });
}

export function useMeta(doctype: string, enabled = true) {
  return useQuery({
    queryKey: ["meta", doctype],
    queryFn: () => frappe.meta(doctype),
    enabled: enabled && !!doctype,
    staleTime: 30 * 60_000,   // 30 min — DocType schema rarely changes
    gcTime: 60 * 60_000,      // 1 hour — keep in memory across page reloads
  });
}

export function useDocList(
  doctype: string,
  opts: {
    fields?: string[];
    filters?: Record<string, unknown> | string;
    limit?: number;
    start?: number;
    orderBy?: string;
  } = {},
) {
  return useQuery({
    queryKey: ["list", doctype, opts],
    queryFn: () => frappe.list(doctype, opts),
    enabled: !!doctype,
  });
}

export function useDoc(doctype: string, name: string | undefined) {
  return useQuery({
    queryKey: ["doc", doctype, name],
    queryFn: () => frappe.get(doctype, name!),
    enabled: !!doctype && !!name,
  });
}
