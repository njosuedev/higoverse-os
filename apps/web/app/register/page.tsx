"use client";

import { useState } from "react";

export default function RegisterPage() {
  const [form, setForm] = useState({
    shop_name: "",
    email: "",
    password: "",
    phone: "",
  });

  const handleRegister = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    const res = await fetch(
      "https://higoverse-auth.vercel.app/api/v1/auth/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || "Registration failed");
      return;
    }

    alert("Workspace created successfully");
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">

      <div className="w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-950 p-10">

        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold text-white">
            Create Workspace
          </h1>

          <p className="text-zinc-400 mt-4">
            Launch your business on Higoverse
          </p>
        </div>

        <form
          onSubmit={handleRegister}
          className="grid md:grid-cols-2 gap-5"
        >
          <input
            placeholder="Business Name"
            value={form.shop_name}
            onChange={(e) =>
              setForm({
                ...form,
                shop_name: e.target.value,
              })
            }
            className="h-14 rounded-xl bg-zinc-900 border border-zinc-700 px-4 text-white"
          />

          <input
            placeholder="Phone Number"
            value={form.phone}
            onChange={(e) =>
              setForm({
                ...form,
                phone: e.target.value,
              })
            }
            className="h-14 rounded-xl bg-zinc-900 border border-zinc-700 px-4 text-white"
          />

          <input
            type="email"
            placeholder="Email Address"
            value={form.email}
            onChange={(e) =>
              setForm({
                ...form,
                email: e.target.value,
              })
            }
            className="h-14 rounded-xl bg-zinc-900 border border-zinc-700 px-4 text-white"
          />

          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) =>
              setForm({
                ...form,
                password: e.target.value,
              })
            }
            className="h-14 rounded-xl bg-zinc-900 border border-zinc-700 px-4 text-white"
          />

          <button
            type="submit"
            className="
              md:col-span-2
              h-14
              rounded-xl
              bg-gradient-to-r
              from-blue-600
              to-indigo-600
              text-white
              font-semibold
            "
          >
            Create Workspace
          </button>
        </form>
      </div>
    </div>
  );
}