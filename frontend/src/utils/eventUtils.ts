// Utility functions for handling event activities with backward compatibility

/**
 * Get activity names from activities array (handles both old string[] and new object[] formats)
 */
export const getActivityNames = (activities?: Array<{ name: string; seatLimit?: number }> | string[]): string[] => {
  if (!activities || activities.length === 0) return [];
  if (typeof activities[0] === 'string') {
    return activities as string[];
  }
  return (activities as Array<{ name: string; seatLimit?: number }>).map(a => a.name);
};

/**
 * Get seat limit for a specific activity
 */
export const getActivitySeatLimit = (
  activities: Array<{ name: string; seatLimit?: number }> | string[] | undefined, 
  activityName: string
): number | undefined => {
  if (!activities || activities.length === 0) return undefined;
  if (typeof activities[0] === 'string') return undefined;
  const activity = (activities as Array<{ name: string; seatLimit?: number }>).find(a => a.name === activityName);
  return activity?.seatLimit;
};

/**
 * Normalize activities to object format (for consistent handling)
 */
export const normalizeActivities = (
  activities?: Array<{ name: string; seatLimit?: number }> | string[]
): Array<{ name: string; seatLimit?: number }> => {
  if (!activities || activities.length === 0) return [];
  if (typeof activities[0] === 'string') {
    return (activities as string[]).map(name => ({ name }));
  }
  return activities as Array<{ name: string; seatLimit?: number }>;
};

/**
 * Normalize event ribbons / registration ribbon selections.
 */
export const normalizeRibbons = (ribbons?: string[]): string[] => {
  if (!Array.isArray(ribbons) || ribbons.length === 0) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const ribbon of ribbons) {
    const trimmed = String(ribbon || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
};

