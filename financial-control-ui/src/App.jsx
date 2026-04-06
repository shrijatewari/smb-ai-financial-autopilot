import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedLayout from './layout/ProtectedLayout'
import Dashboard from './components/Dashboard'
import Today from './pages/Today'
import People from './pages/People'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Onboarding from './pages/Onboarding'
import Assistant from './pages/Assistant'
import Documents from './pages/Documents'
import Transactions from './pages/Transactions'
import CashFlow from './pages/CashFlow'
import Inventory from './pages/Inventory'
import Predictions from './pages/Predictions'
import Risk from './pages/Risk'
import Gst from './pages/Gst'
import ActionCenter from './pages/ActionCenter'
import Profile from './pages/Profile'
import PlatformCapabilities from './pages/PlatformCapabilities'
import Growth from './pages/Growth'
import DataExport from './pages/DataExport'
import Bills from './pages/Bills'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Today />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/people" element={<People />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/cash-flow" element={<CashFlow />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/predictions" element={<Predictions />} />
            <Route path="/risk" element={<Risk />} />
            <Route path="/gst" element={<Gst />} />
            <Route path="/actions" element={<ActionCenter />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/platform" element={<PlatformCapabilities />} />
            <Route path="/growth" element={<Growth />} />
            <Route path="/export" element={<DataExport />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/documents" element={<Documents />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
