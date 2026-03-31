import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Producers from "@/pages/Producers";
import DryKg from "@/pages/DryKg";
import Advances from "@/pages/Advances";
import DryingInvoices from "@/pages/DryingInvoices";
import ProducerInvoices from "@/pages/ProducerInvoices";
import PaymentFlows from "@/pages/PaymentFlows";
import InstallmentPayments from "@/pages/InstallmentPayments";
import IvaTracking from "@/pages/IvaTracking";
import ExchangeRate from "@/pages/ExchangeRate";
import ProducerAccount from "@/pages/ProducerAccount";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return <Auth />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/productores" element={<Producers />} />
        <Route path="/kilos-secos" element={<DryKg />} />
        <Route path="/anticipos" element={<Advances />} />
        <Route path="/facturas-secado" element={<DryingInvoices />} />
        <Route path="/facturas-productores" element={<ProducerInvoices />} />
        <Route path="/flujos-pago" element={<PaymentFlows />} />
        <Route path="/control-iva" element={<IvaTracking />} />
        <Route path="/cuenta-corriente" element={<ProducerAccount />} />
        <Route path="/tipo-cambio" element={<ExchangeRate />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
