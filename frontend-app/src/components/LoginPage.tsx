import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { login, register } from '../api/auth.service';
import { setAuthToken } from '../api/client';

interface LoginProps {
  onLoginSuccess: () => void;
}

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
        const { access_token } = await login({ email, password });
        localStorage.setItem('access_token', access_token);
        setAuthToken(access_token);
        toast.success('로그인 성공!');
        onLoginSuccess();
      } else {
        await register({ email, password, name });
        toast.success('회원가입 완료! 로그인해주세요.');
        setIsLoginMode(true);
      }
    } catch (error) {
      toast.error(isLoginMode ? '로그인 실패. 정보를 확인하세요.' : '회원가입 실패.');
    } finally {
      setLoading(false);
    }
  };
...
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
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
  );
};
