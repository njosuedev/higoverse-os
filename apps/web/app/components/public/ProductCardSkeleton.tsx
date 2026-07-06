import Skeleton from "@/app/components/ui/Skeleton";

/** Matches ProductCard's exact shape so grid layout never shifts on reveal. */
export default function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <Skeleton className="aspect-square w-full" rounded="md" />
      <div className="flex flex-col gap-1.5 p-2.5">
        <Skeleton className="h-3 w-[90%]" />
        <Skeleton className="h-3 w-[65%]" />
        <Skeleton className="mt-0.5 h-4 w-[50%]" />
        <Skeleton className="h-2 w-[70%]" />
        <Skeleton className="h-2 w-[45%]" />
        <div className="mt-0.5 flex items-center gap-1.5 border-t border-slate-100 pt-2">
          <Skeleton className="h-6 w-6 shrink-0" rounded="full" />
          <div className="flex flex-1 flex-col gap-1">
            <Skeleton className="h-2.5 w-[75%]" />
            <Skeleton className="h-2 w-[50%]" />
          </div>
        </div>
      </div>
    </div>
  );
}
