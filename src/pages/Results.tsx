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
    <div className="space-y-6">
      {!equipmentId && (
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-zinc-900">Test Results</h2>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search results..."
                className="pl-10 pr-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500 w-64"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={handleClearResults}
              className="bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 rounded-lg flex items-center transition-colors border border-red-200"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Results
            </button>
          </div>
        </div>
      )}

      {equipmentId && (
        <div className="flex justify-between items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search results..."
              className="pl-10 pr-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider w-10"></th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Barcode</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Patient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Equipment</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Tests</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-zinc-500">
                    Loading results...
                  </td>
                </tr>
              ) : groupedResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-zinc-500">
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
                        className={`hover:bg-zinc-50 transition-colors cursor-pointer ${isExpanded ? 'bg-zinc-50' : ''}`}
                        onClick={() => toggleGroup(key)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                          {hasBarcode ? (
                            isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                          ) : null}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                          {format(new Date(first.result_time || first.created_at), 'MMM d, HH:mm:ss')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 font-mono font-medium">
                          {first.sample_barcode || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900">
                          {first.patient_name || 'Unknown'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900">
                          {first.equipment_name || `Eq #${first.equipment_id}`}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                          {group.length} result{group.length !== 1 ? 's' : ''}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-zinc-50/50">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                              <table className="min-w-full divide-y divide-zinc-200">
                                <thead className="bg-zinc-50">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase">Test</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase">Result</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase">Unit</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase">Time</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200">
                                  {group.map((result) => (
                                    <tr key={result.id}>
                                      <td className="px-4 py-2 text-sm text-zinc-900">{result.test_name || result.test_no}</td>
                                      <td className="px-4 py-2 text-sm font-semibold text-zinc-900">{result.result_value}</td>
                                      <td className="px-4 py-2 text-sm text-zinc-500">{result.result_unit}</td>
                                      <td className="px-4 py-2 text-sm text-zinc-500">
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
