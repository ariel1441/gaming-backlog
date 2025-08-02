import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const AdminLoginForm = ({ onClose }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    setError('');

    const result = await login(password);
    
    if (result.success) {
      onClose();
      setPassword('');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-modal">
      <div className="bg-surface-card border border-surface-border rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-content-primary">Admin Login</h2>
          <button
            onClick={handleClose}
            className="text-content-muted hover:text-content-primary transition-colors text-2xl"
            disabled={loading}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-content-secondary mb-2">
              Admin Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-surface-elevated border border-surface-border rounded-md text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Enter admin password"
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="text-state-error text-sm bg-state-error/20 border border-state-error rounded-md p-2">
              {error}
            </div>
          )}

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-action-primary hover:bg-action-primary-hover disabled:bg-primary-dark disabled:cursor-not-allowed text-content-primary font-medium py-2 px-4 rounded-md transition-colors flex items-center justify-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 bg-surface-elevated hover:bg-surface-border disabled:bg-surface-elevated disabled:cursor-not-allowed text-content-primary font-medium rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>

        <div className="mt-4 text-xs text-content-muted">
          <p>This login is for administrative functions only.</p>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginForm;