const userManual = `
# OMS Import Assistant User Manual

1. Upload your CSV file. The file must contain the required columns: entitytype, Id, customerId, MediaPlanId, PRODUCTID, Name, Description, StartDate, EndDate, Cpm, Cpd, TargetImpressions, TargetSpend, IsReserved, LineType, BudgetScheduleType, Targets, LineId, TargetType, Ids, IsExcluded, AudienceTargetingType, DeviceTypes.
2. After upload, select the data rows you want to operate on. You can filter and page through the data.
3. Choose an action: Clone, Copy, or Edit the selected lines.
4. In Edit Data, you can only edit specific parameters. Read-only fields are greyed out.
5. Review the processed data. Only Line items are shown for review.
6. Download the ready-for-import CSV and import it into your OMS system.

For detailed step-by-step instructions, please refer to the full documentation or contact support.
`;

export default userManual; 