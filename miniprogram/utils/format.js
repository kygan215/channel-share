// ============================================================
// 数据格式化 & 处理工具
// ============================================================

// 标准化标签数组
function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean);
  if (typeof tags === 'string') {
    return tags.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

// 获取健康证状态文本
function getHealthCertText(healthCert) {
  const status = healthCert && healthCert.status;
  if (status === 'approved') return '已认证';
  if (status === 'pending') return '待审核';
  if (status === 'rejected') return '未通过';
  return '未上传';
}

// 获取最近一次聘用信息
function getLatestHireInfo(item, hireHistory) {
  const latest = hireHistory.length ? hireHistory[hireHistory.length - 1] : {};
  return {
    hiredBy: item.hiredBy || latest.hiredBy || '',
    hiredAt: item.hiredAt || latest.hiredAt || '',
    unhireAt: latest.unhireAt || '',
    comment: latest.comment || '',
  };
}

// ============================================================
// 核心：数据筛选、排序、分组
// ============================================================
function processData(options) {
  const {
    allData, searchText,
    selectedProvince, selectedCity, selectedDistrict, selectedStreet,
    selectedTag,
    sortIndex, sortOptions,
    currentUserId,
  } = options;

  // ── 关键词搜索 ──
  let filtered = allData.filter((item) => {
    if (!searchText) return true;
    const keywords = searchText.toLowerCase().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return true;
    const kaTags = normalizeTags(item.kaTags);
    const healthCertText = getHealthCertText(item.healthCert);
    const searchableText = [
      item.sn, item.name, item.province, item.city, item.district,
      item.street, item.phone, item.wechat, item.age, item.remark,
      item.baseSalary, item.recorderNickname, item.recorderPosition,
      item.blacklisted ? '黑名单' : '',
      item.quality ? '优质 优质临促' : '',
      item.hired ? '合作中 聘用中' : '',
      healthCertText,
      kaTags.join(' '),
    ].filter((v) => v !== undefined && v !== null).join(' ').toLowerCase();
    return keywords.every((kw) => searchableText.indexOf(kw) !== -1);
  });

  // ── 地区筛选 ──
  if (selectedProvince && selectedProvince !== '全部省份') {
    filtered = filtered.filter((item) => item.province === selectedProvince);
  }
  if (selectedCity && selectedCity !== '全部城市') {
    filtered = filtered.filter((item) => item.city === selectedCity);
  }
  if (selectedDistrict && selectedDistrict !== '全部区镇') {
    filtered = filtered.filter((item) => item.district === selectedDistrict);
  }
  if (selectedStreet) {
    const streetKw = selectedStreet.toLowerCase();
    filtered = filtered.filter((item) => (item.street || '').toLowerCase().indexOf(streetKw) !== -1);
  }

  // ── 标签筛选 ──
  if (selectedTag === 'blacklist') {
    filtered = filtered.filter((item) => item.blacklisted);
  } else if (selectedTag === 'quality') {
    filtered = filtered.filter((item) => item.quality);
  }

  // ── 排序 ──
  const sortMode = sortOptions[sortIndex];
  if (sortMode === '序号降序') {
    filtered.sort((a, b) => (b.sn || 0) - (a.sn || 0));
  } else {
    filtered.sort((a, b) => (a.sn || 0) - (b.sn || 0));
  }

  // ── 增强数据（附加展示字段） ──
  filtered = filtered.map((item) => {
    const hireHistory = Array.isArray(item.hireHistory) ? item.hireHistory : [];
    const hasComments = (item.comments || []).length > 0;
    const hasHistory = hireHistory.length > 0 || item.hired || hasComments;
    const hireStatus = hasHistory ? 'hired_before' : 'none';
    const kaTags = normalizeTags(item.kaTags);
    const latestHire = getLatestHireInfo(item, hireHistory);
    const detailTags = [];
    if (item.age) detailTags.push(`年龄 ${item.age}岁`);
    if (kaTags.length > 0) detailTags.push(`卖场 ${kaTags.length}项`);
    if (item.baseSalary) detailTags.push(`底薪 ${item.baseSalary}元/天`);
    if (item.blacklisted) detailTags.push('黑名单');
    if (item.quality) detailTags.push('优质临促');
    detailTags.push(`健康证${getHealthCertText(item.healthCert)}`);
    if (hasComments) detailTags.push(`评价 ${item.comments.length}条`);

    return {
      ...item,
      kaTags,
      _avatarChar: (item.name || '?').slice(0, 1),
      _hireStatus: hireStatus,
      _hasHistory: hasHistory,
      _isCreator: item.creatorUserId === currentUserId,
      _detailTags: detailTags,
      _healthCertText: getHealthCertText(item.healthCert),
      _latestHire: latestHire,
      likes: item.likes || [],
      hireHistory: hireHistory.map((h) => ({
        ...h,
        id: h.id || 0,
        hiredBy: h.hiredBy || '未知',
        hiredAt: h.hiredAt || '',
        comment: h.comment || '',
        unhireAt: h.unhireAt || '',
        unhireBy: h.unhireBy || '',
      })),
      comments: (item.comments || []).map((c) => ({
        ...c,
        _avatarChar: (c.nickname || '?').slice(0, 1),
      })),
    };
  });

  // ── 按省份分组 ──
  const groupMap = new Map();
  filtered.forEach((item) => {
    const p = item.province || '未知';
    if (!groupMap.has(p)) groupMap.set(p, []);
    groupMap.get(p).push(item);
  });

  let groups = [];
  groupMap.forEach((items, province) => {
    groups.push({ province, items });
  });

  // ── 组排序 ──
  if (sortMode === '省份A-Z') {
    groups.sort((a, b) => a.province.localeCompare(b.province, 'zh'));
  } else if (sortMode === '省份Z-A') {
    groups.sort((a, b) => b.province.localeCompare(a.province, 'zh'));
  } else if (sortMode === '序号升序') {
    groups.sort((a, b) => (a.items[0].sn || 0) - (b.items[0].sn || 0));
  } else if (sortMode === '序号降序') {
    groups.sort((a, b) => (b.items[0].sn || 0) - (a.items[0].sn || 0));
  }

  return groups;
}

// ============================================================
// CSV 导出
// ============================================================
function exportToCSV(groupedData) {
  const records = [];
  groupedData.forEach((group) => {
    group.items.forEach((item) => {
      records.push(item);
    });
  });

  if (records.length === 0) return false;

  const headers = ['序号', '姓名', '年龄', '省份', '城市', '区/镇', '乡/县/镇/街道', '电话', '微信号', '卖场经验', '底薪(元/天)', '备注', '内部标注', '聘用状态', '记录人', '记录人职位', '健康证', '评论数'];
  const rows = records.map((r) => {
    const healthCertStatus = r.healthCert
      ? ({ none: '未上传', pending: '待审核', approved: '已认证', rejected: '已驳回' }[r.healthCert.status] || '未上传')
      : '未上传';
    const hireStatus = r.hired ? '在岗' : ((r.hireHistory || []).length > 0 ? '有记录' : '空闲');
    const internalTag = r.blacklisted ? '⚫黑名单' : (r.quality ? '⭐优质' : '');
    return [
      r.sn || '', r.name || '', r.age || '',
      r.province || '', r.city || '', r.district || '', r.street || '',
      r.phone || '', r.wechat || '',
      (r.kaTags || []).join('、'), r.baseSalary || '', r.remark || '',
      internalTag, hireStatus,
      r.recorderNickname || '', r.recorderPosition || '',
      healthCertStatus, (r.comments || []).length,
    ];
  });

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => {
      const str = String(cell);
      return str.indexOf(',') !== -1 || str.indexOf('"') !== -1
        ? '"' + str.replace(/"/g, '""') + '"'
        : str;
    }).join(','))
    .join('\n');

  const fs = wx.getFileSystemManager();
  const fileName = `促销员数据_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;
  const filePath = wx.env.USER_DATA_PATH + '/' + fileName;

  try {
    fs.writeFileSync(filePath, '﻿' + csvContent, 'utf8');
    return { filePath, csvContent, fileName };
  } catch (err) {
    console.error('导出失败', err);
    return null;
  }
}

module.exports = {
  normalizeTags,
  getHealthCertText,
  getLatestHireInfo,
  processData,
  exportToCSV,
};
