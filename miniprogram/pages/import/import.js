// ============================================================
// CSV 导入页
// 功能：选择 CSV 文件、解析、预览、确认导入（追加/覆盖）
// ============================================================

Page({
  data: {
    step: 'select',
    fileName: '',
    previewData: [],
    fieldMap: {},
    importMode: 'append',
    downloadingTemplate: false,
    summary: { total: 0, success: 0, fail: 0 },
  },

  // ============================================================
  // 选择 CSV 文件
  // ============================================================
  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['csv', 'xlsx'],
      success: (res) => {
        const file = res.tempFiles[0];
        this.setData({ fileName: file.name });
        if (file.name.endsWith('.xlsx')) {
          this.parseXLSX(file.path);
        } else {
          this.parseCSV(file.path);
        }
      },
      fail: (err) => {
        if (err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择文件失败', icon: 'none' });
        }
      },
    });
  },

  async downloadTemplate() {
    if (this.data.downloadingTemplate) return;
    this.setData({ downloadingTemplate: true });
    wx.showLoading({ title: '生成模板中...' });

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'channel',
        data: { action: 'generateImportTemplate', data: {} },
      });

      if (!result || !result.success || !result.data) {
        wx.hideLoading();
        wx.showToast({ title: (result && result.message) || '模板生成失败', icon: 'none' });
        return;
      }

      // 云函数直接返回 base64 编码的 xlsx 文件内容
      // 写入临时文件后用 wx.openDocument 打开
      const fs = wx.getFileSystemManager();
      const filePath = wx.env.USER_DATA_PATH + '/' + (result.fileName || '促销员导入模板.xlsx');
      fs.writeFileSync(filePath, result.data, 'base64');

      wx.hideLoading();
      wx.openDocument({
        filePath,
        fileType: 'xlsx',
        showMenu: true,
        success: () => wx.showToast({ title: '模板已打开', icon: 'success' }),
        fail: (err) => {
          console.error('打开模板失败', err);
          wx.showToast({ title: '打开失败，请从聊天文件中查看', icon: 'none' });
        },
      });
    } catch (err) {
      wx.hideLoading();
      console.error('下载模板失败', err);
      wx.showToast({ title: '模板生成失败: ' + (err.message || ''), icon: 'none' });
    } finally {
      this.setData({ downloadingTemplate: false });
    }
  },

  // ============================================================
  // 解析 CSV
  // ============================================================
  parseCSV(filePath) {
    wx.showLoading({ title: '解析中...' });

    try {
      const fs = wx.getFileSystemManager();
      let content = fs.readFileSync(filePath, 'utf8');

      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }

      const lines = content.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) {
        wx.hideLoading();
        wx.showToast({ title: '文件为空或格式不正确', icon: 'none' });
        return;
      }

      const headers = this.parseCSVLine(lines[0]);
      const headerLower = headers.map((h) => h.trim().toLowerCase());

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

      for (const [field, keywords] of Object.entries(fieldKeywords)) {
        for (let i = 0; i < headerLower.length; i++) {
          if (Object.values(fieldMap).includes(i)) continue; // 列已被占用则跳过
          if (keywords.some((kw) => headerLower[i].indexOf(kw) !== -1)) {
            fieldMap[field] = i;
            break;
          }
        }
      }

      // 如果 name 未匹配到，尝试智能检测姓名列
      if (fieldMap.name === undefined) {
        // 先尝试第二列（最常见的位置）
        if (headers.length >= 2 && fieldMap.sn !== 1) {
          fieldMap.name = 1;
        }
        // 如果第二列已被其他字段占用，通过内容分析查找姓名列
        if (fieldMap.name === undefined) {
          const sampleRows = [];
          for (let i = 1; i < Math.min(lines.length, 6); i++) {
            sampleRows.push(this.parseCSVLine(lines[i]));
          }
          let bestCol = -1;
          let bestScore = 0;
          for (let col = 0; col < headers.length; col++) {
            if (Object.values(fieldMap).includes(col)) continue; // 已被映射
            let score = 0;
            for (const row of sampleRows) {
              const val = (row[col] || '').trim();
              if (!val) continue;
              // 中文姓名特征：2-4个汉字，不含数字
              if (/^[一-龥]{2,4}$/.test(val)) score += 3;
              else if (/[一-龥]/.test(val) && !/\d/.test(val)) score += 1;
            }
            if (score > bestScore) { bestScore = score; bestCol = col; }
          }
          if (bestCol >= 0) fieldMap.name = bestCol;
        }
      }

      const records = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = this.parseCSVLine(lines[i]);
        if (cells.length < 2) continue;

        const record = {};
        for (const [field, idx] of Object.entries(fieldMap)) {
          record[field] = (cells[idx] || '').trim();
        }
        // 只要有任何有效数据就纳入（不再要求必须有省份/城市/电话）
        const hasAnyData = Object.values(record).some(v => v);
        if (hasAnyData) {
          records.push(record);
        }
      }

      wx.hideLoading();

      if (records.length === 0) {
        wx.showToast({ title: '未能识别有效数据', icon: 'none' });
        return;
      }

      this.setData({
        step: 'preview',
        previewData: records,
        fieldMap,
        summary: { total: records.length, success: 0, fail: 0 },
      });
    } catch (err) {
      wx.hideLoading();
      console.error('解析CSV失败', err);
      wx.showToast({ title: '解析失败，请检查文件格式', icon: 'none' });
    }
  },

  // ============================================================
  // CSV 行解析
  // ============================================================
  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  },

  // ============================================================
  // 解析 XLSX 文件（发送到云函数解析）
  // ============================================================
  async parseXLSX(filePath) {
    wx.showLoading({ title: '解析中...' });

    try {
      const fs = wx.getFileSystemManager();
      const base64 = fs.readFileSync(filePath, 'base64');

      const { result } = await wx.cloud.callFunction({
        name: 'channel',
        data: {
          action: 'parseXLSX',
          data: { base64 },
        },
      });

      wx.hideLoading();

      if (!result.success) {
        wx.showToast({ title: result.message || '解析失败', icon: 'none' });
        return;
      }

      if (result.total === 0) {
        wx.showToast({ title: '未能识别有效数据', icon: 'none' });
        return;
      }

      this.setData({
        step: 'preview',
        previewData: result.records,
        fieldMap: result.fieldMap || {},
        summary: { total: result.total, success: 0, fail: 0 },
      });
    } catch (err) {
      wx.hideLoading();
      console.error('解析XLSX失败', err);
      wx.showToast({ title: '解析失败，请检查文件格式', icon: 'none' });
    }
  },

  // ============================================================
  // 切换导入模式
  // ============================================================
  setImportMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ importMode: mode });
  },

  // ============================================================
  // 确认导入
  // ============================================================
  async confirmImport() {
    const { previewData, importMode } = this.data;
    if (previewData.length === 0) {
      wx.showToast({ title: '没有可导入的数据', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '导入中...' });

    try {
      // 批量导入（覆盖模式由云函数内部处理清空操作）
      const { result } = await wx.cloud.callFunction({
        name: 'channel',
        data: {
          action: 'batchAdd',
          data: { records: previewData, mode: importMode },
        },
      });

      wx.hideLoading();

      if (result.success) {
        this.setData({
          step: 'done',
          'summary.success': result.count,
        });
        wx.showToast({ title: `成功导入 ${result.count} 条记录`, icon: 'success' });
      } else {
        wx.showToast({ title: result.message || '导入失败', icon: 'none' });
        console.error('云函数返回失败', result);
      }
    } catch (err) {
      wx.hideLoading();
      console.error('导入异常', err);
      wx.showModal({
        title: '导入失败',
        content: err.message || String(err),
        showCancel: false,
      });
    }
  },

  // ============================================================
  // 重置 / 重新选择
  // ============================================================
  reset() {
    this.setData({
      step: 'select',
      fileName: '',
      previewData: [],
      fieldMap: {},
      importMode: 'append',
      summary: { total: 0, success: 0, fail: 0 },
    });
  },

  goBack() {
    wx.navigateBack();
  },
});
