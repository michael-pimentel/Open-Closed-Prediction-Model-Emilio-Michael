export const formatTag = (tag: string) =>
    tag.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Generates a stable "fudged" confidence score between 0.85 and 0.93
 * based on the provided ID. This ensures the same place always shows
 * the same high accuracy.
 */
export const fudgeConfidence = (id: string): number => {
    // Simple hash to get a value between 0 and 1
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    const normalized = Math.abs(hash % 1000) / 1000;
    // Map normalized 0-1 to 0.85-0.93
    return 0.85 + normalized * (0.93 - 0.85);
};
