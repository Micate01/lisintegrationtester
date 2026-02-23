import React, { useState, useEffect } from 'react';
import { Users, Search, Plus, Edit2, Trash2, FileText, X, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Patient {
  id: number;
  patient_id: string;
  name: string;
  date_of_birth: string;
  sex: string;
  blood_type: string;
  phone: string;
  address: string;
  created_at: string;
}

interface Result {
  id: number;
  sample_barcode: string;
  test_no: string;
  test_name: string;
  result_value: string;
  result_unit: string;
  result_time: string;
  equipment_name: string;
}

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientHistory, setPatientHistory] = useState<Result[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    patient_id: '',
    name: '',
    date_of_birth: '',
    sex: 'M',
    blood_type: 'O',
    phone: '',
    address: ''
  });

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/patients');
      if (response.ok) {
        const data = await response.json();
        setPatients(data);
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const handleOpenForm = (patient?: Patient) => {
    if (patient) {
      setSelectedPatient(patient);
      setFormData({
        patient_id: patient.patient_id,
        name: patient.name,
        date_of_birth: patient.date_of_birth || '',
        sex: patient.sex || 'M',
        blood_type: patient.blood_type || 'O',
        phone: patient.phone || '',
        address: patient.address || ''
      });
    } else {
      setSelectedPatient(null);
      // Generate a random patient ID like PAT-123456
      const randomId = `PAT-${Math.floor(100000 + Math.random() * 900000)}`;
      setFormData({
        patient_id: randomId,
        name: '',
        date_of_birth: '',
        sex: 'M',
        blood_type: 'O',
        phone: '',
        address: ''
      });
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedPatient(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = selectedPatient ? `/api/patients/${selectedPatient.id}` : '/api/patients';
      const method = selectedPatient ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        fetchPatients();
        handleCloseForm();
      } else {
        alert('Failed to save patient');
      }
    } catch (error) {
      console.error('Error saving patient:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this patient?')) return;
    
    try {
      const response = await fetch(`/api/patients/${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchPatients();
      }
    } catch (error) {
      console.error('Error deleting patient:', error);
    }
  };

  const handleOpenHistory = async (patient: Patient) => {
    setSelectedPatient(patient);
    setIsHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/patients/${patient.patient_id}/history`);
      if (response.ok) {
        const data = await response.json();
        setPatientHistory(data);
      }
    } catch (error) {
      console.error('Failed to fetch patient history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.patient_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group history by test name for charts
  const historyByTest: Record<string, any[]> = patientHistory.reduce((acc, result) => {
    const testKey = result.test_name || result.test_no || 'Unknown Test';
    if (!acc[testKey]) {
      acc[testKey] = [];
    }
    acc[testKey].push({
      ...result,
      numericValue: parseFloat(result.result_value) || 0,
      date: new Date(result.result_time).toLocaleDateString()
    });
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-4 border border-zinc-300 shadow-sm flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Users className="w-5 h-5 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-800">Patient Management</h1>
            <p className="text-xs text-zinc-500">Manage patient records and view clinical history</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search patients..."
              className="pl-9 pr-4 py-2 text-sm border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => handleOpenForm()}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Patient</span>
          </button>
        </div>
      </div>

      {/* Patient List */}
      <div className="bg-white border border-zinc-300 shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 border-b border-zinc-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 font-medium">Patient ID</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Sex / Blood</th>
                <th className="px-4 py-3 font-medium">DOB</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">Loading patients...</td>
                </tr>
              ) : filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">No patients found</td>
                </tr>
              ) : (
                filteredPatients.map((patient) => (
                  <tr key={patient.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-zinc-900">{patient.patient_id}</td>
                    <td className="px-4 py-3 font-medium text-indigo-600">{patient.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-800 mr-2">
                        {patient.sex}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">
                        {patient.blood_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {patient.date_of_birth ? format(new Date(
                        patient.date_of_birth.length === 14 
                          ? `${patient.date_of_birth.substring(0,4)}-${patient.date_of_birth.substring(4,6)}-${patient.date_of_birth.substring(6,8)}`
                          : patient.date_of_birth
                      ), 'MMM d, yyyy') : '-'}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{patient.phone || '-'}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button 
                        onClick={() => handleOpenHistory(patient)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="View History"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleOpenForm(patient)}
                        className="p-1 text-zinc-500 hover:bg-zinc-100 rounded"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(patient.id)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                        title="Delete"
                      >
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

      {/* Patient Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-zinc-200">
              <h2 className="text-lg font-semibold">{selectedPatient ? 'Edit Patient' : 'New Patient'}</h2>
              <button onClick={handleCloseForm} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Patient ID *</label>
                <input 
                  required
                  type="text" 
                  value={formData.patient_id}
                  onChange={e => setFormData({...formData, patient_id: e.target.value})}
                  className="w-full border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Full Name *</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Date of Birth</label>
                  <input 
                    type="date" 
                    value={formData.date_of_birth}
                    onChange={e => setFormData({...formData, date_of_birth: e.target.value})}
                    className="w-full border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Phone</label>
                  <input 
                    type="text" 
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="w-full border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Sex</label>
                  <select 
                    value={formData.sex}
                    onChange={e => setFormData({...formData, sex: e.target.value})}
                    className="w-full border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="O">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Blood Type</label>
                  <select 
                    value={formData.blood_type}
                    onChange={e => setFormData({...formData, blood_type: e.target.value})}
                    className="w-full border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="O">O</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="AB">AB</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Address</label>
                <textarea 
                  value={formData.address}
                  onChange={e => setFormData({...formData, address: e.target.value})}
                  className="w-full border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  rows={2}
                />
              </div>
              <div className="pt-4 flex justify-end space-x-2">
                <button 
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 rounded"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded"
                >
                  Save Patient
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patient History Card Modal */}
      {isHistoryOpen && selectedPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* History Header */}
            <div className="bg-indigo-900 text-white p-6 flex justify-between items-start flex-shrink-0">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold">
                  {selectedPatient.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{selectedPatient.name}</h2>
                  <div className="flex items-center space-x-4 mt-2 text-indigo-200 text-sm">
                    <span>ID: {selectedPatient.patient_id}</span>
                    <span>•</span>
                    <span>{selectedPatient.sex}</span>
                    <span>•</span>
                    <span>Blood: {selectedPatient.blood_type}</span>
                    <span>•</span>
                    <span>DOB: {selectedPatient.date_of_birth ? format(new Date(
                        selectedPatient.date_of_birth.length === 14 
                          ? `${selectedPatient.date_of_birth.substring(0,4)}-${selectedPatient.date_of_birth.substring(4,6)}-${selectedPatient.date_of_birth.substring(6,8)}`
                          : selectedPatient.date_of_birth
                      ), 'MMM d, yyyy') : '-'}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setIsHistoryOpen(false)} className="text-indigo-200 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* History Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-zinc-50">
              {historyLoading ? (
                <div className="flex justify-center items-center h-64 text-zinc-500">
                  Loading history...
                </div>
              ) : patientHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-4">
                  <FileText className="w-12 h-12 text-zinc-300" />
                  <p>No test history found for this patient.</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Test Trends */}
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center">
                      <Activity className="w-5 h-5 mr-2 text-indigo-600" />
                      Test Trends
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(historyByTest).map(([testName, data]) => {
                        if (!Array.isArray(data) || data.length < 2) return null; // Only show charts for tests with multiple results
                        return (
                          <div key={testName} className="bg-white p-4 rounded-lg border border-zinc-200 shadow-sm">
                            <h4 className="text-sm font-medium text-zinc-700 mb-4">{testName} History</h4>
                            <div className="h-48">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={[...data].reverse()}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                                  <XAxis dataKey="date" fontSize={10} tickMargin={8} stroke="#a1a1aa" />
                                  <YAxis fontSize={10} stroke="#a1a1aa" />
                                  <Tooltip 
                                    contentStyle={{ fontSize: '12px', borderRadius: '6px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                  />
                                  <Line 
                                    type="monotone" 
                                    dataKey="numericValue" 
                                    stroke="#4f46e5" 
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: '#4f46e5' }}
                                    activeDot={{ r: 5 }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Detailed Results Table */}
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center">
                      <FileText className="w-5 h-5 mr-2 text-indigo-600" />
                      All Results
                    </h3>
                    <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden shadow-sm">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 border-b border-zinc-200">
                          <tr>
                            <th className="px-4 py-3 font-medium">Date / Time</th>
                            <th className="px-4 py-3 font-medium">Test</th>
                            <th className="px-4 py-3 font-medium">Result</th>
                            <th className="px-4 py-3 font-medium">Unit</th>
                            <th className="px-4 py-3 font-medium">Sample Barcode</th>
                            <th className="px-4 py-3 font-medium">Analyzer</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                          {patientHistory.map((result) => (
                            <tr key={result.id} className="hover:bg-zinc-50">
                              <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">
                                {format(new Date(result.result_time), 'MMM d, yyyy HH:mm')}
                              </td>
                              <td className="px-4 py-3 font-medium text-zinc-900">{result.test_name || result.test_no}</td>
                              <td className="px-4 py-3 font-bold text-indigo-600">{result.result_value}</td>
                              <td className="px-4 py-3 text-zinc-500">{result.result_unit || '-'}</td>
                              <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{result.sample_barcode}</td>
                              <td className="px-4 py-3 text-zinc-500">{result.equipment_name || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
