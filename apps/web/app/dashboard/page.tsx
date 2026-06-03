"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  return (
    <div className="p-10">
      <h1 className="text-4xl font-bold">
        Higoverse Dashboard
      </h1>

      {user && (
        <div className="mt-6 rounded-2xl border p-6">
          <p>
            <strong>Email:</strong> {user.email}
          </p>

          <p>
            <strong>User ID:</strong> {user.id}
          </p>

          <p>
            <strong>Shop ID:</strong> {user.shop_id}
          </p>
        </div>
      )}
    </div>
  );
}