import axios from 'axios';
import toast from 'react-hot-toast';

// Flag to prevent repetitive toast alerts and duplicate redirect processes on concurrent 401s
let isRedirecting = false;

// Safe localStorage access wrapper
export const getSafeLocalStorageItem = (key: string): string | null => {
  try {
    const item = localStorage.getItem(key);
    // Explicitly handle null, undefined (though getItem doesn't return undefined, defensive), 
    // and the literal strings "undefined" or "null".
    if (item === null || item === undefined || item === 'undefined' || item === 'null') {
      return null;
    }
    return item;
  } catch (e) {
    console.error(`Error accessing localStorage key "${key}":`, e);
    return null;
  }
};

export const axiosInstance = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Automatic Authorization header injection
axiosInstance.interceptors.request.use(
  (config) => {
    // Check multiple potential token keys
    const token = getSafeLocalStorageItem('accessToken') || 
                  getSafeLocalStorageItem('access_token') || 
                  getSafeLocalStorageItem('token');
                  
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response Interceptor: Global 401 handling, session cleanup, and toast suppression
axiosInstance.interceptors.response.use(
  (response) => {
    // If wrapped by backend's TransformInterceptor, return the actual data
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      return response.data.data;
    }
    return response.data;
  },
  (error) => {
    // Ignore login request from 401 redirect logic to prevent loops
    if (error.config?.url?.includes('/auth/login')) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      if (!isRedirecting) {
        isRedirecting = true;
        
        // Clear all potential session tokens
        localStorage.removeItem('accessToken');
        localStorage.removeItem('token');
        localStorage.removeItem('access_token');
        
        // Redirect to login page safely
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
    
    // Default error handling: only toast if we are not in the middle of a 401 redirect
    if (!isRedirecting) {
      const message = error.response?.data?.message || '알 수 없는 오류가 발생했습니다.';
      toast.error(message);
    }
    return Promise.reject(error);
  },
);

// setAuthToken to support components (like LoginPage) that manually set or clear tokens
export const setAuthToken = (token: string | null) => {
  if (token) {
    axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete axiosInstance.defaults.headers.common['Authorization'];
  }
};

// Exports for both default and named imports
export default axiosInstance;
