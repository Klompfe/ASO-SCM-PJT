import React, { useEffect, useRef, useState } from 'react';

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
  | 'hsCodeClassifications';

interface NavItem {
  id: TabId;
  label: string;
  // 관리자(MANAGER/ADMIN) 전용 항목 — 그렇지 않으면 그룹 트레이에서 자체를 숨긴다.
  adminOnly?: boolean;
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

// PR-087: 11개 메뉴를 구분 없이 한 줄로 나열하던 것을 카테고리별로 묶었다.
// activeTab 타입/값은 전혀 바꾸지 않는다 — 상단 내비게이션의 "배치 방식"만
// 바뀌는 것이라 각 항목의 id는 기존 activeTab 값을 그대로 재사용한다.
const NAV_GROUPS: NavGroup[] = [
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
    items: [
      { id: 'buyers', label: '고객사' },
      { id: 'exportShipmentDefaults', label: '선적서류 기본정보', adminOnly: true },
      { id: 'users', label: '사용자 관리', adminOnly: true },
    ],
  },
];

interface TopNavProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  canManageUsers: boolean;
  isManagerOrAdmin: boolean;
}

export const TopNav: React.FC<TopNavProps> = ({ activeTab, setActiveTab, canManageUsers, isManagerOrAdmin }) => {
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 관리자 전용 항목은 canManageUsers/isManagerOrAdmin에 따라 각각 숨긴다 — 기존
  // App.tsx 로직에서 두 값이 항상 동일했지만(둘 다 MANAGER/ADMIN 여부), 항목별로
  // 어느 플래그를 썼는지 그대로 유지해 나중에 두 값이 갈라져도 안전하게 둔다.
  const isItemVisible = (item: NavItem): boolean => {
    if (!item.adminOnly) return true;
    if (item.id === 'users') return canManageUsers;
    if (item.id === 'exportShipmentDefaults') return isManagerOrAdmin;
    return true;
  };

  // 트레이 바깥을 클릭하면 닫는다.
  useEffect(() => {
    if (!openGroupKey) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenGroupKey(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openGroupKey]);

  const toggleGroup = (key: string) => {
    setOpenGroupKey((prev) => (prev === key ? null : key));
  };

  const selectItem = (id: TabId) => {
    setActiveTab(id);
    setOpenGroupKey(null);
  };

  const openGroup = NAV_GROUPS.find((g) => g.key === openGroupKey) ?? null;
  const groupLabelClass = (group: NavGroup) => {
    const isActiveGroup = group.items.some((item) => item.id === activeTab);
    return `px-3 h-16 flex items-center text-sm font-medium border-b-2 transition-colors ${
      isActiveGroup
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-600 hover:text-gray-800'
    }`;
  };

  return (
    <div ref={containerRef} className="relative bg-white border-b border-gray-200">
      <div className="h-16 flex items-center gap-1 px-6">
        <button
          className={`px-3 h-16 flex items-center text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'dashboard'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-800'
          }`}
          onClick={() => {
            setActiveTab('dashboard');
            setOpenGroupKey(null);
          }}
        >
          대시보드
        </button>
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(isItemVisible);
          if (visibleItems.length === 0) return null;
          return (
            <button key={group.key} className={groupLabelClass(group)} onClick={() => toggleGroup(group.key)}>
              {group.label}
            </button>
          );
        })}
      </div>

      {openGroup && (
        <div className="absolute left-0 right-0 top-full bg-white shadow-md border-t border-gray-100 z-40">
          <div className="flex gap-6 px-6 py-4">
            <div className="grid grid-cols-4 gap-9 flex-1">
              {openGroup.items.filter(isItemVisible).map((item) => (
                <button
                  key={item.id}
                  onClick={() => selectItem(item.id)}
                  className={`text-left text-sm ${
                    item.id === activeTab ? 'font-semibold text-blue-600' : 'text-gray-700 hover:text-blue-600'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {/* 광고 영역 예약 — 실제 광고 로직/연동 없는 정적 placeholder. */}
            <div className="w-[220px] shrink-0 border border-dashed border-gray-300 bg-gray-50 rounded-lg flex flex-col items-center justify-center py-6 text-center">
              <span className="text-[10px] text-gray-400 font-semibold tracking-wide">광고 영역 · AD SPACE</span>
              <span className="text-[10px] text-gray-400 mt-1">추후 게재 예정</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
