// ============================================================
// 促销信息共享 - 小程序入口
// ============================================================

// 注册小程序应用实例
App({
  // 小程序启动时执行
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-d7gvio3817ca58eb3',
        traceUser: true,
      });

      // 自检：测试云环境是否连通
      wx.cloud.callFunction({ name: 'login' }).then(res => {
      }).catch(err => {
        console.error('云环境连通失败:', err);
        wx.showModal({
          title: '云环境连接失败',
          content: '请检查：\n1. 云开发是否已开通\n2. 环境ID是否匹配（app.js第15行）\n3. login云函数是否已部署\n\n错误：' + (err.errMsg || err.message || 'timeout'),
          showCancel: false,
        });
      });
    }
  },
});
