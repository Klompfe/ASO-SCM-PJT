import React from 'react';

export type TabId =
  | 'dashboard'
  | 'items'
  | 'workOrders'
  | 'shipments'
  | 'styles'
  | 'suppliers'
  | 'buyers'
  | 'users'
  | 'purchaseOrders'
  | 'exportShipmentDefaults'
  | 'hsCodeClassifications'
  | 'cashVouchers'
  | 'inventories'
  | 'brands';

interface NavItem {
  id: TabId;
  label: string;
  // 관리자(MANAGER/ADMIN) 전용 항목 — 그렇지 않으면 목록에서 자체를 숨긴다.
  adminOnly?: boolean;
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

// PR-109: TopNav.tsx(B안, 라이트 탑네비+메가메뉴)를 다크 사이드바(A안)로 교체하면서
// 그룹/항목 데이터(NAV_GROUPS)와 activeTab 매핑/권한 로직은 그대로 옮겼다 — 바뀐 건
// 배치와 스타일뿐이다. 그룹 구성 이력: PR-087(카테고리 최초 도입) → PR-089(발주·입고·
// 출고 현황은 오더관리 탭 내부 서브탭으로 추가되어 여기엔 없음) → PR-093(생산계약관리는
// 발주관리 탭 내부 서브탭) → PR-094(회계관리 그룹 신설) → PR-095(마스터·설정에 공급업체/
// 품목 중복 노출).
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'production',
    label: '생산·오더',
    items: [
      { id: 'styles', label: '오더관리' },
      { id: 'workOrders', label: '작업지시' },
    ],
  },
  {
    key: 'materials',
    label: '자재·발주',
    items: [
      { id: 'items', label: '자재' },
      { id: 'purchaseOrders', label: '발주관리' },
      { id: 'suppliers', label: '공급업체' },
      // PR-110: 재고현황 보고서 — 기존 GET /inventories(백엔드만 있던 API)에
      // 화면을 처음 연결했다.
      { id: 'inventories', label: '재고현황' },
    ],
  },
  {
    key: 'shipping',
    label: '선적·통관',
    items: [
      { id: 'shipments', label: '선적관리' },
      { id: 'hsCodeClassifications', label: 'HS코드 관리' },
    ],
  },
  {
    key: 'master',
    label: '마스터·설정',
    // PR-095: 공급업체/품목은 "자재·발주" 그룹에도 그대로 남겨두고(제거하지 않음),
    // 같은 TabId(suppliers/items)를 이 그룹에도 추가로 노출한다.
    items: [
      { id: 'suppliers', label: '공급업체' },
      { id: 'items', label: '품목' },
      { id: 'buyers', label: '고객사' },
      // PR-111: 스타일번호 접두사 → 브랜드 매핑 마스터.
      { id: 'brands', label: '브랜드 관리' },
      { id: 'exportShipmentDefaults', label: '선적서류 기본정보', adminOnly: true },
      { id: 'users', label: '사용자 관리', adminOnly: true },
    ],
  },
  {
    key: 'accounting',
    label: '회계관리',
    items: [
      { id: 'cashVouchers', label: '입출금전표관리' },
    ],
  },
];

// 헤더 타이틀 등 다른 화면에서도 재사용할 수 있게 label 매핑을 함께 내보낸다.
export const TAB_LABELS: Record<TabId, string> = {
  dashboard: '대시보드',
  ...Object.fromEntries(NAV_GROUPS.flatMap((g) => g.items.map((item) => [item.id, item.label]))),
} as Record<TabId, string>;

const ICON_PROPS = {
  width: 17,
  height: 17,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const ICONS: Record<TabId, React.ReactNode> = {
  dashboard: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  ),
  styles: (
    <svg {...ICON_PROPS}>
      <path d="M7 3h8l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M9 9h6" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  ),
  workOrders: (
    <svg {...ICON_PROPS}>
      <rect x="5" y="4" width="14" height="17" rx="1.5" />
      <path d="M9 2.5h6v3H9z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  items: (
    <svg {...ICON_PROPS}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  ),
  purchaseOrders: (
    <svg {...ICON_PROPS}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h2l2.6 12.4a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L21 7H6" />
    </svg>
  ),
  suppliers: (
    <svg {...ICON_PROPS}>
      <path d="M4 21V7l8-4 8 4v14" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 11h.01M15 11h.01M12 11h.01" />
    </svg>
  ),
  shipments: (
    <svg {...ICON_PROPS}>
      <rect x="1" y="7" width="13" height="10" rx="1" />
      <path d="M14 10h4l3 3v4a1 1 0 0 1-1 1h-2" />
      <circle cx="6" cy="19" r="1.6" />
      <circle cx="17" cy="19" r="1.6" />
    </svg>
  ),
  hsCodeClassifications: (
    <svg {...ICON_PROPS}>
      <path d="M3 4h8l10 10-8 8L3 12V4z" />
      <circle cx="7.5" cy="8.5" r="1.4" />
    </svg>
  ),
  buyers: (
    <svg {...ICON_PROPS}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" />
      <circle cx="18" cy="8.5" r="2.4" />
      <path d="M16.5 14.2c2.6.5 4.5 2.7 4.5 5.8" />
    </svg>
  ),
  exportShipmentDefaults: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  users: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20.5c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5" />
    </svg>
  ),
  cashVouchers: (
    <svg {...ICON_PROPS}>
      <rect x="2.5" y="6" width="19" height="13" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6 15h4" />
    </svg>
  ),
  inventories: (
    <svg {...ICON_PROPS}>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </svg>
  ),
  brands: (
    <svg {...ICON_PROPS}>
      <path d="M20.6 11.1 12.9 3.4A2 2 0 0 0 11.5 3H4.5A1.5 1.5 0 0 0 3 4.5v7c0 .5.2 1 .6 1.4l7.7 7.7a2 2 0 0 0 2.8 0l6.5-6.5a2 2 0 0 0 0-2.8z" />
      <circle cx="8" cy="8" r="1.4" />
    </svg>
  ),
};

