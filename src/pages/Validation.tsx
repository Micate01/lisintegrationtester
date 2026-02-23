import { useState } from 'react';
import { Search, CheckSquare, XSquare, Printer, Eye, FileText } from 'lucide-react';

export default function Validation() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex justify-between items-center bg-white p-2 border border-zinc-300 shadow-sm flex-shrink-0">
        <h2 className="text-sm font-semibold text-zinc-800 uppercase tracking-wider ml-2">Biomedical Validation</h2>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-zinc-400 w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="Search results..."
              className="pl-7 pr-2 py-1 text-xs border border-zinc-300 focus:outline-none focus:border-blue-500 w-48"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 rounded flex items-center hover:bg-purple-100 transition-colors text-xs font-medium">
            <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
            Validate All
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 space-x-4">
        {/* Left Sidebar - Filters */}
        <div className="w-64 bg-white border border-zinc-300 shadow-sm flex flex-col flex-shrink-0">
          <div className="p-2 border-b border-zinc-300 bg-[#f0f0f0]">
            <h3 className="text-xs font-semibold text-zinc-800 uppercase">Search Conditions</h3>
          </div>
          <div className="p-3 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="block text-[10px] font-medium text-zinc-600 mb-1">Date Range</label>
              <select className="w-full px-2 py-1 text-xs border border-zinc-300 bg-white">
                <option>Since the last 2 weeks</option>
                <option>Today</option>
                <option>Yesterday</option>
                <option>This Week</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-600 mb-1">Customer</label>
              <select className="w-full px-2 py-1 text-xs border border-zinc-300 bg-white">
                <option>All Customers</option>
                <option>ARS</option>
                <option>Private</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-600 mb-1">Workgroup</label>
              <select className="w-full px-2 py-1 text-xs border border-zinc-300 bg-white">
                <option>All Workgroups</option>
                <option>Haematology</option>
                <option>Biochemistry</option>
                <option>Microbiology</option>
              </select>
            </div>
            <div className="space-y-2 pt-2 border-t border-zinc-200">
              <label className="flex items-center space-x-2">
                <input type="checkbox" className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500" defaultChecked />
                <span className="text-xs text-zinc-700">Complete requests</span>
              </label>
              <label className="flex items-center space-x-2">
                <input type="checkbox" className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500" />
                <span className="text-xs text-zinc-700">Only the non-validated</span>
              </label>
              <label className="flex items-center space-x-2">
                <input type="checkbox" className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500" />
                <span className="text-xs text-zinc-700">Only the unprinted</span>
              </label>
            </div>
          </div>
        </div>

        {/* Main Content - Results to Validate */}
        <div className="flex-1 bg-white border border-zinc-300 shadow-sm flex flex-col min-w-0">
          <div className="p-2 border-b border-zinc-300 bg-[#f8f8f8] flex justify-between items-center">
            <div className="flex space-x-4 text-xs">
              <span className="text-zinc-500">Lab No: <span className="font-mono text-zinc-900 font-medium">277230</span></span>
              <span className="text-zinc-500">Tube: <span className="font-mono text-zinc-900 font-medium">277230</span></span>
              <span className="text-zinc-500">Patient: <span className="text-zinc-900 font-medium">CFD_277377</span></span>
            </div>
            <div className="flex space-x-2">
              <button className="p-1 text-zinc-500 hover:text-purple-600 hover:bg-purple-50 rounded" title="View Details">
                <Eye className="w-4 h-4" />
              </button>
              <button className="p-1 text-zinc-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="Print Report">
                <Printer className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto bg-white">
            <table className="min-w-full divide-y divide-zinc-200 border-collapse">
              <thead className="bg-[#f0f0f0] sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-zinc-600 border-b border-zinc-300 border-r w-8 text-center">
                    <input type="checkbox" className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500" />
                  </th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Test</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Result</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Units</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Reference Value</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-zinc-600 border-b border-zinc-300">Equipment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                <tr className="bg-zinc-100/50">
                  <td colSpan={6} className="px-3 py-1 text-[11px] font-semibold text-zinc-800 border-b border-zinc-200">
                    HAEMATOLOGY
                  </td>
                </tr>
                <tr className="hover:bg-blue-50">
                  <td className="px-3 py-1 text-center border-r border-zinc-200">
                    <input type="checkbox" className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500" />
                  </td>
                  <td className="px-3 py-1 text-[11px] text-zinc-800 border-r border-zinc-200 pl-6">Red Blood Cells</td>
                  <td className="px-3 py-1 text-[11px] font-medium text-red-600 border-r border-zinc-200">4.04</td>
                  <td className="px-3 py-1 text-[11px] text-zinc-600 border-r border-zinc-200">x10^12/L</td>
                  <td className="px-3 py-1 text-[11px] text-zinc-500 border-r border-zinc-200">4.40 - 5.80</td>
                  <td className="px-3 py-1 text-[11px] text-zinc-500">XN-2000</td>
                </tr>
                <tr className="hover:bg-blue-50">
                  <td className="px-3 py-1 text-center border-r border-zinc-200">
                    <input type="checkbox" className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500" />
                  </td>
                  <td className="px-3 py-1 text-[11px] text-zinc-800 border-r border-zinc-200 pl-6">Haemoglobin</td>
                  <td className="px-3 py-1 text-[11px] font-medium text-zinc-900 border-r border-zinc-200">130</td>
                  <td className="px-3 py-1 text-[11px] text-zinc-600 border-r border-zinc-200">g/L</td>
                  <td className="px-3 py-1 text-[11px] text-zinc-500 border-r border-zinc-200">130 - 170</td>
                  <td className="px-3 py-1 text-[11px] text-zinc-500">XN-2000</td>
                </tr>
                <tr className="hover:bg-blue-50">
                  <td className="px-3 py-1 text-center border-r border-zinc-200">
                    <input type="checkbox" className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500" />
                  </td>
                  <td className="px-3 py-1 text-[11px] text-zinc-800 border-r border-zinc-200 pl-6">Haematocrit</td>
                  <td className="px-3 py-1 text-[11px] font-medium text-zinc-900 border-r border-zinc-200">0.424</td>
                  <td className="px-3 py-1 text-[11px] text-zinc-600 border-r border-zinc-200">L/L</td>
                  <td className="px-3 py-1 text-[11px] text-zinc-500 border-r border-zinc-200">0.380 - 0.500</td>
                  <td className="px-3 py-1 text-[11px] text-zinc-500">XN-2000</td>
                </tr>
                <tr className="bg-zinc-100/50">
                  <td colSpan={6} className="px-3 py-1 text-[11px] font-semibold text-zinc-800 border-b border-zinc-200 border-t border-zinc-300">
                    CHEMISTRY / IMMUNOASSAY
                  </td>
                </tr>
                <tr className="hover:bg-blue-50">
                  <td className="px-3 py-1 text-center border-r border-zinc-200">
                    <input type="checkbox" className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500" />
                  </td>
                  <td className="px-3 py-1 text-[11px] text-zinc-800 border-r border-zinc-200 pl-6">Glucose post fast</td>
                  <td className="px-3 py-1 text-[11px] font-medium text-zinc-900 border-r border-zinc-200">98.00</td>
                  <td className="px-3 py-1 text-[11px] text-zinc-600 border-r border-zinc-200">mg/dL</td>
                  <td className="px-3 py-1 text-[11px] text-zinc-500 border-r border-zinc-200">70.0 - 100.0</td>
                  <td className="px-3 py-1 text-[11px] text-zinc-500">Cobas 8000</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
