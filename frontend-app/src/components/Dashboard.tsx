import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { getItems } from '../api/items.service';
import { getWorkOrders } from '../api/workOrders.service';
import { getShipments } from '../api/shipments.service';
import { getMasterStyles, type MasterStyle } from '../api/styles.service';
import { getErrorMessage } from '../utils/errorMessage';

type Season = 'SS' | 'FW';

// SS는 납기 1~6월, FW는 납기 7~12월 — 사용자 정의 기준.
const getSeasonDateRange = (year: number, season: Season) =>
  season === 'SS'
    ? { targetRddFrom: `${year}-01-01`, targetRddTo: `${year}-06-30` }
    : { targetRddFrom: `${year}-07-01`, targetRddTo: `${year}-12-31` };

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({ items: 0, workOrders: 0, shipments: 0 });
  const navigate = useNavigate();

  const [year, setYear] = useState<number | ''>('');
  const [season, setSeason] = useState<Season | ''>('');
  const [seasonStyles, setSeasonStyles] = useState<MasterStyle[]>([]);
  const [selectedStyleNo, setSelectedStyleNo] = useState('');
  const [loadingStyles, setLoadingStyles] = useState(false);

  useEffect(() => {
    if (!year || !season) {
      setSeasonStyles([]);
      setSelectedStyleNo('');
      return;
    }
    setLoadingStyles(true);
    setSelectedStyleNo('');
    getMasterStyles(getSeasonDateRange(year, season))
      .then((res) => setSeasonStyles(Array.isArray(res) ? res : []))
      .catch((err) => {
        toast.error(getErrorMessage(err, '스타일 목록을 불러오는 데 실패했습니다.'));
        setSeasonStyles([]);
      })
      .finally(() => setLoadingStyles(false));
  }, [year, season]);

  const selectedStyle = seasonStyles.find((s) => s.styleNo === selectedStyleNo) ?? null;

  const handleAuthError = (error: any) => {
    console.error('Dashboard API Error:', error);
    if (error?.response?.status === 401 || error?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('token');
      navigate('/login');
    } else {
      toast.error('대시보드 데이터를 불러오는 데 실패했습니다.');
    }
  };

  useEffect(() => {
    const loadStats = async () => {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      try {
        const [items, wo, shipments] = await Promise.all([
          getItems({}).catch(() => []),
          getWorkOrders({ limit: 100 }).catch(() => []),
          getShipments().catch(() => [])
        ]);

        // GET /items, GET /work-orders는 배열이 아니라 페이지네이션 객체({items, meta})를
        // 반환한다(Shipments/Suppliers처럼 배열을 바로 주는 API와 다름) — PR-038에서 발견.
        const itemsList = Array.isArray(items) ? items : (items?.items ?? []);
        const itemsTotal = Array.isArray(items) ? items.length : (items?.meta?.total ?? itemsList.length);
        const woList = Array.isArray(wo) ? wo : (wo?.items ?? []);
        const shipmentsList = Array.isArray(shipments) ? shipments : (shipments?.data ?? []);

        setStats({
          items: itemsTotal,
          workOrders: woList.filter((item: any) => item?.status !== 'COMPLETED').length,
          shipments: shipmentsList.length,
        });
      } catch (error) {
        handleAuthError(error);
      }
    };
    loadStats();
  }, [navigate]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">총 품목 수</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.items ?? 0}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">진행 중인 작업지시</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">{stats?.workOrders ?? 0}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">총 출하 건수</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.shipments ?? 0}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">스타일번호 조회 (연도/시즌별)</h3>
        <div className="flex flex-wrap gap-4 items-end mb-4">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">연도</label>
            <select
              className="border border-gray-300 rounded px-3 py-2 w-32"
              value={year}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">선택</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">시즌</label>
            <select
              className="border border-gray-300 rounded px-3 py-2 w-32"
              value={season}
              onChange={(e) => setSeason(e.target.value as Season | '')}
            >
              <option value="">선택</option>
              <option value="SS">SS (납기 1~6월)</option>
              <option value="FW">FW (납기 7~12월)</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">스타일 번호</label>
            <select
              className="border border-gray-300 rounded px-3 py-2 w-64"
              value={selectedStyleNo}
              onChange={(e) => setSelectedStyleNo(e.target.value)}
              disabled={!year || !season || loadingStyles}
            >
              <option value="">
                {loadingStyles ? '불러오는 중...' : !year || !season ? '연도/시즌을 먼저 선택하세요' : seasonStyles.length === 0 ? '해당 시즌 스타일 없음' : '선택'}
              </option>
              {seasonStyles.map((s) => (
                <option key={s.styleNo} value={s.styleNo}>
                  {s.styleNo}{s.overview?.styleName ? ` — ${s.overview.styleName}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedStyle && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm bg-gray-50 p-4 rounded-lg">
            <div><span className="text-gray-500">스타일명:</span> {selectedStyle.overview?.styleName ?? '-'}</div>
            <div><span className="text-gray-500">브랜드:</span> {selectedStyle.overview?.brand ?? '-'}</div>
            <div><span className="text-gray-500">생산유형:</span> {selectedStyle.overview?.productionType ?? '-'}</div>
            <div><span className="text-gray-500">공장:</span> {selectedStyle.overview?.factory ?? '-'}</div>
            <div><span className="text-gray-500">바이어:</span> {selectedStyle.overview?.buyer ?? '-'}</div>
            <div><span className="text-gray-500">총수량:</span> {selectedStyle.overview?.totalQty ?? '-'}</div>
            <div><span className="text-gray-500">납기:</span> {selectedStyle.overview?.targetRdd ?? '-'}</div>
            <div><span className="text-gray-500">상태:</span> {selectedStyle.overview?.status ?? '-'}</div>
          </div>
        )}
      </div>
    </div>
  );
};
