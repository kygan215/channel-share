// ============================================================
// 促销管理页
// 每张卡片 = 一个促销员
// ============================================================

const { getProvinces, getCities, getDistricts } = require('../../utils/regions');
const { getUserId, getAllChannels, checkAuth, getMyNickname, processData, getSettings } = require('../../utils/channel-service');

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
    tagOptions: ['全部', '⚫ 黑名单', '⭐ 优质临促', '✅ 在岗'],
    selectedTag: '',
    selectedHired: false,
    selectedAgeMin: '',
    selectedAgeMax: '',
    allKaTags: [],
    selectedKaTags: [],
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

    // 个人模式提示（非授权用户只看自己添加的数据）
    showOwnScopeHint: false,

    // 健康证审核
    reviewModal: false,
    reviewRecord: null,
    reviewCertUrl: '',
    rejectReason: '',

    // 搜索状态
    searching: false,
    resultCount: 0,
    scrollToView: '',
    showBackTop: false,

    // 聘用弹窗
    hireModal: false,
    hireRecord: null,
    hireStartDate: '',
    hireEndDate: '',
    todayDate: '',

    // 解聘弹窗
    unhireModal: false,
    unhireRecord: null,
    unhireComment: '',
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '促销管理' });
    // 设置今天的日期作为日期选择器的最小值
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    this.setData({ todayDate: `${y}-${m}-${d}` });
  },

  async onShow() {
    this.setData({
      currentUserId: await getUserId(),
      showOwnScopeHint: false,
    });

    const auth = await checkAuth();

    // 管理员：完整权限，看到全部数据
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

    // Viewer（白名单用户）：完整操作权限，看到全部数据
    if (auth.isViewer) {
      const settings = getSettings();
      this.setData({
        userRole: 'viewer',
        canAdd: settings.canAdd,
        canEdit: settings.canEdit,
        canDelete: settings.canDelete,
        canPromoter: settings.canPromoter,
        canReview: settings.canReview,
      });
      this.fetchData();
      return;
    }

    // 普通用户：正常使用，但后端只返回自己添加的记录
    const settings = getSettings();
    this.setData({
      userRole: 'normal',
      canAdd: settings.canAdd,
      canEdit: settings.canEdit,
      canDelete: settings.canDelete,
      canPromoter: settings.canPromoter,
      canReview: false,           // 普通用户不能审核健康证
      showOwnScopeHint: true,     // 在顶部显示提示条
    });
    this.fetchData();
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

    // 收集所有卖场经验标签
    const kaTagSet = new Set();
    channels.forEach((item) => {
      const tags = Array.isArray(item.kaTags) ? item.kaTags : [];
      tags.forEach((t) => { if (t) kaTagSet.add(t); });
    });
    const allKaTags = Array.from(kaTagSet).sort();

    this.setData({
      allData: channels,
      provinces,
      displayProvinces: provinces,
      allKaTags,
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
      selectedHired: this.data.selectedHired,
      selectedAgeMin: this.data.selectedAgeMin,
      selectedAgeMax: this.data.selectedAgeMax,
      selectedKaTags: this.data.selectedKaTags,
      selectedProvince: this.data.selectedProvince,
      selectedCity: this.data.selectedCity,
      selectedDistrict: this.data.selectedDistrict,
      selectedStreet: this.data.selectedStreet,
      sortIndex: this.data.sortIndex,
      sortOptions: this.data.sortOptions,
      currentUserId: this.data.currentUserId,
    });
    const count = groups.reduce((sum, g) => sum + g.items.length, 0);
    this.setData({ groupedData: groups, resultCount: count });
  },

  // 搜索按钮点击：给用户反馈，自动滚动到结果
  doSearch() {
    this.setData({ searching: true, scrollToView: '' });
    this.runProcessData();
    // 滚动到列表顶部（展示结果第一条）
    this.setData({ scrollToView: 'result-anchor' });
    setTimeout(() => {
      this.setData({ searching: false });
    }, 600);
  },

  // ==================== 回到顶部 ====================

  // 监听滚动位置，决定是否显示回到顶部按钮
  onScroll(e) {
    const top = e.detail.scrollTop;
    this.setData({ showBackTop: top > 600 });
  },

  // 点击回到顶部
  goToTop() {
    this.setData({ scrollToView: '' });
    // 给筛选区第一个元素加个锚点，滚动到它
    setTimeout(() => {
      this.setData({ scrollToView: 'filter-top-anchor' });
    }, 50);
  },

  async refreshData() {
    // 清除缓存，确保拿到最新数据
    wx.removeStorageSync('channels_cache');
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
    const map = ['', 'blacklist', 'quality', 'hired'];
    const tag = map[idx] || '';
    this.setData({
      selectedTag: tag,
      selectedHired: tag === 'hired',
    });
    this.runProcessData();
  },

  // ==================== 年龄范围筛选 ====================

  onAgeMinInput(e) {
    this.setData({ selectedAgeMin: e.detail.value });
    if (this.data._searchTimer) clearTimeout(this.data._searchTimer);
    this.data._searchTimer = setTimeout(() => this.runProcessData(), 300);
  },

  onAgeMaxInput(e) {
    this.setData({ selectedAgeMax: e.detail.value });
    if (this.data._searchTimer) clearTimeout(this.data._searchTimer);
    this.data._searchTimer = setTimeout(() => this.runProcessData(), 300);
  },

  // ==================== 卖场经验筛选 ====================

  onKaTagSelect(e) {
    const tag = e.currentTarget.dataset.tag;
    let selected = [...this.data.selectedKaTags];
    const idx = selected.indexOf(tag);
    if (idx !== -1) {
      selected.splice(idx, 1);
    } else {
      selected.push(tag);
    }
    this.setData({ selectedKaTags: selected });
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

  goToSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  // ==================== 聘用（带时间区段）====================

  getHireIdentity() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const parts = [userInfo.province, userInfo.city, userInfo.position, userInfo.nickname].filter(Boolean);
    return parts.join(' · ') || '未知用户';
  },

  // 打开聘用弹窗 — 让用户选择聘用时间区段
  openHireModal(e) {
    const id = Number(e.currentTarget.dataset.id);
    const record = this.data.allData.find(item => item.id === id);
    if (!record) return;

    // 默认：起始日期=今天，结束日期=今天+3天
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const startDate = `${y}-${m}-${d}`;

    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 3);
    const ey = endDate.getFullYear();
    const em = String(endDate.getMonth() + 1).padStart(2, '0');
    const ed = String(endDate.getDate()).padStart(2, '0');
    const endDateStr = `${ey}-${em}-${ed}`;

    this.setData({
      hireModal: true,
      hireRecord: record,
      hireStartDate: startDate,
      hireEndDate: endDateStr,
    });
  },

  // 关闭聘用弹窗
  closeHireModal() {
    this.setData({
      hireModal: false,
      hireRecord: null,
      hireStartDate: '',
      hireEndDate: '',
    });
  },

  // 聘用起始日期变更
  onHireStartDateChange(e) {
    const startDate = e.detail.value;
    // 如果结束日期 < 新的起始日期，自动顺延结束日期
    let endDate = this.data.hireEndDate;
    if (endDate && endDate < startDate) {
      // 把结束日期设为起始日期+3天
      const sd = new Date(startDate);
      const ed = new Date(sd);
      ed.setDate(ed.getDate() + 3);
      const ey = ed.getFullYear();
      const em = String(ed.getMonth() + 1).padStart(2, '0');
      const edStr = String(ed.getDate()).padStart(2, '0');
      endDate = `${ey}-${em}-${edStr}`;
    }
    this.setData({ hireStartDate: startDate, hireEndDate: endDate });
  },

  // 聘用结束日期变更
  onHireEndDateChange(e) {
    const endDate = e.detail.value;
    const startDate = this.data.hireStartDate;
    if (endDate < startDate) {
      wx.showToast({ title: '结束日期不能早于开始日期', icon: 'none' });
      return;
    }
    this.setData({ hireEndDate: endDate });
  },

  // 确认聘用（带时间区段提交）
  async confirmHire() {
    const record = this.data.hireRecord;
    const hireStartDate = this.data.hireStartDate;
    const hireEndDate = this.data.hireEndDate;

    if (!record) return;
    if (!hireStartDate || !hireEndDate) {
      wx.showToast({ title: '请选择完整的聘用时间', icon: 'none' });
      return;
    }
    if (hireEndDate < hireStartDate) {
      wx.showToast({ title: '结束日期不能早于开始日期', icon: 'none' });
      return;
    }

    const hiredBy = this.getHireIdentity();

    wx.showLoading({ title: '聘用中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'channel',
        data: {
          action: 'hire',
          data: {
            id: record.id,
            hiredBy,
            hireStartDate,
            hireEndDate,
          },
        },
      });
      wx.hideLoading();
      if (res.result && res.result.success) {
        wx.showToast({ title: `已聘用 ${hireStartDate} ~ ${hireEndDate}` });
        this.closeHireModal();
        this.refreshData();
      } else {
        wx.showToast({ title: res.result?.message || '聘用失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '聘用失败', icon: 'none' });
    }
  },

  openUnhireModal(e) {
    const id = Number(e.currentTarget.dataset.id);
    const record = this.data.allData.find(item => item.id === id);
    this.setData({ unhireModal: true, unhireRecord: record, unhireComment: '' });
  },

  closeUnhireModal() {
    this.setData({ unhireModal: false, unhireRecord: null, unhireComment: '' });
  },

  onUnhireCommentInput(e) {
    this.setData({ unhireComment: e.detail.value });
  },

  async confirmUnhire() {
    const record = this.data.unhireRecord;
    const comment = this.data.unhireComment.trim();
    if (!record || !comment) {
      wx.showToast({ title: '请填写解聘评价', icon: 'none' });
      return;
    }

    const unhireBy = this.getHireIdentity();

    wx.showLoading({ title: '解聘中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'channel',
        data: { action: 'unhire', data: { id: record.id, comment, unhireBy } },
      });
      wx.hideLoading();
      if (res.result && res.result.success) {
        wx.showToast({ title: '已解聘' });
        this.closeUnhireModal();
        this.refreshData();
      } else {
        wx.showToast({ title: res.result?.message || '解聘失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '解聘失败', icon: 'none' });
    }
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
