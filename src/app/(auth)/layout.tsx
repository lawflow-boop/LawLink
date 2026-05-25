export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background min-h-screen">
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        {children}
      </main>
    </div>
  );
}
