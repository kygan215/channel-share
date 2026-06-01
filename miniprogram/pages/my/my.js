// ============================================================
// "我的"页面 — 个人中心
// ============================================================
// 这个页面负责：
//   1. 创建账号（填写昵称、职位、所属区域）
//   2. 修改头像/昵称/职位/区域
//   3. 退出登录
//   4. 注销账号（永久删除）
//   5. 跳转到设置/关于页面
// ============================================================

// 导入省市区数据
const { getProvinces, getCities, getDistricts } = require('../../utils/regions');

Page({
  // ============================================================
  // data：页面数据
  // ============================================================
  data: {
    // 当前登录状态
    isLoggedIn: false,      // true=已创建账号
    openid: '',
    nickname: '',
    avatarUrl: '',
    position: '',
    region: '',
    province: '',
    city: '',
    district: '',

    // 创建账号表单
    showSetup: false,         // true=显示创建账号弹窗
    setupNickname: '',         // 昵称输入
    setupAvatarUrl: '',        // 头像
    setupPosition: '',         // 职位输入
    setupRegion: '',           // 省份选择
    setupProvinceList: [],      // 省份列表
    setupProvinceIndex: -1,
    setupCity: '', setupDistrict: '',
    setupCityList: [], setupDistrictList: [],
    setupCityIndex: -1, setupDistrictIndex: -1,

    // 编辑职位 / 区域弹窗
    showEditPosition: false,
    editPositionValue: '',
    showEditRegion: false,
    editRegionList: [], editRegionIndex: -1, editRegionValue: '',
    editCityValue: '', editDistrictValue: '',
    editCityList: [], editDistrictList: [],
    editCityIndex: -1, editDistrictIndex: -1,

    // 注销账号弹窗
    showDeleteAccount: false,
  },

  // ============================================================
  // onLoad：页面加载时执行（只执行一次）
  // ============================================================
  onLoad() {
    // 获取省份列表供创建账号时选择
    const provinceList = getProvinces();
    this.setData({ setupProvinceList: provinceList, editRegionList: provinceList });
  },

  // ============================================================
  // onShow：每次页面显示时执行
  // ============================================================
  onShow() {
    this.loadUserInfo();
  },

  // loadUserInfo：从本地存储加载用户信息
  loadUserInfo() {
    // 从本地读取之前保存的用户信息
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({
      isLoggedIn: !!userInfo.openid,  // 有 openid 说明已创建账号
      openid: userInfo.openid || '',
      nickname: userInfo.nickname || '',
      avatarUrl: userInfo.avatarUrl || '',
      position: userInfo.position || '',
      region: userInfo.region || '',
      province: userInfo.province || userInfo.region || '',
      city: userInfo.city || '',
      district: userInfo.district || '',
    });
  },

  // saveUserInfo：把用户信息存到本地并刷新页面
  saveUserInfo(userInfo) {
    wx.setStorageSync('userInfo', userInfo);
    this.loadUserInfo();
  },

  // ============================================================
  // 创建账号流程
  // ============================================================

  // startCreateAccount：打开创建账号弹窗
  startCreateAccount() {
    this.setData({
      showSetup: true,
      setupNickname: '', setupAvatarUrl: '', setupPosition: '', setupRegion: '',
      setupProvinceIndex: -1, setupCity: '', setupDistrict: '',
      setupCityList: [], setupDistrictList: [],
      setupCityIndex: -1, setupDistrictIndex: -1,
    });
  },

  // cancelCreateAccount：取消创建
  cancelCreateAccount() {
    this.setData({ showSetup: false });
  },

  // 选择头像（微信头像组件）
  onChooseAvatar(e) {
    this.setData({ setupAvatarUrl: e.detail.avatarUrl });
  },

  // 昵称输入
  onSetupNicknameInput(e) {
    this.setData({ setupNickname: e.detail.value });
  },
  onSetupNicknameBlur(e) {
    if (e.detail.value && !this.data.setupNickname) {
      this.setData({ setupNickname: e.detail.value });
    }
  },

  // 职位输入
  onSetupPositionInput(e) {
    this.setData({ setupPosition: e.detail.value });
  },

  // 省份选择器变化
  onSetupRegionChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const province = this.data.setupProvinceList[idx];
    const cityList = getCities(province);
    this.setData({
      setupProvinceIndex: idx, setupRegion: province,
      setupCityList: cityList, setupCityIndex: -1, setupCity: '',
      setupDistrictList: [], setupDistrictIndex: -1, setupDistrict: '',
    });
  },

  // 城市选择器变化
  onSetupCityChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const city = this.data.setupCityList[idx];
    const districtList = getDistricts(city);
    this.setData({
      setupCityIndex: idx, setupCity: city,
      setupDistrictList: districtList, setupDistrictIndex: -1, setupDistrict: '',
    });
  },

  // 区镇选择器变化
  onSetupDistrictChange(e) {
    const idx = parseInt(e.detail.value, 10);
    this.setData({
      setupDistrictIndex: idx,
      setupDistrict: this.data.setupDistrictList[idx],
    });
  },

  // confirmCreateAccount：确认创建账号
  async confirmCreateAccount() {
    // 校验：昵称必填
    const nickname = this.data.setupNickname.trim();
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    // 校验：职位必填
    const position = this.data.setupPosition.trim();
    if (!position) {
      wx.showToast({ title: '请输入职位', icon: 'none' });
      return;
    }
    // 校验：省份必选
    const province = this.data.setupRegion;
    if (!province) {
      wx.showToast({ title: '请选择省份', icon: 'none' });
      return;
    }

    // 获取或初始化 openid
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

    // 收集表单数据
    const avatarUrl = this.data.setupAvatarUrl || '';
    const city = this.data.setupCity;
    const district = this.data.setupDistrict;

    // 保存到本地
    this.saveUserInfo({
      openid, nickname, avatarUrl, position,
      region: province, province, city, district,
    });
    this.setData({ showSetup: false });
    wx.showToast({ title: '账号创建成功', icon: 'success' });
  },

  // ============================================================
  // 修改头像（上传到微信云存储）
  // ============================================================
  changeAvatar() {
    wx.chooseImage({
      count: 1,                         // 只选一张
      sizeType: ['compressed'],          // 压缩图
      sourceType: ['album', 'camera'],   // 相册或相机
      success: async (res) => {
        const tempPath = res.tempFilePaths[0];
        wx.showLoading({ title: '上传中...' });
        try {
          // 上传到云存储，路径为 avatars/时间戳_随机字符.jpg
          const cloudPath = `avatars/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: tempPath,
          });
          const fileID = uploadRes.fileID;
          // 更新本地存储中的头像地址
          const currentInfo = wx.getStorageSync('userInfo') || {};
          currentInfo.avatarUrl = fileID;
          wx.setStorageSync('userInfo', currentInfo);
          this.setData({ avatarUrl: fileID });
          wx.hideLoading();
          wx.showToast({ title: '头像已更新', icon: 'success' });
        } catch (err) {
          wx.hideLoading();
          console.error('头像上传失败', err);
          wx.showToast({ title: '上传失败，请重试', icon: 'none' });
        }
      },
    });
  },

  // ============================================================
  // 修改昵称
  // ============================================================
  editNickname() {
    wx.showModal({
      title: '修改昵称',
      content: ' ',
      confirmText: '确定',
      editable: true,  // 可编辑的弹窗
      placeholderText: this.data.nickname || '输入新昵称',
      success: (r) => {
        if (r.confirm && r.content.trim()) {
          // 更新本地存储
          const currentInfo = wx.getStorageSync('userInfo') || {};
          currentInfo.nickname = r.content.trim();
          wx.setStorageSync('userInfo', currentInfo);
          this.setData({ nickname: r.content.trim() });
          wx.showToast({ title: '昵称已更新', icon: 'success' });
        }
      },
    });
  },

  // ============================================================
  // 修改职位
  // ============================================================
  editPosition() {
    wx.showModal({
      title: '修改职位',
      content: ' ',
      confirmText: '确定',
      editable: true,
      placeholderText: this.data.position || '输入你的职位',
      success: (r) => {
        if (r.confirm && r.content.trim()) {
          const val = r.content.trim();
          const currentInfo = wx.getStorageSync('userInfo') || {};
          currentInfo.position = val;
          wx.setStorageSync('userInfo', currentInfo);
          this.setData({ position: val });
          wx.showToast({ title: '职位已更新', icon: 'success' });
        } else if (r.confirm) {
          wx.showToast({ title: '职位不能为空', icon: 'none' });
        }
      },
    });
  },

  // ============================================================
  // 修改区域（省市区）
  // ============================================================

  // showEditRegion：打开修改区域弹窗
  showEditRegion() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const province = userInfo.province || userInfo.region || '';
    const city = userInfo.city || '';
    const district = userInfo.district || '';
    const cityList = province ? getCities(province) : [];
    const districtList = city ? getDistricts(city) : [];
    this.setData({
      showEditRegion: true,
      editRegionIndex: this.data.editRegionList.indexOf(province),
      editRegionValue: province,
      editCityList: cityList,
      editCityIndex: cityList.indexOf(city),
      editCityValue: city,
      editDistrictList: districtList,
      editDistrictIndex: districtList.indexOf(district),
      editDistrictValue: district,
    });
  },

  // 省份选择变化
  onEditRegionChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const province = this.data.editRegionList[idx];
    const cityList = getCities(province);
    this.setData({
      editRegionIndex: idx, editRegionValue: province,
      editCityList: cityList, editCityIndex: -1, editCityValue: '',
      editDistrictList: [], editDistrictIndex: -1, editDistrictValue: '',
    });
  },

  // 城市选择变化
  onEditCityChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const city = this.data.editCityList[idx];
    const districtList = getDistricts(city);
    this.setData({
      editCityIndex: idx, editCityValue: city,
      editDistrictList: districtList, editDistrictIndex: -1, editDistrictValue: '',
    });
  },

  // 区镇选择变化
  onEditDistrictChange(e) {
    const idx = parseInt(e.detail.value, 10);
    this.setData({
      editDistrictIndex: idx,
      editDistrictValue: this.data.editDistrictList[idx],
    });
  },

  // confirmEditRegion：保存区域修改
  confirmEditRegion() {
    const province = this.data.editRegionValue;
    const city = this.data.editCityValue;
    const district = this.data.editDistrictValue;
    const currentInfo = wx.getStorageSync('userInfo') || {};
    currentInfo.region = province;
    currentInfo.province = province;
    currentInfo.city = city;
    currentInfo.district = district;
    wx.setStorageSync('userInfo', currentInfo);
    this.setData({
      region: province, province, city, district,
      showEditRegion: false,
    });
    wx.showToast({ title: province ? '区域已更新' : '区域已清除', icon: 'success' });
  },

  // cancelEditRegion：取消区域修改
  cancelEditRegion() {
    this.setData({ showEditRegion: false });
  },

  // ============================================================
  // 退出登录
  // ============================================================
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmText: '退出',
      confirmColor: '#e64340',   // 红色按钮
      success: (res) => {
        if (res.confirm) {
          // 清除本地用户信息
          wx.removeStorageSync('userInfo');
          this.loadUserInfo();
          wx.showToast({ title: '已退出', icon: 'success' });
        }
      },
    });
  },

  // ============================================================
  // 注销账号（永久删除）
  // ============================================================

  // showDeleteAccount：打开注销确认弹窗
  showDeleteAccount() {
    this.setData({ showDeleteAccount: true });
  },

  // cancelDeleteAccount：取消注销
  cancelDeleteAccount() {
    this.setData({ showDeleteAccount: false });
  },

  // confirmDeleteAccount：确认注销
  // 调用云函数删除 users 和 whitelist_users 中的记录
  async confirmDeleteAccount() {
    wx.showModal({
      title: '注销账号',
      content: '此操作不可恢复',     // 红色警告
      confirmText: '确认注销',
      confirmColor: '#e64340',
      success: async (res) => {
        if (res.confirm) {
          try {
            // 调用云函数执行注销
            wx.showLoading({ title: '处理中...' });
            await wx.cloud.callFunction({
              name: 'channel',
              data: { action: 'deleteAccount' },
            });
            wx.hideLoading();
            // 清除所有本地数据
            wx.removeStorageSync('userInfo');
            wx.removeStorageSync('_openid');
            wx.removeStorageSync('channels_cache');
            wx.removeStorageSync('privacy_agreed');
            this.setData({ showDeleteAccount: false });
            wx.showToast({ title: '账号已注销', icon: 'success' });
            // 刷新页面（显示未登录状态）
            setTimeout(() => {
              this.loadUserInfo();
            }, 1500);
          } catch (err) {
            wx.hideLoading();
            console.error('注销账号失败', err);
            wx.showToast({ title: '注销失败，请重试', icon: 'none' });
          }
        }
      },
    });
  },

  // ============================================================
  // 页面跳转
  // ============================================================
  goToSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },
  goToAbout() {
    wx.navigateTo({ url: '/pages/about/about' });
  },
});
