import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Steps, Upload, Table, Button, message, Modal, Input, Progress, Select } from 'antd';
import { InboxOutlined, HomeOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';

// API配置
const API_CONFIG = {
  production: {
    baseURL: 'https://omsimportassistant-hrhpdxdrbvc3eha9.eastus2-01.azurewebsites.net',
    timeout: 30000, // 生产环境超时时间更长
  },
  development: {
    baseURL: 'http://localhost:8000',
    timeout: 10000,
  }
};

// 环境配置
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CONFIG = IS_PRODUCTION ? API_CONFIG.production : API_CONFIG.development;

// 配置axios
axios.defaults.baseURL = CONFIG.baseURL;
axios.defaults.timeout = CONFIG.timeout;
axios.defaults.withCredentials = true;

const { Header, Content } = Layout;
const { Dragger } = Upload;
const { Step } = Steps;

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [fileList, setFileList] = useState<any[]>([]);
  const [data, setData] = useState<any[]>([]);
  const [selectedRows, setSelectedRows] = useState<any[]>([]);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [editData, setEditData] = useState<any[]>([]);
  const [processing, setProcessing] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [reviewData, setReviewData] = useState<any[]>([]);
  const [targetMediaPlanId, setTargetMediaPlanId] = useState<string | null>(null);
  const [targetOpportunityId, setTargetOpportunityId] = useState<string | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tableHeight, setTableHeight] = useState(400);
  const [helpVisible, setHelpVisible] = useState(false);
  const [idFilter] = useState<string[]>([]);
  const [nameFilter] = useState('');
  const [descFilter] = useState('');
  const [dateRange] = useState<[string, string] | null>(null);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(20);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [targetMediaPlanName, setTargetMediaPlanName] = useState<string | null>(null);

  // 2. 新CSV字段顺序
  const allFields = useMemo(() => [
    "EntityType", "Id", "Name", "Description", "StartDate", "EndDate", "TargetSpend", 
    "CustomerId", "CustomerName", "MediaPlanId", "MediaPlanName", "CurrencyCode", 
    "Contact", "OpportunityId", "MediaPlanStatus", "LineId", "LineName", "LineType", 
    "LineStatus", "Cpm", "Cpd", "TargetImpressions", "IsReserved", "BudgetScheduleType",
    "TargetType", "Ids", "IsExcluded", "AudienceTargetingType", "DayOfWeek", 
    "StartHour", "EndHour", "DeviceTypes", "FrequencyUnit", "FrequencyNumber", 
    "MinutesPerImpression", "PublisherId", "PublisherName", "ProductId", "ProductName", 
    "ProductType"
  ], []); // 空依赖数组因为这是静态数据

  // 3. 全局隐藏字段 - 包括 Id 字段
  const globalHiddenFields: string[] = useMemo(() => ["Id"], []); // 空依赖数组因为这是静态数据

  // 4. 统一columns定义（顺序与allFields一致）
  const columns = allFields
    .filter(field => !globalHiddenFields.includes(field))
    .map(field => ({
      title: field,
      dataIndex: field,
      key: field,
      width: 120,
      ellipsis: true,
    }));

  // 所有字段都可编辑，除了 Id
  const editableFields = useMemo(() => allFields.filter(field => !globalHiddenFields.includes(field)), [allFields, globalHiddenFields]);

  // 移除字段编辑限制
  const prdReadOnlyFields: { [key: string]: string[] } = useMemo(() => ({
    clone: ['Id'],
    edit: ['Id'],
    copy: ['Id']
  }), []);

  // 1. 定义通用排序器
  const getSorter = (dataIndex: string) => {
    if ([
      'Id', 'CustomerId', 'MediaPlanId', 'OpportunityId', 'PublisherId', 'ProductId', 
      'Cpm', 'Cpd', 'TargetImpressions', 'TargetSpend', 'StartHour', 'EndHour',
      'FrequencyNumber', 'MinutesPerImpression'
    ].includes(dataIndex)) {
      return (a: any, b: any) => Number(a[dataIndex] || 0) - Number(b[dataIndex] || 0);
    }
    if (["StartDate", "EndDate"].includes(dataIndex)) {
      return (a: any, b: any) => {
        const da = a[dataIndex] ? dayjs(a[dataIndex]) : dayjs(0);
        const db = b[dataIndex] ? dayjs(b[dataIndex]) : dayjs(0);
        return da.valueOf() - db.valueOf();
      };
    }
    return (a: any, b: any) => (a[dataIndex] || '').toString().localeCompare((b[dataIndex] || '').toString());
  };

  // 5. 统一columns定义（顺序与allFields一致）
  const selectDataColumns = columns.map(col => {
    if (col.dataIndex === 'Id') {
      return {
        ...col,
        width: 120,
        sorter: getSorter(col.dataIndex),
      };
    }
    if (col.dataIndex === 'Name') {
      return {
        ...col,
        width: 200,
        sorter: getSorter(col.dataIndex),
      };
    }
    if (col.dataIndex === 'Description') {
      return {
        ...col,
        width: 200,
        sorter: getSorter(col.dataIndex),
      };
    }
    if (col.dataIndex === 'StartDate' || col.dataIndex === 'EndDate') {
      return {
        ...col,
        width: 220,
        sorter: getSorter(col.dataIndex),
      };
    }
    return {
      ...col,
      width: 120,
      sorter: getSorter(col.dataIndex),
    };
  });

  const editPageColumns = useMemo(() => {
    // 以 selectDataColumns 的字段顺序和字段集为准
    return selectDataColumns.map(col => {
      const field = col.dataIndex;
      // 判断是否可编辑
      const isEditable = editableFields.includes(field) && !(prdReadOnlyFields[selectedAction || 'clone'] || []).includes(field);
      return {
        ...col,
        editable: isEditable,
        render: (text: any, record: any) => {
          if (!isEditable) return (text === '' || text === null || text === undefined ? '-' : text);
          if (field === 'IsReserved' || field === 'IsExcluded') {
            return (
              <Select
                value={record[field]}
                style={{ width: '100%' }}
                onChange={value => {
                  const newData = [...editData];
                  const index = newData.findIndex(item => String(item.Id) === String(record.Id));
                  if (index > -1) {
                    newData[index] = { ...newData[index], [field]: value };
                    setEditData(newData);
                  }
                }}
              >
                <Select.Option value="TRUE">TRUE</Select.Option>
                <Select.Option value="FALSE">FALSE</Select.Option>
              </Select>
            );
          }
          if (field === 'DayOfWeek' || field === 'DeviceTypes') {
            return (
              <Select
                mode="tags"
                style={{ width: '100%' }}
                value={record[field] ? record[field].split(',').filter(Boolean) : []}
                onChange={value => {
                  const newData = [...editData];
                  const index = newData.findIndex(item => String(item.Id) === String(record.Id));
                  if (index > -1) {
                    newData[index] = { ...newData[index], [field]: value.join(',') };
                    setEditData(newData);
                  }
                }}
              />
            );
          }
          if (field === 'StartHour' || field === 'EndHour') {
            return (
              <Input
                type="number"
                min={0}
                max={23}
                value={record[field]}
                onChange={e => {
                  const value = Math.min(23, Math.max(0, parseInt(e.target.value) || 0));
                  const newData = [...editData];
                  const index = newData.findIndex(item => String(item.Id) === String(record.Id));
                  if (index > -1) {
                    newData[index] = { ...newData[index], [field]: value };
                    setEditData(newData);
                  }
                }}
              />
            );
          }
          return (
            <Input
              value={record[field]}
              onChange={e => {
                const newData = [...editData];
                const index = newData.findIndex(item => String(item.Id) === String(record.Id));
                if (index > -1) {
                  newData[index] = { ...newData[index], [field]: e.target.value };
                  setEditData(newData);
                }
              }}
            />
          );
        }
      };
    });
  }, [selectDataColumns, editableFields, prdReadOnlyFields, selectedAction, editData, setEditData]);

  // Edit Data页面的表格组件配置
  /*
  const editPageComponents = {
    body: {
      cell: (props: any) => {
        const { dataIndex, record, children, ...restProps } = props;
        if (!record || !dataIndex) {
          return <td {...restProps}></td>;
        }
        const col = editPageColumns.find(c => c.dataIndex === dataIndex);
        if (!col || !col.editable) {
          return <td {...restProps}>{record ? record[dataIndex] : ''}</td>;
        }
        // IsReserved 字段用下拉框
        if (dataIndex === 'IsReserved') {
          return (
            <td {...restProps}>
              <Select
                value={record[dataIndex]}
                style={{ width: '100%' }}
                onChange={value => {
                  const newData = [...editData];
                  const index = newData.findIndex(item => item.originalId === record.originalId);
                  if (index > -1) {
                    newData[index] = { ...newData[index], [dataIndex]: value };
                    setEditData(newData);
                  }
                }}
              >
                <Select.Option value="TRUE">TRUE</Select.Option>
                <Select.Option value="FALSE">FALSE</Select.Option>
              </Select>
            </td>
          );
        }
        // 其它字段用Input
        return (
          <td {...restProps}>
            <Input
              value={record[dataIndex]}
              onChange={e => {
                const newData = [...editData];
                const index = newData.findIndex(item => item.originalId === record.originalId);
                if (index > -1) {
                  newData[index] = { ...newData[index], [dataIndex]: e.target.value };
                  setEditData(newData);
                }
              }}
            />
          </td>
        );
      },
    },
  };
  */
  // 修改表格组件配置
  /*
  const components = {
    body: {
      cell: (props: any) => {
        const { dataIndex, record, children, ...restProps } = props;
        // 先判断 dataIndex 是否为字符串
        const isString = typeof dataIndex === 'string';
        // 已重构为 editPageColumns，直接用 col.editable 判断
        const editable = isString ? !editPageColumns.find(c => c.dataIndex === dataIndex)?.editable : false;
        
        if (!editable) {
          return <td {...restProps}>{children}</td>;
        }

        let input;
        if (isString && dataIndex.toLowerCase() === 'isreserved') {
          input = (
            <Select
              defaultValue={record[dataIndex]}
              style={{ width: '100%' }}
              onChange={(value) => {
                const newData = [...editData];
                const index = newData.findIndex(item => item.originalId === record.originalId);
                if (index > -1) {
                  newData[index] = { ...newData[index], [dataIndex]: value };
                  setEditData(newData);
                }
              }}
            >
              <Select.Option value="TRUE">TRUE</Select.Option>
              <Select.Option value="FALSE">FALSE</Select.Option>
            </Select>
          );
        } else {
          input = (
            <Input
              defaultValue={isString ? record[dataIndex] : ''}
              onChange={(e) => {
                const newData = [...editData];
                const index = newData.findIndex(item => item.originalId === record.originalId);
                if (index > -1 && isString) {
                  newData[index] = { ...newData[index], [dataIndex]: e.target.value };
                  setEditData(newData);
                }
              }}
            />
          );
        }

        return <td {...restProps}>{input}</td>;
      },
    },
  };
  */
  // 添加数据验证函数
  /*
  const validateData = (data: any[]) => {
    const errors: string[] = [];
    
    data.forEach((row, index) => {
      // 验证必填字段
      const requiredFields = ['Name', 'StartDate', 'EndDate', 'TargetSpend'];
      requiredFields.forEach(field => {
        if (!row[field]) {
          errors.push(`Row ${index + 1}: ${field} is required`);
        }
      });

      // 验证日期格式和逻辑
      if (row.StartDate && row.EndDate) {
        const startDate = dayjs(row.StartDate);
        const endDate = dayjs(row.EndDate);
        if (!startDate.isValid() || !endDate.isValid()) {
          errors.push(`Row ${index + 1}: Invalid date format`);
        } else if (startDate.isAfter(endDate)) {
          errors.push(`Row ${index + 1}: StartDate cannot be after EndDate`);
        }
      }

      // 验证数字字段
      const numericFields = ['TargetSpend', 'Cpm', 'Cpd', 'TargetImpressions'];
      numericFields.forEach(field => {
        if (row[field] && isNaN(Number(row[field]))) {
          errors.push(`Row ${index + 1}: ${field} must be a number`);
        }
      });

      // 验证布尔字段
      if (row.IsReserved && !['TRUE', 'FALSE'].includes(row.IsReserved.toUpperCase())) {
        errors.push(`Row ${index + 1}: IsReserved must be TRUE or FALSE`);
      }
    });

    return errors;
  };
  */
  // 添加导出验证函数
  const validateExportData = (data: any[]) => {
    const errors: string[] = [];
    
    // 验证数据完整性
    if (!data || data.length === 0) {
      errors.push('No data to export');
      return errors;
    }

    // 验证字段完整性
    const requiredFields = [
      "EntityType", "Id", "Name", "Description", "StartDate", "EndDate", 
      "TargetSpend", "CustomerId", "CustomerName", "MediaPlanId", 
      "MediaPlanName", "CurrencyCode", "Contact", "OpportunityId", 
      "MediaPlanStatus", "LineId", "LineName", "LineType", "LineStatus", 
      "Cpm", "Cpd", "TargetImpressions", "IsReserved", "BudgetScheduleType",
      "TargetType", "Ids", "IsExcluded", "AudienceTargetingType", "DayOfWeek", 
      "StartHour", "EndHour", "DeviceTypes", "FrequencyUnit", "FrequencyNumber", 
      "MinutesPerImpression", "PublisherId", "PublisherName", "ProductId", 
      "ProductName", "ProductType"
    ];

    // 只验证字段存在性，不验证值
    data.forEach((row, index) => {
      requiredFields.forEach(field => {
        if (!(field in row)) {
          errors.push(`Row ${index + 1}: Missing required field "${field}"`);
        }
      });
    });

    return errors;
  };

  // 修改处理函数以包含进度提示
  const handleProcess = async (action: string) => {
    console.log('handleProcess called', action);
    setProcessing(true);
    setProcessingProgress(0);
    try {
      let submitData;
      let endpoint;

      switch (action) {
        case 'copy':
          submitData = editData.map(row => ({ 
            ...row, 
            Id: row.originalId, 
            MediaPlanId: targetMediaPlanId,
            MediaPlanName: targetMediaPlanName,
            OpportunityId: targetOpportunityId 
          }));
          endpoint = '/process_copy';
          break;
        case 'edit':
          submitData = editData.map(row => ({ ...row, Id: row.originalId }));
          endpoint = '/process_edit';
          break;
        case 'clone':
          submitData = editData.map(row => ({ ...row, Id: row.originalId }));
          endpoint = '/process_clone';
          break;
        default:
          throw new Error('Invalid action');
      }

      console.log('handleProcess submitData:', submitData);
      console.log('handleProcess endpoint:', endpoint);

      // 模拟进度更新
      const progressInterval = setInterval(() => {
        setProcessingProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 500);

      const res = await axios.post(endpoint, action === 'copy' ? { lines: submitData, targetMediaPlanId, targetOpportunityId } : submitData);
      console.log('handleProcess response:', res.data);
      
      clearInterval(progressInterval);
      setProcessingProgress(100);

      if (res.data && res.data.success) {
        // 验证导出数据
        const exportErrors = validateExportData(res.data.review_data || []);
        if (exportErrors.length > 0) {
          message.error(
            <div>
              <p>Export data validation failed:</p>
              <ul>
                {exportErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          );
          setProcessing(false);
          return;
        }

        setReviewData(res.data.review_data || []);
        setDownloadReady(true);
        setCurrentStep(4);
      } else {
        message.error(res.data.error || 'Processing failed');
      }
    } catch (e) {
      message.error('Processing failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setProcessing(false);
      setProcessingProgress(0);
    }
  };

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    accept: '.csv',
    fileList,
    beforeUpload: (file) => {
      setFileList([file]);
      setUploadError(null);
      return false;
    },
    onRemove: () => {
      setFileList([]);
      setUploadError(null);
    },
  };

  const handleUpload = async () => {
    if (fileList.length === 0) {
      setUploadError('Please select a file first');
      return;
    }
    const formData = new FormData();
    formData.append('file', fileList[0]);
    try {
      const response = await axios.post('/upload', formData);
      if (response.data.error) {
        setUploadError('You uploaded a file with incorrect format, please use another file.');
        setTimeout(() => setFileList([]), 300);
      } else {
        setUploadError(null);
        message.success('File uploaded successfully');
        setCurrentStep(1);
        // 清空 action 选择和 3 个输入
        setSelectedAction(null);
        setTargetMediaPlanId(null);
        setTargetMediaPlanName(null);
        setTargetOpportunityId(null);
        // 获取数据
        const dataResponse = await axios.get('/lines');
        // 为每一行加originalId
        const withOriginalId = (dataResponse.data.data || []).map((row: any) => ({ ...row, originalId: row.Id }));
        setData(withOriginalId);
      }
    } catch (error) {
      setUploadError('Upload failed, please try again.');
      setTimeout(() => setFileList([]), 300);
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[], rows: any[]) => {
      setSelectedRowKeys(keys.map(String));
      setSelectedRows(rows);
    },
    onSelect: (record: any, selected: boolean) => {
      if (!selected) {
        setSelectedRowKeys(selectedRowKeys.filter(key => key !== String(record.Id)));
        setSelectedRows(selectedRows.filter(row => String(row.Id) !== String(record.Id)));
      }
    },
    onSelectAll: (selected: boolean, selectedRowsAll: any[], changeRows: any[]) => {
      if (selected) {
        const newKeys = changeRows.map(row => String(row.Id));
        setSelectedRowKeys(Array.from(new Set([...selectedRowKeys, ...newKeys])));
        setSelectedRows(Array.from(new Set([...selectedRows, ...changeRows])));
      } else {
        const removeKeys = changeRows.map(row => String(row.Id));
        setSelectedRowKeys(selectedRowKeys.filter(key => !removeKeys.includes(key)));
        setSelectedRows(selectedRows.filter(row => !removeKeys.includes(String(row.Id))));
      }
    }
  };

  // 过滤逻辑
  const filteredData = data.filter(row => {
    if (idFilter.length > 0 && !idFilter.includes(String(row.Id))) return false;
    if (nameFilter && !(row.Name || '').toLowerCase().includes(nameFilter.toLowerCase())) return false;
    if (descFilter && !(row.Description || '').toLowerCase().includes(descFilter.toLowerCase())) return false;
    if (dateRange) {
      const s = row.StartDate ? dayjs(row.StartDate) : null;
      const e = row.EndDate ? dayjs(row.EndDate) : null;
      if (dateRange[0] && (!s || s.isBefore(dayjs(dateRange[0]), 'day'))) return false;
      if (dateRange[1] && (!e || e.isAfter(dayjs(dateRange[1]), 'day'))) return false;
    }
    return true;
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (currentStep === 3) {
      // copy 场景下赋值 MediaPlanName
      if (selectedAction === 'copy') {
        setEditData(selectedRowKeys.map(key => {
          const row = data.find(row => String(row.Id) === String(key));
          return row ? { ...row, Id: String(row.Id), MediaPlanName: targetMediaPlanName } : null;
        }).filter(Boolean));
      } else {
        setEditData(selectedRowKeys.map(key => {
          const row = data.find(row => String(row.Id) === String(key));
          return row ? { ...row, Id: String(row.Id) } : null;
        }).filter(Boolean));
      }
    }
    // eslint-disable-next-line
  }, [currentStep]);

  // review页只展示entitytype=Line的数据
  const reviewLineOnly = (arr: any[]) => (arr || []).filter(row => row.EntityType === 'Line');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const updateHeight = () => setTableHeight(window.innerHeight - 320); // 320为header/steps等高度
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // 添加确认对话框
  const ConfirmModal = () => {
    const getConfirmMessage = () => {
      switch (selectedAction) {
        case 'copy':
          return `Are you sure you want to copy ${editData.length} line items to Media Plan ${targetMediaPlanId}?`;
        case 'edit':
          return `Are you sure you want to edit ${editData.length} line items? This will overwrite the original data.`;
        case 'clone':
          return `Are you sure you want to clone ${editData.length} line items?`;
        default:
          return 'Are you sure you want to proceed?';
      }
    };

    return (
      <Modal
        title="Confirm Action"
        open={confirmModalVisible}
        onOk={() => {
          setConfirmModalVisible(false);
          handleProcess(selectedAction || 'clone');
        }}
        onCancel={() => setConfirmModalVisible(false)}
        okText="Yes, proceed"
        cancelText="Cancel"
      >
        <p>{getConfirmMessage()}</p>
        {selectedAction === 'edit' && (
          <p style={{ color: 'red' }}>
            Warning: This action cannot be undone. Please make sure you have reviewed all changes.
          </p>
        )}
      </Modal>
    );
  };

  // 在Review页面时输出reviewData和reviewLineOnly
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (currentStep === 4) {
      console.log('reviewData:', reviewData);
      console.log('reviewLineOnly:', reviewLineOnly(reviewData));
    }
  }, [currentStep, reviewData, editPageColumns]);

  // Edit Data页面渲染日志
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (currentStep === 3) {
      console.log('EditData render', currentStep, editData);
    }
  }, [currentStep, editData, editPageColumns]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#fff', padding: 0, height: 80, display: 'flex', alignItems: 'center' }}>
        <h1 style={{ margin: 0, paddingLeft: 20, display: 'inline-block' }}>OMS Import Assistant</h1>
        <Button
          type="link"
          icon={<HomeOutlined style={{ fontSize: 22 }} />}
          style={{ marginLeft: 24, fontSize: 20 }}
          onClick={() => {
            setCurrentStep(0);
            setFileList([]);
            setData([]);
            setSelectedRows([]);
            setSelectedRowKeys([]);
            setEditData([]);
            setProcessing(false);
            setDownloadReady(false);
            setReviewData([]);
            setTargetMediaPlanId(null);
            setTargetOpportunityId(null);
            setShowCopyModal(false);
            setDownloaded(false);
            setUploadError(null);
          }}
        />
        <Button
          type="link"
          icon={<QuestionCircleOutlined style={{ fontSize: 22 }} />}
          style={{ marginLeft: 8, fontSize: 20 }}
          onClick={() => setHelpVisible(true)}
        />
      </Header>
      <Content style={{ padding: '20px' }}>
        <Steps current={currentStep} style={{ marginBottom: '20px' }}>
          <Step title="Upload File" />
          <Step title="Select Data" />
          <Step title="Select Action" />
          <Step title="Edit Data" />
          <Step title="Review" />
          <Step title="Download File" status={downloaded ? 'finish' : (currentStep === 5 ? 'process' : 'wait')} />
        </Steps>

        {currentStep === 0 && (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <Dragger {...uploadProps}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag file to this area to upload</p>
              <p className="ant-upload-hint">Only CSV files are supported</p>
            </Dragger>
            {uploadError && (
              <div style={{ color: 'red', marginTop: 12, marginBottom: 0 }}>{uploadError}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
              <Button
                type="primary"
                onClick={handleUpload}
                disabled={fileList.length === 0}
              >
                {fileList.length === 0 ? 'Please select a file' : 'Upload'}
              </Button>
              <Button
                type="link"
                onClick={() => window.open('https://omsimportassistant-hrhpdxdrbvc3eha9.eastus2-01.azurewebsites.net/download_template', '_blank')}
              >
                Download File Template
              </Button>
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div>
            <Table
              columns={selectDataColumns}
              dataSource={filteredData}
              pagination={{
                pageSize,
                pageSizeOptions: ['10', '20', '50', '100'],
                showSizeChanger: true,
                onShowSizeChange: (current, size) => setPageSize(size),
              }}
              rowSelection={rowSelection}
              rowKey={record => String(record.Id)}
              scroll={{ x: 'max-content', y: tableHeight }}
            />
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
              <Button onClick={() => setCurrentStep(0)}>Back</Button>
              <Button
                type="default"
                onClick={() => setResetModalVisible(true)}
                style={{ fontWeight: 500 }}
              >
                Reset Selection
              </Button>
              <Button type="primary" onClick={() => setCurrentStep(2)} disabled={selectedRows.length === 0}>Next</Button>
            </div>
            <Modal
              title="Confirm Reset Selection"
              open={resetModalVisible}
              onOk={() => { setSelectedRows([]); setSelectedRowKeys([]); setResetModalVisible(false); }}
              onCancel={() => setResetModalVisible(false)}
              okText="Yes, clear all"
              cancelText="Cancel"
            >
              Are you sure you want to clear all selected rows?
            </Modal>
          </div>
        )}

        {currentStep === 2 && (
          <div style={{ textAlign: 'center', marginTop: 60 }}>
            <h2>Please select an action</h2>
            <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 24 }}>
              <Button
                type={selectedAction === 'clone' ? 'primary' : 'default'}
                size="large"
                style={{ margin: '0 0 0 0', minWidth: 260, height: 44, fontSize: 16 }}
                onClick={() => { setSelectedAction('clone'); setCurrentStep(3); }}
              >
                I want to clone these line items in the media plan
              </Button>
              <Button
                type={selectedAction === 'copy' ? 'primary' : 'default'}
                size="large"
                style={{ margin: '0 0 0 0', minWidth: 260, height: 44, fontSize: 16 }}
                onClick={() => { setSelectedAction('copy'); setShowCopyModal(true); }}
              >
                I want to copy these line items into a new media plan
              </Button>
              <Button
                type={selectedAction === 'edit' ? 'primary' : 'default'}
                size="large"
                style={{ margin: '0 0 0 0', minWidth: 260, height: 44, fontSize: 16 }}
                onClick={() => { setSelectedAction('edit'); setCurrentStep(3); }}
              >
                I want to edit these line items
              </Button>
            </div>
            <div style={{ marginTop: 32 }}>
              <Button onClick={() => setCurrentStep(1)} size="large">Back</Button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div>
            <div style={{ color: '#faad14', fontWeight: 500, marginBottom: 16, fontSize: 16 }}>
              You're only allowed to edit specific parameters of the line items.
            </div>
            {processing && (
              <div style={{ marginBottom: 16 }}>
                <Progress percent={processingProgress} status="active" />
              </div>
            )}
                <Table
              columns={editPageColumns}
              dataSource={selectedAction === 'copy'
                ? editData.map(row => ({
                    ...row,
                    MediaPlanId: targetMediaPlanId || row.MediaPlanId,
                    OpportunityId: targetOpportunityId || row.OpportunityId
                  }))
                : editData}
                  pagination={{
                    pageSize,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showSizeChanger: true,
                    onShowSizeChange: (current, size) => setPageSize(size),
                  }}
              rowKey={record => String(record.Id)}
              scroll={{ x: 'max-content' }}
                />
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
                  <Button onClick={() => setCurrentStep(2)}>Back</Button>
                  <Button
                    type="primary"
                    loading={processing}
                onClick={() => handleProcess(selectedAction || 'clone')}
                  >
                    Next
                  </Button>
                </div>
          </div>
        )}

        {currentStep === 4 && (
          <div>
            <h2>Review Processed Data</h2>
            <Table
              columns={selectDataColumns}
              dataSource={selectedAction === 'copy'
                ? reviewLineOnly(reviewData).map(row => ({ ...row, MediaPlanId: targetMediaPlanId }))
                : reviewLineOnly(reviewData)}
              pagination={{
                pageSize,
                pageSizeOptions: ['10', '20', '50', '100'],
                showSizeChanger: true,
                onShowSizeChange: (current, size) => setPageSize(size),
              }}
              rowKey={record => String(record.Id)}
              scroll={{ x: 'max-content' }}
            />
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
              <Button onClick={() => setCurrentStep(3)}>Back</Button>
              <Button type="primary" onClick={() => setCurrentStep(5)}>Next</Button>
            </div>
            {selectedAction === 'edit' && (
              <div style={{ marginTop: 24, color: 'red', textAlign: 'center' }}>
                <b>Warning:</b> The original line items will be overwritten. Please double-check your changes carefully before importing the CSV into OMS.
              </div>
            )}
          </div>
        )}

        {currentStep === 5 && (
          <div style={{ textAlign: 'center', marginTop: 60 }}>
            <h2>Edit Complete!</h2>
            <p>Please go back to the corresponding media plan page in the OMS system and import the exported CSV file.</p>
            <Button
              type="primary"
              onClick={async () => {
                try {
                  const response = await axios.get('/download_ready_csv', {
                    responseType: 'blob'
                  });
                  const url = window.URL.createObjectURL(new Blob([response.data]));
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', 'ready_for_import.csv');
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  window.URL.revokeObjectURL(url);
                  setDownloaded(true);
                } catch (error) {
                  message.error('Download failed: ' + (error instanceof Error ? error.message : String(error)));
                }
              }}
              disabled={!downloadReady}
              style={{ marginTop: 24, marginRight: 16 }}
            >
              Download CSV
            </Button>
            <Button
              style={{ marginTop: 24 }}
              onClick={() => setCurrentStep(4)}
            >
              Back
            </Button>
          </div>
        )}

        <Modal
          title="Enter Target Media Plan ID, Name and Opportunity ID"
          open={showCopyModal}
          onOk={() => {
            if (!targetMediaPlanId || !targetOpportunityId) {
              message.error('Please enter Media Plan ID and Opportunity ID');
              return;
            }
            setShowCopyModal(false);
            setCurrentStep(3);
          }}
          onCancel={() => setShowCopyModal(false)}
          okText="Next"
          cancelText="Cancel"
        >
          <div style={{ marginBottom: 16 }}>
            <Input
              placeholder="Target Media Plan ID"
              value={targetMediaPlanId || ''}
              onChange={e => setTargetMediaPlanId(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            <Input
              placeholder="Target Media Plan Name (optional)"
              value={targetMediaPlanName || ''}
              onChange={e => setTargetMediaPlanName(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            <Input
              placeholder="Target Opportunity ID"
              value={targetOpportunityId || ''}
              onChange={e => setTargetOpportunityId(e.target.value)}
            />
          </div>
        </Modal>

        <Modal
          title="User Manual"
          open={helpVisible}
          onCancel={() => setHelpVisible(false)}
          footer={null}
          width={800}
          styles={{ body: { maxHeight: 600, overflowY: 'auto' } }}
        >
          <div style={{ fontSize: 16 }}>
            <h2>OMS Import Assistant User Manual</h2>
            <ol style={{ paddingLeft: 20 }}>
              <li>
                <b>Upload your CSV file.</b> The file must contain <b>all</b> of the following columns (column order must match the template):<br/>
                <span style={{ color: '#333', fontSize: 15 }}>
                  <b>{["EntityType","Id","Name","Description","StartDate","EndDate","TargetSpend","CustomerId","CustomerName","MediaPlanId","MediaPlanName","CurrencyCode","Contact","OpportunityId","MediaPlanStatus","LineId","LineName","LineType","LineStatus","Cpm","Cpd","TargetImpressions","IsReserved","BudgetScheduleType","Targets","PublisherId","PublisherName","ProductId","ProductName","ProductType"].join(', ')}</b>
                </span>
              </li>
              <li>After upload, select the data rows you want to operate on. You can filter and page through the data.</li>
              <li>Choose an action: <b>Clone</b>, <b>Copy</b>, or <b>Edit</b> the selected lines.</li>
              <li>
                In Edit Data, you can <b>only edit the following fields</b>:<br/>
                <span style={{ color: '#333', fontSize: 15 }}>
                  <b>{['Name', 'Description', 'StartDate', 'EndDate', 'TargetSpend', 'Cpm', 'Cpd', 'TargetImpressions', 'IsReserved', 'LineType', 'BudgetScheduleType', 'CurrencyCode', 'Contact'].join(', ')}</b>
                </span><br/>
                All other fields are read-only and cannot be modified.
              </li>
              <li>Review the processed data. Only Line items are shown for review.</li>
              <li>Download the ready-for-import CSV and import it into your OMS system.</li>
            </ol>
            <div style={{ marginTop: 24 }}>
              <b>For further assistance, please contact:</b>
              <ul style={{ marginTop: 8 }}>
                <li>Eric Duerr (<a href="mailto:ericduer@microsoft.com">ericduer@microsoft.com</a>)</li>
                <li>Neo Cheng (<a href="mailto:neocheng@microsoft.com">neocheng@microsoft.com</a>)</li>
              </ul>
            </div>
          </div>
        </Modal>

        <ConfirmModal />
      </Content>
    </Layout>
  );
};

export default App;
