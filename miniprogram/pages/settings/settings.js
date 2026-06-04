// ============================================================
// 设置页面
// 功能：记录权限管理、手机号绑定
// ============================================================

const { checkAuth, verifyMyWhitelist } = require('../../utils/channel-service');

Page({
  data: {
    // 权限开关
    permAdd: true,
    permEdit: true,
    permDelete: true,
    permPromoter: true,
    permReview: true,
    // 手机号
    phone: '',
    // 管理员状态
    isAdmin: false,
    myOpenid: '',
    users: [],
    showAddAdmin: false,
    addOpenid: '',
    // 白名单管理
    whitelist: [],
    whitelistBatchText: '',
    showAddWhitelist: false,
  },

  async onShow() {
    this.loadSettings();
    this.loadPhone();
    await this.loadAdminInfo();
  },

  // ============================================================
  // 加载管理员信息 + 白名单
  // ============================================================
  async loadAdminInfo() {
    const auth = await checkAuth();
    const myOpenid = wx.getStorageSync('_openid') || '';
    this.setData({
      isAdmin: auth.isAdmin,
      myOpenid,
    });
    if (auth.isAdmin) {
      try {
        const [userRes, wlRes] = await Promise.all([
          wx.cloud.callFunction({ name: 'channel', data: { action: 'authListUsers' } }),
          wx.cloud.callFunction({ name: 'channel', data: { action: 'whitelistList' } }),
        ]);
        const users = (userRes.result && userRes.result.success) ? userRes.result.data : [];
        const whitelist = (wlRes.result && wlRes.result.success) ? wlRes.result.data : [];
        // 格式化日期，避免 WXML 中不能用 new Date()
        const fmtUsers = users.map(u => ({
          ...u,
          _createdAt: u.createdAt ? new Date(u.createdAt).toLocaleDateString('zh-CN') : '',
        }));
        const fmtWhitelist = whitelist.map(w => ({
          ...w,
          _createdAt: w.createdAt ? new Date(w.createdAt).toLocaleDateString('zh-CN') : '',
        }));
        this.setData({
          users: fmtUsers,
          whitelist: fmtWhitelist,
        });
      } catch (e) {
        console.error('加载数据失败', e);
      }
    }
  },

  // ============================================================
  // 加载权限设置
  // ============================================================
  loadSettings() {
    const settings = wx.getStorageSync('appSettings') || {};
    this.setData({
      permAdd: settings.permAdd !== false,
      permEdit: settings.permEdit !== false,
      permDelete: settings.permDelete !== false,
      permPromoter: settings.permPromoter !== false,
      permReview: settings.permReview !== false,
    });
  },

  // ============================================================
  // 加载手机号
  // ============================================================
  loadPhone() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({ phone: userInfo.phone || '' });
  },

  // ============================================================
  // 保存设置
  // ============================================================
  saveSettings() {
    wx.setStorageSync('appSettings', {
      permAdd: this.data.permAdd,
      permEdit: this.data.permEdit,
      permDelete: this.data.permDelete,
      permPromoter: this.data.permPromoter,
      permReview: this.data.permReview,
    });
    wx.showToast({ title: '设置已保存', icon: 'success' });
  },

  // ============================================================
  // 切换权限开关
  // ============================================================
  togglePerm(e) {
    const field = e.currentTarget.dataset.field;
    const key = `perm${field.charAt(0).toUpperCase() + field.slice(1)}`;
    this.setData({ [key]: !this.data[key] });
    this.saveSettings();
  },

  // ============================================================
  // 手动输入手机号
  // ============================================================
  onPhoneInput(e) {
    this._savePhone(e.detail.value);
  },

  // ============================================================
  // 保存手机号到 userInfo
  // ============================================================
  _savePhone(phone) {
    const userInfo = wx.getStorageSync('userInfo') || {};
    userInfo.phone = phone;
    wx.setStorageSync('userInfo', userInfo);
    this.setData({ phone });
  },

  // ============================================================
  // 确认手机号
  // ============================================================
  confirmPhone() {
    const phone = this.data.phone.trim();
    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }
    wx.showToast({ title: '手机号已保存', icon: 'success' });
  },

  // ============================================================
  // 验证白名单身份
  // ============================================================
  async verifyWhitelist() {
    const phone = this.data.phone.trim();
    if (!phone) {
      wx.showToast({ title: '请先输入手机号', icon: 'none' });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '验证中...' });
    try {
      const result = await verifyMyWhitelist(phone);
      wx.hideLoading();
      if (result.success) {
        wx.showToast({ title: '🎉 验证通过！现在可以看到全部数据了', icon: 'success' });
        // 清除权限缓存，重新加载身份
        wx.removeStorageSync('auth_status');
        await this.loadAdminInfo();
      } else {
        wx.showModal({
          title: '未在白名单中',
          content: result.message || '你的手机号尚未加入白名单，请联系管理员添加',
          showCancel: false,
          confirmText: '知道了',
        });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  // ============================================================
  // 复制 OPENID
  // ============================================================
  copyOpenid() {
    wx.setClipboardData({
      data: this.data.myOpenid,
      success: () => wx.showToast({ title: '已复制', icon: 'success' }),
    });
  },

  // ============================================================
  // 显示添加管理员输入框
  // ============================================================
  toggleAddAdmin() {
    this.setData({ showAddAdmin: !this.data.showAddAdmin, addOpenid: '' });
  },

  // ============================================================
  // 输入要添加的 OPENID
  // ============================================================
  onAddOpenidInput(e) {
    this.setData({ addOpenid: e.detail.value });
  },

  // ============================================================
  // 确认添加管理员
  // ============================================================
  async confirmAddAdmin() {
    const openid = this.data.addOpenid.trim();
    if (!openid) {
      wx.showToast({ title: '请输入 OPENID', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '添加中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'channel',
        data: { action: 'authAddUser', data: { openid } },
      });
      wx.hideLoading();
      if (res.result && res.result.success) {
        wx.showToast({ title: '添加成功', icon: 'success' });
        this.setData({ showAddAdmin: false, addOpenid: '' });
        this.loadAdminInfo();
      } else {
        wx.showToast({ title: res.result.message || '添加失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  },

  // ============================================================
  // 移除管理员
  // ============================================================
  async removeAdmin(e) {
    const openid = e.currentTarget.dataset.openid;
    if (openid === this.data.myOpenid) {
      wx.showModal({
        title: '提示',
        content: '不能移除自己',
        showCancel: false,
      });
      return;
    }
    wx.showModal({
      title: '确认移除',
      content: '确定要移除该管理员吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '移除中...' });
          try {
            const result = await wx.cloud.callFunction({
              name: 'channel',
              data: { action: 'authRemoveUser', data: { openid } },
            });
            wx.hideLoading();
            if (result.result && result.result.success) {
              wx.showToast({ title: '已移除', icon: 'success' });
              this.loadAdminInfo();
            } else {
              wx.showToast({ title: result.result.message || '移除失败', icon: 'none' });
            }
          } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '移除失败', icon: 'none' });
          }
        }
      },
    });
  },

  // ============================================================
  // 白名单管理
  // ============================================================

  toggleAddWhitelist() {
    this.setData({ showAddWhitelist: !this.data.showAddWhitelist, whitelistBatchText: '' });
  },

  onWhitelistBatchInput(e) {
    this.setData({ whitelistBatchText: e.detail.value });
  },

  // 批量添加白名单（一行一个手机号，或逗号/空格分隔）
  async confirmAddWhitelist() {
    const text = this.data.whitelistBatchText.trim();
    if (!text) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }
    // 支持换行、逗号、空格分隔
    const phones = text.split(/[\n,，、\s]+/).map(s => s.trim()).filter(Boolean);
    if (phones.length === 0) {
      wx.showToast({ title: '未识别到有效手机号', icon: 'none' });
      return;
    }

    wx.showLoading({ title: `添加 ${phones.length} 个...` });
    try {
      const res = await wx.cloud.callFunction({
        name: 'channel',
        data: { action: 'whitelistAdd', data: { phones } },
      });
      wx.hideLoading();
      if (res.result && res.result.success) {
        const errors = res.result.errors;
        if (errors && errors.length > 0) {
          wx.showModal({
            title: `成功添加 ${res.result.added} 个`,
            content: `以下手机号添加失败：\n${errors.join('\n')}`,
            showCancel: false,
            confirmText: '知道了',
          });
        } else {
          wx.showToast({ title: `成功添加 ${res.result.added} 个`, icon: 'success' });
        }
        this.setData({ showAddWhitelist: false, whitelistBatchText: '' });
        this.loadAdminInfo();
      } else {
        wx.showToast({ title: res.result.message || '添加失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  },

  async removeWhitelist(e) {
    const phone = e.currentTarget.dataset.phone;
    wx.showModal({
      title: '确认移除',
      content: `确定要将 ${phone} 移出白名单吗？`,
      success: async (r) => {
        if (r.confirm) {
          wx.showLoading({ title: '移除中...' });
          try {
            const res = await wx.cloud.callFunction({
              name: 'channel',
              data: { action: 'whitelistRemove', data: { phone } },
            });
            wx.hideLoading();
            if (res.result && res.result.success) {
              wx.showToast({ title: '已移除', icon: 'success' });
              this.loadAdminInfo();
            } else {
              wx.showToast({ title: res.result.message || '移除失败', icon: 'none' });
            }
          } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '移除失败', icon: 'none' });
          }
        }
      },
    });
  },
});
