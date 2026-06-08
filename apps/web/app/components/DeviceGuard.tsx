// components/DeviceGuard.tsx

"use client";

import { useEffect, useState } from "react";
import {
  MonitorSmartphone,
  Phone,
} from "lucide-react";

interface DeviceGuardProps {
  children: React.ReactNode;
}

export default function DeviceGuard({
  children,
}: DeviceGuardProps) {
  const [allowed, setAllowed] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    const checkDevice = () => {
      // Allow tablets, laptops, desktops
      setAllowed(window.innerWidth >= 768);
    };

    checkDevice();

    window.addEventListener(
      "resize",
      checkDevice
    );

    return () =>
      window.removeEventListener(
        "resize",
        checkDevice
      );
  }, []);

  // Prevent flashing content before check
  if (allowed === null) {
    return null;
  }

  // Block mobile devices
  if (!allowed) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-6">
        <div>
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
              <MonitorSmartphone
                size={42}
                className="text-blue-600"
              />
            </div>
          </div>
          <p className="text-slate-600 leading-relaxed">
            Thank you for your interest in Higoverse. To ensure the best performance,
            security, and user experience, this platform is currently optimized for
            tablets, laptops, and desktop computers. Mobile phone access is not yet
            supported. Please use a larger-screen device to continue. If you need
            assistance, our support team is available to help.
          </p>
          {/* Support */}
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <a
              href="tel:+250790885174"
              className="mt-3 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold transition-colors"
            >
              <Phone size={18} />
              +250 790 885 174
            </a>

            <p className="text-sm text-slate-500 mt-2">
              Technical Support
            </p>
          </div>

          {/* Footer */}
          <div className="mt-8 border-t pt-4 text-xs text-slate-400">
            © {new Date().getFullYear()} Higoverse.
            All rights reserved.
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
