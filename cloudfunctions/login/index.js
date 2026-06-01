// ============================================================
// 云函数：用户登录
// 通过 wx.login 获取的 code，返回用户 openid
// ============================================================

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  return {
    success: true,
    openid: wxContext.OPENID,
    unionid: wxContext.UNIONID || '',
    appid: wxContext.APPID,
  };
};
