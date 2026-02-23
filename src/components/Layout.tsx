import { Outlet, NavLink } from 'react-router-dom';
import { Activity, Server, FileText, List, Stethoscope, Settings, Users, LogOut, Search, ClipboardList, CheckSquare } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Layout() {
  const navigation = [
    { name: 'Dashboard', href: '/', icon: Activity },
    { name: 'Patients', href: '/patients', icon: Users },
    { name: 'Equipments', href: '/equipments', icon: Server },
    { name: 'Worklist', href: '/worklist', icon: ClipboardList },
    { name: 'Results', href: '/results', icon: FileText },
    { name: 'Validation', href: '/validation', icon: CheckSquare },
    { name: 'Logs', href: '/logs', icon: List },
  ];

  return (
    <div className="min-h-screen bg-[#f0f0f0] flex flex-col font-sans text-sm">
      {/* Toolbar */}
      <div className="bg-white border-b border-zinc-300 px-2 py-1 flex items-center space-x-1 shadow-sm">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center w-20 h-16 rounded border border-transparent transition-all',
                isActive
                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:border-zinc-200'
              )
            }
          >
            <item.icon className={cn("w-6 h-6 mb-1", item.name === 'Equipments' ? 'text-emerald-600' : item.name === 'Results' ? 'text-blue-600' : item.name === 'Validation' ? 'text-purple-600' : item.name === 'Patients' ? 'text-indigo-600' : 'text-zinc-500')} />
            <span className="text-[10px] font-medium text-center leading-tight">{item.name}</span>
          </NavLink>
        ))}
        
        <div className="h-10 w-px bg-zinc-300 mx-2" />
        
        <button className="flex flex-col items-center justify-center w-16 h-16 rounded border border-transparent text-zinc-600 hover:bg-zinc-100 hover:border-zinc-200 transition-all">
          <LogOut className="w-6 h-6 mb-1 text-red-500" />
          <span className="text-[10px] font-medium text-center leading-tight">Exit</span>
        </button>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-4 flex flex-col">
        <div className="bg-white border border-zinc-300 shadow-sm flex-1 rounded flex flex-col overflow-hidden">
          <Outlet />
        </div>
      </main>
      
      {/* Status Bar */}
      <footer className="bg-[#f0f0f0] border-t border-zinc-300 px-4 py-1 flex justify-between items-center text-[10px] text-zinc-500">
        <div className="flex space-x-6">
          <span>Computer: LOCALHOST (127.0.0.1)</span>
          <span>Connection: LINUX</span>
          <span>User: Administrator</span>
        </div>
        <div>
          <span>{new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</span>
        </div>
      </footer>
    </div>
  );
}
