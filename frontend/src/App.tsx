import React, { useState, useEffect } from 'react';
import { Layout, Steps, Upload, Table, Button, message, Modal, Input, DatePicker, AutoComplete, Progress, Select } from 'antd';
import { InboxOutlined, HomeOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import type { FilterDropdownProps } from 'antd/es/table/interface';
import axios from 'axios';
import dayjs from 'dayjs';

axios.defaults.baseURL = 'https://omsimportassistant-hrhpdxdrbvc3eha9.eastus2-01.azurewebsites.net';

const { Header, Content } = Layout;
const { Dragger } = Upload;
const { Step } = Steps;
const { RangePicker } = DatePicker;

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
  const [idFilter, setIdFilter] = useState<string[]>([]);
  const [idInput, setIdInput] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [descFilter, setDescFilter] = useState('');
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [nameFilterInput, setNameFilterInput] = useState('');
  const [descFilterInput, setDescFilterInput] = useState('');
  const [dateRangeInput, setDateRangeInput] = useState<[string, string] | null>(null);
  const [pageSize, setPageSize] = useState(20);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);

  // 1. 定义通用排序器
  const getSorter = (dataIndex: string) => {
    if ([
      'Id', 'CustomerId', 'MediaPlanId', 'OpportunityId', 'PublisherId', 'ProductId', 'Cpm', 'Cpd', 'TargetImpressions', 'TargetSpend'
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

  // 2. 新CSV字段顺序
  const allFields = [
    "EntityType","Id","Name","Description","StartDate","EndDate","TargetSpend","CustomerId","CustomerName","MediaPlanId","MediaPlanName","CurrencyCode","Contact","OpportunityId","MediaPlanStatus","LineId","LineName","LineType","LineStatus","Cpm","Cpd","TargetImpressions","IsReserved","BudgetScheduleType","Targets","PublisherId","PublisherName","ProductId","ProductName","ProductType"
  ];
  // 3. 全局隐藏字段
  const hiddenFields = ["LineId", "LineName", "LineStatus", "Targets"];
  // 4. 全局显示字段
  const displayFields = allFields.filter(f => !hiddenFields.includes(f));
  // 5. 统一columns定义（顺序与allFields一致）
  const columns = allFields.map(field => ({
    title: field,
    dataIndex: field,
    key: field,
    width: 120,
    ellipsis: true,
  }));

  // 定义不同操作模式下的只读字段
  const getReadOnlyFields = (action: string | null) => {
    const commonReadOnlyFields = [
      "EntityType", "Id", "CustomerId", "CustomerName", "MediaPlanId", 
      "OpportunityId", "MediaPlanStatus", "PublisherId", "PublisherName", 
      "ProductId", "ProductName", "ProductType"
    ];
    
    switch (action) {
      case 'clone':
        return commonReadOnlyFields;
      case 'copy':
        return [...commonReadOnlyFields, "MediaPlanName"];
      case 'edit':
        return commonReadOnlyFields;
      default:
        return [];
    }
  };

  // 6. selectDataColumns 只显示 displayFields
  const selectDataColumns = columns.filter(col => displayFields.includes(col.dataIndex)).map(col => {
    if (col.dataIndex === 'Id') {
      return {
        ...col,
        width: 120,
        filterDropdown: () => (
          <div style={{ padding: 8, width: 200 }}>
            <AutoComplete
              style={{ width: '100%' }}
              options={idOptions}
              value={idInput}
              onChange={v => {
                setIdInput(v);
              }}
              onSelect={v => {
                if (!idFilter.includes(v)) setIdFilter([...idFilter, v]);
                setIdInput('');
              }}
              placeholder="Type to search Id"
              allowClear
            />
            <div style={{ marginTop: 8, minHeight: 32 }}>
              {idFilter.map(id => (
                <span key={id} style={{ display: 'inline-block', background: '#e6f7ff', borderRadius: 4, padding: '2px 8px', margin: 2 }}>
                  {id} <button onClick={() => setIdFilter(idFilter.filter(i => i !== id))} style={{ color: '#1890ff', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} aria-label="Remove Id">x</button>
                </span>
              ))}
            </div>
          </div>
        ),
        filterIcon: (filtered: boolean) => <span style={{ color: idFilter.length ? '#1890ff' : undefined }}>🔍</span>,
        filteredValue: idFilter.length ? idFilter : null,
        sorter: getSorter(col.dataIndex),
      };
    }
    if (col.dataIndex === 'Name') {
      return {
        ...col,
        width: 200,
        filterDropdown: (props: FilterDropdownProps) => (
          <div style={{ padding: 8 }}>
            <Input
              placeholder="Search Name"
              value={nameFilterInput}
              onChange={e => setNameFilterInput(e.target.value)}
              onPressEnter={() => { setNameFilter(nameFilterInput); props.confirm(); }}
              style={{ width: 188, marginBottom: 8, display: 'block' }}
            />
            <Button
              type="primary"
              onClick={() => { setNameFilter(nameFilterInput); props.confirm(); }}
              icon={<InboxOutlined />}
              size="small"
              style={{ width: 90, marginRight: 8 }}
            >
              Search
            </Button>
            <Button onClick={() => { setNameFilterInput(''); setNameFilter(''); props.clearFilters?.(); }} size="small" style={{ width: 90 }}>
              Reset
            </Button>
          </div>
        ),
        filterIcon: (filtered: boolean) => <span style={{ color: nameFilter ? '#1890ff' : undefined }}>🔍</span>,
        filteredValue: nameFilter ? [nameFilter] : null,
        sorter: getSorter(col.dataIndex),
      };
    }
    if (col.dataIndex === 'Description') {
      return {
        ...col,
        width: 200,
        filterDropdown: (props: FilterDropdownProps) => (
          <div style={{ padding: 8 }}>
            <Input
              placeholder="Search Description"
              value={descFilterInput}
              onChange={e => setDescFilterInput(e.target.value)}
              onPressEnter={() => { setDescFilter(descFilterInput); props.confirm(); }}
              style={{ width: 188, marginBottom: 8, display: 'block' }}
            />
            <Button
              type="primary"
              onClick={() => { setDescFilter(descFilterInput); props.confirm(); }}
              icon={<InboxOutlined />}
              size="small"
              style={{ width: 90, marginRight: 8 }}
            >
              Search
            </Button>
            <Button onClick={() => { setDescFilterInput(''); setDescFilter(''); props.clearFilters?.(); }} size="small" style={{ width: 90 }}>
              Reset
            </Button>
          </div>
        ),
        filterIcon: (filtered: boolean) => <span style={{ color: descFilter ? '#1890ff' : undefined }}>🔍</span>,
        filteredValue: descFilter ? [descFilter] : null,
        sorter: getSorter(col.dataIndex),
      };
    }
    if (col.dataIndex === 'StartDate' || col.dataIndex === 'EndDate') {
      return {
        ...col,
        width: 150,
        filterDropdown: (props: FilterDropdownProps) => (
          <div style={{ padding: 8 }}>
            <RangePicker
              value={dateRangeInput ? [
                dateRangeInput[0] ? dayjs(dateRangeInput[0]) : null,
                dateRangeInput[1] ? dayjs(dateRangeInput[1]) : null
              ] : null}
              onChange={dates => {
                if (dates) setDateRangeInput([dates[0]?.format('YYYY-MM-DD') || '', dates[1]?.format('YYYY-MM-DD') || '']);
                else setDateRangeInput(null);
              }}
              style={{ width: 220 }}
            />
            <div style={{ marginTop: 8 }}>
              <Button type="primary" onClick={() => { setDateRange(dateRangeInput); props.confirm(); }} size="small" style={{ width: 90, marginRight: 8 }}>Search</Button>
              <Button onClick={() => { setDateRangeInput(null); setDateRange(null); props.clearFilters?.(); }} size="small" style={{ width: 90 }}>Reset</Button>
            </div>
          </div>
        ),
        filterIcon: (filtered: boolean) => <span style={{ color: dateRange ? '#1890ff' : undefined }}>📅</span>,
        filteredValue: dateRange ? [dateRange.join(',')] : null,
        sorter: getSorter(col.dataIndex),
      };
    }
    return {
      ...col,
      width: 120,
      sorter: getSorter(col.dataIndex),
    } as any;
  });

  // 定义clonePageColumns
  const clonePageColumns = [
    {
      title: 'EntityType',
      dataIndex: 'EntityType',
      key: 'EntityType',
      width: 120,
    },
    {
      title: 'Id',
      dataIndex: 'Id',
      key: 'Id',
      width: 120,
    },
    {
      title: 'Name',
      dataIndex: 'Name',
      key: 'Name',
      width: 200,
    },
    {
      title: 'Description',
      dataIndex: 'Description',
      key: 'Description',
      width: 200,
    },
    {
      title: 'StartDate',
      dataIndex: 'StartDate',
      key: 'StartDate',
      width: 180,
    },
    {
      title: 'EndDate',
      dataIndex: 'EndDate',
      key: 'EndDate',
      width: 180,
    },
    {
      title: 'TargetSpend',
      dataIndex: 'TargetSpend',
      key: 'TargetSpend',
      width: 120,
    },
    {
      title: 'CustomerId',
      dataIndex: 'CustomerId',
      key: 'CustomerId',
      width: 120,
    },
    {
      title: 'CustomerName',
      dataIndex: 'CustomerName',
      key: 'CustomerName',
      width: 150,
    },
    {
      title: 'MediaPlanId',
      dataIndex: 'MediaPlanId',
      key: 'MediaPlanId',
      width: 120,
    },
    {
      title: 'MediaPlanName',
      dataIndex: 'MediaPlanName',
      key: 'MediaPlanName',
      width: 150,
    },
    {
      title: 'CurrencyCode',
      dataIndex: 'CurrencyCode',
      key: 'CurrencyCode',
      width: 120,
    },
    {
      title: 'Contact',
      dataIndex: 'Contact',
      key: 'Contact',
      width: 200,
    },
    {
      title: 'OpportunityId',
      dataIndex: 'OpportunityId',
      key: 'OpportunityId',
      width: 120,
    },
    {
      title: 'MediaPlanStatus',
      dataIndex: 'MediaPlanStatus',
      key: 'MediaPlanStatus',
      width: 150,
    },
    {
      title: 'LineId',
      dataIndex: 'LineId',
      key: 'LineId',
      width: 120,
    },
    {
      title: 'LineName',
      dataIndex: 'LineName',
      key: 'LineName',
      width: 150,
    },
    {
      title: 'LineType',
      dataIndex: 'LineType',
      key: 'LineType',
      width: 120,
    },
    {
      title: 'LineStatus',
      dataIndex: 'LineStatus',
      key: 'LineStatus',
      width: 120,
    },
    {
      title: 'Cpm',
      dataIndex: 'Cpm',
      key: 'Cpm',
      width: 100,
    },
    {
      title: 'Cpd',
      dataIndex: 'Cpd',
      key: 'Cpd',
      width: 100,
    },
    {
      title: 'TargetImpressions',
      dataIndex: 'TargetImpressions',
      key: 'TargetImpressions',
      width: 150,
    },
    {
      title: 'IsReserved',
      dataIndex: 'IsReserved',
      key: 'IsReserved',
      width: 100,
    },
    {
      title: 'BudgetScheduleType',
      dataIndex: 'BudgetScheduleType',
      key: 'BudgetScheduleType',
      width: 150,
    },
    {
      title: 'Targets',
      dataIndex: 'Targets',
      key: 'Targets',
      width: 200,
    },
    {
      title: 'PublisherId',
      dataIndex: 'PublisherId',
      key: 'PublisherId',
      width: 120,
    },
    {
      title: 'PublisherName',
      dataIndex: 'PublisherName',
      key: 'PublisherName',
      width: 150,
    },
    {
      title: 'ProductId',
      dataIndex: 'ProductId',
      key: 'ProductId',
      width: 120,
    },
    {
      title: 'ProductName',
      dataIndex: 'ProductName',
      key: 'ProductName',
      width: 150,
    },
    {
      title: 'ProductType',
      dataIndex: 'ProductType',
      key: 'ProductType',
      width: 120,
    }
  ];

  // 添加数据验证函数
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
      "Targets", "PublisherId", "PublisherName", "ProductId", "ProductName", 
      "ProductType"
    ];

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

      // 验证数据
      const errors = validateData(submitData);
      if (errors.length > 0) {
        message.error(
          <div>
            <p>Please fix the following errors:</p>
            <ul>
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        );
        return;
      }

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

  // 修改表格组件配置
  const components = {
    body: {
      cell: (props: any) => {
        const { dataIndex, record, children, ...restProps } = props;
        const editable = !getReadOnlyFields(selectedAction).includes(dataIndex);
        
        if (!editable) {
          return <td {...restProps}>{children}</td>;
        }

        let input;
        if (dataIndex === 'IsReserved') {
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
              defaultValue={record[dataIndex]}
              onChange={(e) => {
                const newData = [...editData];
                const index = newData.findIndex(item => item.originalId === record.originalId);
                if (index > -1) {
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
      // 合并已选 keys，去重
      const mergedKeys = Array.from(new Set([...selectedRowKeys, ...keys]));
      // 只保留当前 data 里存在的行
      const allRows = [...selectedRows, ...rows];
      const mergedRows = mergedKeys.map(key => allRows.find(row => row.originalId === key)).filter(Boolean);
      setSelectedRowKeys(mergedKeys);
      setSelectedRows(mergedRows);
    },
    // 当用户取消勾选时，移除对应 key
    onSelect: (record: any, selected: boolean) => {
      if (!selected) {
        setSelectedRowKeys(selectedRowKeys.filter(key => key !== record.originalId));
        setSelectedRows(selectedRows.filter(row => row.originalId !== record.originalId));
      }
    },
    onSelectAll: (selected: boolean, selectedRowsAll: any[], changeRows: any[]) => {
      if (selected) {
        // 全选时合并所有 keys
        const newKeys = changeRows.map(row => row.originalId);
        const mergedKeys = Array.from(new Set([...selectedRowKeys, ...newKeys]));
        const allRows = [...selectedRows, ...changeRows];
        const mergedRows = mergedKeys.map(key => allRows.find(row => row.originalId === key)).filter(Boolean);
        setSelectedRowKeys(mergedKeys);
        setSelectedRows(mergedRows);
      } else {
        // 取消全选时移除当前页 keys
        const removeKeys = changeRows.map(row => row.originalId);
        setSelectedRowKeys(selectedRowKeys.filter(key => !removeKeys.includes(key)));
        setSelectedRows(selectedRows.filter(row => !removeKeys.includes(row.originalId)));
      }
    }
  };

  // 进入第三步时初始化可编辑数据
  useEffect(() => {
    if (currentStep === 3 && selectedRows.length > 0) {
      setEditData(selectedRows.map(row => ({ ...row, originalId: row.originalId })));
    }
  }, [currentStep, selectedRows]);

  // review页只展示entitytype=Line的数据
  const reviewLineOnly = (arr: any[]) => (arr || []).filter(row => row.entitytype === 'Line');

  useEffect(() => {
    const updateHeight = () => setTableHeight(window.innerHeight - 320); // 320为header/steps等高度
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

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

  // Id下拉选项
  const idOptions = Array.from(new Set(data.map(row => String(row.Id))))
    .filter(id => id.includes(idInput))
    .map(id => ({ value: id }));

  const handleDownloadTemplate = () => {
    window.open('https://omsimportassistant-hrhpdxdrbvc3eha9.eastus2-01.azurewebsites.net/download_template', '_blank');
  };

  // 修改处理按钮的点击事件
  const handleNextClick = () => {
    setConfirmModalVisible(true);
  };

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
          handleProcess(selectedAction || '');
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
            setSelectedAction(null);
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
                onClick={handleDownloadTemplate}
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
              rowKey="originalId"
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
                style={{ margin: '0 0 0 0', minWidth: 400, height: 64, fontSize: 22 }}
                onClick={() => { setSelectedAction('clone'); setCurrentStep(3); }}
              >
                I want to clone these line items in the media plan
              </Button>
              <Button
                type={selectedAction === 'copy' ? 'primary' : 'default'}
                size="large"
                style={{ margin: '0 0 0 0', minWidth: 400, height: 64, fontSize: 22 }}
                onClick={() => { setSelectedAction('copy'); setShowCopyModal(true); }}
              >
                I want to copy these line items into a new media plan
              </Button>
              <Button
                type={selectedAction === 'edit' ? 'primary' : 'default'}
                size="large"
                style={{ margin: '0 0 0 0', minWidth: 400, height: 64, fontSize: 22 }}
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
            {selectedAction === 'copy' ? (
              <div>
                <h2>Please edit the lines you want to copy</h2>
                <Table
                  columns={clonePageColumns}
                  dataSource={editData.map(row => ({ 
                    ...row, 
                    MediaPlanId: targetMediaPlanId,
                    OpportunityId: targetOpportunityId
                  }))}
                  pagination={{
                    pageSize,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showSizeChanger: true,
                    onShowSizeChange: (current, size) => setPageSize(size),
                  }}
                  rowKey="originalId"
                  scroll={{ x: true }}
                  components={components}
                />
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
                  <Button onClick={() => setCurrentStep(2)}>Back</Button>
                  <Button
                    type="primary"
                    loading={processing}
                    onClick={handleNextClick}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : selectedAction === 'edit' ? (
              <div>
                <h2>Please edit the lines you want to update</h2>
                <Table
                  columns={clonePageColumns}
                  dataSource={editData}
                  pagination={{
                    pageSize,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showSizeChanger: true,
                    onShowSizeChange: (current, size) => setPageSize(size),
                  }}
                  rowKey="originalId"
                  scroll={{ x: true }}
                  components={components}
                />
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
                  <Button onClick={() => setCurrentStep(2)}>Back</Button>
                  <Button
                    type="primary"
                    loading={processing}
                    onClick={handleNextClick}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <h2>Please edit the lines you want to clone</h2>
                <Table
                  columns={clonePageColumns}
                  dataSource={editData}
                  pagination={{
                    pageSize,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showSizeChanger: true,
                    onShowSizeChange: (current, size) => setPageSize(size),
                  }}
                  rowKey="originalId"
                  scroll={{ x: true }}
                  components={components}
                />
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
                  <Button onClick={() => setCurrentStep(2)}>Back</Button>
                  <Button
                    type="primary"
                    loading={processing}
                    onClick={handleNextClick}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
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
              rowKey="originalId"
              scroll={{ x: true }}
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
              href={downloadReady ? 'https://omsimportassistant-hrhpdxdrbvc3eha9.eastus2-01.azurewebsites.net/download_ready_csv' : undefined}
              target="_blank"
              disabled={!downloadReady}
              style={{ marginTop: 24, marginRight: 16 }}
              onClick={() => setDownloaded(true)}
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
          title="Enter target Media Plan Id and Opportunity Id"
          open={showCopyModal}
          onOk={() => { 
            if (targetMediaPlanId && targetOpportunityId) {
              setShowCopyModal(false); 
              setCurrentStep(3);
            } else {
              message.error('Please enter both Media Plan Id and Opportunity Id');
            }
          }}
          onCancel={() => setShowCopyModal(false)}
          okButtonProps={{ disabled: !targetMediaPlanId || !targetOpportunityId }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ marginBottom: 8 }}>Target Media Plan Id:</div>
              <Input
                placeholder="Target Media Plan Id"
                value={targetMediaPlanId || ''}
                onChange={e => setTargetMediaPlanId(e.target.value)}
              />
            </div>
            <div>
              <div style={{ marginBottom: 8 }}>Target Opportunity Id:</div>
              <Input
                placeholder="Target Opportunity Id"
                value={targetOpportunityId || ''}
                onChange={e => setTargetOpportunityId(e.target.value)}
              />
            </div>
          </div>
        </Modal>

        <Modal
          title="User Manual"
          open={helpVisible}
          onCancel={() => setHelpVisible(false)}
          footer={null}
          width={800}
          bodyStyle={{ maxHeight: 600, overflowY: 'auto' }}
        >
          <div style={{ fontSize: 16 }}>
            <h2>OMS Import Assistant User Manual</h2>
            <ol style={{ paddingLeft: 20 }}>
              <li>Upload your CSV file. The file must contain the required columns: <b>entitytype, Id, customerId, MediaPlanId, PRODUCTID, Name, Description, StartDate, EndDate, Cpm, Cpd, TargetImpressions, TargetSpend, IsReserved, LineType, BudgetScheduleType, Targets, LineId, TargetType, Ids, IsExcluded, AudienceTargetingType, DeviceTypes</b>.</li>
              <li>After upload, select the data rows you want to operate on. You can filter and page through the data.</li>
              <li>Choose an action: <b>Clone</b>, <b>Copy</b>, or <b>Edit</b> the selected lines.</li>
              <li>In Edit Data, you can only edit specific parameters. Read-only fields are greyed out.</li>
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
