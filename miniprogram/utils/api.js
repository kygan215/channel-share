// ============================================================
// API 层 — 云函数调用封装
// ============================================================

const db = wx.cloud.database();

// 获取所有促销员记录（支持分页 + 60秒本地缓存）
async function getAllChannels(options = {}) {
  const page = options.page || 1;
  const pageSize = options.pageSize || 500;

  // 首页全量数据走缓存（60秒有效）
  if (page === 1 && pageSize === 500) {
    const cached = wx.getStorageSync('channels_cache');
    if (cached && cached.data && cached.timestamp) {
      const age = Date.now() - cached.timestamp;
      if (age < 60000) {
        return cached.data;
      }
    }
  }

  try {
    const res = await wx.cloud.callFunction({
      name: 'channel',
      data: { action: 'list', data: { page, pageSize } },
    });
    if (res.result && res.result.success) {
      const data = res.result.data || [];
      // 首页全量结果写入缓存
      if (page === 1 && pageSize === 500) {
        wx.setStorageSync('channels_cache', { data, timestamp: Date.now() });
      }
      return data;
    }
    return [];
  } catch (err) {
    console.error('getAllChannels error:', err);
    wx.showToast({ title: '网络异常，请检查网络', icon: 'none' });
    return [];
  }
}

// 检查当前用户权限
async function checkAuth() {
  try {
    const res = await wx.cloud.callFunction({
      name: 'channel',
      data: { action: 'authCheck' },
    });
    return res.result || { success: false, isAdmin: false, registered: false };
  } catch (err) {
    return { success: false, isAdmin: false, registered: false, error: err.message };
  }
}

// 验证手机号白名单
async function checkWhitelist(phone) {
  try {
    const res = await wx.cloud.callFunction({
      name: 'channel',
      data: { action: 'whitelistCheck', data: { phone } },
    });
    return res.result || { success: false, message: '验证失败' };
  } catch (err) {
    return { success: false, message: '网络错误，请稍后重试' };
  }
}

// 本地设置
function getSettings() {
  const settings = wx.getStorageSync('appSettings') || {};
  return {
    canAdd: settings.permAdd !== false,
    canEdit: settings.permEdit !== false,
    canDelete: settings.permDelete !== false,
    canPromoter: settings.permPromoter !== false,
    canReview: settings.permReview !== false,
  };
}

module.exports = {
  getAllChannels,
  checkAuth,
  checkWhitelist,
  getSettings,
};
