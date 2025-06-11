import React, { useState, useEffect } from 'react';
import { Layout, Steps, Upload, Table, Button, message, Modal, Input, DatePicker, AutoComplete } from 'antd';
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

  const columns = [
    { title: 'entitytype', dataIndex: 'entitytype', key: 'entitytype', width: 110, ellipsis: true },
    { title: 'Id', dataIndex: 'Id', key: 'Id', width: 80, ellipsis: true },
    { title: 'customerId', dataIndex: 'customerId', key: 'customerId', width: 120, ellipsis: true },
    { title: 'MediaPlanId', dataIndex: 'MediaPlanId', key: 'MediaPlanId', width: 120, ellipsis: true },
    { title: 'PRODUCTID', dataIndex: 'PRODUCTID', key: 'PRODUCTID', width: 110, ellipsis: true },
    { title: 'Name', dataIndex: 'Name', key: 'Name', width: 180, ellipsis: true },
    { title: 'Description', dataIndex: 'Description', key: 'Description', width: 200, ellipsis: true },
    { title: 'StartDate', dataIndex: 'StartDate', key: 'StartDate', width: 140, ellipsis: true },
    { title: 'EndDate', dataIndex: 'EndDate', key: 'EndDate', width: 140, ellipsis: true },
    { title: 'Cpm', dataIndex: 'Cpm', key: 'Cpm', width: 80, ellipsis: true },
    { title: 'Cpd', dataIndex: 'Cpd', key: 'Cpd', width: 80, ellipsis: true },
    { title: 'TargetImpressions', dataIndex: 'TargetImpressions', key: 'TargetImpressions', width: 140, ellipsis: true },
    { title: 'TargetSpend', dataIndex: 'TargetSpend', key: 'TargetSpend', width: 120, ellipsis: true },
    { title: 'IsReserved', dataIndex: 'IsReserved', key: 'IsReserved', width: 110, ellipsis: true },
    { title: 'LineType', dataIndex: 'LineType', key: 'LineType', width: 110, ellipsis: true },
    { title: 'BudgetScheduleType', dataIndex: 'BudgetScheduleType', key: 'BudgetScheduleType', width: 140, ellipsis: true },
    { title: 'Targets', dataIndex: 'Targets', key: 'Targets', width: 120, ellipsis: true },
    { title: 'LineId', dataIndex: 'LineId', key: 'LineId', width: 100, ellipsis: true },
    { title: 'TargetType', dataIndex: 'TargetType', key: 'TargetType', width: 110, ellipsis: true },
    { title: 'Ids', dataIndex: 'Ids', key: 'Ids', width: 100, ellipsis: true },
    { title: 'IsExcluded', dataIndex: 'IsExcluded', key: 'IsExcluded', width: 110, ellipsis: true },
    { title: 'AudienceTargetingType', dataIndex: 'AudienceTargetingType', key: 'AudienceTargetingType', width: 160, ellipsis: true },
    { title: 'DeviceTypes', dataIndex: 'DeviceTypes', key: 'DeviceTypes', width: 140, ellipsis: true },
  ];

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
      setSelectedRowKeys(keys);
      setSelectedRows(rows);
    },
  };

  // 进入第三步时初始化可编辑数据
  useEffect(() => {
    if (currentStep === 3 && selectedRows.length > 0) {
      setEditData(selectedRows.map(row => ({ ...row, originalId: row.originalId })));
    }
  }, [currentStep, selectedRows]);

  // 克隆/编辑页面只显示的16个字段
  const clonePageFields = [
    'entitytype', 'Id', 'customerId', 'MediaPlanId', 'PRODUCTID',
    'Name', 'Description', 'StartDate', 'EndDate', 'Cpm', 'Cpd',
    'TargetImpressions', 'TargetSpend', 'IsReserved', 'LineType', 'BudgetScheduleType'
  ];

  // 只读字段
  const readOnlyFields = ['Id', 'entitytype', 'customerId', 'MediaPlanId', 'PRODUCTID'];

  // 1. 定义通用排序器
  const getSorter = (dataIndex: string) => {
    if ([
      'Id', 'customerId', 'MediaPlanId', 'PRODUCTID', 'Cpm', 'Cpd', 'TargetImpressions', 'TargetSpend', 'LineId', 'Ids'
    ].includes(dataIndex)) {
      return (a: any, b: any) => Number(a[dataIndex] || 0) - Number(b[dataIndex] || 0);
    }
    if ([
      'StartDate', 'EndDate'
    ].includes(dataIndex)) {
      return (a: any, b: any) => {
        const da = a[dataIndex] ? dayjs(a[dataIndex]) : dayjs(0);
        const db = b[dataIndex] ? dayjs(b[dataIndex]) : dayjs(0);
        return da.valueOf() - db.valueOf();
      };
    }
    return (a: any, b: any) => (a[dataIndex] || '').toString().localeCompare((b[dataIndex] || '').toString());
  };

  // 只用于显示的columns
  const clonePageColumns = columns.filter(col => clonePageFields.includes(col.dataIndex)).map(col => {
    return {
      ...col,
      ...(readOnlyFields.includes(col.dataIndex) ? { render: (text: any) => <span>{text}</span> } : {}),
      sorter: getSorter(col.dataIndex),
    } as any;
  });

  // review页只展示entitytype=Line的数据
  const reviewLineOnly = (arr: any[]) => (arr || []).filter(row => row.entitytype === 'Line');

  useEffect(() => {
    const updateHeight = () => setTableHeight(window.innerHeight - 320); // 320为header/steps等高度
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Select Data页表格columns只用16列
  const selectDataFields = [
    'entitytype', 'Id', 'customerId', 'MediaPlanId', 'PRODUCTID',
    'Name', 'Description', 'StartDate', 'EndDate', 'Cpm', 'Cpd',
    'TargetImpressions', 'TargetSpend', 'IsReserved', 'LineType', 'BudgetScheduleType'
  ];

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

  const selectDataColumns = columns.filter(col => selectDataFields.includes(col.dataIndex)).map(col => {
    if (col.dataIndex === 'Id') {
      return {
        ...col,
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
      sorter: getSorter(col.dataIndex),
    } as any;
  });

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
                type="default"
                style={{ fontWeight: 500 }}
                href="https://omsimportassistant-hrhpdxdrbvc3eha9.eastus2-01.azurewebsites.net/download_template"
                target="_blank"
                icon={<InboxOutlined />}>
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
              scroll={{ x: true, y: tableHeight }}
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
            {selectedAction === 'copy' ? (
              <div>
                <h2>Please edit the lines you want to copy</h2>
                <Table
                  columns={clonePageColumns}
                  dataSource={editData.map(row => ({ ...row, MediaPlanId: targetMediaPlanId }))}
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
                  <Button onClick={() => setCurrentStep(2)}>Back</Button>
                  <Button
                    type="primary"
                    loading={processing}
                    onClick={async () => {
                      setProcessing(true);
                      try {
                        const submitData = editData.map(row => ({ ...row, Id: row.originalId, MediaPlanId: targetMediaPlanId }));
                        const res = await axios.post('/process_copy', { lines: submitData, targetMediaPlanId });
                        if (res.data && res.data.success) {
                          setReviewData(res.data.review_data || []);
                          setDownloadReady(true);
                          setCurrentStep(4);
                        } else {
                          message.error(res.data.error || 'Processing failed');
                        }
                      } catch (e) {
                        message.error('Processing failed');
                      } finally {
                        setProcessing(false);
                      }
                    }}
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
                />
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
                  <Button onClick={() => setCurrentStep(2)}>Back</Button>
                  <Button
                    type="primary"
                    loading={processing}
                    onClick={async () => {
                      setProcessing(true);
                      try {
                        const submitData = editData.map(row => ({ ...row, Id: row.originalId }));
                        const res = await axios.post('/process_edit', submitData);
                        if (res.data && res.data.success) {
                          setReviewData(res.data.review_data || []);
                          setDownloadReady(true);
                          setCurrentStep(4);
                        } else {
                          message.error(res.data.error || 'Processing failed');
                        }
                      } catch (e) {
                        message.error('Processing failed');
                      } finally {
                        setProcessing(false);
                      }
                    }}
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
                />
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
                  <Button onClick={() => setCurrentStep(2)}>Back</Button>
                  <Button
                    type="primary"
                    loading={processing}
                    onClick={async () => {
                      setProcessing(true);
                      try {
                        const submitData = editData.map(row => ({ ...row, Id: row.originalId }));
                        const res = await axios.post('/process_clone', submitData);
                        if (res.data && res.data.success) {
                          setReviewData(res.data.review_data || []);
                          setDownloadReady(true);
                          setCurrentStep(4);
                        } else {
                          message.error(res.data.error || 'Processing failed');
                        }
                      } catch (e) {
                        message.error('Processing failed');
                      } finally {
                        setProcessing(false);
                      }
                    }}
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
              columns={columns}
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
          title="Enter target Media Plan Id"
          open={showCopyModal}
          onOk={() => { setShowCopyModal(false); setCurrentStep(3); }}
          onCancel={() => setShowCopyModal(false)}
          okButtonProps={{ disabled: !targetMediaPlanId }}
        >
          <Input
            placeholder="Target Media Plan Id"
            value={targetMediaPlanId || ''}
            onChange={e => setTargetMediaPlanId(e.target.value)}
          />
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
      </Content>
    </Layout>
  );
};

export default App;
