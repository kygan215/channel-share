// ============================================================
// 渠道列表首页
// 功能：渠道列表展示、搜索、筛选、排序、点赞、评论、促销员
// 数据存储依赖：wx.setStorageSync / getStorageSync
// ============================================================

Page({
  // ============================================================
  // 页面数据
  // ============================================================
  data: {
    allData: [],          // 本地存储中全部渠道数据（原始数据）
    groupedData: [],      // 经过过滤/排序/分组后用于渲染的数据
    searchText: '',       // 搜索关键词
    selectedProvince: '全部省份',
    provinceIndex: 0,
    provinces: ['全部省份'],
    displayProvinces: ['全部省份'],
    filterSearchText: '',
    sortIndex: 0,
    sortOptions: ['序号升序', '序号降序', '省份A-Z', '省份Z-A'],
    loading: true,        // 加载状态

    // ---- 快捷评论标签 ----
    quickTags: [
      '知识工作者，销售技巧熟练',
      '主动叫卖',
      '尚可胜任',
      '态度好成长好',
    ],

    // ---- 点赞/评论/促销员状态 ----
    currentUserId: '',      // 当前用户唯一标识（本地生成）
    expandedComments: {},   // 展开的评论区域 { [channelId]: true/false }
    expandedPromoters: {},  // 展开的促销员区域 { [channelId]: true/false }
    commentTexts: {},       // 评论输入框内容 { [channelId]: '文字' }
    promoterNames: {},      // 促销员姓名输入 { [channelId]: '姓名' }
    promoterPhones: {},     // 促销员电话输入 { [channelId]: '电话' }
  },

  // ============================================================
  // 生命周期：每次页面展示时自动刷新
  // ============================================================
  onShow() {
    // 初始化当前用户标识（每次显示都要获取，确保已存在）
    this.setData({ currentUserId: this.getUserId() });
    // 从本地存储重新加载数据
    this.fetchData();
  },

  // ============================================================
  // 获取/创建当前用户标识
  // 用时间戳生成唯一 ID，存入本地存储复用（模拟 openid）
  // ============================================================
  getUserId() {
    // 尝试读取已有的用户 ID
    let uid = wx.getStorageSync('_uid');
    if (!uid) {
      // 首次使用：生成新 ID（u + 时间戳）
      uid = 'u' + Date.now();
      wx.setStorageSync('_uid', uid);
    }
    return uid;
  },

  // ============================================================
  // 从本地存储读取数据并刷新列表
  // ============================================================
  fetchData() {
    // 显示加载状态
    this.setData({ loading: true });

    // 从本地存储读取全部渠道数据
    const channels = wx.getStorageSync('channels') || [];

    // 提取所有省份并去重排序，生成省份筛选列表
    const provinceSet = new Set(
      channels.map((item) => item.province).filter(Boolean)
    );
    const provinces = ['全部省份', ...Array.from(provinceSet).sort()];

    // 更新数据
    this.setData({
      allData: channels,
      provinces,
      displayProvinces: provinces,
      filterSearchText: '',
      selectedProvince: '全部省份',
      provinceIndex: 0,
    });
    // 执行过滤/排序/分组
    this.processData();
    // 关闭加载状态
    this.setData({ loading: false });
  },

  // ============================================================
  // 核心处理：过滤 → 排序 → 分组
  // 按搜索关键词、省份筛选、排序模式处理后分组展示
  // ============================================================
  processData() {
    // 解构当前数据和筛选状态
    const { allData, searchText, selectedProvince, sortIndex, sortOptions, currentUserId } =
      this.data;

    // ---- 1. 搜索过滤 ----
    // 匹配字段：省份、城市、电话（模糊搜索）
    let filtered = allData.filter((item) => {
      if (!searchText) return true;           // 无关键词则全部展示
      const kw = searchText.toLowerCase();     // 转小写实现不区分大小写
      return (
        (item.province || '').toLowerCase().indexOf(kw) !== -1 ||
        (item.city || '').toLowerCase().indexOf(kw) !== -1 ||
        (item.phone || '').indexOf(kw) !== -1
      );
    });

    // ---- 2. 省份筛选 ----
    if (selectedProvince !== '全部省份') {
      filtered = filtered.filter(
        (item) => item.province === selectedProvince
      );
    }

    // ---- 3. 排序 ----
    const sortMode = sortOptions[sortIndex];
    if (sortMode === '序号降序') {
      // 按序号从大到小（降序）
      filtered.sort((a, b) => (b.sn || 0) - (a.sn || 0));
    } else {
      // 默认按序号从小到大（升序）
      filtered.sort((a, b) => (a.sn || 0) - (b.sn || 0));
    }

    // ---- 4. 补全字段 + 标记当前用户点赞状态 ----
    // 兼容旧数据：旧记录可能没有 likes/comments/promoters 字段
    filtered = filtered.map((item) => ({
      ...item,
      likes: item.likes || [],                            // 默认空数组
      comments: item.comments || [],                      // 默认空数组
      promoters: item.promoters || [],                    // 默认空数组
      _liked: (item.likes || []).indexOf(currentUserId) !== -1, // 当前用户是否已点赞
    }));

    // ---- 5. 按省份分组 ----
    const groupMap = new Map();
    filtered.forEach((item) => {
      const p = item.province || '未知';
      if (!groupMap.has(p)) groupMap.set(p, []);
      groupMap.get(p).push(item);
    });

    // 将 Map 转为数组便于渲染
    let groups = [];
    groupMap.forEach((items, province) => {
      groups.push({ province, items });
    });

    // ---- 6. 组排序 ----
    if (sortMode === '省份A-Z') {
      // 按省份拼音正序
      groups.sort((a, b) => a.province.localeCompare(b.province, 'zh'));
    } else if (sortMode === '省份Z-A') {
      // 按省份拼音倒序
      groups.sort((a, b) => b.province.localeCompare(a.province, 'zh'));
    } else if (sortMode === '序号升序') {
      // 按每组最小序号升序
      groups.sort((a, b) => (a.items[0].sn || 0) - (b.items[0].sn || 0));
    } else if (sortMode === '序号降序') {
      // 按每组最大序号降序
      groups.sort((a, b) => (b.items[0].sn || 0) - (a.items[0].sn || 0));
    }

    // 更新渲染数据
    this.setData({ groupedData: groups });
  },

  // ============================================================
  // 搜索框输入事件
  // ============================================================
  onSearchInput(e) {
    this.setData({ searchText: e.detail.value });
    this.processData(); // 实时重新过滤
  },

  // ============================================================
  // 省份搜索过滤
  // ============================================================
  onFilterSearch(e) {
    const text = e.detail.value;
    const filtered = this.data.provinces.filter(p => p.indexOf(text) !== -1);
    this.setData({
      filterSearchText: text,
      displayProvinces: filtered,
    });
  },

  // ============================================================
  // 省份筛选 Tab 点击
  // ============================================================
  onProvinceTabTap(e) {
    const value = e.currentTarget.dataset.value;
    const idx = this.data.provinces.indexOf(value);
    if (idx >= 0) this.onProvinceChange({ detail: { value: idx } });
  },

  // ============================================================
  // 排序 Tab 点击
  // ============================================================
  onSortTabTap(e) {
    this.onSortChange({ detail: { value: parseInt(e.currentTarget.dataset.index, 10) } });
  },

  // ============================================================
  // 省份筛选切换
  // ============================================================
  onProvinceChange(e) {
    const index = parseInt(e.detail.value, 10);
    this.setData({
      provinceIndex: index,
      selectedProvince: this.data.provinces[index],
    });
    this.processData();
  },

  // ============================================================
  // 排序方式切换
  // ============================================================
  onSortChange(e) {
    this.setData({ sortIndex: parseInt(e.detail.value, 10) });
    this.processData();
  },

  // ============================================================
  // 复制电话到剪贴板
  // ============================================================
  copyPhone(e) {
    const { phone } = e.currentTarget.dataset;
    wx.setClipboardData({
      data: String(phone),
      success: () => wx.showToast({ title: '电话已复制' }),
    });
  },

  // ============================================================
  // 复制微信号到剪贴板
  // ============================================================
  copyWechat(e) {
    const { wechat } = e.currentTarget.dataset;
    wx.setClipboardData({
      data: String(wechat),
      success: () => wx.showToast({ title: '微信号已复制' }),
    });
  },

  // ============================================================
  // 删除渠道记录
  // 先弹确认框，确认后从本地存储移除
  // ============================================================
  deleteItem(e) {
    // 获取渠道 ID（从自定义属性 data-id）
    const id = Number(e.currentTarget.dataset.id);
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？',
      success: (res) => {
        if (res.confirm) {
          // 从本地存储读取全部数据
          let channels = wx.getStorageSync('channels') || [];
          // 过滤掉要删除的记录
          channels = channels.filter((item) => item.id !== id);
          // 保存回本地存储
          wx.setStorageSync('channels', channels);
          wx.showToast({ title: '删除成功' });
          // 刷新列表
          this.fetchData();
        }
      },
    });
  },

  // ============================================================
  // 跳转到新增渠道页面
  // ============================================================
  goToAdd() {
    wx.navigateTo({ url: '/pages/add/add' });
  },

  // ============================================================
  // 导出 Excel
  // 从当前筛选后的数据取记录，传给云函数生成 xlsx
  // ============================================================
  exportData() {
    const { groupedData } = this.data;
    // 将分组数据展平为记录数组
    const records = [];
    groupedData.forEach((group) => {
      group.items.forEach((item) => {
        records.push(item);
      });
    });

    // 无数据时提示
    if (records.length === 0) {
      wx.showToast({ title: '暂无数据可导出', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '导出中...' });

    // 调用云函数 exportExcel，传入记录数据
    wx.cloud
      .callFunction({
        name: 'exportExcel',
        data: { records },
      })
      .then((res) => {
        wx.hideLoading();
        if (!res.result || !res.result.success) {
          wx.showToast({
            title: res.result?.message || '导出失败',
            icon: 'none',
          });
          return;
        }
        const { downloadUrl } = res.result;
        // 下载文件并打开
        wx.downloadFile({
          url: downloadUrl,
          success: (downloadRes) => {
            wx.openDocument({
              filePath: downloadRes.tempFilePath,
              fileType: 'xlsx',
              success: () => wx.showToast({ title: '导出成功' }),
              fail: () => {
                // 无法打开时复制下载链接到剪贴板
                wx.setClipboardData({
                  data: downloadUrl,
                  success: () =>
                    wx.showToast({ title: '下载链接已复制到剪贴板' }),
                });
              },
            });
          },
          fail: () => wx.showToast({ title: '文件下载失败', icon: 'none' }),
        });
      })
      .catch((err) => {
        wx.hideLoading();
        console.error('导出失败', err);
        wx.showToast({ title: '导出失败，请检查云开发状态', icon: 'none' });
      });
  },

  // ============================================================
  // 点赞 / 取消点赞
  // 检查当前用户是否已在 likes 数组中，切换状态
  // ============================================================
  toggleLike(e) {
    // 渠道 ID
    const id = Number(e.currentTarget.dataset.id);
    // 当前用户标识
    const userId = this.data.currentUserId;
    // 读取本地存储的全部数据
    let channels = wx.getStorageSync('channels') || [];
    // 查找要操作的记录
    const index = channels.findIndex((item) => item.id === id);
    if (index === -1) return; // 未找到则退出

    // 确保 likes 数组存在
    if (!channels[index].likes) channels[index].likes = [];

    // 如果已点赞则取消，否则添加
    if (channels[index].likes.indexOf(userId) !== -1) {
      // 从数组中移除当前用户 ID
      channels[index].likes = channels[index].likes.filter((u) => u !== userId);
    } else {
      // 添当前用户 ID
      channels[index].likes.push(userId);
    }

    // 保存更新后的数据
    wx.setStorageSync('channels', channels);
    // 刷新列表以更新显示
    this.fetchData();
  },

  // ============================================================
  // 展开/收起评论区域
  // ============================================================
  toggleComments(e) {
    // 渠道 ID 转为字符串（用作对象键）
    const id = String(e.currentTarget.dataset.id);
    // 动态更新 expandedComments 中该渠道的展开状态
    const key = `expandedComments.${id}`;
    this.setData({ [key]: !this.data.expandedComments[id] });
  },

  // ============================================================
  // 评论输入框输入事件
  // 按渠道 ID 分别存储每条的输入内容
  // ============================================================
  onCommentInput(e) {
    // 渠道 ID 转为字符串
    const channelId = String(e.currentTarget.dataset.channelId);
    // 更新对应渠道的评论输入内容
    this.setData({ [`commentTexts.${channelId}`]: e.detail.value });
  },

  // ============================================================
  // 快捷评论标签点击：将标签内容填入评论输入框
  // ============================================================
  onQuickTagTap(e) {
    const channelId = String(e.currentTarget.dataset.channelId);
    const tag = e.currentTarget.dataset.tag;
    this.setData({ [`commentTexts.${channelId}`]: tag });
  },

  // ============================================================
  // 添加评论
  // ============================================================
  addComment(e) {
    // 获取渠道 ID
    const channelId = Number(e.currentTarget.dataset.channelId);
    // 读取该渠道对应的输入内容并去除首尾空格
    const content = (this.data.commentTexts[String(channelId)] || '').trim();
    if (!content) return; // 空内容不提交

    // 读取本地存储的全部数据
    let channels = wx.getStorageSync('channels') || [];
    const index = channels.findIndex((item) => item.id === channelId);
    if (index === -1) return;

    // 确保 comments 数组存在
    if (!channels[index].comments) channels[index].comments = [];

    // 组装评论对象并添加到数组
    channels[index].comments.push({
      id: Date.now(),                              // 唯一 ID
      userId: this.data.currentUserId,             // 评论者身份标识
      nickname: '当前用户',                         // 评论者昵称（暂固定）
      content: content,                             // 评论内容
      time: new Date().toLocaleString('zh-CN'),     // 评论时间
    });

    // 保存到本地存储
    wx.setStorageSync('channels', channels);
    // 清空该渠道的评论输入框
    this.setData({ [`commentTexts.${channelId}`]: '' });
    // 刷新列表
    this.fetchData();
  },

  // ============================================================
  // 删除评论（只能删除自己的）
  // ============================================================
  deleteComment(e) {
    // 渠道 ID 和 评论 ID
    const channelId = Number(e.currentTarget.dataset.channelId);
    const commentId = Number(e.currentTarget.dataset.commentId);
    // 读取本地存储
    let channels = wx.getStorageSync('channels') || [];
    const index = channels.findIndex((item) => item.id === channelId);
    if (index === -1) return;

    // 按评论 ID 过滤掉要删除的评论
    channels[index].comments = (channels[index].comments || []).filter(
      (c) => c.id !== commentId
    );
    // 保存并刷新
    wx.setStorageSync('channels', channels);
    this.fetchData();
  },

  // ============================================================
  // 展开/收起促销员区域
  // ============================================================
  togglePromoters(e) {
    const id = String(e.currentTarget.dataset.id);
    const key = `expandedPromoters.${id}`;
    this.setData({ [key]: !this.data.expandedPromoters[id] });
  },

  // ============================================================
  // 促销员姓名输入
  // ============================================================
  onPromoterNameInput(e) {
    const channelId = String(e.currentTarget.dataset.channelId);
    this.setData({ [`promoterNames.${channelId}`]: e.detail.value });
  },

  // ============================================================
  // 促销员电话输入
  // ============================================================
  onPromoterPhoneInput(e) {
    const channelId = String(e.currentTarget.dataset.channelId);
    this.setData({ [`promoterPhones.${channelId}`]: e.detail.value });
  },

  // ============================================================
  // 添加促销员
  // ============================================================
  addPromoter(e) {
    // 获取渠道 ID
    const channelId = Number(e.currentTarget.dataset.channelId);
    // 读取输入的姓名（必填）
    const name = (this.data.promoterNames[String(channelId)] || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写姓名', icon: 'none' });
      return;
    }

    // 读取本地存储
    let channels = wx.getStorageSync('channels') || [];
    const index = channels.findIndex((item) => item.id === channelId);
    if (index === -1) return;

    // 确保 promoters 数组存在
    if (!channels[index].promoters) channels[index].promoters = [];

    // 添加促销员对象
    channels[index].promoters.push({
      id: Date.now(),                                           // 唯一 ID
      name: name,                                               // 姓名
      phone: (this.data.promoterPhones[String(channelId)] || '').trim(), // 电话（选填）
    });

    // 保存到本地存储
    wx.setStorageSync('channels', channels);
    // 清空表单输入
    this.setData({
      [`promoterNames.${channelId}`]: '',
      [`promoterPhones.${channelId}`]: '',
    });
    // 刷新列表
    this.fetchData();
  },

  // ============================================================
  // 删除促销员
  // ============================================================
  deletePromoter(e) {
    // 渠道 ID 和 促销员 ID
    const channelId = Number(e.currentTarget.dataset.channelId);
    const promoterId = Number(e.currentTarget.dataset.promoterId);
    // 读取本地存储
    let channels = wx.getStorageSync('channels') || [];
    const index = channels.findIndex((item) => item.id === channelId);
    if (index === -1) return;

    // 按促销员 ID 过滤移除
    channels[index].promoters = (channels[index].promoters || []).filter(
      (p) => p.id !== promoterId
    );
    // 保存并刷新
    wx.setStorageSync('channels', channels);
    this.fetchData();
  },
});
