import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { ItemsManager } from './components/ItemsManager';
import { WorkOrdersManager } from './components/WorkOrdersManager';
import { ShipmentsManager } from './components/ShipmentsManager';
import { StylesManager } from './components/StylesManager';
import { OrderProgressSummary } from './components/OrderProgressSummary';
import { SuppliersManager } from './components/SuppliersManager';
import { BuyersManager } from './components/BuyersManager';
import { UsersManager } from './components/UsersManager';
import { PurchaseOrdersManager } from './components/PurchaseOrdersManager';
import { ExportShipmentManager } from './components/ExportShipmentManager';
import { ExportShipmentDefaultsManager } from './components/ExportShipmentDefaultsManager';
import { HsCodeManager } from './components/HsCodeManager';
import { LoginPage } from './components/LoginPage';
import { getCurrentUser, type CurrentUser } from './api/auth.service';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const storedToken = localStorage?.getItem?.('access_token') ?? localStorage?.getItem?.('token') ?? null;
      if (!storedToken) return false;
      
      let tokenValue = storedToken;
      if (storedToken.startsWith('{')) {
        const parsed = JSON.parse(storedToken);
        tokenValue = parsed?.token ?? parsed?.accessToken ?? null;
      }
      
      return !!tokenValue;
    } catch (e) {
      console.error('Failed to parse auth state, clearing localStorage', e);
      try {
        localStorage?.removeItem?.('access_token');
        localStorage?.removeItem?.('token');
      } catch (innerE) {
        // ignore
      }
      return false;
    }
  });
  
  // Explicit tab type handling with fallback
  const [activeTab, setActiveTab] = useState<'dashboard' | 'items' | 'workOrders' | 'shipments' | 'styles' | 'suppliers' | 'buyers' | 'users' | 'purchaseOrders' | 'exportShipmentDefaults' | 'hsCodeClassifications'>('dashboard');

  // PR-070: "사용자 관리" 탭은 MANAGER/ADMIN에게만 보여야 한다 — GET /auth/me(PR-066)로
  // 현재 사용자의 role을 조회해 탭 자체를 목록에서 숨긴다(USER는 존재를 알 필요도 없음).
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  useEffect(() => {
    if (!isAuthenticated) return;
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, [isAuthenticated]);
  const canManageUsers = currentUser?.role === 'MANAGER' || currentUser?.role === 'ADMIN';
  // PR-079: "선적서류 기본정보" 탭도 동일하게 MANAGER/ADMIN 전용이다 — canManageUsers와
  // 조건은 같지만 별도 탭을 가리키는 이름이라 헷갈리지 않게 따로 둔다.
  const isManagerOrAdmin = canManageUsers;
  // Items(자재명세) 화면에서 "발주하기"를 누르면 이 값을 채우고 Purchase Orders 탭으로 이동한다.
  const [poPrefillItemId, setPoPrefillItemId] = useState<number | null>(null);

  // PR-067: 오더관리 탭 하위에 "오더 목록"/"진행현황 요약" 두 서브탭을 둔다.
  // 진행현황 요약에서 행을 클릭하면 오더 목록 서브탭으로 전환하며 해당 styleNo의
  // 상세 모달을 자동으로 연다 — poPrefillItemId와 동일한 패턴.
  const [orderManagementSubTab, setOrderManagementSubTab] = useState<'list' | 'summary'>('list');
  const [styleNoToOpen, setStyleNoToOpen] = useState<string | null>(null);

  const handleSelectStyleFromSummary = (styleNo: string) => {
    setStyleNoToOpen(styleNo);
    setOrderManagementSubTab('list');
  };

  // PR-076: 상단 "Shipments" 탭을 "선적관리"로 개명하고 하위에 "수출"/"수입" 두 서브탭을
  // 둔다. "수출"은 PR-073~075에서 구축한 수출 선적서류(Invoice/Packing List) 자동생성
  // 기능(ExportShipmentManager, 옛 최상단 "수출선적서류" 탭)이고, "수입"은 기존
  // Shipments 기능(ShipmentsManager, 원자재 입고 물류)을 별도 설계 전까지 임시 배치한
  // 것이다(설계문서 6-1절 확정사항). 기본값은 현재 개발 중인 "수출".
  const [shipmentsSubTab, setShipmentsSubTab] = useState<'export' | 'import'>('export');

  const handleOrderItem = (itemId: number) => {
    setPoPrefillItemId(itemId);
    setActiveTab('purchaseOrders');
  };

  useEffect(() => {
    try {
      const storedToken = localStorage?.getItem?.('access_token') ?? localStorage?.getItem?.('token') ?? null;
      // Re-verify on mount
      if (storedToken) {
        setIsAuthenticated(true);
      }
    } catch (e) {
      console.error('Failed to access localStorage in useEffect', e);
      setIsAuthenticated(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage?.removeItem?.('access_token');
    localStorage?.removeItem?.('token');
    setIsAuthenticated(false);
  };

  // Fallback UI for catastrophic initialization failure
  const FallbackUI = ({ message }: { message: string }) => (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white p-8 rounded-xl shadow-lg border border-red-200 text-center">
        <h2 className="text-xl font-bold text-red-600 mb-4">서비스 이용 불가</h2>
        <p className="text-gray-700">{message}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          새로고침
        </button>
      </div>
    </div>
  );

  try {
    if (!isAuthenticated) {
      return <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />;
    }
  } catch (e) {
    console.error('Auth check error', e);
    return <FallbackUI message="인증 정보를 확인할 수 없습니다." />;
  }

  const tabButtonStyle = "px-4 py-2 rounded-lg font-medium transition-colors";
  const activeTabStyle = "bg-blue-600 text-white";
  const inactiveTabStyle = "bg-gray-200 text-gray-700 hover:bg-gray-300";

  const renderContent = () => {
    try {
      // Safe rendering switch
      switch (activeTab) {
        case 'dashboard': return <Dashboard />;
        case 'items': return <ItemsManager onOrderItem={handleOrderItem} />;
        case 'workOrders': return <WorkOrdersManager />;
        case 'styles': return (
          <div>
            <div className="flex space-x-2 mb-4 border-b border-gray-200">
              <button
                className={`px-3 py-2 text-sm font-medium ${orderManagementSubTab === 'list' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setOrderManagementSubTab('list')}
              >오더 목록</button>
              <button
                className={`px-3 py-2 text-sm font-medium ${orderManagementSubTab === 'summary' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setOrderManagementSubTab('summary')}
              >진행현황 요약</button>
            </div>
            {orderManagementSubTab === 'list' ? (
              <StylesManager initialStyleNo={styleNoToOpen} onInitialStyleNoConsumed={() => setStyleNoToOpen(null)} />
            ) : (
              <OrderProgressSummary onSelectStyle={handleSelectStyleFromSummary} />
            )}
          </div>
        );
        case 'shipments': return (
          <div>
            <div className="flex space-x-2 mb-4 border-b border-gray-200">
              <button
                className={`px-3 py-2 text-sm font-medium ${shipmentsSubTab === 'export' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setShipmentsSubTab('export')}
              >수출</button>
              <button
                className={`px-3 py-2 text-sm font-medium ${shipmentsSubTab === 'import' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setShipmentsSubTab('import')}
              >수입</button>
            </div>
            {shipmentsSubTab === 'export' ? <ExportShipmentManager /> : <ShipmentsManager />}
          </div>
        );
        case 'suppliers': return <SuppliersManager />;
        case 'buyers': return <BuyersManager />;
        case 'users': return <UsersManager />;
        case 'purchaseOrders': return <PurchaseOrdersManager prefillItemId={poPrefillItemId} onPrefillConsumed={() => setPoPrefillItemId(null)} />;
        case 'exportShipmentDefaults': return <ExportShipmentDefaultsManager />;
        case 'hsCodeClassifications': return <HsCodeManager />;
        default:
          // Routing Fallback: If unknown, default to Dashboard
          return <Dashboard />;
      }
    } catch (error) {
      console.error('Failed to render tab content:', error);
      return (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          <p>화면을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.</p>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">SCM Dashboard</h1>
        <button 
          onClick={handleLogout} 
          className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Logout
        </button>
      </header>
      
      <nav className="flex space-x-4 mb-6">
        <button className={`${tabButtonStyle} ${activeTab === 'dashboard' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
        <button className={`${tabButtonStyle} ${activeTab === 'items' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('items')}>Items</button>
        <button className={`${tabButtonStyle} ${activeTab === 'workOrders' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('workOrders')}>Work Orders</button>
        <button className={`${tabButtonStyle} ${activeTab === 'styles' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('styles')}>오더관리</button>
        <button className={`${tabButtonStyle} ${activeTab === 'shipments' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('shipments')}>선적관리</button>
        <button className={`${tabButtonStyle} ${activeTab === 'suppliers' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('suppliers')}>Suppliers</button>
        <button className={`${tabButtonStyle} ${activeTab === 'buyers' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('buyers')}>고객사</button>
        {canManageUsers && (
          <button className={`${tabButtonStyle} ${activeTab === 'users' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('users')}>사용자 관리</button>
        )}
        <button className={`${tabButtonStyle} ${activeTab === 'purchaseOrders' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('purchaseOrders')}>Purchase Orders</button>
        {isManagerOrAdmin && (
          <button className={`${tabButtonStyle} ${activeTab === 'exportShipmentDefaults' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('exportShipmentDefaults')}>선적서류 기본정보</button>
        )}
        <button className={`${tabButtonStyle} ${activeTab === 'hsCodeClassifications' ? activeTabStyle : inactiveTabStyle}`} onClick={() => setActiveTab('hsCodeClassifications')}>HS코드 관리</button>
      </nav>

      <main className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 min-h-[400px]">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;