import { Loader2 } from "lucide-react";

/** Centered loading indicator — shown by loading.tsx while a page's data is
 *  still being fetched (route navigation, not client-side refetches, which
 *  already have their own skeletons). Reused everywhere a full page might
 *  take a moment to load. */
export default function PageSpinner() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <Loader2 size={36} className="animate-spin text-orange-500" />
    </div>
  );
}
