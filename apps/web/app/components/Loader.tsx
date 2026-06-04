export default function Loader() {
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      <span className="text-sm text-slate-600">Loading...</span>
    </div>
  );
}