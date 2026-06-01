export const normalizeCommandArgs = (args: string[]): string[] => {
  return args.map((arg) => arg.trim()).filter((arg) => arg.length > 0);
};

export const joinRegionTokens = (args: string[]): string => {
  return args.join(" ").trim();
};

export interface ResolvedWeatherRegion<T = any> {
  name: string;
  data: T;
}

const sortByLengthAsc = (a: string, b: string): number =>
  a.length - b.length || a.localeCompare(b, "ko");

const sortByLengthDesc = (a: string, b: string): number =>
  b.length - a.length || a.localeCompare(b, "ko");

const getLookupQueries = (regionName: string): string[] => {
  const query = regionName.trim();
  if (!query) return [];

  const queries = [query];
  if (query.length > 2 && query.endsWith("동")) {
    queries.push(query.slice(0, -1));
  }

  return Array.from(new Set(queries));
};

export const resolveWeatherRegion = <T = any>(
  regions: Record<string, T>,
  regionName: string,
): ResolvedWeatherRegion<T> | null => {
  const keys = Object.keys(regions);

  for (const query of getLookupQueries(regionName)) {
    if (regions[query]) {
      return { name: query, data: regions[query] };
    }

    const startsWithQuery = keys
      .filter((key) => key.startsWith(query))
      .sort(sortByLengthAsc)[0];
    if (startsWithQuery) {
      return { name: startsWithQuery, data: regions[startsWithQuery] };
    }

    const queryStartsWithKey = keys
      .filter((key) => key.length >= 2 && query.startsWith(key))
      .sort(sortByLengthDesc)[0];
    if (queryStartsWithKey) {
      return { name: queryStartsWithKey, data: regions[queryStartsWithKey] };
    }

    const containsQuery = keys
      .filter((key) => key.includes(query))
      .sort(sortByLengthAsc)[0];
    if (containsQuery) {
      return { name: containsQuery, data: regions[containsQuery] };
    }

    const queryContainsKey = keys
      .filter((key) => key.length >= 2 && query.includes(key))
      .sort(sortByLengthDesc)[0];
    if (queryContainsKey) {
      return { name: queryContainsKey, data: regions[queryContainsKey] };
    }
  }

  return null;
};
