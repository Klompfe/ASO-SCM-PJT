import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { login, register } from '../api/auth.service';
import { setAuthToken } from '../api/client';
import { getErrorMessage } from '../utils/errorMessage';

interface LoginProps {
  onLoginSuccess: () => void;
}

const ICON_PROPS = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: '#8fb0ff',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// PR-097: A안 브랜드 패널의 4개 기능 소개 행. 이모지 대신 인라인 SVG 아이콘(상자/문서/
// 트럭/저울 형태)을 쓴다.
const FEATURES: { title: string; description: string; icon: React.ReactNode }[] = [
  {
    title: '자재관리',
    description: '원자재·부자재 BOM과 재고를 한 곳에서',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M21 8l-9-5-9 5 9 5 9-5z" />
        <path d="M3 8v8l9 5 9-5V8" />
        <path d="M12 13v8" />
      </svg>
    ),
  },
  {
    title: '오더·발주관리',
    description: '작업지시서부터 발주·입고까지 추적',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M7 3h8l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M9 9h6" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    ),
  },
  {
    title: '납품관리',
    description: '포장내역과 실제 납품 수량을 정확하게',
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="1" y="7" width="13" height="10" rx="1" />
        <path d="M14 10h4l3 3v4a1 1 0 0 1-1 1h-2" />
        <circle cx="6" cy="19" r="1.6" />
        <circle cx="17" cy="19" r="1.6" />
      </svg>
    ),
  },
  {
    title: '선적·통관관리',
    description: '수출입 INV/PKL 작성과 HS코드 관리',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M12 3v3" />
        <path d="M5 9h14" />
        <path d="M5 9l-3 5h6l-3-5z" />
        <path d="M19 9l-3 5h6l-3-5z" />
        <path d="M12 6l-3 3h6l-3-3z" />
        <path d="M8 20h8" />
        <path d="M12 14v6" />
      </svg>
    ),
  },
];

export const LoginPage: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const validateEmail = (email: string) => /\S+@\S+\.\S+/.test(email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      toast.error('유효한 이메일 형식이 아닙니다.');
      return;
    }

    setLoading(true);
    try {
      if (isLoginMode) {
        // 백엔드가 email/username 둘 다 로그인 아이디로 허용하므로 email 값을 둘 다에 채워 보낸다.
        const res = await login({ email, username: email, password });
        const token = res?.accessToken;

        if (token) {
          localStorage.setItem('access_token', token);
          setAuthToken(token);
          toast.success('로그인 성공!');
          onLoginSuccess();
        } else {
          throw new Error('토큰을 찾을 수 없습니다.');
        }
      } else {
        // RegisterDto는 username을 받지 않는다(whitelist 위반으로 400) — email/password/name만 전송.
        await register({ email, password, name });
        toast.success('회원가입 완료! 로그인해주세요.');
        setIsLoginMode(true);
      }
    } catch (error: any) {
      console.error('Login/Register error:', error);
      const message = getErrorMessage(error, isLoginMode ? '로그인 실패. 정보를 확인하세요.' : '회원가입 실패.');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* PR-097: A안 — 왼쪽 브랜드 패널. 데스크톱(lg)에서만 노출되고 모바일/태블릿에서는
          완전히 숨긴다(기존 모바일 동작과 동일하게 폼만 전체 너비로 보이게). */}
      <div className="hidden lg:flex lg:w-[560px] bg-[#0b1636] flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-[34px] h-[34px] rounded-lg bg-[#3b6cf6] flex items-center justify-center text-white font-extrabold">
              A
            </div>
            <span className="font-extrabold text-white text-lg">ASO SCM</span>
          </div>

          {/* index.css의 전역 h1/h2 스타일(font-size:56px, 어두운 색)이 Tailwind
              유틸리티보다 나중에 로드되어 우선하므로, <h1>/<h2> 대신 <p>를 쓴다. */}
          <p className="text-2xl lg:text-[29px] font-extrabold text-white leading-snug mt-10">
            자재부터 선적까지,<br />하나의 시스템으로
          </p>
          <p className="text-sm text-[#a8b4d6] mt-4">
            자재관리·오더/발주관리·납품관리·선적관리를 하나로 연결한 태일무역의 공급망 관리 시스템입니다.
          </p>

          <div className="mt-10 space-y-6">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex items-start gap-4">
                <div className="shrink-0">{feature.icon}</div>
                <div>
                  <h3 className="text-white text-sm font-semibold">{feature.title}</h3>
                  <p className="text-[#a8b4d6] text-xs mt-1">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-dashed border-[#33437a] rounded-lg flex flex-col items-center justify-center py-6 text-center">
          <span className="text-[10px] text-[#7c8bbd] font-semibold tracking-wide">광고 영역 · AD SPACE</span>
          <span className="text-[10px] text-[#5f6da0] mt-1">추후 게재 예정</span>
        </div>
      </div>

      {/* 오른쪽 폼 패널 — 기존 카드/폼 구조는 그대로, 배치만 A안 레이아웃에 맞춘다. */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-md border border-gray-200 w-full max-w-md">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-6">
            {isLoginMode ? 'SCM Login' : 'SCM Register'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {!isLoginMode && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-9 text-sm text-gray-500"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white rounded-lg py-2 font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
              disabled={loading}
            >
              {loading ? 'Processing...' : (isLoginMode ? 'Login' : 'Register')}
            </button>
          </form>
          <button
            onClick={() => setIsLoginMode(!isLoginMode)}
            className="mt-4 w-full text-blue-600 hover:text-blue-800 text-sm text-center"
          >
            {isLoginMode ? 'Don\'t have an account? Register' : 'Already have an account? Login'}
          </button>
        </div>
      </div>
    </div>
  );
};
