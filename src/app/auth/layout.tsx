export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col items-center justify-center px-4 pt-safe pb-safe">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-500 flex items-center justify-center mx-auto mb-3 shadow-lg">
          <span className="text-white text-2xl font-bold">N</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">NutriSense</h1>
        <p className="text-sm text-gray-500 mt-1">Your conversational health companion</p>
      </div>

      {/* Auth card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        {children}
      </div>
    </div>
  );
}
