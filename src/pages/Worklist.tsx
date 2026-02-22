import { useEffect, useState, FormEvent } from 'react';
import { Plus, Trash2, Search, FileText } from 'lucide-react';
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

export default function Worklist() {
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-zinc-900">Worklist Orders</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg flex items-center hover:bg-zinc-800 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Order
        </button>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Barcode</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Patient ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Age/Sex</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Tests</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-zinc-500">Loading...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-zinc-500">No orders in worklist.</td></tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-zinc-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-zinc-900">{order.sample_barcode}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">{order.patient_id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900">{order.patient_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">{order.age} / {order.sex}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">{order.test_names}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">{format(new Date(order.created_at), 'MMM d, HH:mm')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => handleDeleteOrder(order.id)} className="text-red-600 hover:text-red-900">
                        <Trash2 className="w-4 h-4" />
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Add New Order</h3>
            <form onSubmit={handleAddOrder} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Sample Barcode</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  value={newOrder.sample_barcode}
                  onChange={(e) => setNewOrder({ ...newOrder, sample_barcode: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Patient ID</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    value={newOrder.patient_id}
                    onChange={(e) => setNewOrder({ ...newOrder, patient_id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Patient Name</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    value={newOrder.patient_name}
                    onChange={(e) => setNewOrder({ ...newOrder, patient_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Age (e.g. 32^Y)</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    value={newOrder.age}
                    onChange={(e) => setNewOrder({ ...newOrder, age: e.target.value })}
                    placeholder="32^Y"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Sex</label>
                  <select
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500 bg-white"
                    value={newOrder.sex}
                    onChange={(e) => setNewOrder({ ...newOrder, sex: e.target.value })}
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="O">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Tests</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  value={newOrder.test_names}
                  onChange={(e) => setNewOrder({ ...newOrder, test_names: e.target.value })}
                />
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
                  Add Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
