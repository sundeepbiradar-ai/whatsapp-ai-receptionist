import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard - AI Customer Operations Platform",
  description: "Application dashboard",
};

export default function DashboardPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Dashboard</h1>
          <p className="text-lg text-gray-600 mb-8">
            Welcome to the AI Customer Operations Platform.
          </p>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {[
              { label: "Organizations", value: "0" },
              { label: "Users", value: "0" },
              { label: "Conversations", value: "0" },
            ].map((stat, index) => (
              <div key={index} className="bg-white p-6 rounded-lg border border-gray-200">
                <p className="text-gray-600 text-sm font-medium mb-2">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Foundation Ready</h2>
            <p className="text-gray-600 mb-4">
              Phase 1 foundation is now complete. The application provides:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              <li>Next.js App Router with TypeScript strict mode</li>
              <li>Tailwind CSS and shadcn/ui component foundation</li>
              <li>Project structure ready for multi-tenant architecture</li>
              <li>ESLint and Prettier configuration</li>
              <li>Vitest and Playwright test framework setup</li>
              <li>Documentation structure for architecture and security</li>
            </ul>
            <p className="text-gray-600 mt-4 text-sm">
              Next phases will include authentication, database integration, WhatsApp API, and
              appointment management.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
