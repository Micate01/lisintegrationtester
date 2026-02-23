import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format } from 'date-fns';
import { Search, Filter, Download, Plus } from 'lucide-react';

interface QCResult {
  id: number;
  run_time: string;
  test_name: string;
  level: string;
  result_value: number;
  mean: number;
  sd: number;
  status: 'pass' | 'warning' | 'fail';
  operator: string;
}

export default function QualityControl({ equipmentId }: { equipmentId?: number }) {
  const [selectedTest, setSelectedTest] = useState('WBC');
  const [selectedLevel, setSelectedLevel] = useState('Level 2');
  const [data, setData] = useState<QCResult[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQCData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/qc_results');
      if (response.ok) {
        const rawData = await response.json();
        
        // Filter and map the raw database data to our component's format
        const filteredData = rawData
          .filter((row: any) => 
            row.test_name === selectedTest && 
            row.qc_level === selectedLevel &&
            (!equipmentId || row.equipment_id === equipmentId)
          )
          .map((row: any) => {
            // Calculate mock mean/sd based on test type for visualization
            // In a real app, these would come from the database or a target table
            const baseMean = selectedTest === 'WBC' ? (selectedLevel === 'Level 1' ? 3.5 : selectedLevel === 'Level 2' ? 7.5 : 15.0) : 
                             selectedTest === 'RBC' ? (selectedLevel === 'Level 1' ? 2.5 : selectedLevel === 'Level 2' ? 4.5 : 6.0) : 120;
            const sd = baseMean * 0.05;
            const value = parseFloat(row.result_value);
            
            let status: 'pass' | 'warning' | 'fail' = 'pass';
            if (Math.abs(value - baseMean) > 3 * sd) status = 'fail';
            else if (Math.abs(value - baseMean) > 2 * sd) status = 'warning';

            return {
              id: row.id,
              run_time: row.result_time,
              test_name: row.test_name,
              level: row.qc_level,
              result_value: value,
              mean: baseMean,
              sd: parseFloat(sd.toFixed(2)),
              status: status,
              operator: 'Admin'
            };
          })
          .sort((a: any, b: any) => new Date(a.run_time).getTime() - new Date(b.run_time).getTime());
          
        setData(filteredData);
      }
    } catch (error) {
      console.error('Failed to fetch QC data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQCData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchQCData, 30000);
    return () => clearInterval(interval);
  }, [selectedTest, selectedLevel, equipmentId]);

  // Update data when filters change
  const handleFilterChange = (test: string, level: string) => {
    setSelectedTest(test);
    setSelectedLevel(level);
  };

  const currentMean = data.length > 0 ? data[0].mean : 0;
  const currentSD = data.length > 0 ? data[0].sd : 0;

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header / Filters */}
      <div className="flex justify-between items-center bg-white p-2 border border-zinc-300 shadow-sm flex-shrink-0">
        <div className="flex items-center space-x-4">
          <h2 className="text-sm font-semibold text-zinc-800 uppercase tracking-wider ml-2">Quality Control</h2>
          <div className="h-4 w-px bg-zinc-300" />
          <div className="flex items-center space-x-2">
            <select 
              className="text-xs border border-zinc-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-500"
              value={selectedTest}
              onChange={(e) => handleFilterChange(e.target.value, selectedLevel)}
            >
              <option value="WBC">WBC</option>
              <option value="RBC">RBC</option>
              <option value="HGB">HGB</option>
              <option value="PLT">PLT</option>
            </select>
            <select 
              className="text-xs border border-zinc-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-500"
              value={selectedLevel}
              onChange={(e) => handleFilterChange(selectedTest, e.target.value)}
            >
              <option value="Level 1">Level 1 (Low)</option>
              <option value="Level 2">Level 2 (Normal)</option>
              <option value="Level 3">Level 3 (High)</option>
            </select>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded flex items-center hover:bg-blue-100 transition-colors text-xs font-medium">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add QC Run
          </button>
          <button className="bg-zinc-50 text-zinc-700 border border-zinc-200 px-3 py-1 rounded flex items-center hover:bg-zinc-100 transition-colors text-xs font-medium">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 space-y-4 overflow-auto">
        {/* Chart Section */}
        <div className="bg-white border border-zinc-300 shadow-sm p-4 flex-shrink-0 h-80">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-semibold text-zinc-700 uppercase">Levey-Jennings Chart - {selectedTest} {selectedLevel}</h3>
            <div className="text-xs text-zinc-500 space-x-4">
              <span>Mean: <span className="font-mono text-zinc-900">{currentMean}</span></span>
              <span>SD: <span className="font-mono text-zinc-900">{currentSD}</span></span>
              <span>CV: <span className="font-mono text-zinc-900">{((currentSD / currentMean) * 100).toFixed(2)}%</span></span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis 
                  dataKey="run_time" 
                  tickFormatter={(time) => format(new Date(time), 'dd/MM')} 
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={false}
                />
                <YAxis 
                  domain={[currentMean - 4 * currentSD, currentMean + 4 * currentSD]} 
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={false}
                  width={40}
                />
                <Tooltip 
                  contentStyle={{ fontSize: '12px', border: '1px solid #e5e7eb', borderRadius: '4px' }}
                  labelFormatter={(label) => format(new Date(label), 'dd/MM/yyyy HH:mm')}
                />
                
                {/* Reference Lines for Mean and SDs */}
                <ReferenceLine y={currentMean} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Mean', position: 'right', fontSize: 10, fill: '#10b981' }} />
                <ReferenceLine y={currentMean + 2 * currentSD} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '+2SD', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                <ReferenceLine y={currentMean - 2 * currentSD} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '-2SD', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                <ReferenceLine y={currentMean + 3 * currentSD} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '+3SD', position: 'right', fontSize: 10, fill: '#ef4444' }} />
                <ReferenceLine y={currentMean - 3 * currentSD} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '-3SD', position: 'right', fontSize: 10, fill: '#ef4444' }} />

                <Line 
                  type="monotone" 
                  dataKey="result_value" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    const color = payload.status === 'fail' ? '#ef4444' : payload.status === 'warning' ? '#f59e0b' : '#3b82f6';
                    return <circle cx={cx} cy={cy} r={3} fill={color} stroke="none" />;
                  }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white border border-zinc-300 shadow-sm flex-1 flex flex-col min-h-0">
          <div className="px-4 py-2 border-b border-zinc-300 bg-[#f0f0f0]">
            <h3 className="text-xs font-semibold text-zinc-800 uppercase tracking-wider">QC Run History</h3>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="min-w-full divide-y divide-zinc-200 border-collapse">
              <thead className="bg-[#f8f8f8] sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Run Time</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Test</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Level</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Result</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Target</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Deviation</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Status</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300">Operator</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-zinc-200">
                {data.slice().reverse().map((run) => {
                  const deviation = (run.result_value - run.mean) / run.sd;
                  return (
                    <tr key={run.id} className="hover:bg-blue-50 transition-colors">
                      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-600 border-r border-zinc-200">
                        {format(new Date(run.run_time), 'dd/MM/yyyy HH:mm')}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-800 border-r border-zinc-200">{run.test_name}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-600 border-r border-zinc-200">{run.level}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-xs font-medium text-zinc-900 border-r border-zinc-200">{run.result_value}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-600 border-r border-zinc-200">{run.mean}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-600 border-r border-zinc-200">
                        <span className={Math.abs(deviation) > 2 ? (Math.abs(deviation) > 3 ? 'text-red-600 font-bold' : 'text-amber-600 font-bold') : 'text-zinc-600'}>
                          {deviation > 0 ? '+' : ''}{deviation.toFixed(2)} SD
                        </span>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-xs border-r border-zinc-200">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                          run.status === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                          run.status === 'warning' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-600">{run.operator}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
