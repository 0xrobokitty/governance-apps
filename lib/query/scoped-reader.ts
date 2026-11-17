import type { QueryClient } from "@tanstack/react-query";

/** Keep publication guards for as long as their query cache, across route remounts. */
export function createQueryScopedReader<T>(create: () => T) {
  const readers = new WeakMap<QueryClient, T>();
  return (queryClient: QueryClient): T => {
    let reader = readers.get(queryClient);
    if (!reader) {
      reader = create();
      readers.set(queryClient, reader);
    }
    return reader;
  };
}
