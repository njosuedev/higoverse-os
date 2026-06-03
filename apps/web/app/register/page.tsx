"use client";

import { useState } from "react";

export default function RegisterPage() {
  const [form, setForm] = useState({
    shop_name: "",
    email: "",
    password: "",
    phone: "",
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    await fetch("https://higoverse-auth.vercel.app/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setLoading(false);
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white to-indigo-50 px-4">

      <div className="w-full max-w-md bg-white border rounded-2xl shadow-xl p-8">

        <h1 className="text-3xl font-bold">Create Shop</h1>
        <p className="text-zinc-500 mt-2">Start your business with Higoverse</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">

          <input
            placeholder="Shop Name"
            className="input"
            onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
          />

          <input
            placeholder="Email"
            className="input"
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <input
            placeholder="Phone"
            className="input"
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />

          <input
            type="password"
            placeholder="Password"
            className="input"
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />

          <button
            disabled={loading}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white flex items-center justify-center"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : (
              "Create Account"
            )}
          </button>

        </form>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          height: 48px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 0 14px;
          outline: none;
        }
        .input:focus {
          border-color: #3b82f6;
        }
      `}</style>
    </div>
  );
}
