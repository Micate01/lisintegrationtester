import { useEffect, useState, FormEvent } from 'react';
import { Plus, Server, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface Equipment {
  id: number;
  name: string;
  model: string;
  ip_address: string;
  port: number;
  status: string;
  created_at: string;
}

export default function Equipments() {
  const navigate = useNavigate();
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEquipment, setNewEquipment] = useState({
    name: '',
    brand: '',
    model: '',
    ip_address: '',
    port: '',
  });

  const brands = ['Mindray', 'Medconn', 'Generic', 'Other'];
  const modelsByBrand: { [key: string]: string[] } = {
    'Mindray': ['Mindray BS-200', 'Mindray BS-220', 'Mindray BS-120', 'Mindray BS-130'],
    'Medconn': ['Medconn MH 120', 'Medconn MH 120X', 'Medconn MH 120R', 'Medconn MH 120C', 'Medconn MH 120S', 'Medconn MH 120CR', 'Medconn MH 120SR', 'Medconn MH 60'],
    'Generic': ['Generic HL7'],
    'Other': ['Other']
  };

  const fetchEquipments = async () => {
    try {
      const res = await fetch('/api/equipments');
      if (res.ok) {
        const data = await res.json();
        setEquipments(data);
      }
    } catch (error) {
      console.error('Failed to fetch equipments', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEquipments();
    const interval = setInterval(fetchEquipments, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAddEquipment = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/equipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newEquipment,
          port: parseInt(newEquipment.port),
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setNewEquipment({ name: '', brand: '', model: '', ip_address: '', port: '' });
        fetchEquipments();
      }
    } catch (error) {
      console.error('Failed to add equipment', error);
    }
  };

  const handleDeleteEquipment = async (id: number) => {
    if (!confirm('Are you sure you want to delete this equipment?')) return;
    
    try {
      const res = await fetch(`/api/equipments/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchEquipments();
      }
    } catch (error) {
      console.error('Failed to delete equipment', error);
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex justify-between items-center bg-white p-2 border border-zinc-300 shadow-sm flex-shrink-0">
        <h2 className="text-sm font-semibold text-zinc-800 uppercase tracking-wider ml-2">Connected Equipments</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded flex items-center hover:bg-blue-100 transition-colors text-xs font-medium"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Add Equipment
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-zinc-500">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 flex-1 content-start">
          {equipments.map((eq) => (
            <div 
              key={eq.id} 
              className="bg-white border border-zinc-300 shadow-sm hover:border-blue-300 hover:shadow transition-all relative group cursor-pointer"
              onClick={() => navigate(`/equipments/${eq.id}`)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteEquipment(eq.id);
                }}
                className="absolute top-1.5 right-1.5 p-1 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                title="Delete Equipment"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              
              <div className="p-3 border-b border-zinc-200 bg-[#f8f8f8] flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <Server className="w-4 h-4 text-zinc-500" />
                  <h3 className="text-sm font-semibold text-zinc-800 truncate" title={eq.name}>{eq.name}</h3>
                </div>
              </div>
              
              <div className="p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-500">Status</span>
                  <div className={`flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
                    eq.status === 'connected' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                  }`}>
                    {eq.status === 'connected' ? (
                      <CheckCircle className="w-3 h-3 mr-1" />
                    ) : (
                      <XCircle className="w-3 h-3 mr-1" />
                    )}
                    {eq.status}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-500">Model</span>
                  <span className="text-xs text-zinc-800 font-medium truncate max-w-[120px]" title={eq.model}>{eq.model}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-500">IP Address</span>
                  <span className="text-xs font-mono text-zinc-700">{eq.ip_address || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-500">Port</span>
                  <span className="text-xs font-mono text-zinc-700">{eq.port}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-[#f0f0f0] border border-zinc-400 shadow-lg w-full max-w-md flex flex-col">
            <div className="bg-blue-800 text-white px-3 py-2 flex justify-between items-center">
              <h3 className="text-sm font-medium">Add New Equipment</h3>
              <button onClick={() => setShowAddModal(false)} className="text-blue-200 hover:text-white">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddEquipment} className="p-4 space-y-3 bg-[#f0f0f0]">
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <label className="text-xs text-zinc-700 text-right">Name:</label>
                <input
                  type="text"
                  required
                  className="w-full px-2 py-1 text-xs border border-zinc-300 focus:outline-none focus:border-blue-500 bg-white"
                  value={newEquipment.name}
                  onChange={(e) => setNewEquipment({ ...newEquipment, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <label className="text-xs text-zinc-700 text-right">Brand:</label>
                <select
                  required
                  className="w-full px-2 py-1 text-xs border border-zinc-300 focus:outline-none focus:border-blue-500 bg-white"
                  value={newEquipment.brand}
                  onChange={(e) => setNewEquipment({ ...newEquipment, brand: e.target.value, model: '' })}
                >
                  <option value="" disabled>Select a brand</option>
                  {brands.map(brand => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <label className="text-xs text-zinc-700 text-right">Model:</label>
                <select
                  required
                  className="w-full px-2 py-1 text-xs border border-zinc-300 focus:outline-none focus:border-blue-500 bg-white"
                  value={newEquipment.model}
                  onChange={(e) => setNewEquipment({ ...newEquipment, model: e.target.value })}
                  disabled={!newEquipment.brand}
                >
                  <option value="" disabled>Select a model</option>
                  {newEquipment.brand && modelsByBrand[newEquipment.brand]?.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <label className="text-xs text-zinc-700 text-right">IP Address:</label>
                <input
                  type="text"
                  className="w-full px-2 py-1 text-xs border border-zinc-300 focus:outline-none focus:border-blue-500 bg-white"
                  value={newEquipment.ip_address}
                  onChange={(e) => setNewEquipment({ ...newEquipment, ip_address: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <label className="text-xs text-zinc-700 text-right">Port:</label>
                <input
                  type="number"
                  required
                  className="w-full px-2 py-1 text-xs border border-zinc-300 focus:outline-none focus:border-blue-500 bg-white"
                  value={newEquipment.port}
                  onChange={(e) => setNewEquipment({ ...newEquipment, port: e.target.value })}
                />
              </div>
              <div className="flex justify-end space-x-2 mt-4 pt-3 border-t border-zinc-300">
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-zinc-100 border border-zinc-400 text-zinc-800 text-xs hover:bg-zinc-200 flex items-center"
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                  OK
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-1.5 bg-zinc-100 border border-zinc-400 text-zinc-800 text-xs hover:bg-zinc-200 flex items-center"
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5 text-red-600" />
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
