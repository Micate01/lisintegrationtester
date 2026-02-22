import { useEffect, useState, useMemo } from 'react';
import { Activity, Server, FileText, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface Stats {
  totalEquipments: number;
  activeEquipments: number;
  totalResults: number;
  recentLogs: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalEquipments: 0,
    activeEquipments: 0,
    totalResults: 0,
    recentLogs: 0,
  });
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [equipmentsRes, resultsRes, logsRes] = await Promise.all([
          fetch('/api/equipments'),
          fetch('/api/results'),
          fetch('/api/logs'),
        ]);

        if (!equipmentsRes.ok || !resultsRes.ok || !logsRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const equipments = await equipmentsRes.json();
        const results = await resultsRes.json();
        const logs = await logsRes.json();

        setStats({
          totalEquipments: equipments.length,
          activeEquipments: equipments.filter((e: any) => e.status === 'connected').length,
          totalResults: results.length,
          recentLogs: logs.length,
        });

        setRecentResults(results.slice(0, 20)); // Get more results to group effectively
      } catch (err: any) {
        setError(err.message || 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const groupedResults = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    recentResults.forEach(r => {
      const key = r.sample_barcode ? r.sample_barcode : `NO_BARCODE_${r.id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    return Object.entries(groups)
      .sort(([, a], [, b]) => {
        const timeA = new Date(a[0].result_time || a[0].created_at).getTime();
        const timeB = new Date(b[0].result_time || b[0].created_at).getTime();
        return timeB - timeA;
      })
      .slice(0, 5); // Show top 5 groups
  }, [recentResults]);

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

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center">
        <AlertCircle className="w-5 h-5 mr-2" />
        {error}
      </div>
    );
  }

  const statCards = [
    { name: 'Total Equipments', value: stats.totalEquipments, icon: Server, color: 'text-blue-600', bg: 'bg-blue-100' },
    { name: 'Active Connections', value: stats.activeEquipments, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { name: 'Total Results', value: stats.totalResults, icon: FileText, color: 'text-purple-600', bg: 'bg-purple-100' },
    { name: 'Recent Logs', value: stats.recentLogs, icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-100' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div key={stat.name} className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
            <div className="flex items-center">
              <div className={`p-3 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-zinc-500">{stat.name}</p>
                <p className="text-2xl font-semibold text-zinc-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-200">
          <h3 className="text-lg font-medium text-zinc-900">Recent Test Results</h3>
        </div>
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
              {groupedResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-zinc-500">
                    No results found
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
                                  {group.map((result: any) => (
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
