import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Users, BarChart3, FileText, DollarSign, Settings, LogOut, Menu, X,
  TrendingUp, Receipt, ArrowLeftRight, Percent, BookOpen, CreditCard, Download, Wallet
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Resumen', icon: BarChart3 },
  { path: '/productores', label: 'Productores', icon: Users },
  { path: '/kilos-secos', label: 'Kilos Secos', icon: TrendingUp },
  { path: '/anticipos', label: 'Anticipos', icon: DollarSign },
  { path: '/facturas-secado', label: 'Facturas Secado', icon: Receipt },
  { path: '/facturas-productores', label: 'Facturas Productores', icon: FileText },
  { path: '/flujos-pago', label: 'Flujos de Pago', icon: ArrowLeftRight },
  { path: '/cuotas-secado', label: 'Cuotas Secado', icon: CreditCard },
  { path: '/control-iva', label: 'Control IVA', icon: Percent },
  { path: '/pagos-iva', label: 'Pagos IVA', icon: Wallet },
  { path: '/cuenta-corriente', label: 'Cuenta Corriente', icon: BookOpen },
  { path: '/tipo-cambio', label: 'Tipo de Cambio', icon: Settings },
  { path: '/respaldo', label: 'Respaldo', icon: Download },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform lg:translate-x-0 lg:static lg:z-auto",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
          <h1 className="text-lg font-bold text-sidebar-primary-foreground">
            Anticipos
          </h1>
          <button className="lg:hidden text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                location.pathname === path
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <p className="text-xs text-sidebar-foreground/60 truncate mb-2">{user?.email}</p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b flex items-center px-4 lg:px-6 bg-card">
          <button className="lg:hidden mr-3" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold truncate">
            {navItems.find(n => n.path === location.pathname)?.label ?? 'Anticipos Productores'}
          </h2>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
