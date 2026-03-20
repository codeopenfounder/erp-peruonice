export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="noise-bg relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Gradient mesh background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        {/* Primary dark base */}
        <div className="absolute inset-0 bg-[#0B1120]" />

        {/* Cyan radial glow — top right */}
        <div className="absolute -right-[20%] -top-[30%] h-[80vh] w-[80vh] rounded-full bg-[#00D9F5] opacity-[0.15] blur-[160px]" />

        {/* Cyan radial glow — bottom left */}
        <div className="absolute -bottom-[20%] -left-[10%] h-[60vh] w-[60vh] rounded-full bg-[#00D9F5] opacity-[0.10] blur-[140px]" />

        {/* Purple accent — center right */}
        <div className="absolute right-[10%] top-[40%] h-[50vh] w-[50vh] rounded-full bg-[#7C3AED] opacity-[0.20] blur-[180px]" />

        {/* Subtle secondary purple — bottom center */}
        <div className="absolute -bottom-[10%] left-[30%] h-[40vh] w-[40vh] rounded-full bg-[#7C3AED] opacity-[0.08] blur-[120px]" />
      </div>

      {children}
    </div>
  );
}
