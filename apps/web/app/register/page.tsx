"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL = "https://higoverse-auth.vercel.app/api/v1/auth";

export default function RegisterPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    shop_name: "",
    email: "",
    phone: "",
    password: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setLoading(true);

      const res = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.detail || "Registration failed");
        return;
      }

      alert("Account created successfully");

      router.push("/login");
    } catch (error) {
      console.error(error);
      alert("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border p-8 shadow-xl">
        <h1 className="text-3xl font-bold">Create Account</h1>

        <p className="text-zinc-500 mt-2">
          Create your Higoverse business workspace
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <input
            placeholder="Shop Name"
            value={form.shop_name}
            onChange={(e) =>
              setForm({ ...form, shop_name: e.target.value })
            }
            className="w-full rounded-xl border-2 border-zinc-200 p-3"
            required
          />

          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) =>
              setForm({ ...form, email: e.target.value })
            }
            className="w-full rounded-xl border-2 border-zinc-200 p-3"
            required
          />

          <input
            placeholder="Phone Number"
            value={form.phone}
            onChange={(e) =>
              setForm({ ...form, phone: e.target.value })
            }
            className="w-full rounded-xl border-2 border-zinc-200 p-3"
          />

          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) =>
              setForm({ ...form, password: e.target.value })
            }
            className="w-full rounded-xl border-2 border-zinc-200 p-3"
            required
          />

          <button
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-xl"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>

        <p className="text-center mt-5 text-sm">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}