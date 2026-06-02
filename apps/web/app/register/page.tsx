export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow">
        <h1 className="text-2xl font-bold mb-6">Create Shop</h1>

        <form className="space-y-4">
          <input
            placeholder="Shop Name"
            className="w-full border rounded-xl px-4 py-3"
          />

          <input
            type="email"
            placeholder="Email"
            className="w-full border rounded-xl px-4 py-3"
          />

          <input
            placeholder="Phone"
            className="w-full border rounded-xl px-4 py-3"
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full border rounded-xl px-4 py-3"
          />

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-xl"
          >
            Create Account
          </button>
        </form>
      </div>
    </div>
  );
}