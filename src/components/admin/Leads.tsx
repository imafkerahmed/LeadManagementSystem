"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";

interface Lead {
  id: string;
  leadId: string;
  studentName: string;
  mobile: string;
  email: string;
  course: string;
  leadSource: string;
  status: string;
  assignedTo: string;
  comments: string;
}

export default function AdminLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [counselorFilter, setCounselorFilter] = useState("");
  const [counselors, setCounselors] = useState<string[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  useEffect(() => {
    fetchLeads();
  }, [statusFilter, counselorFilter, searchTerm]);

  const fetchLeads = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      if (counselorFilter) params.append("counselor", counselorFilter);
      if (searchTerm) params.append("search", searchTerm);

      const response = await fetch(`/api/admin/leads?${params.toString()}`);
      const data = await response.json();
      setLeads(data.items || []);
      setFilteredLeads(data.items || []);

      // Extract unique counselors
      const uniqueCounselors = [
        ...new Set((data.items || []).map((l: Lead) => l.assignedTo)),
      ];
      setCounselors(uniqueCounselors);
    } catch (error) {
      console.error("Error fetching leads:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const statuses = ["New", "Contacted", "Follow-up", "Registered", "Lost"];
  const statusColors: Record<string, string> = {
    New: "bg-blue-100 text-blue-800",
    Contacted: "bg-yellow-100 text-yellow-800",
    "Follow-up": "bg-orange-100 text-orange-800",
    Registered: "bg-green-100 text-green-800",
    Lost: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Name, mobile, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Counselor
            </label>
            <select
              value={counselorFilter}
              onChange={(e) => setCounselorFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Counselors</option>
              {counselors.map((counselor) => (
                <option key={counselor} value={counselor}>
                  {counselor}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("");
                setCounselorFilter("");
              }}
              className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading leads...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No leads found</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Mobile
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Course
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Assigned To
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition"
                >
                  <td className="px-6 py-3 text-sm font-mono text-gray-600">
                    {lead.leadId}
                  </td>
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">
                    {lead.studentName}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600">
                    {lead.mobile}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600">
                    {lead.course}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[lead.status]}`}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600">
                    {lead.assignedTo}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    <button
                      onClick={() => setSelectedLead(lead)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Lead Detail Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">
                {selectedLead.studentName}
              </h2>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-gray-600">Lead ID</p>
                <p className="font-mono text-lg font-medium">
                  {selectedLead.leadId}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <span
                  className={`inline-block px-2 py-1 rounded text-sm font-medium ${statusColors[selectedLead.status]}`}
                >
                  {selectedLead.status}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-600">Mobile</p>
                <p className="font-medium">{selectedLead.mobile}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-medium">{selectedLead.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Course</p>
                <p className="font-medium">{selectedLead.course}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Assigned To</p>
                <p className="font-medium">{selectedLead.assignedTo}</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">Comments</p>
              <p className="text-gray-800 bg-gray-50 p-3 rounded">
                {selectedLead.comments || "No comments"}
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setSelectedLead(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
