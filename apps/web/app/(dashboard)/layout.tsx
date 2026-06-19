import HeartbeatManager from "@/app/components/dashboard/HeartbeatManager";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HeartbeatManager />
      {children}
    </>
  );
}
