import { useEffect, useState, FormEvent } from 'react';
import { Plus, Trash2, Search, FileText, XCircle, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

interface WorklistOrder {
  id: number;
  sample_barcode: string;
  patient_id: string;
  patient_name: string;
  age: string;
  sex: string;
  test_names: string;
  status: string;
  created_at: string;
}

export default function Worklist({ equipmentId }: { equipmentId?: number }) {
  const [orders, setOrders] = useState<WorklistOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newOrder, setNewOrder] = useState({
    sample_barcode: '',
    patient_id: '',
    patient_name: '',
    age: '',
    sex: 'M',
    test_names: 'CBC+DIFF',
  });

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/worklist');
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Failed to fetch worklist', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAddOrder = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/worklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrder),
      });

      if (res.ok) {
        setShowAddModal(false);
        setNewOrder({
          sample_barcode: '',
          patient_id: '',
          patient_name: '',
          age: '',
          sex: 'M',
          test_names: 'CBC+DIFF',
        });
        fetchOrders();
      }
    } catch (error) {
      console.error('Failed to add order', error);
    }
  };

  const handleDeleteOrder = async (id: number) => {
    if (!confirm('Are you sure you want to delete this order?')) return;
    try {
      const res = await fetch(`/api/worklist/${id}`, { method: 'DELETE' });
      if (res.ok) fetchOrders();
    } catch (error) {
      console.error('Failed to delete order', error);
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      {!equipmentId && (
        <div className="flex justify-between items-center bg-white p-2 border border-zinc-300 shadow-sm flex-shrink-0">
          <h2 className="text-sm font-semibold text-zinc-800 uppercase tracking-wider ml-2">Worklist Orders</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded flex items-center hover:bg-blue-100 transition-colors text-xs font-medium"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Order
          </button>
        </div>
      )}

      <div className="bg-white border border-zinc-300 shadow-sm flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-zinc-200 border-collapse">
            <thead className="bg-[#f8f8f8] sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Barcode</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Patient ID</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Name</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Age/Sex</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Tests</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-600 border-b border-zinc-300 border-r">Created</th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold text-zinc-600 border-b border-zinc-300">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-xs text-zinc-500">Loading...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-xs text-zinc-500">No orders in worklist.</td></tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-blue-50 transition-colors">
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs font-mono font-medium text-zinc-900 border-r border-zinc-200">{order.sample_barcode}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-600 border-r border-zinc-200">{order.patient_id}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-800 border-r border-zinc-200">{order.patient_name}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-600 border-r border-zinc-200">{order.age} / {order.sex}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-600 border-r border-zinc-200">{order.test_names}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs text-zinc-600 border-r border-zinc-200">{format(new Date(order.created_at), 'dd/MM/yyyy HH:mm')}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-center text-xs font-medium">
                      <button onClick={() => handleDeleteOrder(order.id)} className="text-zinc-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5 mx-auto" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-[#f0f0f0] border border-zinc-400 shadow-lg w-full max-w-md flex flex-col">
            <div className="bg-blue-800 text-white px-3 py-2 flex justify-between items-center">
              <h3 className="text-sm font-medium">Add New Order</h3>
              <button onClick={() => setShowAddModal(false)} className="text-blue-200 hover:text-white">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddOrder} className="p-4 space-y-3 bg-[#f0f0f0]">
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <label className="text-xs text-zinc-700 text-right">Sample Barcode:</label>
                <input
                  type="text"
                  required
                  className="w-full px-2 py-1 text-xs border border-zinc-300 focus:outline-none focus:border-blue-500 bg-white"
                  value={newOrder.sample_barcode}
                  onChange={(e) => setNewOrder({ ...newOrder, sample_barcode: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <label className="text-xs text-zinc-700 text-right">Patient ID:</label>
                <input
                  type="text"
                  className="w-full px-2 py-1 text-xs border border-zinc-300 focus:outline-none focus:border-blue-500 bg-white"
                  value={newOrder.patient_id}
                  onChange={(e) => setNewOrder({ ...newOrder, patient_id: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <label className="text-xs text-zinc-700 text-right">Patient Name:</label>
                <input
                  type="text"
                  className="w-full px-2 py-1 text-xs border border-zinc-300 focus:outline-none focus:border-blue-500 bg-white"
                  value={newOrder.patient_name}
                  onChange={(e) => setNewOrder({ ...newOrder, patient_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <label className="text-xs text-zinc-700 text-right">Age:</label>
                <input
                  type="text"
                  className="w-full px-2 py-1 text-xs border border-zinc-300 focus:outline-none focus:border-blue-500 bg-white"
                  value={newOrder.age}
                  onChange={(e) => setNewOrder({ ...newOrder, age: e.target.value })}
                  placeholder="32^Y"
                />
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <label className="text-xs text-zinc-700 text-right">Sex:</label>
                <select
                  className="w-full px-2 py-1 text-xs border border-zinc-300 focus:outline-none focus:border-blue-500 bg-white"
                  value={newOrder.sex}
                  onChange={(e) => setNewOrder({ ...newOrder, sex: e.target.value })}
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <label className="text-xs text-zinc-700 text-right">Tests:</label>
                <input
                  type="text"
                  className="w-full px-2 py-1 text-xs border border-zinc-300 focus:outline-none focus:border-blue-500 bg-white"
                  value={newOrder.test_names}
                  onChange={(e) => setNewOrder({ ...newOrder, test_names: e.target.value })}
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
