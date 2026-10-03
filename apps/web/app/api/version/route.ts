import { readFileSync } from "fs";
import path from "path";

// Which build of the website is running. Open pages (browser, desktop app)
// poll this and offer a reload when it changes after a deployment.
export const dynamic = "force-dynamic";

let cached: string | null = null;
function buildId(): string {
  if (cached) return cached;
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
