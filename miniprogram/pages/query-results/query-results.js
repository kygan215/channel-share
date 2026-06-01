// ============================================================
// 查询结果页
// 接收搜索条件，展示过滤后的促销员卡片
// ============================================================

const { getUserId, getAllChannels, getMyNickname, processData } = require('../../utils/channel-service');

Page({
  data: {
    groupedData: [],
    loading: true,
    refreshing: false,

    quickTags: [
      '知识工作者，销售技巧熟练',
      '主动叫卖，态度积极',
      '尚可胜任，有待提升',
      '态度好，成长快',
    ],

    currentUserId: '',
    expandedComments: {},
    commentTexts: {},
    commentExpanded: {},

    // 筛选参数
    searchParams: {},
  },

  onLoad(options) {
    wx.setNavigationBarTitle({ title: '查询结果' });
    this.setData({ searchParams: options });
  },

  async onShow() {
    this.setData({ currentUserId: await getUserId() });
    this.fetchData();
  },

  async fetchData() {
    this.setData({ loading: true });

    const channels = await getAllChannels();
    const params = this.data.searchParams;

    const groups = processData({
      allData: channels,
      searchText: decodeURIComponent(params.searchText || ''),
      selectedTag: decodeURIComponent(params.tag || ''),
      selectedProvince: decodeURIComponent(params.province || '全部省份'),
      selectedCity: decodeURIComponent(params.city || '全部城市'),
      selectedDistrict: decodeURIComponent(params.district || '全部区镇'),
      selectedStreet: decodeURIComponent(params.street || ''),
      sortIndex: parseInt(params.sort || '0', 10),
      sortOptions: ['序号升序', '序号降序', '省份A-Z', '省份Z-A'],
      currentUserId: this.data.currentUserId,
    });

    this.setData({ groupedData: groups, loading: false });
  },

  async refreshData() {
    const channels = await getAllChannels();
    const params = this.data.searchParams;

    const groups = processData({
      allData: channels,
      searchText: decodeURIComponent(params.searchText || ''),
      selectedTag: decodeURIComponent(params.tag || ''),
      selectedProvince: decodeURIComponent(params.province || '全部省份'),
      selectedCity: decodeURIComponent(params.city || '全部城市'),
      selectedDistrict: decodeURIComponent(params.district || '全部区镇'),
      selectedStreet: decodeURIComponent(params.street || ''),
      sortIndex: parseInt(params.sort || '0', 10),
      sortOptions: ['序号升序', '序号降序', '省份A-Z', '省份Z-A'],
      currentUserId: this.data.currentUserId,
    });

    this.setData({ groupedData: groups });
  },

  // ==================== 下拉刷新 ====================

  async onPullDownRefresh() {
    this.setData({ refreshing: true });
    try {
      await this.refreshData();
    } finally {
      this.setData({ refreshing: false });
      wx.stopPullDownRefresh();
    }
  },

  // ==================== 复制 ====================

  copyPhone(e) {
    const { phone } = e.currentTarget.dataset;
    wx.setClipboardData({
      data: String(phone),
      success: () => wx.showToast({ title: '电话已复制' }),
    });
  },

  copyWechat(e) {
    const { wechat } = e.currentTarget.dataset;
    wx.setClipboardData({
      data: String(wechat),
      success: () => wx.showToast({ title: '微信号已复制' }),
    });
  },

  // ==================== 评论 ====================

  toggleCommentInput(e) {
    const id = String(e.currentTarget.dataset.id);
    const key = `commentExpanded.${id}`;
    this.setData({ [key]: !this.data.commentExpanded[id] });
  },

  toggleComments(e) {
    const id = String(e.currentTarget.dataset.id);
    const key = `expandedComments.${id}`;
    this.setData({ [key]: !this.data.expandedComments[id] });
  },

  onCommentInput(e) {
    const id = String(e.currentTarget.dataset.id);
    this.setData({ [`commentTexts.${id}`]: e.detail.value });
  },

  onQuickTagTap(e) {
    const id = String(e.currentTarget.dataset.id);
    const tag = e.currentTarget.dataset.tag;
    this.setData({ [`commentTexts.${id}`]: tag });
  },

  async addComment(e) {
    const id = Number(e.currentTarget.dataset.id);
    const key = String(id);
    const content = (this.data.commentTexts[key] || '').trim();
    if (!content) return;

    const nickname = getMyNickname();
    const time = new Date().toLocaleString('zh-CN');
    const newComment = {
      id: Date.now(),
      userId: this.data.currentUserId,
      nickname,
      content,
      time,
      _avatarChar: (nickname || '?').slice(0, 1),
    };

    const allData = this.data.groupedData.map(group => ({
      ...group,
      items: group.items.map(item => {
        if (item.id !== id) return item;
        const comments = [...(item.comments || []), newComment];
        return { ...item, comments };
      }),
    }));
    this.setData({ groupedData: allData, [`commentTexts.${key}`]: '' });

    try {
      await wx.cloud.callFunction({
        name: 'channel',
        data: { action: 'addComment', data: { id, nickname, content, time } },
      });
    } catch (err) {
      this.refreshData();
    }
  },

  async deleteComment(e) {
    const id = Number(e.currentTarget.dataset.id);
    const commentId = Number(e.currentTarget.dataset.commentId);

    await wx.cloud.callFunction({
      name: 'channel',
      data: { action: 'deleteComment', data: { id, commentId } },
    });
    this.refreshData();
  },
});
