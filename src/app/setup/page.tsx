"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader } from "lucide-react";
import AppShell from "@/components/layout/AppShell";

export default function SetupPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    error?: string;
  } | null>(null);

  const handleSetupCollections = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/setup/collections", {
        method: "POST",
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        message: "Error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppShell title="Setup" headerRight={<></>}>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12 mt-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              🎓 Lead Management System Setup
            </h1>
            <p className="text-gray-600">
              Initialize your PocketBase collections
            </p>
          </div>

          {/* Setup Card */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="space-y-6">
              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">
                  ℹ️ What will be created?
                </h3>
                <ul className="text-sm text-blue-800 space-y-2">
                  <li>
                    <strong>users</strong> - User accounts (admins and
                    counselors)
                  </li>
                  <li>
                    <strong>leads</strong> - Student lead records with details
                  </li>
                  <li>
                    <strong>leadHistory</strong> - Audit trail of all changes
                  </li>
                  <li>
                    <strong>assets</strong> - Physical/digital hardware and peripherals log
                  </li>
                  <li>
                    <strong>assetHistory</strong> - Audit trail of asset changes and assignments
                  </li>
                </ul>
              </div>

              {/* Database Connection Info */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-600">
                  <strong>Database:</strong>{" "}
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                    {process.env.NEXT_PUBLIC_POCKETBASE_URL}
                  </code>
                </p>
              </div>

              {/* Setup Button */}
              <button
                onClick={handleSetupCollections}
                disabled={isLoading}
                className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition flex items-center justify-center gap-2 ${
                  isLoading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                }`}
              >
                {isLoading && <Loader className="w-5 h-5 animate-spin" />}
                {isLoading ? "Setting up..." : "✨ Initialize Collections"}
              </button>

              {/* Result */}
              {result && (
                <div
                  className={`p-4 rounded-lg border flex gap-3 ${
                    result.success
                      ? "bg-green-50 border-green-200"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  {result.success ? (
                    <>
                      <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-green-900">
                          {result.message}
                        </p>
                        <p className="text-sm text-green-800 mt-1">
                          You can now start using the system. Go to the home
                          page to log in.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-red-900">
                          {result.message}
                        </p>
                        {result.error && (
                          <p className="text-sm text-red-800 mt-1 font-mono">
                            {result.error}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Navigation */}
              <div className="border-t pt-6 flex gap-3">
                <Link
                  href="/"
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition font-medium text-center"
                >
                  Back to Home
                </Link>
                <a
                  href="https://amazoncrm-db.codix.site/_/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium text-center"
                >
                  Open PocketBase Admin
                </a>
              </div>
            </div>
          </div>

          {/* Info Section */}
          <div className="mt-8 bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-3">
              📝 Setup Methods
            </h3>
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                <strong>Method 1 (Recommended):</strong> Click the button above
                to set up collections automatically
              </p>
              <p>
                <strong>Method 2:</strong> Use the PocketBase Admin UI to create
                collections manually
              </p>
              <p>
                <strong>Method 3:</strong> Run the Node.js setup script:
              </p>
              <code className="block bg-gray-100 p-3 rounded mt-2 text-xs">
                node scripts/setup-pocketbase.js
              </code>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
