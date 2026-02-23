import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Terminal, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';

interface Log {
  id: number;
  equipment_id: number;
  equipment_name: string;
  message_type: string;
  direction: 'IN' | 'OUT';
  raw_message: string;
  created_at: string;
}

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (error) {
      console.error('Failed to fetch logs', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000); // Faster refresh for logs
    return () => clearInterval(interval);
  }, []);

  const handleClearLogs = async () => {
    if (!confirm('Are you sure you want to clear all logs?')) return;
    
    try {
      const res = await fetch('/api/logs', {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchLogs();
      }
    } catch (error) {
      console.error('Failed to clear logs', error);
    }
  };

  const groupedLogs = useMemo(() => {
    const groups: { [key: string]: Log & { count: number } } = {};
    
    // Process logs in reverse order (newest first) to keep the newest timestamp
    // Assuming 'logs' is already sorted DESC by created_at from the API
    logs.forEach(log => {
      // Create a unique key based on content, direction, and equipment
      // We ignore timestamp for grouping
      const key = `${log.equipment_id}-${log.direction}-${log.message_type}-${log.raw_message}`;
      
      if (!groups[key]) {
        groups[key] = { ...log, count: 1 };
      } else {
        groups[key].count++;
      }
    });

    return Object.values(groups).sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [logs]);

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex justify-between items-center bg-white p-2 border border-zinc-300 shadow-sm flex-shrink-0">
        <h2 className="text-sm font-semibold text-zinc-800 uppercase tracking-wider ml-2">HL7 Communication Logs</h2>
        <button
          onClick={handleClearLogs}
          className="bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded flex items-center hover:bg-red-100 transition-colors text-xs font-medium"
        >
          <Trash2 className="w-4 h-4 mr-1.5" />
          Clear Logs
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 shadow-sm flex-1 flex flex-col min-h-0">
        <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-950 flex items-center flex-shrink-0">
          <Terminal className="w-4 h-4 text-zinc-400 mr-2" />
          <span className="text-zinc-400 font-mono text-xs">Live Feed</span>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-zinc-800 border-collapse">
            <thead className="bg-zinc-900 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 border-r">Time</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 border-r">Equipment</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 border-r">Dir</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 border-r">Type</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 w-full">Message</th>
              </tr>
            </thead>
            <tbody className="bg-zinc-900 divide-y divide-zinc-800 font-mono text-[11px]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-zinc-500">
                    Loading logs...
                  </td>
                </tr>
              ) : groupedLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-zinc-500">
                    No logs recorded yet.
                  </td>
                </tr>
              ) : (
                groupedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-800/50 transition-colors group">
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-500 border-r border-zinc-800">
                      {format(new Date(log.created_at), 'HH:mm:ss.SSS')}
                      {log.count > 1 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 text-[10px]">
                          x{log.count}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-300 border-r border-zinc-800">
                      {log.equipment_name || `Eq #${log.equipment_id}`}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap border-r border-zinc-800">
                      {log.direction === 'IN' ? (
                        <span className="flex items-center text-emerald-400">
                          <ArrowDown className="w-3 h-3 mr-1" /> IN
                        </span>
                      ) : (
                        <span className="flex items-center text-blue-400">
                          <ArrowUp className="w-3 h-3 mr-1" /> OUT
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap border-r border-zinc-800">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] border border-zinc-700">
                        {log.message_type}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-zinc-400 break-all">
                      <div className="max-w-3xl truncate group-hover:whitespace-normal group-hover:overflow-visible">
                        {log.raw_message.replace(/\r/g, '↵ ')}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
