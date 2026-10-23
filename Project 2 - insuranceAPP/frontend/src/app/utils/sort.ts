// Helpers for the "Sort by" dropdowns on the admin pages.
// Each page lists its options as { label, compare }; the dropdown stores the chosen option's index.
export interface SortOption<T> { label: string; compare: (a: T, b: T) => number; }

// A to Z by some text (names, emails); ignores upper/lower case
export const byText = <T>(get: (x: T) => string) =>
  (a: T, b: T) => get(a).localeCompare(get(b), undefined, { sensitivity: 'base' });

// smallest first by some number (IDs, amounts); "yyyy-mm-dd" dates also sort correctly with byText
export const byNumber = <T>(get: (x: T) => number) => (a: T, b: T) => get(a) - get(b);

// flips any comparison: A to Z becomes Z to A, smallest first becomes largest first
export const reversed = <T>(compare: (a: T, b: T) => number) => (a: T, b: T) => compare(b, a);

// returns a sorted copy, so the original list (and its signal) is never changed in place
export const sortedBy = <T>(list: T[], option: SortOption<T> | undefined) =>
  option ? [...list].sort(option.compare) : list;
