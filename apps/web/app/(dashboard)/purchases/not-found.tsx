import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center">
      <div className="max-w-lg bg-white border border-slate-200 shadow-lg rounded-3xl p-10">
        {/* Status Badge */}
        <div className="inline-flex items-center px-4 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium mb-6">
          Service Update
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-slate-900">
          Service Temporarily Unavailable
        </h1>

        {/* Message */}
        <p className="mt-4 text-slate-600 leading-relaxed">
          Our system is currently busy or undergoing maintenance.
          The technical team is actively working to restore full access.
        </p>

        <p className="mt-3 text-slate-500 text-sm">
          Please try again after a few moments. We apologize for any inconvenience caused.
        </p>

        {/* Action */}
        <Link
          href="/"
          className="inline-block mt-6 px-6 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition"
        >
          Return Home
        </Link>

        {/* Support */}
        <div className="mt-8 border-t pt-4 text-xs text-slate-400">
          Need help? Contact support: <br />
          <span className="text-slate-600 font-medium">
            +250 790 885 174
          </span>
        </div>
      </div>
    </div>
  );
}
