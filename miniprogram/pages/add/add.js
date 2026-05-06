const { getProvinces, getCities, getDistricts } = require('../../utils/regions');

Page({
  data: {
    provinceList: [],
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
    submitting: false,

    // 搜索 & 过滤
    provinceSearchText: '',
    citySearchText: '',
    districtSearchText: '',
    filteredProvinceList: [],
    filteredCityList: [],
    filteredDistrictList: [],
  },

  onLoad() {
    const provinceList = getProvinces();
    this.setData({
      provinceList,
      filteredProvinceList: provinceList,
      filteredCityList: [],
      filteredDistrictList: [],
    });
  },

  // ---- 省份搜索过滤 ----
  onProvinceSearch(e) {
    const text = e.detail.value;
    const filtered = this.data.provinceList.filter(p => p.indexOf(text) !== -1);
    this.setData({
      provinceSearchText: text,
      filteredProvinceList: filtered,
      province: '',
      provinceIndex: -1,
      city: '',
      cityIndex: -1,
      cityList: [],
      filteredCityList: [],
      citySearchText: '',
      district: '',
      districtIndex: -1,
      districtList: [],
      filteredDistrictList: [],
      districtSearchText: '',
    });
  },

  // ---- 城市搜索过滤 ----
  onCitySearch(e) {
    const text = e.detail.value;
    const filtered = this.data.cityList.filter(c => c.indexOf(text) !== -1);
    this.setData({
      citySearchText: text,
      filteredCityList: filtered,
      city: '',
      cityIndex: -1,
      district: '',
      districtIndex: -1,
      districtList: [],
      filteredDistrictList: [],
      districtSearchText: '',
    });
  },

  // ---- 区/镇搜索过滤 ----
  onDistrictSearch(e) {
    const text = e.detail.value;
    const filtered = this.data.districtList.filter(d => d.indexOf(text) !== -1);
    this.setData({
      districtSearchText: text,
      filteredDistrictList: filtered,
      district: '',
      districtIndex: -1,
    });
  },

  // ---- 省份 Tab 点击 ----
  onProvinceTabTap(e) {
    const value = e.currentTarget.dataset.value;
    const idx = this.data.provinceList.indexOf(value);
    if (idx >= 0) this.onProvinceChange({ detail: { value: idx } });
  },

  // ---- 城市 Tab 点击 ----
  onCityTabTap(e) {
    const value = e.currentTarget.dataset.value;
    const idx = this.data.cityList.indexOf(value);
    if (idx >= 0) this.onCityChange({ detail: { value: idx } });
  },

  // ---- 区/镇 Tab 点击 ----
  onDistrictTabTap(e) {
    const value = e.currentTarget.dataset.value;
    const idx = this.data.districtList.indexOf(value);
    if (idx >= 0) this.onDistrictChange({ detail: { value: idx } });
  },

  // ---- 省份选择 ----
  onProvinceChange(e) {
    const index = parseInt(e.detail.value, 10);
    const province = this.data.provinceList[index];
    const cityList = getCities(province);
    this.setData({
      provinceIndex: index,
      province,
      provinceSearchText: province,
      filteredProvinceList: this.data.provinceList,
      city: '',
      cityIndex: -1,
      cityList,
      filteredCityList: cityList,
      citySearchText: '',
      district: '',
      districtIndex: -1,
      districtList: [],
      filteredDistrictList: [],
      districtSearchText: '',
    });
  },

  // ---- 城市选择 ----
  onCityChange(e) {
    const index = parseInt(e.detail.value, 10);
    const city = this.data.cityList[index];
    const districtList = getDistricts(city);
    this.setData({
      cityIndex: index,
      city,
      citySearchText: city,
      filteredCityList: this.data.cityList,
      district: '',
      districtIndex: -1,
      districtList,
      filteredDistrictList: districtList,
      districtSearchText: '',
    });
  },

  // ---- 区/镇选择 ----
  onDistrictChange(e) {
    const index = parseInt(e.detail.value, 10);
    this.setData({
      districtIndex: index,
      district: this.data.districtList[index],
      districtSearchText: this.data.districtList[index],
      filteredDistrictList: this.data.districtList,
    });
  },

  // ---- 文本输入 ----
  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [field]: e.detail.value });
  },

  // ---- 提交 ----
  submit() {
    const { province, city, phone } = this.data;

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

    this.setData({ submitting: true });

    const channels = wx.getStorageSync('channels') || [];
    const sameProvince = channels.filter((item) => item.province === province);
    const maxSn = sameProvince.length > 0
      ? Math.max(...sameProvince.map((item) => item.sn || 0))
      : 0;

    const newRecord = {
      id: Date.now(),
      province,
      city,
      district: this.data.district,
      street: this.data.street.trim(),
      phone: phone.trim(),
      wechat: this.data.wechat.trim(),
      sn: maxSn + 1,
      likes: [],
      comments: [],
      promoters: [],
    };

    channels.push(newRecord);
    wx.setStorageSync('channels', channels);

    wx.showToast({ title: '添加成功', icon: 'success' });
    setTimeout(() => {
      wx.navigateBack();
    }, 1500);
  },
});
