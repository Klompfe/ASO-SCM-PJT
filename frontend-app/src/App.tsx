import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { buildSingleOrderUrl, buildBulkOrderUrl, parseOrderPrefillFromSearch } from './utils/bomBulkOrderNav';
import { clearUploadReview, hasPendingUploadReviewWork } from './utils/uploadReviewStorage';
import { Dashboard } from './components/Dashboard';
import { ItemsManager } from './components/ItemsManager';
import { WorkOrdersManager } from './components/WorkOrdersManager';
import { StylesManager } from './components/StylesManager';
import { OrderProgressSummary } from './components/OrderProgressSummary';
import { ProcurementStatusReport } from './components/ProcurementStatusReport';
import { UnlinkedPurchaseOrders } from './components/UnlinkedPurchaseOrders';
import { SuppliersManager } from './components/SuppliersManager';
import { BuyersManager } from './components/BuyersManager';
import { UsersManager } from './components/UsersManager';
import { PurchaseOrdersManager } from './components/PurchaseOrdersManager';
import { BomBulkOrderPanel } from './components/BomBulkOrderPanel';
import { MultiStyleBulkOrder } from './components/MultiStyleBulkOrder';
import { ProductionContractsManager } from './components/ProductionContractsManager';
import { PurchaseOrderLedgerReport } from './components/PurchaseOrderLedgerReport';
import { PackingReceiptSummaryReport } from './components/PackingReceiptSummaryReport';
import { CashVouchersManager } from './components/CashVouchersManager';
import { ExportShipmentManager } from './components/ExportShipmentManager';
import { ExportPerformanceReport } from './components/ExportPerformanceReport';
import { BomRequirementReport } from './components/BomRequirementReport';
import { BomDuplicateReview } from './components/BomDuplicateReview';
import { ExportShipmentDefaultsManager } from './components/ExportShipmentDefaultsManager';
import { HsCodeManager } from './components/HsCodeManager';
import { ImportShipmentManager } from './components/ImportShipmentManager';
import { InventoryReport } from './components/InventoryReport';
import { BrandManager } from './components/BrandManager';
import { MaterialPackagingUnitRulesManager } from './components/MaterialPackagingUnitRulesManager';
import { ThreadTapeClassificationManager } from './components/ThreadTapeClassificationManager';
import { CustomsExchangeRatesManager } from './components/CustomsExchangeRatesManager';
import { WeeklyExchangeRatePopup, WeeklyExchangeRateBanner } from './components/WeeklyExchangeRatePopup';
import { MaterialCategoriesManager } from './components/MaterialCategoriesManager';
import { BrandPriceRulesManager } from './components/BrandPriceRulesManager';
import { StatusCodesManager } from './components/StatusCodesManager';
import { Sidebar, TAB_LABELS, type TabId } from './components/Sidebar';
import { LoginPage } from './components/LoginPage';
import { getCurrentUser, type CurrentUser } from './api/auth.service';
import { getCustomsExchangeRateStatus, type ExchangeRateStatus } from './api/customsExchangeRates.service';
import { shouldShowWeeklyRatePopup, wasPopupDismissedThisSession, canEnterWeeklyRate } from './utils/customsExchangeRates';
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
  
  // PR-238: 자재명세(자재·BOM 조회)의 "발주하기"/"선택 자재 일괄 발주"는 새 브라우저
  // 탭으로 연다 — 그 새 탭이 바로 이 App이 다시 처음부터 마운트되는 것이므로, 쿼리를
  // 여기서 한 번만 읽어 초기 탭/프리필 상태를 정한다(쿼리가 없으면 기존 흐름 그대로).
  const initialOrderPrefill = parseOrderPrefillFromSearch(window.location.search);

  // Explicit tab type handling with fallback
  const [activeTab, setActiveTab] = useState<TabId>(() => (initialOrderPrefill ? 'purchaseOrders' : 'dashboard'));

  // PR-070: "사용자 관리" 탭은 MANAGER/ADMIN에게만 보여야 한다 — GET /auth/me(PR-066)로
  // 현재 사용자의 role을 조회해 탭 자체를 목록에서 숨긴다(USER는 존재를 알 필요도 없음).
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  useEffect(() => {
    if (!isAuthenticated) return;
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, [isAuthenticated]);
  const canManageUsers = currentUser?.role === 'MANAGER' || currentUser?.role === 'ADMIN';

  // PR-184: 로그인 직후(그리고 저장된 토큰으로 인증이 복원되는 경우 둘 다) 이번 주
  // 관세청 환율이 비어 있으면 알려준다. 조회 실패는 로그인/업무를 막지 않고 콘솔에만 남긴다.
  const [weeklyRateStatus, setWeeklyRateStatus] = useState<ExchangeRateStatus | null>(null);
  const [showWeeklyRatePopup, setShowWeeklyRatePopup] = useState(false);
  const [showWeeklyRateBanner, setShowWeeklyRateBanner] = useState(false);
  const weeklyRateCheckedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !currentUser || weeklyRateCheckedRef.current) return;
    weeklyRateCheckedRef.current = true;
    getCustomsExchangeRateStatus()
      .then((status) => {
        setWeeklyRateStatus(status);
        if (!shouldShowWeeklyRatePopup(status)) return;
        if (canEnterWeeklyRate(currentUser.role)) {
          if (!wasPopupDismissedThisSession()) setShowWeeklyRatePopup(true);
        } else {
          setShowWeeklyRateBanner(true);
        }
      })
      .catch((err) => {
        console.error('이번 주 관세청 환율 상태를 확인하지 못했습니다', err);
      });
  }, [isAuthenticated, currentUser]);

  const handleWeeklyRateSaved = () => {
    getCustomsExchangeRateStatus()
      .then((status) => {
        setWeeklyRateStatus(status);
        if (!shouldShowWeeklyRatePopup(status)) setShowWeeklyRatePopup(false);
      })
      .catch(() => {
        // 재조회 실패는 조용히 넘어간다 — 이미 저장은 성공했다.
      });
  };
  // PR-079: "선적서류 기본정보" 탭도 동일하게 MANAGER/ADMIN 전용이다 — canManageUsers와
  // 조건은 같지만 별도 탭을 가리키는 이름이라 헷갈리지 않게 따로 둔다.
  const isManagerOrAdmin = canManageUsers;
  // Items(자재명세) 화면에서 "발주하기"를 누르면 이 값을 채우고 Purchase Orders 탭으로 이동한다.
  // PR-238: 이제 그 이동이 새 탭 열기라, 초기값도 (같은 탭이 새로 마운트될 때) URL
  // 쿼리에서 바로 채워진다.
  const [poPrefillItemId, setPoPrefillItemId] = useState<number | null>(() =>
    initialOrderPrefill?.kind === 'single' ? initialOrderPrefill.itemId : null,
  );
  // PR-230: 자재·BOM 조회는 항상 특정 스타일을 보는 중이라, 품목과 함께 그 스타일도
  // 넘겨 [B] 발주 입력 칸에 스타일이 기본으로 연결되게 한다(poPrefillItemId와 같은
  // consume-once 패턴, onPrefillConsumed에서 같이 지운다).
  const [poPrefillItemStyleNo, setPoPrefillItemStyleNo] = useState<string | null>(() =>
    initialOrderPrefill?.kind === 'single' ? initialOrderPrefill.styleNo : null,
  );
  // PR-238: 자재명세에서 "선택 자재 일괄 발주"로 넘어온 경우 — 스타일 + 고른 BOM 행
  // id만 들고 온다(업무 데이터는 URL에 없음, 새 탭이 서버에서 다시 조회).
  const [bomBulkOrderPrefill, setBomBulkOrderPrefill] = useState<{ styleNo: string; bomItemIds: number[] } | null>(() =>
    initialOrderPrefill?.kind === 'bulk' ? { styleNo: initialOrderPrefill.styleNo, bomItemIds: initialOrderPrefill.bomItemIds } : null,
  );

  // PR-238: 프리필을 한 번 반영했으면 주소창 쿼리를 지운다(새로고침해도 같은 값을
  // 다시 쓰지 않도록) — 값 자체는 이미 위 useState 초기값으로 복사해 뒀다.
  useEffect(() => {
    if (initialOrderPrefill) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PR-238: 자재명세의 "발주하기"(단일)/"선택 자재 일괄 발주"는 같은 탭을 바꾸지 않고
  // 새 탭을 연다(자재명세 탭의 필터·선택 상태가 그대로 유지됨) — 로그인 세션은
  // localStorage 기반이라 같은 출처의 새 탭에서도 그대로 쓰인다. 팝업이 차단되면
  // window.open이 null을 돌려준다(사용자 클릭에서 바로 호출하면 보통 차단되지 않음).
  const openOrderTab = (url: string) => {
    const win = window.open(url, '_blank', 'noopener');
    if (!win) {
      toast.error('팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 눌러 주세요.');
    }
  };
  // PR-196: 발주·입고·출고 현황에서 "발주하기"/"발주 보기"를 누르면 그 스타일번호를
  // 채우고 발주관리 탭으로 이동한다(poPrefillItemId와 동일한 패턴).
  const [poPrefillStyleNo, setPoPrefillStyleNo] = useState<string | null>(null);
  const handleGoToPurchaseOrdersForStyle = (styleNo: string) => {
    setPoPrefillStyleNo(styleNo);
    setPurchaseOrdersSubTab('list');
    setActiveTab('purchaseOrders');
  };
  const handleGoToUnlinkedPurchaseOrders = () => {
    setPurchaseOrdersSubTab('unlinked');
    setActiveTab('purchaseOrders');
  };
  // PR-194 보완: 발주·입고·출고 현황에서 체크한 스타일들을 다품번 일괄발주 화면에
  // 미리 채워 넘긴다 — poPrefillStyleNo와 동일한 consume-once 패턴.
  const [multiStylePrefillStyleNos, setMultiStylePrefillStyleNos] = useState<string[] | null>(null);
  const handleGoToMultiStyleBulkOrder = (styleNos: string[]) => {
    setMultiStylePrefillStyleNos(styleNos);
    setPurchaseOrdersSubTab('multiStyleBulkOrder');
    setActiveTab('purchaseOrders');
  };

  // PR-067: 오더관리 탭 하위에 "오더 목록"/"진행현황 요약" 두 서브탭을 둔다.
  // 진행현황 요약에서 행을 클릭하면 오더 목록 서브탭으로 전환하며 해당 styleNo의
  // 상세 모달을 자동으로 연다 — poPrefillItemId와 동일한 패턴.
  const [orderManagementSubTab, setOrderManagementSubTab] = useState<'list' | 'summary' | 'procurement'>('list');
  const [styleNoToOpen, setStyleNoToOpen] = useState<string | null>(null);

  const handleSelectStyleFromSummary = (styleNo: string) => {
    setStyleNoToOpen(styleNo);
    setOrderManagementSubTab('list');
  };

  // 오더관리(수주 등록/오더 목록)에서 "자재명세 보기"를 누르면 Items(자재·BOM) 탭으로
  // 전환하고 그 styleNo의 BOM을 바로 연다 — poPrefillItemId(Items→PurchaseOrders)와
  // 동일한 cross-tab 패턴.
  const [bomStyleNoToOpen, setBomStyleNoToOpen] = useState<string | null>(null);
  const handleViewBom = (styleNo: string) => {
    setBomStyleNoToOpen(styleNo);
    setItemsSubTab('items');
    setActiveTab('items');
  };

  // PR-076: 상단 "Shipments" 탭을 "선적관리"로 개명하고 하위에 "수출"/"수입" 두 서브탭을
  // 둔다. "수출"은 PR-073~075에서 구축한 수출 선적서류(Invoice/Packing List) 자동생성
  // 기능(ExportShipmentManager, 옛 최상단 "수출선적서류" 탭)이고, "수입"은 완제품
  // 수입통관 추적 화면(ImportShipmentManager, PR-082)이다 — 원자재 입고(옛
  // ShipmentsManager, PurchaseOrder와 연결된 별개 개념)는 PR-082에서 "Purchase
  // Orders > 입고관리" 서브탭으로 옮겼다. 기본값은 현재 개발 중인 "수출".
  const [itemsSubTab, setItemsSubTab] = useState<'items' | 'bomDuplicates'>('items');
  const [workOrdersSubTab, setWorkOrdersSubTab] = useState<'list' | 'requirements'>('list');
  const [shipmentsSubTab, setShipmentsSubTab] = useState<'export' | 'import' | 'exportPerformance'>('export');
  const [purchaseOrdersSubTab, setPurchaseOrdersSubTab] = useState<'list' | 'productionContracts' | 'ledger' | 'packing' | 'multiStyleBulkOrder' | 'unlinked'>('list');

  // PR-238: 같은 탭에서 바꾸던 것을 새 탭 열기로 바꿨다 — 자재명세 탭은 그대로 남는다.
  const handleOrderItem = (itemId: number, styleNo?: string) => {
    openOrderTab(buildSingleOrderUrl(window.location.pathname, itemId, styleNo));
  };

  // PR-238: 자재명세에서 "선택 자재 일괄 발주"를 누르면 새 탭에서 공급사별 일괄 발주
  // 화면이 뜬다(스타일 + 고른 BOM 행 id만 전달).
  const handleBulkOrderBomItems = (styleNo: string, bomItemIds: number[]) => {
    openOrderTab(buildBulkOrderUrl(window.location.pathname, styleNo, bomItemIds));
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
    // PR-237: 업로드 승인 대기/실패 목록에는 파싱된 시트 내용이 들어 있어 로그아웃 시
    // 지운다(다음 로그인 사용자가 이전 사용자의 업로드를 보지 않게).
    clearUploadReview();
    setIsAuthenticated(false);
  };

  // PR-237: 자재명세 업로드 승인 대기/실패 스타일이 남아 있는 상태에서 탭을 닫거나
  // 새로고침할 때만 브라우저 기본 확인창을 띄운다(남은 게 없으면 띄우지 않음). 이
  // 컴포넌트는 앱이 켜져 있는 동안 항상 마운트돼 있어, ItemsManager가 다른 탭으로
  // 바뀌어 unmount돼 있어도(sessionStorage에는 남아 있으므로) 여전히 경고할 수 있다 —
  // 메뉴 내부 이동(이 핸들러와 무관)에는 뜨지 않는다(실제 브라우저 unload 이벤트만).
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasPendingUploadReviewWork()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

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
        case 'items': return (
          <div>
            <div className="flex space-x-2 mb-4 border-b border-gray-200">
              <button
                className={`px-3 py-2 text-sm font-medium ${itemsSubTab === 'items' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setItemsSubTab('items')}
              >자재 · BOM 조회</button>
              <button
                className={`px-3 py-2 text-sm font-medium ${itemsSubTab === 'bomDuplicates' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setItemsSubTab('bomDuplicates')}
              >BOM 중복 검토</button>
            </div>
            {itemsSubTab === 'items' ? (
              <ItemsManager
                onOrderItem={handleOrderItem}
                onBulkOrderItems={handleBulkOrderBomItems}
                initialStyleNo={bomStyleNoToOpen}
                onInitialStyleNoConsumed={() => setBomStyleNoToOpen(null)}
              />
            ) : <BomDuplicateReview />}
          </div>
        );
        case 'workOrders': return (
          <div>
            <div className="flex space-x-2 mb-4 border-b border-gray-200">
              <button
                className={`px-3 py-2 text-sm font-medium ${workOrdersSubTab === 'list' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setWorkOrdersSubTab('list')}
              >작업지시 목록</button>
              <button
                className={`px-3 py-2 text-sm font-medium ${workOrdersSubTab === 'requirements' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setWorkOrdersSubTab('requirements')}
              >BOM 소요명세서</button>
            </div>
            {workOrdersSubTab === 'list' ? <WorkOrdersManager /> : <BomRequirementReport />}
          </div>
        );
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
              <StylesManager
                initialStyleNo={styleNoToOpen}
                onInitialStyleNoConsumed={() => setStyleNoToOpen(null)}
                onViewBom={handleViewBom}
              />
            ) : orderManagementSubTab === 'summary' ? (
              <OrderProgressSummary onSelectStyle={handleSelectStyleFromSummary} />
            ) : (
              <ProcurementStatusReport
                onGoToPurchaseOrders={handleGoToPurchaseOrdersForStyle}
                onGoToUnlinkedPurchaseOrders={handleGoToUnlinkedPurchaseOrders}
                onGoToMultiStyleBulkOrder={handleGoToMultiStyleBulkOrder}
              />
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
              <button
                className={`px-3 py-2 text-sm font-medium ${purchaseOrdersSubTab === 'multiStyleBulkOrder' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setPurchaseOrdersSubTab('multiStyleBulkOrder')}
              >다품번 일괄발주</button>
              <button
                className={`px-3 py-2 text-sm font-medium ${purchaseOrdersSubTab === 'unlinked' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setPurchaseOrdersSubTab('unlinked')}
              >미연결 발주 정리</button>
            </div>
            {purchaseOrdersSubTab === 'list' && bomBulkOrderPrefill ? (
              <BomBulkOrderPanel
                styleNo={bomBulkOrderPrefill.styleNo}
                bomItemIds={bomBulkOrderPrefill.bomItemIds}
                onClose={() => setBomBulkOrderPrefill(null)}
              />
            ) : purchaseOrdersSubTab === 'list' ? (
              <PurchaseOrdersManager
                prefillItemId={poPrefillItemId}
                prefillItemStyleNo={poPrefillItemStyleNo}
                onPrefillConsumed={() => { setPoPrefillItemId(null); setPoPrefillItemStyleNo(null); }}
                prefillStyleNo={poPrefillStyleNo}
                onStylePrefillConsumed={() => setPoPrefillStyleNo(null)}
              />
            ) : purchaseOrdersSubTab === 'ledger' ? (
              <PurchaseOrderLedgerReport />
            ) : purchaseOrdersSubTab === 'packing' ? (
              <PackingReceiptSummaryReport />
            ) : purchaseOrdersSubTab === 'multiStyleBulkOrder' ? (
              <MultiStyleBulkOrder
                prefillStyleNos={multiStylePrefillStyleNos}
                onStyleNosPrefillConsumed={() => setMultiStylePrefillStyleNos(null)}
              />
            ) : purchaseOrdersSubTab === 'unlinked' ? (
              <UnlinkedPurchaseOrders />
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
        case 'materialPackagingUnitRules': return <MaterialPackagingUnitRulesManager />;
        case 'threadTapeClassification': return <ThreadTapeClassificationManager />;
        case 'customsExchangeRates': return <CustomsExchangeRatesManager />;
        case 'materialCategories': return <MaterialCategoriesManager />;
        case 'brandPriceRules': return <BrandPriceRulesManager />;
        case 'statusCodes': return <StatusCodesManager />;
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
        {showWeeklyRateBanner && <WeeklyExchangeRateBanner onClose={() => setShowWeeklyRateBanner(false)} />}
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

      {showWeeklyRatePopup && weeklyRateStatus && (
        <WeeklyExchangeRatePopup
          status={weeklyRateStatus}
          onClose={() => setShowWeeklyRatePopup(false)}
          onSaved={handleWeeklyRateSaved}
        />
      )}
    </div>
  );
}

export default App;