interface SidebarProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  canManageUsers: boolean;
  isManagerOrAdmin: boolean;
  userName: string;
  userRole: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  USER: 'User',
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  canManageUsers,
  isManagerOrAdmin,
  userName,
  userRole,
}) => {
  // 관리자 전용 항목은 canManageUsers/isManagerOrAdmin에 따라 각각 숨긴다(TopNav.tsx와
  // 동일 로직 — 항목별로 어느 플래그를 썼는지 그대로 유지해 나중에 두 값이 갈라져도 안전).
  const isItemVisible = (item: NavItem): boolean => {
    if (!item.adminOnly) return true;
    if (item.id === 'users') return canManageUsers;
    if (item.id === 'exportShipmentDefaults') return isManagerOrAdmin;
    return true;
  };

  const itemClass = (id: TabId) =>
    `w-full flex items-center gap-2.5 px-5 py-2.5 text-[13.5px] rounded-md transition-colors ${
      activeTab === id ? 'bg-[#1e293b] text-white font-semibold' : 'text-[#e2e8f0] hover:bg-[#1e293b]'
    }`;

  const initial = (userName || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <aside
      className="w-[248px] shrink-0 flex flex-col h-screen sticky top-0"
      style={{ background: '#0f172a', color: '#e2e8f0' }}
    >
      {/* 로고 영역 */}
      <div className="px-5 py-[22px] border-b" style={{ borderColor: '#1e293b' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-[34px] h-[34px] rounded-lg flex items-center justify-center text-white font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4338ca)' }}
          >
            A
          </div>
          <div className="min-w-0">
            <p className="text-white text-[15px] font-bold leading-tight truncate">ASO SCM</p>
            <p className="text-[11px] leading-tight truncate" style={{ color: '#94a3b8' }}>
              태일무역 공급망관리
            </p>
          </div>
        </div>
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        <div className="px-1">
          <button className={itemClass('dashboard')} onClick={() => setActiveTab('dashboard')}>
            <span className="shrink-0">{ICONS.dashboard}</span>
            <span>대시보드</span>
          </button>
        </div>

        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(isItemVisible);
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.key} className="px-1">
              <p
                className="px-5 mb-1 text-[10.5px] font-bold"
                style={{ color: '#64748b', letterSpacing: '0.6px' }}
              >
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <button key={item.id} className={itemClass(item.id)} onClick={() => setActiveTab(item.id)}>
                    <span className="shrink-0">{ICONS[item.id]}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* 광고 영역 — 실제 광고 로직/연동 없는 정적 placeholder (기존 TopNav.tsx의
          "메뉴 트레이 옆" 위치에서 사이드바 하단으로 이동). */}
      <div
        className="m-3 p-3.5 rounded-[10px] text-center"
        style={{ border: '1.5px dashed #334155', background: '#111c33' }}
      >
        <p className="text-[10px] font-semibold tracking-wide" style={{ color: '#64748b' }}>
          광고 영역 · AD SPACE
        </p>
        <p className="text-[10px] mt-1" style={{ color: '#475569' }}>
          300×120 배너 예약 공간(추후 게재 예정 — 현재는 자리표시)
        </p>
      </div>

      {/* 사용자 정보 */}
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-t" style={{ borderColor: '#1e293b' }}>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ background: 'linear-gradient(135deg, #6366f1, #4338ca)' }}
        >
          {initial}
        </div>
        <div className="min-w-0">
          <p className="text-white text-[13px] font-semibold truncate">{userName || '-'}</p>
          <p className="text-[11px] truncate" style={{ color: '#94a3b8' }}>
            {ROLE_LABELS[userRole] ?? userRole ?? '-'}
          </p>
        </div>
      </div>
    </aside>
  );
};
