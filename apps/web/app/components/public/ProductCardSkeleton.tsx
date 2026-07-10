import Skeleton from "@/app/components/ui/Skeleton";

/** Matches ProductCard's exact shape so grid layout never shifts on reveal. */
export default function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm sm:rounded-lg">
      <Skeleton className="aspect-square w-full" rounded="md" />
      <div className="flex flex-col gap-1 p-1.5 sm:gap-1.5 sm:p-2.5">
        <Skeleton className="h-3 w-[90%]" />
        <Skeleton className="h-3 w-[65%]" />
        <Skeleton className="mt-0.5 h-4 w-[50%]" />
        <Skeleton className="mt-0.5 hidden h-2 w-[45%] sm:block" />
        <Skeleton className="mt-auto h-2 w-[45%]" />
      </div>
    </div>
  );
}
