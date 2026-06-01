// ============================================================
// 首页 — 数据概览 + 隐私同意 + 权限验证
// ============================================================
// 这个页面是小程序的"大门口"，用户打开小程序首先看到它。
// 它负责三件事：
//   1. 如果用户没同意隐私协议 → 弹隐私弹窗
//   2. 同意后验证用户有没有权限使用 → 没权限就显示"访问受限"
//   3. 有权限 → 显示首页数据（促销员总数、在岗数等）
// ============================================================

// 从工具箱导入需要用到的函数
const { getAllChannels, checkAuth } = require('../../utils/channel-service');

// 权限缓存的有效期：1小时（1小时内不用重复验证）
const AUTH_CACHE_TTL = 3600000;

// Page 是微信小程序的页面构造函数
// 里面定义了这个页面所有的数据、生命周期函数、事件处理函数
Page({
  // ============================================================
  // data：页面数据（相当于页面的"状态"）
  // 在 WXML 中用 {{变量名}} 访问
  // 用 this.setData() 修改
  // ============================================================
  data: {
    // 首页统计（显示在页面顶部的四个数字）
    stats: { total: 0, hired: 0, quality: 0, provinces: 0 },

    // 隐私协议相关
    privacyAgreed: false,   // true=已同意隐私协议（控制弹窗显隐）
    privacyChecked: false,  // true=复选框已勾选

    // 权限验证相关
    authChecked: false,     // true=已经验证过权限了
    authorized: false,      // true=有权限使用系统
  },

  // ============================================================
  // onLoad：页面加载时自动执行（只执行一次）
  // ============================================================
  onLoad() {
    // 第一步：检查用户以前是否同意过隐私协议
    // 如果本地存了 privacy_agreed=true → 跳过隐私弹窗
    const agreed = wx.getStorageSync('privacy_agreed');
    if (agreed) {
      this.setData({ privacyAgreed: true });
    }

    // 第二步：检查缓存的权限状态
    // 如果1小时内验证过权限 → 直接用缓存结果，不用再请求服务器
    const cachedAuth = wx.getStorageSync('auth_status');
    if (cachedAuth && cachedAuth.checked && cachedAuth.timestamp) {
      const age = Date.now() - cachedAuth.timestamp;
      if (age < AUTH_CACHE_TTL) {
        // 缓存还没有过期 → 直接使用
        this.setData({
          authChecked: true,
          authorized: cachedAuth.authorized,
        });
      }
    }

    // 第三步：监听微信隐私授权事件
    // 如果用户使用了需要隐私权限的 API（比如定位），微信会自动触发
    if (wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization((resolve) => {
        // 如果已经同意过 → 直接放行
        if (wx.getStorageSync('privacy_agreed')) {
          resolve({ event: 'agree', buttonId: 'agree-btn' });
        } else {
          // 还没同意 → 保存 resolve 回调
          // 如果之前已经有一个 resolve 还没处理，先取消它
          if (this._privacyResolve) {
            this._privacyResolve({ event: 'cancel' });
          }
          this._privacyResolve = resolve;
          // 同时显示隐私弹窗
          this.setData({ privacyAgreed: false });
        }
      });
    }
  },

  // ============================================================
  // onShow：页面每次显示时执行（切换 Tab 也会触发）
  // ============================================================
  async onShow() {
    // 只有用户同意了隐私协议，才继续加载数据
    if (this.data.privacyAgreed) {
      // 如果还没验证过权限 → 发起验证
      if (!this.data.authChecked) {
        await this._checkAccess();
      }
      // 有权限才加载首页数据
      if (this.data.authorized) {
        this.loadStats();
      }
    }
  },

  // ============================================================
  // _checkAccess：验证当前用户是否有权限使用系统
  // 这是内部方法（以 _ 开头），不直接在 WXML 中调用
  // ============================================================
  async _checkAccess() {
    try {
      // 调用云函数查当前用户的身份
      const result = await checkAuth();
      // 如果返回了 isAdmin 或 isViewer 或 role 是 admin/viewer → 有权限
      const authorized = result && (result.isAdmin || result.isViewer || result.role === 'admin' || result.role === 'viewer');
      // 更新页面状态
      this.setData({
        authChecked: true,     // 已经验证过了
        authorized: !!authorized, // 是否有权限
      });
      // 写入缓存（1小时内不用再验证）
      wx.setStorageSync('auth_status', {
        checked: true,
        authorized: !!authorized,
        timestamp: Date.now(),
      });
    } catch (err) {
      // 网络异常时 → 保守处理：显示"无权限"
      console.error('权限验证失败:', err);
      this.setData({
        authChecked: true,
        authorized: false,
      });
      wx.setStorageSync('auth_status', {
        checked: true,
        authorized: false,
        timestamp: Date.now(),
      });
    }
  },

  // ============================================================
  // loadStats：加载首页统计数据（促销员总数、在岗数、优质数、覆盖省份）
  // ============================================================
  async loadStats() {
    // 获取所有数据
    const channels = await getAllChannels();
    // 如果数据为空 → 全部显示0
    if (channels.length === 0) {
      this.setData({ stats: { total: 0, hired: 0, quality: 0, provinces: 0 } });
      return;
    }

    // 统计
    const provinceSet = new Set(); // 用 Set 去重省份
    let hired = 0, quality = 0;
    channels.forEach((item) => {
      if (item.province) provinceSet.add(item.province); // 收集省份
      if (item.hired) hired++;            // 统计在岗人数
      if (item.quality) quality++;        // 统计优质人数
    });

    // 更新页面显示
    this.setData({
      stats: {
        total: channels.length,             // 总促销员数
        hired,                              // 在岗数
        quality,                            // 优质数
        provinces: provinceSet.size,         // 覆盖省份数
      },
    });
  },

  // ============================================================
  // 以下是隐私协议相关的事件处理
  // ============================================================

  // goToPrivacy：跳转到完整的隐私政策页面
  goToPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  // toggleAgree：切换复选框的勾选状态
  toggleAgree() {
    this.setData({ privacyChecked: !this.data.privacyChecked });
  },

  // confirmPrivacy：用户点击"同意并继续"按钮
  // 1. 把同意状态存到本地
  // 2. 如果有微信隐私授权的 resolve 回调 → 放行
  // 3. 验证权限
  // 4. 有权限 → 加载首页数据
  async confirmPrivacy() {
    // 如果没勾选复选框，什么也不做
    if (!this.data.privacyChecked) return;

    // 持久化存储：同意过隐私协议，下次不用再弹
    wx.setStorageSync('privacy_agreed', true);

    // 如果有微信的隐私授权请求的回调，通知它"用户已同意"
    if (this._privacyResolve) {
      this._privacyResolve({ event: 'agree', buttonId: 'agree-btn' });
      this._privacyResolve = null;
    }

    // 显示加载提示（防止隐私弹窗消失后页面闪白）
    wx.showLoading({ title: '验证身份中...', mask: true });

    // 验证用户权限
    await this._checkAccess();
    wx.hideLoading();

    // 隐私弹窗消失，显示首页或权限门
    this.setData({ privacyAgreed: true });

    // 有权限 → 加载首页数据
    if (this.data.authorized) {
      this.loadStats();
    }
  },

  // ============================================================
  // 功能菜单导航（页面跳转）
  // ============================================================
  goToQuery() {
    wx.navigateTo({ url: '/pages/query/query' });
  },
  goToAdd() {
    wx.navigateTo({ url: '/pages/add/add' });
  },
  goToImport() {
    wx.navigateTo({ url: '/pages/import/import' });
  },
  goToManage() {
    wx.navigateTo({ url: '/pages/manage/manage' });
  },

  // ============================================================
  // exportData：导出为 CSV 文件
  // ============================================================
  async exportData() {
    let channels = await getAllChannels();

    // 如果云函数没返回数据，试试从本地缓存取
    if (channels.length === 0) {
      channels = wx.getStorageSync('channels') || [];
    }

    if (channels.length === 0) {
      wx.showToast({ title: '暂无数据可导出', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '导出中...' });

    // 组装 CSV 表头和数据行
    const headers = ['序号', '姓名', '省份', '城市', '区/镇', '地址', '电话', '微信号', '备注', '卖场经验', '底薪', '内部标注', '点赞数', '评论数', '状态'];
    const rows = channels.map((r) => [
      r.sn || '',
      r.name || '',
      r.province || '',
      r.city || '',
      r.district || '',
      r.street || '',
      r.phone || '',
      r.wechat || '',
      r.remark || '',
      (r.kaTags || []).join('、'),
      r.baseSalary || '',
      r.blacklisted ? '⚫黑名单' : (r.quality ? '⭐优质' : ''),
      (r.likes || []).length,
      (r.comments || []).length,
      (r.hireHistory && r.hireHistory.length > 0) || r.hired || (r.comments && r.comments.length > 0) ? '已聘用过' : '',
    ]);

    // 生成 CSV 文本（处理逗号和引号转义）
    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => {
          const str = String(cell);
          return str.indexOf(',') !== -1 || str.indexOf('"') !== -1
            ? '"' + str.replace(/"/g, '""') + '"'
            : str;
        }).join(',')
      )
      .join('\n');

    // 写入临时文件
    const fs = wx.getFileSystemManager();
    const fileName = `促销员数据_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;
    const filePath = wx.env.USER_DATA_PATH + '/' + fileName;

    try {
      // 写入文件（BOM + 内容，防止 Excel 打开乱码）
      fs.writeFileSync(filePath, '﻿' + csvContent, 'utf8');
      wx.hideLoading();

      // 尝试保存到用户设备
      if (wx.saveFileToDisk) {
        wx.saveFileToDisk({
          filePath,
          success: () => wx.showToast({ title: '导出成功' }),
          fail: () => this.shareOrCopy(filePath, csvContent),
        });
      } else {
        this.shareOrCopy(filePath, csvContent);
      }
    } catch (err) {
      wx.hideLoading();
      console.error('导出失败', err);
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  // shareOrCopy：导出失败后的备选方案（分享或复制到剪贴板）
  shareOrCopy(filePath, csvContent) {
    wx.showActionSheet({
      itemList: ['分享到微信', '复制数据到剪贴板'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.shareFileMessage({
            filePath,
            fileName: '促销员数据.csv',
            success: () => wx.showToast({ title: '分享成功' }),
            fail: () => this.copyToClipboard(csvContent),
          });
        } else {
          this.copyToClipboard(csvContent);
        }
      },
      fail: () => {
        wx.showModal({
          title: '导出提示',
          content: '可将 CSV 数据复制到剪贴板，粘贴到文本文件保存为 .csv',
          confirmText: '复制数据',
          success: (r) => {
            if (r.confirm) this.copyToClipboard(csvContent);
          },
        });
      },
    });
  },

  // copyToClipboard：将数据复制到系统剪贴板
  copyToClipboard(csvContent) {
    wx.setClipboardData({
      data: csvContent,
      success: () => wx.showToast({ title: 'CSV 数据已复制，请粘贴到文本文件保存为 .csv' }),
    });
  },
});
