// ============================================================
// 查询页 — 搜索条件表单
// 输入完搜索条件后，跳转到结果页
// ============================================================

const { getProvinces, getCities, getDistricts } = require('../../utils/regions');
const { getUserId, getAllChannels, getSettings } = require('../../utils/channel-service');

Page({
  data: {
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
    selectedStreet: '',

    // 权限
    canAdd: true,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '查询促销员' });
  },

  async onShow() {
    const settings = getSettings();
    this.setData({ canAdd: settings.canAdd });
    this.initFilters();
  },

  async initFilters() {
    const provinces = ['全部省份', ...getProvinces()];
    this.setData({
      provinces,
      displayProvinces: provinces,
    });
  },

  // ==================== 搜索 ====================

  onSearchIconTap() {
    this.setData({ searchFocused: true });
  },

  onSearchBlur() {
    this.setData({ searchFocused: false });
  },

  onSearchInput(e) {
    const value = e.detail ? e.detail.value : (e.currentTarget.dataset.value || '');
    this.setData({ searchText: value });
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
  },

  onDistrictFilterSearch(e) {
    const text = e.detail.value;
    const filtered = this.data.districts.filter(d => d.indexOf(text) !== -1);
    this.setData({ districtFilterSearchText: text, displayDistricts: filtered });
  },

  onDistrictSelect(e) {
    const district = e.currentTarget.dataset.value;
    this.setData({ selectedDistrict: district, selectedStreet: '' });
  },

  onStreetInput(e) {
    this.setData({ selectedStreet: e.detail.value });
  },

  onTagSelect(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const map = ['', 'blacklist', 'quality'];
    this.setData({ selectedTag: map[idx] || '' });
  },

  onSortTabTap(e) {
    this.setData({ sortIndex: parseInt(e.currentTarget.dataset.index, 10) });
  },

  // ==================== 提交搜索 ====================

  submitSearch() {
    const params = [
      `searchText=${encodeURIComponent(this.data.searchText)}`,
      `province=${encodeURIComponent(this.data.selectedProvince)}`,
      `city=${encodeURIComponent(this.data.selectedCity)}`,
      `district=${encodeURIComponent(this.data.selectedDistrict)}`,
      `street=${encodeURIComponent(this.data.selectedStreet)}`,
      `sort=${this.data.sortIndex}`,
      `tag=${encodeURIComponent(this.data.selectedTag)}`,
    ].join('&');

    wx.navigateTo({ url: `/pages/query-results/query-results?${params}` });
  },

  // ==================== 导航 ====================

  goToAdd() {
    wx.navigateTo({ url: '/pages/add/add' });
  },
});
