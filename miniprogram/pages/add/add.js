// ============================================================
// 新增 / 编辑促销员页面
// ============================================================
// 这个页面既可以"新增"也可以"编辑"。
// 如果从首页点"添加"进来 → 新增模式
// 如果从管理页面点"编辑"进来 → 编辑模式（自动填好已有数据）
// ============================================================

// 导入省市区数据（全国省市区列表）
const { getProvinces, getCities, getDistricts } = require('../../utils/regions');
// 导入公共函数
const { getUserId, getAllChannels, getSettings } = require('../../utils/channel-service');

Page({
  // ============================================================
  // data：页面的所有数据
  // ============================================================
  data: {
    editMode: false,   // true=编辑模式，false=新增模式
    editId: null,       // 编辑模式下，要修改的记录的ID

    // 表单字段
    name: '',
    remark: '',
    cityList: [],
    districtList: [],
    provinceIndex: -1,
    cityIndex: -1,
    districtIndex: -1,
    province: '',
    city: '',
    district: '',
    street: '',
    phone: '',
    wechat: '',
    age: '',
    submitting: false,          // true=正在提交中（防止重复提交）
    showFormatGuide: false,     // true=显示导入格式说明

    // KA 系统经验标签（卖场经验）
    kaTagOptions: [
      '沃尔玛', '家乐福', '大润发', '永辉超市', '华润万家',
      '物美', '联华', '华联', '苏果', '欧尚',
      '麦德龙', '人人乐', '步步高', '盒马鲜生', '京东7鲜',
      '苏宁', '国美', '中百仓储', '红旗连锁', '家家悦',
      '利群', '永旺', '伊藤洋华堂', '山姆会员店', 'Costco',
      '便利店系统', '母婴系统', '其他',
    ],
    kaTags: [],              // 已选的卖场经验
    kaCustomInput: '',        // 自定义卖场输入框的值
    baseSalary: '',           // 底薪
    blacklisted: false,       // 是否黑名单
    quality: false,           // 是否优质

    // 搜索过滤（省市区搜索框）
    provinceSearchText: '',
    citySearchText: '',
    districtSearchText: '',
    filteredProvinceList: [],
    filteredCityList: [],
    filteredDistrictList: [],
  },

  // ============================================================
  // onLoad：页面加载时执行（只执行一次）
  // options：从上一个页面传过来的参数
  // ============================================================
  onLoad(options) {
    // 获取全国省份列表
    const provinceList = getProvinces();
    this.setData({
      provinceList,
      filteredProvinceList: provinceList,
      filteredCityList: [],
      filteredDistrictList: [],
    });

    // 如果传了 id 参数 → 编辑模式
    if (options.id) {
      // 检查有没有编辑权限
      const settings = getSettings();
      if (!settings.canEdit) {
        wx.showToast({ title: '无编辑权限', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
      // 加载要编辑的记录数据
      const editId = Number(options.id);
      this.loadEditRecord(editId);
    }
  },

  // ============================================================
  // loadEditRecord：编辑模式下加载已有数据
  // editId：要编辑的记录的ID
  // ============================================================
  async loadEditRecord(editId) {
    // 调用云函数获取这条记录的完整数据
    const { result } = await wx.cloud.callFunction({
      name: 'channel',
      data: { action: 'getRecord', data: { id: editId } },
    });

    const record = result && result.data;
    if (!record) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      return;
    }

    // 根据已有数据生成城市和区镇列表
    const cityList = getCities(record.province);
    const districtList = getDistricts(record.city);

    // 把记录数据填入表单
    this.setData({
      editMode: true,
      editId,
      name: record.name || '',
      remark: record.remark || '',
      kaTags: record.kaTags || [],
      baseSalary: record.baseSalary || '',
      blacklisted: record.blacklisted || false,
      quality: record.quality || false,
      province: record.province,
      city: record.city,
      district: record.district || '',
      street: record.street || '',
      phone: record.phone || '',
      wechat: record.wechat || '',
      age: record.age || '',
      provinceSearchText: record.province,
      citySearchText: record.city,
      districtSearchText: record.district || '',
      cityList,
      filteredCityList: cityList,
      districtList,
      filteredDistrictList: districtList,
    });
    // 修改页面标题
    wx.setNavigationBarTitle({ title: '编辑促销员' });
  },

  // ============================================================
  // 自动定位相关
  // ============================================================

  // autoLocate：获取用户当前位置，自动填写省市区
  autoLocate() {
    wx.showLoading({ title: '获取定位...' });
    // 先查一下是否有位置权限
    wx.getSetting({
      success: (res) => {
        wx.hideLoading();
        // 如果没有位置权限 → 弹窗请求
        if (!res.authSetting['scope.userLocation']) {
          wx.showModal({
            title: '需要位置权限',
            content: '自动定位需要获取您的位置信息，用于自动填写省份/城市/区镇。',
            confirmText: '允许定位',
            cancelText: '手动填写',
            success: (r) => {
              if (r.confirm) {
                // 用户点了"允许定位" → 发起权限申请
                wx.authorize({
                  scope: 'scope.userLocation',
                  success: () => this._chooseLocation(),   // 授权成功 → 打开地图
                  fail: () => {
                    // 授权被拒绝 → 引导去设置页开启
                    wx.showModal({
                      title: '无法获取定位',
                      content: '位置权限已被拒绝，请在设置中手动开启，或手动选择省份/城市。',
                      confirmText: '去设置',
                      cancelText: '取消',
                      success: (s) => {
                        if (s.confirm) wx.openSetting();
                      },
                    });
                  },
                });
              }
            },
          });
        } else {
          // 有权限 → 直接打开地图选点
          this._chooseLocation();
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '获取设置状态失败', icon: 'none' });
      },
    });
  },

  // _chooseLocation：打开微信地图选点
  _chooseLocation() {
    wx.showLoading({ title: '加载地图...' });
    wx.chooseLocation({
      success: (res) => {
        wx.hideLoading();
        if (!res.address) {
          wx.showToast({ title: '未能识别位置，请手动选择', icon: 'none' });
          return;
        }
        // 从地址字符串中解析出省市区
        this._parseAndFillAddress(res.address);
      },
      fail: (err) => {
        wx.hideLoading();
        if (!err.errMsg) return;
        if (err.errMsg.indexOf('cancel') !== -1) return;  // 用户取消
        if (err.errMsg.indexOf('fail') !== -1) {
          wx.showModal({
            title: '定位失败',
            content: '无法打开地图选点，请确保手机已开启定位服务，或手动填写位置信息。',
            confirmText: '知道了',
            showCancel: false,
          });
          return;
        }
        wx.showToast({ title: '选点失败，请手动填写', icon: 'none' });
      },
    });
  },

  // _parseAndFillAddress：从地址字符串中解析省市区
  // 比如 "广东省深圳市南山区粤海街道科技园" → 省=广东省、市=深圳市、区=南山区
  _parseAndFillAddress(address) {
    const provinceList = this.data.provinceList;

    // 匹配省份：用最长的优先匹配（因为"湖南"可能包含在"湖北"中）
    let matchedProvince = '';
    const sortedProvinces = [...provinceList].sort((a, b) => b.length - a.length);
    for (const p of sortedProvinces) {
      if (address.indexOf(p) !== -1) {
        matchedProvince = p;
        break;
      }
    }
    if (!matchedProvince) {
      wx.showToast({ title: '未能识别省份，请手动选择', icon: 'none' });
      return;
    }

    // 匹配城市
    const cityList = getCities(matchedProvince);
    let matchedCity = '';
    const sortedCities = [...cityList].sort((a, b) => b.length - a.length);
    for (const c of sortedCities) {
      const cityName = c.replace('市', '');
      if (address.indexOf(cityName) !== -1 || address.indexOf(c) !== -1) {
        matchedCity = c;
        break;
      }
    }
    if (!matchedCity) {
      // 直辖市特殊处理（北京、天津、上海、重庆的城市名和省名一样）
      if (['北京市', '天津市', '上海市', '重庆市'].indexOf(matchedProvince) !== -1) {
        matchedCity = matchedProvince;
      } else {
        wx.showToast({ title: '未能识别城市，请手动选择', icon: 'none' });
        return;
      }
    }

    // 匹配区/镇
    const districtList = getDistricts(matchedCity);
    let matchedDistrict = '';
    const sortedDistricts = [...districtList].sort((a, b) => b.length - a.length);
    for (const d of sortedDistricts) {
      if (address.indexOf(d) !== -1) {
        matchedDistrict = d;
        break;
      }
    }

    // 剩下的地址作为街道
    let street = address;
    if (matchedProvince) street = street.replace(matchedProvince, '');
    if (matchedCity) street = street.replace(matchedCity, '').replace('市', '');
    if (matchedDistrict) street = street.replace(matchedDistrict, '');
    street = street.trim();

    // 更新页面数据
    const newCityList = getCities(matchedProvince);
    const newDistrictList = getDistricts(matchedCity);

    this.setData({
      province: matchedProvince,
      provinceSearchText: matchedProvince,
      parsedProvince: true,
      city: matchedCity,
      citySearchText: matchedCity,
      cityList: newCityList,
      filteredCityList: newCityList,
      district: matchedDistrict,
      districtSearchText: matchedDistrict,
      districtList: newDistrictList,
      filteredDistrictList: newDistrictList,
      street: street || this.data.street,
    });

    wx.showToast({ title: '已自动填写位置', icon: 'success' });
  },

  // ============================================================
  // 微信号智能检测（聚焦输入框时检测剪贴板）
  // ============================================================
  onWechatFocus() {
    // 如果已经填了微信号，就不检测了
    if (this.data.wechat) return;

    // 读取剪贴板内容
    wx.getClipboardData({
      success: (res) => {
        const text = (res.data || '').trim();
        // 微信号的正则：字母开头，5-19位字母数字下划线
        const wechatRegex = /^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/;

        // 如果剪贴板内容看起来像微信号 → 询问用户是否使用
        if (text && wechatRegex.test(text)) {
          wx.showModal({
            title: '检测到微信号',
            content: `剪贴板中内容「${text}」看起来像微信号，是否使用？`,
            confirmText: '使用',
            cancelText: '取消',
            success: (r) => {
              if (r.confirm) {
                this.setData({ wechat: text });
              }
            },
          });
        }
      },
      fail: () => {},
    });
  },

  // ============================================================
  // KA 系统经验标签（卖场经验选择器）
  // ============================================================

  // toggleKaTag：点击预设标签，切换选中/取消
  toggleKaTag(e) {
    const tag = e.currentTarget.dataset.tag;
    const kaTags = [...this.data.kaTags];
    const idx = kaTags.indexOf(tag);
    if (idx !== -1) {
      kaTags.splice(idx, 1);  // 已有 → 移除
    } else {
      kaTags.push(tag);       // 没有 → 添加
    }
    this.setData({ kaTags });
  },

  // 自定义卖场输入框内容变化时
  onKaCustomInput(e) {
    this.setData({ kaCustomInput: e.detail.value });
  },

  // 添加自定义卖场标签
  addKaCustomTag() {
    const tag = this.data.kaCustomInput.trim();
    if (!tag) return;
    const kaTags = [...this.data.kaTags];
    if (!kaTags.includes(tag)) {
      kaTags.push(tag);
    }
    this.setData({ kaTags, kaCustomInput: '' });
  },

  // 删除一个已选的卖场标签
  removeKaTag(e) {
    const tag = e.currentTarget.dataset.tag;
    const kaTags = this.data.kaTags.filter(t => t !== tag);
    this.setData({ kaTags });
  },

  // ============================================================
  // 省份/城市/区镇 搜索和选择
  // ============================================================

  // 省份搜索框输入
  onProvinceSearch(e) {
    const text = e.detail.value;
    const filtered = this.data.provinceList.filter(p => p.indexOf(text) !== -1);
    this.setData({
      provinceSearchText: text,
      filteredProvinceList: filtered,
      province: '', provinceIndex: -1,
      city: '', cityIndex: -1, cityList: [], filteredCityList: [], citySearchText: '',
      district: '', districtIndex: -1, districtList: [], filteredDistrictList: [], districtSearchText: '',
    });
  },

  // 城市搜索框输入
  onCitySearch(e) {
    const text = e.detail.value;
    const filtered = this.data.cityList.filter(c => c.indexOf(text) !== -1);
    this.setData({
      citySearchText: text,
      filteredCityList: filtered,
      city: '', cityIndex: -1,
      district: '', districtIndex: -1, districtList: [], filteredDistrictList: [], districtSearchText: '',
    });
  },

  // 区镇搜索框输入
  onDistrictSearch(e) {
    const text = e.detail.value;
    const filtered = this.data.districtList.filter(d => d.indexOf(text) !== -1);
    this.setData({
      districtSearchText: text,
      filteredDistrictList: filtered,
      district: '', districtIndex: -1,
    });
  },

  // 点击省份标签
  onProvinceTabTap(e) {
    const value = e.currentTarget.dataset.value;
    const idx = this.data.provinceList.indexOf(value);
    if (idx >= 0) this.onProvinceChange({ detail: { value: idx } });
  },

  // 点击城市标签
  onCityTabTap(e) {
    const value = e.currentTarget.dataset.value;
    const idx = this.data.cityList.indexOf(value);
    if (idx >= 0) this.onCityChange({ detail: { value: idx } });
  },

  // 点击区镇标签
  onDistrictTabTap(e) {
    const value = e.currentTarget.dataset.value;
    const idx = this.data.districtList.indexOf(value);
    if (idx >= 0) this.onDistrictChange({ detail: { value: idx } });
  },

  // picker 选择省份
  onProvinceChange(e) {
    const index = parseInt(e.detail.value, 10);
    const province = this.data.provinceList[index];
    const cityList = getCities(province);
    this.setData({
      provinceIndex: index, province,
      provinceSearchText: province, filteredProvinceList: this.data.provinceList,
      city: '', cityIndex: -1, cityList, filteredCityList: cityList, citySearchText: '',
      district: '', districtIndex: -1, districtList: [], filteredDistrictList: [], districtSearchText: '',
    });
  },

  // picker 选择城市
  onCityChange(e) {
    const index = parseInt(e.detail.value, 10);
    const city = this.data.cityList[index];
    const districtList = getDistricts(city);
    this.setData({
      cityIndex: index, city,
      citySearchText: city, filteredCityList: this.data.cityList,
      district: '', districtIndex: -1, districtList, filteredDistrictList: districtList, districtSearchText: '',
    });
  },

  // picker 选择区镇
  onDistrictChange(e) {
    const index = parseInt(e.detail.value, 10);
    this.setData({
      districtIndex: index,
      district: this.data.districtList[index],
      districtSearchText: this.data.districtList[index],
      filteredDistrictList: this.data.districtList,
    });
  },

  // ============================================================
  // 工具：跳转到批量导入页 / 显示格式说明
  // ============================================================
  goToImport() {
    wx.navigateTo({ url: '/pages/import/import' });
  },
  toggleFormatGuide() {
    this.setData({ showFormatGuide: !this.data.showFormatGuide });
  },

  // ============================================================
  // 内部标记：黑名单 / 优质
  // ============================================================
  toggleBlacklist() {
    this.setData({ blacklisted: !this.data.blacklisted });
  },
  toggleQuality() {
    this.setData({ quality: !this.data.quality });
  },

  // ============================================================
  // 通用输入事件：所有的输入框都通过这个函数更新数据
  // ============================================================
  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [field]: e.detail.value });
  },

  // ============================================================
  // submit：提交表单（新增或保存修改）
  // ============================================================
  async submit() {
    const { name, province, city, phone } = this.data;

    // 第一步：校验必填字段
    if (!name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }
    if (!province) {
      wx.showToast({ title: '请选择省份', icon: 'none' });
      return;
    }
    if (!city) {
      wx.showToast({ title: '请选择城市', icon: 'none' });
      return;
    }
    if (!this.data.district) {
      wx.showToast({ title: '请选择区/镇', icon: 'none' });
      return;
    }

    // 第二步：手机号格式验证（非空时才校验）
    if (phone && phone.trim() !== '') {
      if (!/^1[3-9]\d{9}$/.test(phone.trim())) {
        wx.showToast({ title: '请输入正确的11位手机号', icon: 'none' });
        return;
      }
    }

    // 第三步：微信号长度验证（非空时才校验）
    const wechat = this.data.wechat;
    if (wechat && wechat.trim() !== '') {
      if (wechat.trim().length < 6) {
        wx.showToast({ title: '微信号长度至少6位', icon: 'none' });
        return;
      }
    }

    // 第四步：设置为提交中（禁用按钮，防止重复提交）
    this.setData({ submitting: true });

    try {
      if (this.data.editMode) {
        // 编辑模式 → 调用 update 操作
        await wx.cloud.callFunction({
          name: 'channel',
          data: {
            action: 'update',
            data: {
              id: this.data.editId,
              name: name.trim(), province, city,
              district: this.data.district, street: this.data.street.trim(),
              phone: phone.trim(), wechat: wechat.trim(), age: this.data.age.trim(),
              remark: this.data.remark.trim(), kaTags: this.data.kaTags,
              baseSalary: this.data.baseSalary,
              blacklisted: this.data.blacklisted, quality: this.data.quality,
            },
          },
        });
        wx.showToast({ title: '保存成功', icon: 'success' });
      } else {
        // 新增模式 → 先计算序号，再调用 add 操作
        const currentUserId = await getUserId();
        const userInfo = wx.getStorageSync('userInfo') || {};

        // 计算同一省份内的最大序号，新序号 = 最大序号 + 1
        const allData = await getAllChannels();
        const sameProvince = allData.filter((item) => item.province === province);
        const maxSn = sameProvince.length > 0
          ? Math.max(...sameProvince.map((item) => item.sn || 0))
          : 0;

        await wx.cloud.callFunction({
          name: 'channel',
          data: {
            action: 'add',
            data: {
              sn: maxSn + 1,
              name: name.trim(), province, city,
              district: this.data.district, street: this.data.street.trim(),
              phone: phone.trim(), wechat: wechat.trim(), age: this.data.age.trim(),
              remark: this.data.remark.trim(), kaTags: this.data.kaTags,
              baseSalary: this.data.baseSalary,
              recorderUserId: currentUserId,
              recorderNickname: userInfo.nickname || '',
              recorderPosition: userInfo.position || '',
              recorderProvince: userInfo.province || userInfo.region || '',
              recorderCity: userInfo.city || '',
              creatorUserId: currentUserId,
            },
          },
        });

        wx.showToast({ title: '添加成功', icon: 'success' });
      }

      // 提交成功后返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      console.error('提交失败', err);
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    } finally {
      // 不管成功还是失败，都解除提交状态
      this.setData({ submitting: false });
    }
  },
});
