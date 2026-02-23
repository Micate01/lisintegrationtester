import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Server, CheckCircle, XCircle } from 'lucide-react';
import Worklist from './Worklist';
import Results from './Results';

interface Equipment {
  id: number;
  name: string;
  model: string;
  ip_address: string;
  port: number;
  status: string;
  created_at: string;
}

export default function EquipmentDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'worklist' | 'results' | 'qc'>('results');

  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        const res = await fetch(`/api/equipments`);
        if (res.ok) {
          const data = await res.json();
          const eq = data.find((e: Equipment) => e.id === Number(id));
          if (eq) {
            setEquipment(eq);
          } else {
            navigate('/equipments');
          }
        }
      } catch (error) {
        console.error('Failed to fetch equipment details', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEquipment();
    const interval = setInterval(fetchEquipment, 5000);
    return () => clearInterval(interval);
  }, [id, navigate]);

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (!equipment) {
    return null;
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center space-x-4 bg-white p-2 border border-zinc-300 shadow-sm flex-shrink-0">
        <button 
          onClick={() => navigate('/equipments')}
          className="p-1.5 hover:bg-zinc-100 rounded transition-colors border border-transparent hover:border-zinc-300"
        >
          <ArrowLeft className="w-5 h-5 text-zinc-600" />
        </button>
        <div>
          <h2 className="text-sm font-semibold text-zinc-800 flex items-center uppercase tracking-wider">
            {equipment.name}
            <div className={`ml-3 flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
              equipment.status === 'connected' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
            }`}>
              {equipment.status === 'connected' ? (
                <CheckCircle className="w-3 h-3 mr-1" />
              ) : (
                <XCircle className="w-3 h-3 mr-1" />
              )}
              {equipment.status}
            </div>
          </h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            {equipment.model} • {equipment.ip_address || 'No IP'} • Port {equipment.port}
          </p>
        </div>
      </div>

      <div className="bg-[#f0f0f0] border-b border-zinc-300 px-2 flex space-x-1 flex-shrink-0">
        <button
          onClick={() => setActiveTab('results')}
          className={`px-3 py-1.5 text-xs font-medium border-t border-l border-r rounded-t-sm ${
            activeTab === 'results'
              ? 'bg-white border-zinc-300 text-zinc-900 -mb-px z-10 relative'
              : 'bg-transparent border-transparent text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          Results
        </button>
        <button
          onClick={() => setActiveTab('worklist')}
          className={`px-3 py-1.5 text-xs font-medium border-t border-l border-r rounded-t-sm ${
            activeTab === 'worklist'
              ? 'bg-white border-zinc-300 text-zinc-900 -mb-px z-10 relative'
              : 'bg-transparent border-transparent text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          Worklist Orders
        </button>
        <button
          onClick={() => setActiveTab('qc')}
          className={`px-3 py-1.5 text-xs font-medium border-t border-l border-r rounded-t-sm ${
            activeTab === 'qc'
              ? 'bg-white border-zinc-300 text-zinc-900 -mb-px z-10 relative'
              : 'bg-transparent border-transparent text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          QC
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-white border border-zinc-300 -mt-4 relative z-0">
        {activeTab === 'results' && <Results equipmentId={equipment.id} />}
        {activeTab === 'worklist' && <Worklist equipmentId={equipment.id} />}
        {activeTab === 'qc' && (
          <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
            QC functionality coming soon
          </div>
        )}
      </div>
    </div>
  );
}
