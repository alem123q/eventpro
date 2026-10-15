import api from './api';

export const authService = {
  login(email, password) {
    return api.post('/auth/login/', { email, password });
  },

  register(data) {
    return api.post('/auth/register/', data);
  },

  logout(refreshToken) {
    return api.post('/auth/logout/', { refresh: refreshToken });
  },

  refresh(refreshToken) {
    return api.post('/auth/refresh/', { refresh: refreshToken });
  },

  getProfile() {
    return api.get('/users/profile/');
  },

  updateProfile(data) {
    return api.put('/users/profile/', data);
  },

  changePassword(data) {
    return api.post('/auth/change-password/', data);
  },

  forgotPassword(email) {
    return api.post('/auth/forgot-password/', { email });
  },

  resetPassword(token, password, password_confirm) {
    return api.post('/auth/reset-password/', { token, password, password_confirm });
  },

  verifyEmail(token) {
    return api.post('/auth/verify-email/', { token });
  },

  resendVerification(email) {
    return api.post('/auth/resend-verification/', { email });
  },
};
