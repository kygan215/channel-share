// ============================================================
// 促销管理页
// 每张卡片 = 一个促销员
// ============================================================

const { getProvinces, getCities, getDistricts } = require('../../utils/regions');
const { getUserId, getAllChannels, checkAuth, checkWhitelist, getMyNickname, processData, getSettings } = require('../../utils/channel-service');

Page({
  data: {
    allData: [],
    groupedData: [],
    searchText: '',
    searchFocused: false,
    selectedProvince: '全部省份',
    selectedCity: '全部城市',
    selectedDistrict: '全部区镇',
    provinces: ['全部省份'],
    cities: ['全部城市'],
    districts: ['全部区镇'],
    displayProvinces: ['全部省份'],
    displayCities: ['全部城市'],
    displayDistricts: ['全部区镇'],
    provinceFilterSearchText: '',
    cityFilterSearchText: '',
    districtFilterSearchText: '',
    sortIndex: 0,
    sortOptions: ['序号升序', '序号降序', '省份A-Z', '省份Z-A'],
    tagOptions: ['全部', '⚫ 黑名单', '⭐ 优质临促'],
    selectedTag: '',
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
    selectedStreet: '',

    // 批量删除
    batchMode: false,
    selectedIds: {},
    selectedCount: 0,

    _searchTimer: null,

    // 权限
    canAdd: true,
    canEdit: true,
    canDelete: true,
    canPromoter: true,
    canReview: true,

    // 健康证审核
    reviewModal: false,
    reviewRecord: null,
    reviewCertUrl: '',
    rejectReason: '',

    // 手机号验证
    userRole: '',
    showPhoneAuth: false,
    phoneInput: '',
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '促销管理' });
  },

  async onShow() {
    this.setData({
      currentUserId: await getUserId(),
      userRole: '',
      showPhoneAuth: false,
      phoneInput: '',
    });

    const auth = await checkAuth();

    // 管理员：完整权限
    if (auth.isAdmin) {
      const settings = getSettings();
      this.setData({
        userRole: 'admin',
        canAdd: settings.canAdd,
        canEdit: settings.canEdit,
        canDelete: settings.canDelete,
        canPromoter: settings.canPromoter,
        canReview: settings.canReview,
      });
      this.fetchData();
      return;
    }

    // Viewer（白名单已验证的查看者）：只能看
    if (auth.isViewer) {
      this.setData({
        userRole: 'viewer',
        canAdd: false,
        canEdit: false,
        canDelete: false,
        canPromoter: false,
        canReview: false,
      });
      this.fetchData();
      return;
    }

    // 尚未注册到系统中：放行，首次调用云函数会自动注册第一个用户为管理员
    if (!auth.registered) {
      const settings = getSettings();
      this.setData({
        userRole: 'admin',
        canAdd: settings.canAdd,
        canEdit: settings.canEdit,
        canDelete: settings.canDelete,
        canPromoter: settings.canPromoter,
        canReview: settings.canReview,
      });
      this.fetchData();
      return;
    }

    // 已注册但未在白名单：弹手机号验证
    this.setData({ showPhoneAuth: true, loading: false });
  },

  // ==================== 手机号白名单验证 ====================

  onPhoneAuthInput(e) {
    this.setData({ phoneInput: e.detail.value });
  },

  async submitPhoneAuth() {
    const phone = this.data.phoneInput.trim();
    if (!phone || !/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '验证中...' });
    const result = await checkWhitelist(phone);
    wx.hideLoading();

    if (result.success) {
      wx.showToast({ title: '验证通过', icon: 'success' });
      this.setData({
        showPhoneAuth: false,
        userRole: 'viewer',
        canAdd: false,
        canEdit: false,
        canDelete: false,
        canPromoter: false,
        canReview: false,
      });
      this.fetchData();
    } else {
      wx.showModal({
        title: '验证失败',
        content: result.message || '手机号不在白名单中，请联系管理员',
        showCancel: false,
        confirmText: '知道了',
      });
    }
  },

  async fetchData() {
    this.setData({ loading: true });

    let channels = await getAllChannels();

    if (channels.length === 0) {
      const localData = wx.getStorageSync('channels') || [];
      if (localData.length > 0) {
        wx.showLoading({ title: '正在迁移数据...' });
        try {
          await wx.cloud.callFunction({
            name: 'channel',
            data: { action: 'migrate', data: { records: localData } },
          });
          channels = await getAllChannels();
        } catch (err) {
          console.error('迁移失败', err);
        }
        wx.hideLoading();
      }
    }

    const provinces = ['全部省份', ...getProvinces()];

    this.setData({
      allData: channels,
      provinces,
      displayProvinces: provinces,
      provinceFilterSearchText: '',
      selectedProvince: '全部省份',
      selectedCity: '全部城市',
      selectedDistrict: '全部区镇',
      selectedStreet: '',
      cities: ['全部城市'],
      districts: ['全部区镇'],
      displayCities: ['全部城市'],
      displayDistricts: ['全部区镇'],
    });
    this.runProcessData();
    this.setData({ loading: false });
  },

  runProcessData() {
    const groups = processData({
      allData: this.data.allData,
      searchText: this.data.searchText,
      selectedTag: this.data.selectedTag,
      selectedProvince: this.data.selectedProvince,
      selectedCity: this.data.selectedCity,
      selectedDistrict: this.data.selectedDistrict,
      selectedStreet: this.data.selectedStreet,
      sortIndex: this.data.sortIndex,
      sortOptions: this.data.sortOptions,
      currentUserId: this.data.currentUserId,
    });
    this.setData({ groupedData: groups });
  },

  async refreshData() {
    const channels = await getAllChannels();
    this.setData({ allData: channels });
    this.runProcessData();
  },

  async onPullDownRefresh() {
    this.setData({ refreshing: true });
    try {
      await this.refreshData();
    } finally {
      this.setData({ refreshing: false });
      wx.stopPullDownRefresh();
    }
  },

  // ==================== 搜索（含防抖） ====================

  onSearchIconTap() {
    this.setData({ searchFocused: true });
  },

  onSearchBlur() {
    this.setData({ searchFocused: false });
  },

  onSearchInput(e) {
    const value = e.detail ? e.detail.value : (e.currentTarget.dataset.value || '');
    this.setData({ searchText: value });

    if (this.data._searchTimer) clearTimeout(this.data._searchTimer);
    this.data._searchTimer = setTimeout(() => {
      this.runProcessData();
    }, 300);
  },

  // ==================== 筛选与排序 ====================

  onProvinceFilterSearch(e) {
    const text = e.detail.value;
    const filtered = this.data.provinces.filter(p => p.indexOf(text) !== -1);
    this.setData({ provinceFilterSearchText: text, displayProvinces: filtered });
  },

  onProvinceSelect(e) {
    const province = e.currentTarget.dataset.value;
    if (province !== this.data.selectedProvince) {
      const cityList = province === '全部省份'
        ? ['全部城市']
        : ['全部城市', ...getCities(province)];
      this.setData({
        selectedProvince: province,
        selectedCity: '全部城市',
        selectedDistrict: '全部区镇',
        selectedStreet: '',
        cities: cityList,
        displayCities: cityList,
        districts: ['全部区镇'],
        displayDistricts: ['全部区镇'],
        cityFilterSearchText: '',
        districtFilterSearchText: '',
      });
    }
    this.runProcessData();
  },

  onCityFilterSearch(e) {
    const text = e.detail.value;
    const filtered = this.data.cities.filter(c => c.indexOf(text) !== -1);
    this.setData({ cityFilterSearchText: text, displayCities: filtered });
  },

  onCitySelect(e) {
    const city = e.currentTarget.dataset.value;
    if (city !== this.data.selectedCity) {
      const districtList = city === '全部城市'
        ? ['全部区镇']
        : ['全部区镇', ...getDistricts(city)];
      this.setData({
        selectedCity: city,
        selectedDistrict: '全部区镇',
        selectedStreet: '',
        districts: districtList,
        displayDistricts: districtList,
        districtFilterSearchText: '',
      });
    }
    this.runProcessData();
  },

  onDistrictFilterSearch(e) {
    const text = e.detail.value;
    const filtered = this.data.districts.filter(d => d.indexOf(text) !== -1);
    this.setData({ districtFilterSearchText: text, displayDistricts: filtered });
  },

  onDistrictSelect(e) {
    const district = e.currentTarget.dataset.value;
    this.setData({ selectedDistrict: district, selectedStreet: '' });
    this.runProcessData();
  },

  onStreetInput(e) {
    const value = e.detail.value;
    this.setData({ selectedStreet: value });
    if (this.data._searchTimer) clearTimeout(this.data._searchTimer);
    this.data._searchTimer = setTimeout(() => {
      this.runProcessData();
    }, 300);
  },

  onSortTabTap(e) {
    this.setData({ sortIndex: parseInt(e.currentTarget.dataset.index, 10) });
    this.runProcessData();
  },

  // ==================== 内部标注筛选 ====================

  onTagSelect(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const map = ['', 'blacklist', 'quality'];
    this.setData({ selectedTag: map[idx] || '' });
    this.runProcessData();
  },

  // ==================== 每卡片操作 ====================

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

  editItem(e) {
    const id = Number(e.currentTarget.dataset.id);
    wx.navigateTo({ url: `/pages/add/add?id=${id}` });
  },

  goToAdd() {
    wx.navigateTo({ url: '/pages/add/add' });
  },

  async deleteSingle(e) {
    const id = Number(e.currentTarget.dataset.id);
    const record = this.data.allData.find(item => item.id === id);
    if (!record) return;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除 ${record.name} 吗？此操作不可撤销。`,
      confirmText: '删除',
      confirmColor: '#e64340',
      success: async (r) => {
        if (r.confirm) {
          const res = await wx.cloud.callFunction({
            name: 'channel',
            data: { action: 'delete', data: { id } },
          });
          if (res.result && res.result.success) {
            wx.showToast({ title: '已删除' });
            this.refreshData();
          } else {
            wx.showToast({ title: res.result?.message || '删除失败', icon: 'none' });
          }
        }
      },
    });
  },

  // ============================================================
  // 健康证
  // ============================================================

  // 上传健康证
  async uploadHealthCert(e) {
    const id = Number(e.currentTarget.dataset.id);

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中...' });

        try {
          const suffix = tempFilePath.match(/\.\w+$/)?.[0] || '.jpg';
          const cloudPath = `healthcerts/${id}_${Date.now()}${suffix}`;

          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: tempFilePath,
          });

          const cfRes = await wx.cloud.callFunction({
            name: 'channel',
            data: {
              action: 'healthCertUpload',
              data: { id, fileId: uploadRes.fileID },
            },
          });

          wx.hideLoading();

          if (cfRes.result && cfRes.result.success) {
            wx.showToast({ title: '已提交审核', icon: 'success' });
            this.refreshData();
          } else {
            wx.showToast({ title: cfRes.result?.message || '上传失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          console.error('上传健康证失败', err);
          wx.showToast({ title: '上传失败，请重试', icon: 'none' });
        }
      },
    });
  },

  // 查看健康证大图
  viewHealthCert(e) {
    const fileId = e.currentTarget.dataset.fileid;
    wx.previewImage({
      urls: [fileId],
      showmenu: true,
    });
  },

  // 打开审核弹窗
  openReview(e) {
    const id = Number(e.currentTarget.dataset.id);
    const record = this.data.allData.find(item => item.id === id);
    if (!record || !record.healthCert || record.healthCert.status !== 'pending') return;

    this.setData({
      reviewModal: true,
      reviewRecord: record,
      reviewCertUrl: record.healthCert.fileId || '',
      rejectReason: '',
    });
  },

  // 关闭审核弹窗
  closeReview() {
    this.setData({
      reviewModal: false,
      reviewRecord: null,
      reviewCertUrl: '',
      rejectReason: '',
    });
  },

  // 驳回原因输入
  onRejectReasonInput(e) {
    this.setData({ rejectReason: e.detail.value });
  },

  // 通过审核
  async approveHealthCert() {
    const record = this.data.reviewRecord;
    if (!record) return;

    wx.showLoading({ title: '审核中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'channel',
        data: {
          action: 'healthCertReview',
          data: { id: record.id, status: 'approved' },
        },
      });

      wx.hideLoading();

      if (res.result && res.result.success) {
        wx.showToast({ title: '已通过审核', icon: 'success' });
        this.closeReview();
        this.refreshData();
      } else {
        wx.showToast({ title: res.result?.message || '审核失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('审核失败', err);
      wx.showToast({ title: '审核失败', icon: 'none' });
    }
  },

  // 驳回
  async rejectHealthCert() {
    const record = this.data.reviewRecord;
    if (!record) return;

    const reason = this.data.rejectReason.trim() || '未通过审核';

    wx.showLoading({ title: '提交中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'channel',
        data: {
          action: 'healthCertReview',
          data: { id: record.id, status: 'rejected', rejectReason: reason },
        },
      });

      wx.hideLoading();

      if (res.result && res.result.success) {
        wx.showToast({ title: '已驳回', icon: 'success' });
        this.closeReview();
        this.refreshData();
      } else {
        wx.showToast({ title: res.result?.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('驳回失败', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // ============================================================
  // 评论
  // ============================================================

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

    const allData = this.data.allData.map(item => {
      if (item.id !== id) return item;
      const comments = [...(item.comments || []), newComment];
      return { ...item, comments };
    });
    this.setData({ allData, [`commentTexts.${key}`]: '' });
    this.runProcessData();

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

  // ============================================================
  // 批量删除
  // ============================================================

  toggleBatchMode() {
    this.setData({
      batchMode: !this.data.batchMode,
      selectedIds: {},
      selectedCount: 0,
    });
  },

  toggleSelect(e) {
    const id = String(e.currentTarget.dataset.id);
    const selectedIds = { ...this.data.selectedIds };
    if (selectedIds[id]) {
      delete selectedIds[id];
    } else {
      selectedIds[id] = true;
    }
    this.setData({
      selectedIds,
      selectedCount: Object.keys(selectedIds).length,
    });
  },

  selectAll() {
    const { selectedCount, groupedData } = this.data;
    let totalItems = 0;
    groupedData.forEach(g => { totalItems += g.items.length; });

    if (selectedCount === totalItems) {
      this.setData({ selectedIds: {}, selectedCount: 0 });
    } else {
      const ids = {};
      groupedData.forEach(g => {
        g.items.forEach(item => { ids[String(item.id)] = true; });
      });
      this.setData({ selectedIds: ids, selectedCount: Object.keys(ids).length });
    }
  },

  async batchDelete() {
    const ids = Object.keys(this.data.selectedIds).map(Number);
    if (ids.length === 0) return;

    wx.showModal({
      title: '确认批量删除',
      content: `确定要删除选中的 ${ids.length} 条记录吗？此操作不可撤销。`,
      confirmText: '删除',
      confirmColor: '#e64340',
      success: async (r) => {
        if (r.confirm) {
          wx.showLoading({ title: '删除中...' });
          const res = await wx.cloud.callFunction({
            name: 'channel',
            data: { action: 'batchDelete', data: { ids } },
          });
          wx.hideLoading();

          if (res.result && res.result.success) {
            wx.showToast({ title: `已删除 ${res.result.count} 条` });
            this.setData({ batchMode: false, selectedIds: {}, selectedCount: 0 });
            this.refreshData();
          } else {
            wx.showToast({ title: res.result?.message || '删除失败', icon: 'none' });
          }
        }
      },
    });
  },
});
