/** Pure, dependency-free slug helpers shared by server and client code. */

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";
}

/** e.g. "BYD e2 2020" + "a1b2c3d4-..." -> "byd-e2-2020-a1b2c3" */
export function productSlug(name: string, id: string): string {
  return `${slugify(name)}-${id.slice(0, 6)}`;
}

/** Given a slug (or a raw id, for backward-compat links), find the matching item by id suffix or exact id. */
export function resolveBySlugOrId<T extends { id: string }>(items: T[], slugOrId: string): T | undefined {
  const exact = items.find((i) => i.id === slugOrId);
  if (exact) return exact;
  return items.find((i) => slugOrId.endsWith(i.id.slice(0, 6)) || slugOrId === i.id);
}
