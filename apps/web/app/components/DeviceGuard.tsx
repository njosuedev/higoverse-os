// components/DeviceGuard.tsx
"use client";

import { useEffect, useState } from "react";

export default function DeviceGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    const checkScreen = () => {
      setAllowed(window.innerWidth >= 768);
    };

    checkScreen();
    window.addEventListener("resize", checkScreen);

    return () =>
      window.removeEventListener(
        "resize",
        checkScreen
      );
  }, []);

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-4">
            Desktop or Tablet Required
          </h1>

          <p className="text-gray-600">
            This application is not
            available on mobile phones.
            Please use a tablet,
            laptop, or desktop computer.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
