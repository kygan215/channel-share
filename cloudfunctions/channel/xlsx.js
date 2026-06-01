// ============================================================
// Excel 文件处理
// ============================================================
// 这个文件负责：
//   解析用户导入的 Excel 文件（parseXLSX）
//   生成导入模板 Excel 文件（generateImportTemplate）
// 使用 xlsx 库（SheetJS）处理 Excel 格式
// ============================================================

const { XLSX } = require('./constants');

// ============================================================
// parseXLSX：解析用户上传的 Excel 文件
// data：{ base64: 文件的 Base64 编码内容 }
// 返回：{ success, records（解析出的记录数组）, total（数量）, fieldMap（列映射） }
// ============================================================
async function parseXLSX(data) {
  // 检查有没有文件内容
  if (!data || !data.base64) {
    return { success: false, message: '未收到文件内容' };
  }

  // 把 Base64 转成 Buffer
  const buffer = Buffer.from(data.base64, 'base64');
  // 用 xlsx 库读取
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  // 取第一个工作表
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { success: false, message: '未找到工作表' };
  }

  const sheet = workbook.Sheets[sheetName];
  // 转成二维数组（header: 1 表示第一行是表头）
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // 最少需要 2 行（表头 + 1条数据）
  if (rows.length < 2) {
    return { success: false, message: '文件为空或格式不正确' };
  }

  // 解析表头（第一行）
  const headers = rows[0].map((h) => String(h).trim());
  const headerLower = headers.map((h) => h.toLowerCase());

  // 列名 → 字段映射表
  // 支持中英文多种列名，比如"姓名"、"name"、"促销员"都映射到 name 字段
  const fieldMap = {};
  const fieldKeywords = {
    sn: ['序号', 'sn', '编号', 'id', 'no', 'no.', '#'],
    name: ['姓名', '名字', 'name', '促销员', '员工', '人员', '联系人', '销售', 'staff', 'person', 'worker', 'sales', '微信名'],
    province: ['省份', '省', 'province', '省/市'],
    city: ['城市', '市', 'city', '市/区'],
    district: ['区', '镇', '县', '区/镇', '乡', '乡/镇', 'district', '区域', '地区'],
    street: ['地址', '街道', 'street', 'address', '详细地址', '门店', '网点', '工作地点', '工作地址'],
    phone: ['电话', '手机', '手机号', '联系电话', 'phone', 'tel', '联系方式', '联系', 'mobile'],
    wechat: ['微信', '微信号', 'wechat', 'wx', '微信id', '微信账号'],
    age: ['年龄', 'age', '年纪', '岁数'],
    remark: ['备注', 'remark', '合作历史', '反馈', '注意事项', '说明', '描述', 'note'],
    kaTags: ['ka经验', 'ka系统', '卖场经验', '零售经验', 'ka', '系统经验', '商超经验', '商场经验', '渠道经验'],
    baseSalary: ['底薪', '工资', '基本工资', '薪资', '薪酬', '薪水', 'baseSalary', 'base_salary', 'sal'],
    internalTag: ['内部标注', '内部标记', '标注', '标记', '标签', 'tag'],
  };

  // 用关键词匹配列名
  for (const [field, keywords] of Object.entries(fieldKeywords)) {
    for (let i = 0; i < headerLower.length; i++) {
      // 跳过已被占用的列
      if (Object.values(fieldMap).includes(i)) continue;
      if (keywords.some((kw) => headerLower[i].indexOf(kw) !== -1)) {
        fieldMap[field] = i;
        break;
      }
    }
  }

  // 逐行解析数据
  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.length < 2) continue; // 跳过空行

    const record = {};
    for (const [field, idx] of Object.entries(fieldMap)) {
      record[field] = String(cells[idx] || '').trim();
    }
    // 至少有一个字段有值才算有效行
    const hasAnyData = Object.values(record).some((v) => v);
    if (hasAnyData) records.push(record);
  }

  return { success: true, records, total: records.length, fieldMap };
}

// ============================================================
// generateImportTemplate：生成导入用的 Excel 模板
// 包含表头 + 5行示例数据
// 返回：{ success, data（Base64编码）, fileName }
// ============================================================
async function generateImportTemplate() {
  // 表头
  const headers = ['姓名', '年龄', '省份', '城市', '区/镇', '乡/县/镇', '电话', '微信号', '卖场经验', '底薪', '备注', '内部标注'];
  // 示例数据（含各种标注和卖场经验）
  const sampleData = [
    ['张三', '28', '广东省', '深圳市', '南山区', '粤海街道', '13800138000', 'zhangsan_wx', '沃尔玛、山姆会员店', '180', '可周末上班，做过试吃活动', '优质临促'],
    ['李四', '35', '广东省', '广州市', '天河区', '车陂街道', '13900139000', 'lisi_wx', '大润发、永辉超市', '160', '需提前一天确认档期', ''],
    ['王五', '42', '广东省', '东莞市', '长安镇', '乌沙社区', '13700137000', 'wangwu_wx', '华润万家、永旺、嘉荣', '200', '有健康证，经验丰富', '优质'],
    ['赵六', '25', '浙江省', '杭州市', '西湖区', '文三路', '13600136000', 'zhaoliu_wx', '盒马鲜生', '150', '', '⚫黑名单'],
    ['孙七', '30', '江苏省', '苏州市', '虎丘区', '狮山街道', '13500135000', 'sunqi_wx', '大润发、永辉超市、沃尔玛', '170', '试吃推广经验丰富', ''],
  ];

  // 创建工作表
  const rows = [headers, ...sampleData];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 10 }, { wch: 6 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    { wch: 32 }, { wch: 8 }, { wch: 36 }, { wch: 14 },
  ];
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1 }; // 冻结表头

  // 创建工作簿
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '促销员导入模板');

  // 导出为 Base64
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  return {
    success: true,
    data: buffer.toString('base64'),
    fileName: '促销员导入模板.xlsx',
  };
}

module.exports = {
  parseXLSX,               // 解析导入的 Excel
  generateImportTemplate,  // 生成导入模板
};
