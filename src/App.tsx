import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Equipments from './pages/Equipments';
import Results from './pages/Results';
import Worklist from './pages/Worklist';
import Logs from './pages/Logs';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="equipments" element={<Equipments />} />
          <Route path="results" element={<Results />} />
          <Route path="worklist" element={<Worklist />} />
          <Route path="logs" element={<Logs />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
