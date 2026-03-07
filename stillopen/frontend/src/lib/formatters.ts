export const formatTag = (tag: string) =>
    tag.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
