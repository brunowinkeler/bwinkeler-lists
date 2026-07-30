import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicUser } from '@bwinkeler-lists/shared';
import { apiGet, apiSend } from '../../lib/api';

export function useSession() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ user: PublicUser }>('/auth/me'),
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      apiSend<{ user: PublicUser }>('POST', '/auth/login', input),
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], data);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<void>('POST', '/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
