"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { sendHeartbeat } from "@/lib/shop-api";

const HEARTBEAT_INTERVAL = 2 * 60 * 1000; // every 2 minutes

export default function HeartbeatManager() {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    sendHeartbeat();
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.shop_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
