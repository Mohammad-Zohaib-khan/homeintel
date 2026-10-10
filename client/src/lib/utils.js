// Joins truthy class names (shadcn-style `cn`, without extra dependencies).
export const cn = (...classes) => classes.flat().filter(Boolean).join(' ');
