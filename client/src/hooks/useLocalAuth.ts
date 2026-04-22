import { trpc } from "@/lib/trpc";

export function useLocalAuth() {
  const { data: user, isLoading: loading, refetch } = trpc.localAuth.me.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
  });

  return {
    user: user ?? null,
    loading,
    refetch,
    isAdmin: user?.role === "admin",
  };
}
