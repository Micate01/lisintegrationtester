import { Outlet, NavLink } from 'react-router-dom';
import { Activity, Server, FileText, List, Stethoscope } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Layout() {
  const navigation = [
    { name: 'Dashboard', href: '/', icon: Activity },
    { name: 'Equipments', href: '/equipments', icon: Server },
    { name: 'Results', href: '/results', icon: FileText },
    { name: 'Logs', href: '/logs', icon: List },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-zinc-900 text-zinc-300 flex-shrink-0 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-zinc-800 bg-zinc-950">
          <Stethoscope className="w-6 h-6 text-emerald-500 mr-3" />
          <span className="text-lg font-semibold text-white tracking-tight">MedHub</span>
        </div>
        <nav className="flex-1 py-6 px-3 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  'flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors',
                  isActive
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
                )
              }
            >
              <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center px-8 flex-shrink-0">
          <h1 className="text-xl font-semibold text-zinc-900">Medical Equipment Integration Hub</h1>
        </header>
        <main className="flex-1 overflow-auto p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
