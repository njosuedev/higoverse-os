"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface Props {
  /** Query keys this page acts on, e.g. ["new", "product"]. */
  keys: string[];
  /** Called once with the params when any of `keys` is present. */
  onParams: (params: URLSearchParams) => void;
}

function DeepLinkInner({ keys, onParams }: Props) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const handler = useRef(onParams);
  useEffect(() => { handler.current = onParams; });

  useEffect(() => {
    if (!keys.some((k) => params.has(k))) return;
    handler.current(new URLSearchParams(params.toString()));
    // One-shot: drop the params so a reload or Back doesn't repeat the action.
    router.replace(pathname, { scroll: false });
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

/** Runs a page action from link parameters (e.g. /sales?new=1 opens the sale
 *  form). Uses the router's search params rather than window.location, which
 *  isn't updated yet when a page renders after in-app navigation. */
export default function DeepLink(props: Props) {
  return (
    <Suspense fallback={null}>
      <DeepLinkInner {...props} />
    </Suspense>
  );
}
