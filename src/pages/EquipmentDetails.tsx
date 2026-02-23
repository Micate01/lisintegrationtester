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
  const [activeTab, setActiveTab] = useState<'worklist' | 'results' | 'qc'>('worklist');

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
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <button 
          onClick={() => navigate('/equipments')}
          className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-zinc-600" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 flex items-center">
            {equipment.name}
            <div className={`ml-4 flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider ${
              equipment.status === 'connected' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-800'
            }`}>
              {equipment.status === 'connected' ? (
                <CheckCircle className="w-3 h-3 mr-1" />
              ) : (
                <XCircle className="w-3 h-3 mr-1" />
              )}
              {equipment.status}
            </div>
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            {equipment.model} • {equipment.ip_address || 'No IP'} • Port {equipment.port}
          </p>
        </div>
      </div>

      <div className="border-b border-zinc-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('worklist')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'worklist'
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
            }`}
          >
            Worklist Orders
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'results'
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
            }`}
          >
            Results
          </button>
          <button
            onClick={() => setActiveTab('qc')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'qc'
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
            }`}
          >
            QC
          </button>
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'worklist' && <Worklist equipmentId={equipment.id} />}
        {activeTab === 'results' && <Results equipmentId={equipment.id} />}
        {activeTab === 'qc' && (
          <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-zinc-500">
            QC functionality coming soon
          </div>
        )}
      </div>
    </div>
  );
}
