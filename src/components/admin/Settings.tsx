"use client";

export default function AdminSettings() {
  return (
    <div className="space-y-6">
      {/* System Info */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          System Information
        </h3>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600">Backend URL</p>
            <p className="font-mono text-gray-900">
              {process.env.NEXT_PUBLIC_POCKETBASE_URL}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">System Version</p>
            <p className="font-medium text-gray-900">v1.0.0</p>
          </div>
        </div>
      </div>

      {/* Counselor Management */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Counselor Management
        </h3>
        <p className="text-gray-600 mb-4">
          Manage your counselor team from the PocketBase Admin UI
        </p>
        <a
          href={`${process.env.NEXT_PUBLIC_POCKETBASE_URL}/_/`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Open PocketBase Admin
        </a>
      </div>

      {/* Documentation */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Documentation
        </h3>
        <div className="space-y-2 text-sm text-gray-600">
          <p>
            • <strong>Dashboard:</strong> View overall system statistics and
            recent activity
          </p>
          <p>
            • <strong>All Leads:</strong> Search, filter, and manage all leads
            in the system
          </p>
          <p>
            • <strong>Bulk Upload:</strong> Import multiple leads from CSV/Excel
            files
          </p>
          <p>
            • <strong>Counselor Portal:</strong> Share links with counselors for
            lead management
          </p>
        </div>
      </div>
    </div>
  );
}
