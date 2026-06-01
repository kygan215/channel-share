// ============================================================
// 用户信息工具
// ============================================================

// 获取或初始化当前用户的 openid
async function getUserId() {
  let openid = wx.getStorageSync('_openid');
  if (!openid) {
    try {
      const { result } = await wx.cloud.callFunction({ name: 'login' });
      openid = result.openid;
      wx.setStorageSync('_openid', openid);
    } catch (err) {
      openid = 'u' + Date.now();
      wx.setStorageSync('_openid', openid);
    }
  }
  return openid;
}

// 构建聘用身份标识字符串
function buildHireByIdentity() {
  const userInfo = wx.getStorageSync('userInfo') || {};
  const province = userInfo.province || '';
  const city = userInfo.city || '';
  const position = userInfo.position || '';
  const nickname = userInfo.nickname || '';
  const parts = [];
  const region = province + city;
  if (region) parts.push(region);
  if (position) parts.push(position);
  if (nickname) parts.push(nickname);
  return parts.join(' · ') || nickname || '匿名用户';
}

// 获取当前用户昵称
function getMyNickname() {
  const userInfo = wx.getStorageSync('userInfo') || {};
  return userInfo.nickname || '匿名用户';
}

// 获取当前用户 openid
function getMyOpenid() {
  return wx.getStorageSync('_openid') || '';
}

module.exports = {
  getUserId,
  buildHireByIdentity,
  getMyNickname,
  getMyOpenid,
};
