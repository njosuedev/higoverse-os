"use client";

import PageSkeleton from "./PageSkeleton";

export default function LoadingSkeleton() {
  return <PageSkeleton cards={6} showTable={false} showChart />;
}
