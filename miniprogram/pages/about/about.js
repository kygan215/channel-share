Page({
  data: {
    phone: '',
    appVersion: 'v1.0.0',
    systemInfo: '',
  },

  onShow() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({
      phone: userInfo.phone || '未绑定',
    });

    wx.getSystemInfo({
      success: (res) => {
        this.setData({
          systemInfo: `${res.platform} ${res.system} | 基础库 ${res.SDKVersion}`,
        });
      },
    });
  },

  goToPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  copyContact() {
    wx.showModal({
      title: '',
      content: '请联系您的团队管理员获取客服微信',
      confirmText: '知道了',
      showCancel: false,
    });
  },
});
