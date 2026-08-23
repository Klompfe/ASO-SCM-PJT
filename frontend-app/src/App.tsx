import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { ItemsManager } from './components/ItemsManager';
import { WorkOrdersManager } from './components/WorkOrdersManager';
import { ShipmentsManager } from './components/ShipmentsManager';
import { LoginPage } from './components/LoginPage';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!localStorage.getItem('access_token'));
  const [activeTab, setActiveTab] = useState<'dashboard' | 'items' | 'workOrders' | 'shipments'>('dashboard');

  useEffect(() => {
    setIsAuthenticated(!!localStorage.getItem('access_token'));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  const tabButtonStyle = "px-4 py-2 rounded-lg font-medium transition-colors";
  const activeTabStyle = "bg-blue-600 text-white";
  const inactiveTabStyle = "bg-gray-200 text-gray-700 hover:bg-gray-300";

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">SCM Dashboard</h1>
        <button onClick={handleLogout} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300">Logout</button>
      </header>
      
      <nav className="flex space-x-4 mb-6">
        <button className={`${tabButtonStyle} ${activeTab === 'dashboard' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
        <button className={`${tabButtonStyle} ${activeTab === 'items' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('items')}>Items</button>
        <button className={`${tabButtonStyle} ${activeTab === 'workOrders' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('workOrders')}>Work Orders</button>
        <button className={`${tabButtonStyle} ${activeTab === 'shipments' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('shipments')}>Shipments</button>
      </nav>

      <main className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'items' && <ItemsManager />}
        {activeTab === 'workOrders' && <WorkOrdersManager />}
        {activeTab === 'shipments' && <ShipmentsManager />}
      </main>
    </div>
  );
}

export default App;
