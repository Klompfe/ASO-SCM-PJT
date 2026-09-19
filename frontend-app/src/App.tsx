import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { ItemsManager } from './components/ItemsManager';
import { WorkOrdersManager } from './components/WorkOrdersManager';
import { StylesManager } from './components/StylesManager';
import { OrderProgressSummary } from './components/OrderProgressSummary';
import { ProcurementStatusReport } from './components/ProcurementStatusReport';
import { SuppliersManager } from './components/SuppliersManager';
import { BuyersManager } from './components/BuyersManager';
import { UsersManager } from './components/UsersManager';
import { PurchaseOrdersManager } from './components/PurchaseOrdersManager';
import { ProductionContractsManager } from './components/ProductionContractsManager';
import { PurchaseOrderLedgerReport } from './components/PurchaseOrderLedgerReport';
import { PackingReceiptSummaryReport } from './components/PackingReceiptSummaryReport';
import { CashVouchersManager } from './components/CashVouchersManager';
import { ExportShipmentManager } from './components/ExportShipmentManager';
import { ExportPerformanceReport } from './components/ExportPerformanceReport';
import { ExportShipmentDefaultsManager } from './components/ExportShipmentDefaultsManager';
import { HsCodeManager } from './components/HsCodeManager';
import { ImportShipmentManager } from './components/ImportShipmentManager';
import { InventoryReport } from './components/InventoryReport';
import { BrandManager } from './components/BrandManager';
import { Sidebar, TAB_LABELS, type TabId } from './components/Sidebar';
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
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

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
  const [orderManagementSubTab, setOrderManagementSubTab] = useState<'list' | 'summary' | 'procurement'>('list');
  const [styleNoToOpen, setStyleNoToOpen] = useState<string | null>(null);

  const handleSelectStyleFromSummary = (styleNo: string) => {
    setStyleNoToOpen(styleNo);
    setOrderManagementSubTab('list');
  };

  // PR-076: 상단 "Shipments" 탭을 "선적관리"로 개명하고 하위에 "수출"/"수입" 두 서브탭을
  // 둔다. "수출"은 PR-073~075에서 구축한 수출 선적서류(Invoice/Packing List) 자동생성
  // 기능(ExportShipmentManager, 옛 최상단 "수출선적서류" 탭)이고, "수입"은 완제품
  // 수입통관 추적 화면(ImportShipmentManager, PR-082)이다 — 원자재 입고(옛
  // ShipmentsManager, PurchaseOrder와 연결된 별개 개념)는 PR-082에서 "Purchase
  // Orders > 입고관리" 서브탭으로 옮겼다. 기본값은 현재 개발 중인 "수출".
  const [shipmentsSubTab, setShipmentsSubTab] = useState<'export' | 'import' | 'exportPerformance'>('export');
  const [purchaseOrdersSubTab, setPurchaseOrdersSubTab] = useState<'list' | 'productionContracts' | 'ledger' | 'packing'>('list');

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
              <button
                className={`px-3 py-2 text-sm font-medium ${orderManagementSubTab === 'procurement' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setOrderManagementSubTab('procurement')}
              >발주·입고·출고 현황</button>
            </div>
            {orderManagementSubTab === 'list' ? (
              <StylesManager initialStyleNo={styleNoToOpen} onInitialStyleNoConsumed={() => setStyleNoToOpen(null)} />
            ) : orderManagementSubTab === 'summary' ? (
              <OrderProgressSummary onSelectStyle={handleSelectStyleFromSummary} />
            ) : (
              <ProcurementStatusReport />
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
              <button
                className={`px-3 py-2 text-sm font-medium ${shipmentsSubTab === 'exportPerformance' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setShipmentsSubTab('exportPerformance')}
              >수출 실적표</button>
            </div>
            {shipmentsSubTab === 'export' ? <ExportShipmentManager /> : shipmentsSubTab === 'exportPerformance' ? <ExportPerformanceReport /> : <ImportShipmentManager />}
          </div>
        );
        case 'suppliers': return <SuppliersManager />;
        case 'buyers': return <BuyersManager />;
        case 'users': return <UsersManager />;
        case 'purchaseOrders': return (
          <div>
            <div className="flex space-x-2 mb-4 border-b border-gray-200">
              <button
                className={`px-3 py-2 text-sm font-medium ${purchaseOrdersSubTab === 'list' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setPurchaseOrdersSubTab('list')}
              >발주 목록</button>
              <button
                className={`px-3 py-2 text-sm font-medium ${purchaseOrdersSubTab === 'productionContracts' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setPurchaseOrdersSubTab('productionContracts')}
              >생산계약(Sales Contract)</button>
              <button
                className={`px-3 py-2 text-sm font-medium ${purchaseOrdersSubTab === 'ledger' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setPurchaseOrdersSubTab('ledger')}
              >발주 현황표(원장)</button>
              <button
                className={`px-3 py-2 text-sm font-medium ${purchaseOrdersSubTab === 'packing' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setPurchaseOrdersSubTab('packing')}
              >포장내역 집계</button>
            </div>
            {purchaseOrdersSubTab === 'list' ? (
              <PurchaseOrdersManager prefillItemId={poPrefillItemId} onPrefillConsumed={() => setPoPrefillItemId(null)} />
            ) : purchaseOrdersSubTab === 'ledger' ? (
              <PurchaseOrderLedgerReport />
            ) : purchaseOrdersSubTab === 'packing' ? (
              <PackingReceiptSummaryReport />
            ) : (
              <ProductionContractsManager />
            )}
          </div>
        );
        case 'exportShipmentDefaults': return <ExportShipmentDefaultsManager />;
        case 'hsCodeClassifications': return <HsCodeManager />;
        case 'cashVouchers': return <CashVouchersManager />;
        case 'inventories': return <InventoryReport />;
        case 'brands': return <BrandManager />;
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

  // PR-109: B안(라이트 탑네비)에서 A안(다크 사이드바)으로 교체 — 화면 전체를 좌측
  // 고정폭 사이드바 + 우측 메인 콘텐츠로 나눈다. 로그인 화면(PR-097, 남색 사이드
  // 패널)과 톤을 맞췄다.
  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        canManageUsers={canManageUsers}
        isManagerOrAdmin={isManagerOrAdmin}
        userName={currentUser?.username ?? currentUser?.email ?? ''}
        userRole={currentUser?.role ?? ''}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-[#e2e8f0] px-8 py-[18px] flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">{TAB_LABELS[activeTab] ?? 'SCM Dashboard'}</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="알림"
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg font-medium text-sm transition-colors"
              style={{ background: '#eef2ff', color: '#4338ca' }}
            >
              로그아웃
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 min-w-0">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 min-h-[400px]">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;