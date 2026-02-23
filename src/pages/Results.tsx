import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Search, Filter, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

interface Result {
  id: number;
  equipment_id: number;
  equipment_name: string;
  sample_barcode: string;
  patient_name: string;
  test_no: string;
  test_name: string;
  result_value: string;
  result_unit: string;
  result_time: string;
  created_at: string;
}

export default function Results({ equipmentId }: { equipmentId?: number }) {
  const [results, setResults] = useState<Result[]>([]);
  const [filteredResults, setFilteredResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const fetchResults = async () => {
    try {
      const res = await fetch('/api/results');
      if (res.ok) {
        const data = await res.json();
        const filteredData = equipmentId ? data.filter((r: Result) => r.equipment_id === equipmentId) : data;
        setResults(filteredData);
        setFilteredResults(filteredData);
      }
    } catch (error) {
      console.error('Failed to fetch results', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
    const interval = setInterval(fetchResults, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const lowerTerm = searchTerm.toLowerCase();
    const filtered = results.filter((r) => 
      r.patient_name?.toLowerCase().includes(lowerTerm) ||
      r.sample_barcode?.toLowerCase().includes(lowerTerm) ||
      r.test_name?.toLowerCase().includes(lowerTerm) ||
      r.equipment_name?.toLowerCase().includes(lowerTerm)
    );
    setFilteredResults(filtered);
  }, [searchTerm, results]);

  const groupedResults = useMemo(() => {
    const groups: { [key: string]: Result[] } = {};
    filteredResults.forEach(r => {
      // Group by barcode. If no barcode, treat as unique item (don't group)
      const key = r.sample_barcode ? r.sample_barcode : `NO_BARCODE_${r.id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    return Object.entries(groups).sort(([, a], [, b]) => {
      // Sort by the most recent result in the group
      const timeA = new Date(a[0].result_time || a[0].created_at).getTime();
      const timeB = new Date(b[0].result_time || b[0].created_at).getTime();
      return timeB - timeA;
    });
  }, [filteredResults]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleClearResults = async () => {
    if (!confirm('Are you sure you want to clear all results?')) return;
    
    try {
      const res = await fetch('/api/results', {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchResults();
      }
    } catch (error) {
      console.error('Failed to clear results', error);
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      {!equipmentId && (
        <div className="flex justify-between items-center bg-white p-2 border border-zinc-300 shadow-sm flex-shrink-0">
          <h2 className="text-sm font-semibold text-zinc-800 uppercase tracking-wider ml-2">Test Results</h2>
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
            <button
              onClick={handleClearResults}
              className="bg-red-50 text-red-700 border border-red-200 px-3 py-1 rounded flex items-center hover:bg-red-100 transition-colors text-xs font-medium"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Clear Results
            </button>
          </div>
        </div>
      )}

      {equipmentId && (
        <div className="flex justify-between items-center bg-white p-2 border border-zinc-300 shadow-sm flex-shrink-0">
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
        </div>
      )}

      <div className="bg-white border border-zinc-300 shadow-sm flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-zinc-200 border-collapse">
            <thead className="bg-[#f8f8f8] sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r w-8"></th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Time</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Barcode</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Patient</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Equipment</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300">Tests</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-xs text-zinc-500">
                    Loading results...
                  </td>
                </tr>
              ) : groupedResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-xs text-zinc-500">
                    No results found matching your search.
                  </td>
                </tr>
              ) : (
                groupedResults.map(([key, group]) => {
                  const first = group[0];
                  const isExpanded = expandedGroups.has(key);
                  const hasBarcode = !!first.sample_barcode;
                  
                  return (
                    <>
                      <tr 
                        key={key} 
                        className={`hover:bg-blue-50 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50/50' : ''}`}
                        onClick={() => toggleGroup(key)}
                      >
                        <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-500 border-r border-zinc-200 text-center">
                          {hasBarcode ? (
                            isExpanded ? <ChevronDown className="w-3.5 h-3.5 inline-block" /> : <ChevronRight className="w-3.5 h-3.5 inline-block" />
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-600 border-r border-zinc-200">
                          {format(new Date(first.result_time || first.created_at), 'dd/MM/yyyy HH:mm:ss')}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-900 font-mono border-r border-zinc-200">
                          {first.sample_barcode || '-'}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-800 border-r border-zinc-200">
                          {first.patient_name || 'Unknown'}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-800 border-r border-zinc-200">
                          {first.equipment_name || `Eq #${first.equipment_id}`}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-600">
                          {group.length} result{group.length !== 1 ? 's' : ''}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-zinc-50">
                          <td colSpan={6} className="p-0 border-b border-zinc-300">
                            <div className="pl-12 pr-4 py-2 bg-zinc-100/50 border-l-4 border-blue-400">
                              <table className="min-w-full border border-zinc-300 bg-white">
                                <thead className="bg-[#f0f0f0]">
                                  <tr>
                                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Test</th>
                                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Result</th>
                                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Unit</th>
                                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-zinc-600 border-b border-zinc-300">Time</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200">
                                  {group.map((result) => (
                                    <tr key={result.id} className="hover:bg-zinc-50">
                                      <td className="px-3 py-1 text-[11px] text-zinc-800 border-r border-zinc-200">{result.test_name || result.test_no}</td>
                                      <td className="px-3 py-1 text-[11px] font-medium text-zinc-900 border-r border-zinc-200">{result.result_value}</td>
                                      <td className="px-3 py-1 text-[11px] text-zinc-600 border-r border-zinc-200">{result.result_unit}</td>
                                      <td className="px-3 py-1 text-[11px] text-zinc-500">
                                        {format(new Date(result.result_time || result.created_at), 'HH:mm:ss')}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
