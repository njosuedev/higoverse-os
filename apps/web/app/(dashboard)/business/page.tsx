"use client";

import MobileBusiness from "@/app/components/mobile/MobileBusiness";

// The phone tab bar's Business tab (on wider screens the same list, centred).
export default function BusinessPage() {
  return (
    <div className="mx-auto max-w-lg">
      <MobileBusiness />
    </div>
  );
}
