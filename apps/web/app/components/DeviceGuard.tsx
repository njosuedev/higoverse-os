// components/DeviceGuard.tsx

"use client";

import { useEffect, useState } from "react";
import {
  MonitorSmartphone,
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
    const isMobilePhone = () => {
      const ua = navigator.userAgent;
      // True phones: Android phones (not tablets) or iPhone
      const isPhone = /iPhone|Android/i.test(ua) && !/iPad|Tablet/i.test(ua);
      // On a phone, also confirm the screen is narrow (< 768px)
      // A laptop/desktop will never have a phone UA regardless of window size
      return isPhone && window.innerWidth < 768;
    };

    const checkDevice = () => setAllowed(!isMobilePhone());

    checkDevice();
    window.addEventListener("resize", checkDevice);
    return () => window.removeEventListener("resize", checkDevice);
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
          <small className="text-slate-600 leading-relaxed">
            Thank you for your interest in A & T Consultants. To ensure the best performance,
            security, and user experience, this platform is currently optimized for
            tablets, laptops, and desktop computers. Mobile phone access is not yet
            supported. Please use a larger-screen device to continue. If you need
            assistance, our support team is available to help.
          </small>
          {/* Support */}
          <small className="mt-2 p-2">
            <a
              href="tel:+250790885174"
              className="text-blue-600 hover:text-blue-700 font-semibold"
            >
              +250 790 885 174
            </a>
          </small>
          {/* Footer */}
          <div className="mt-8 border-t pt-4 text-xs text-center text-slate-400">
            ©2020–{new Date().getFullYear()} A & T Consultants. Business Technology Company
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
