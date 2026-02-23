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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-zinc-900">Connected Equipments</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg flex items-center hover:bg-zinc-800 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Equipment
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {equipments.map((eq) => (
            <div 
              key={eq.id} 
              className="bg-white rounded-lg border border-zinc-200 p-4 shadow-sm hover:shadow-md transition-shadow relative group cursor-pointer"
              onClick={() => navigate(`/equipments/${eq.id}`)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteEquipment(eq.id);
                }}
                className="absolute top-2 right-2 p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                title="Delete Equipment"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              
              <div className="flex justify-between items-start mb-3">
                <div className="p-2 bg-zinc-100 rounded-md">
                  <Server className="w-5 h-5 text-zinc-600" />
                </div>
                <div className={`flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${
                  eq.status === 'connected' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-800'
                }`}>
                  {eq.status === 'connected' ? (
                    <CheckCircle className="w-3 h-3 mr-1" />
                  ) : (
                    <XCircle className="w-3 h-3 mr-1" />
                  )}
                  {eq.status}
                </div>
              </div>
              
              <h3 className="text-base font-semibold text-zinc-900 mb-0.5 pr-6 truncate" title={eq.name}>{eq.name}</h3>
              <p className="text-xs text-zinc-500 mb-3 truncate" title={eq.model}>{eq.model}</p>
              
              <div className="space-y-1.5 border-t border-zinc-100 pt-3">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">IP Address</span>
                  <span className="font-mono text-zinc-900">{eq.ip_address || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Port</span>
                  <span className="font-mono text-zinc-900">{eq.port}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Added</span>
                  <span className="text-zinc-900">{format(new Date(eq.created_at), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Add New Equipment</h3>
            <form onSubmit={handleAddEquipment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  value={newEquipment.name}
                  onChange={(e) => setNewEquipment({ ...newEquipment, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Brand</label>
                <select
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500 bg-white"
                  value={newEquipment.brand}
                  onChange={(e) => setNewEquipment({ ...newEquipment, brand: e.target.value, model: '' })}
                >
                  <option value="" disabled>Select a brand</option>
                  {brands.map(brand => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Model</label>
                <select
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500 bg-white"
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">IP Address</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    value={newEquipment.ip_address}
                    onChange={(e) => setNewEquipment({ ...newEquipment, ip_address: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Port</label>
                  <input
                    type="number"
                    required
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    value={newEquipment.port}
                    onChange={(e) => setNewEquipment({ ...newEquipment, port: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-zinc-700 hover:bg-zinc-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
                >
                  Add Equipment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
