import { readFileSync } from "fs";
import path from "path";

// Which build of the website is running. Open pages (browser, desktop app)
// poll this and offer a reload when it changes after a deployment.
export const dynamic = "force-dynamic";

let cached: string | null = null;
function buildId(): string {
  if (cached) return cached;
  // `next dev` keeps whatever BUILD_ID an earlier build left in .next, which
  // never matches the page: development has no versions to update to.
  if (process.env.NODE_ENV !== "production") return (cached = "dev");
  // The id baked into the pages (next.config.ts): Next names .next/BUILD_ID
  // itself when deploymentId is set, so that file can differ from it.
  if (process.env.NEXT_PUBLIC_BUILD_ID) return (cached = process.env.NEXT_PUBLIC_BUILD_ID);
  try {
    cached = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    cached = "dev";
  }
  return cached;
}

export function GET() {
  return Response.json({ build: buildId() }, { headers: { "Cache-Control": "no-store" } });
}
