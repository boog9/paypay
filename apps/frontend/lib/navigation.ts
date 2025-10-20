/**
 * Prevent open redirects by only allowing same-origin relative targets.
 */
export function resolveNextDestination(nextValue: string | null): string {
  if (!nextValue) {
    return '/';
  }

  if (!nextValue.startsWith('/')) {
    return '/';
  }

  if (nextValue.startsWith('//')) {
    return '/';
  }

  return nextValue;
}
