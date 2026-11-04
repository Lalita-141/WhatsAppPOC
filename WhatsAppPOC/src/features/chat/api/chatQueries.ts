import { useInfiniteQuery } from '@tanstack/react-query';
import { ConversationsPage, getConversations } from './chatApi';

export const chatKeys = {
  all: ['chat'] as const,
  // Not keyed by token: logout clears this cache, and refresh must not refetch.
  conversations: (archived = false) => [...chatKeys.all, 'conversations', archived ? 'archived' : 'main'] as const,
};

/** GET /chat/conversations, one page at a time. */
export const useConversationsQuery = (
  accessToken?: string,
  enabled: boolean = true,
  archived: boolean = false,
) => {
  const query = useInfiniteQuery<ConversationsPage, Error>({
    queryKey: chatKeys.conversations(archived),
    queryFn: ({ pageParam }) =>
      getConversations(accessToken, { cursor: pageParam as string | null, archived }),
    initialPageParam: null,
    getNextPageParam: (last) => (last.pagination.hasMore ? last.pagination.nextCursor : undefined),
    enabled: Boolean(accessToken && accessToken.trim().length > 0 && enabled),
    staleTime: 1000 * 15,
  });

  return {
    ...query,
    data: query.data?.pages.flatMap((page) => page.conversations),
  };
};
