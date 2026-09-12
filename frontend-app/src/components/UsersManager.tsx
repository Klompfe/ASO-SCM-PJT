import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getUsers, updateUser, deleteUser, type UserAccount } from '../api/users.service';
import type { UserRole } from '../api/auth.service';
import { getErrorMessage } from '../utils/errorMessage';

const ROLE_OPTIONS: UserRole[] = ['USER', 'MANAGER', 'ADMIN'];

const roleBadgeStyle = (role: UserRole) => {
  switch (role) {
    case 'ADMIN':
      return 'bg-red-100 text-red-700';
    case 'MANAGER':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

export const UsersManager: React.FC = () => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getUsers();
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
      setUsers(data);
    } catch (err: any) {
      setError(getErrorMessage(err, '사용자 목록을 불러오는 데 실패했습니다.'));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (id: number, role: UserRole) => {
    setError(null);
    try {
      await updateUser(id, { role });
      toast.success('사용자 역할이 변경되었습니다.');
      loadUsers();
    } catch (err: any) {
      setError(getErrorMessage(err, '역할 변경에 실패했습니다.'));
    }
  };

  const handleToggleActive = async (u: UserAccount) => {
    setError(null);
    try {
      await updateUser(u.id, { isActive: !u.isActive });
      toast.success(u.isActive ? '계정이 비활성화되었습니다.' : '계정이 활성화되었습니다.');
      loadUsers();
    } catch (err: any) {
      setError(getErrorMessage(err, '계정 상태 변경에 실패했습니다.'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('이 사용자를 삭제하시겠습니까?')) return;
    setError(null);
    try {
      await deleteUser(id);
      toast.success('사용자가 삭제되었습니다.');
      loadUsers();
    } catch (err: any) {
      setError(getErrorMessage(err, '사용자 삭제에 실패했습니다.'));
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">사용자 관리</h2>

      {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}
      {loading && <div className="text-gray-500 text-sm">불러오는 중...</div>}

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">Username</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">상태</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">{u.username}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${roleBadgeStyle(u.role)}`}>{u.role}</span>
                    <select
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                    {u.isActive ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                  <button className="text-blue-600" onClick={() => handleToggleActive(u)}>
                    {u.isActive ? '비활성화' : '활성화'}
                  </button>
                  <button className="text-red-600" onClick={() => handleDelete(u.id)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
