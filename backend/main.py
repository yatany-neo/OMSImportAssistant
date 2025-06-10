from fastapi import FastAPI, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import pandas as pd
import os
from typing import List
import json
import numpy as np
import tempfile
import redis

app = FastAPI()

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://zealous-water-097e55b1e.6.azurestaticapps.net"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 用于存储内存中的临时数据
TEMP_DATA = {
    "lines_temp": None,  # entitytype=Line 的所有行
    "lines_target_temp": None,  # entitytype=LineTarget 的所有行
}

REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD", None)

redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD,
    decode_responses=True,
    ssl=True
)

def get_session_id(request: Request):
    return request.cookies.get("session_id") or "default"

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        df = pd.read_csv(file.file)
        print("[DEBUG] 上传CSV shape:", df.shape)
        print("[DEBUG] 上传CSV columns:", df.columns.tolist())
        required_columns = [
            "entitytype", "Id", "customerId", "MediaPlanId", "PRODUCTID",
            "Name", "Description", "StartDate", "EndDate", "Cpm", "Cpd",
            "TargetImpressions", "TargetSpend", "IsReserved", "LineType",
            "BudgetScheduleType", "Targets", "LineId", "TargetType", "Ids",
            "IsExcluded", "AudienceTargetingType", "DeviceTypes"
        ]
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            print(f"[DEBUG] 缺失列: {missing_columns}")
            return {"error": f"Missing required columns: {', '.join(missing_columns)}"}
        # 分离Line和LineTarget数据，忽略大小写和空格
        lines_df = df[df['entitytype'].astype(str).str.strip().str.lower() == 'line']
        lines_target_df = df[df['entitytype'].astype(str).str.strip().str.lower() == 'linetarget']
        print("[DEBUG] Line行数:", lines_df.shape[0])
        print("[DEBUG] LineTarget行数:", lines_target_df.shape[0])
        print("[DEBUG] Line部分预览:", lines_df.head(2).to_dict(orient='records'))
        print("[DEBUG] LineTarget部分预览:", lines_target_df.head(2).to_dict(orient='records'))
        # 存入内存
        TEMP_DATA["lines_temp"] = lines_df.reset_index(drop=True)
        TEMP_DATA["lines_target_temp"] = lines_target_df.reset_index(drop=True)
        return {"message": "File processed successfully"}
    except Exception as e:
        print(f"[DEBUG] 上传处理异常: {e}")
        return {"error": str(e)}

@app.get("/lines")
async def get_lines():
    try:
        df = TEMP_DATA["lines_temp"]
        if df is None:
            return {"data": []}
        data = df.replace({np.nan: None}).to_dict(orient='records')
        return {"data": data}
    except Exception as e:
        return {"error": str(e)}

@app.post("/process_clone")
async def process_clone(request: Request):
    try:
        post_selection_complete_edit = await request.json()
        print("[DEBUG] process_clone收到数据行数:", len(post_selection_complete_edit))
        lines_df = pd.DataFrame(post_selection_complete_edit)
        print("[DEBUG] process_clone lines_df shape:", lines_df.shape)
        # 保留原始Id用于匹配
        lines_df["_original_Id"] = lines_df["Id"]
        lines_target_df = TEMP_DATA["lines_target_temp"]
        print("[DEBUG] process_clone lines_target_df shape:", None if lines_target_df is None else lines_target_df.shape)
        if lines_target_df is None:
            print("[DEBUG] process_clone: lines_target_df为None")
            return {"error": "No lines_target_temp data in memory"}
        # 新增详细调试输出
        print("[DEBUG] lines_df['Id']:", lines_df['Id'].tolist())
        print("[DEBUG] lines_df['_original_Id']:", lines_df['_original_Id'].tolist())
        print("[DEBUG] lines_target_df['LineId']:", lines_target_df['LineId'].tolist())
        print("[DEBUG] lines_target_df['Id']:", lines_target_df['Id'].tolist())
        # 用原始Id匹配LineTarget（类型统一为int）
        line_ids = set(int(float(i)) for i in lines_df['_original_Id'] if pd.notnull(i))
        lines_target_temp_select = lines_target_df[
            lines_target_df['LineId'].apply(lambda x: int(float(x)) if pd.notnull(x) else None).isin(line_ids)
        ].copy()
        print("[DEBUG] 匹配到的LineTarget行数:", lines_target_temp_select.shape[0])
        print("[DEBUG] 匹配到的LineTarget部分预览:", lines_target_temp_select.head(2).to_dict(orient='records'))
        # 合并
        lines_merged_select = pd.concat([lines_df, lines_target_temp_select], ignore_index=True)
        print("[DEBUG] 合并后总行数:", lines_merged_select.shape[0])
        # 不做负数Id重排，保留原始Id/LineId
        if '_original_Id' in lines_merged_select.columns:
            lines_merged_select = lines_merged_select.drop(columns=['_original_Id'])
        TEMP_DATA["lines_merged_select_update_complete"] = lines_merged_select.replace({np.nan: None})
        review_data = TEMP_DATA["lines_merged_select_update_complete"].to_dict(orient='records')
        print("[DEBUG] review_data总行数:", len(review_data))
        print("[DEBUG] review_data部分预览:", review_data[:2])
        session_id = get_session_id(request)
        redis_client.set(f"review_data:{session_id}", json.dumps(review_data), ex=3600)
        return {"success": True, "review_data": review_data, "download_url": "/download_ready_csv"}
    except Exception as e:
        print(f"[DEBUG] process_clone异常: {e}")
        return {"error": str(e)}

@app.post("/process_copy")
async def process_copy(request: Request):
    try:
        body = await request.json()
        lines = body.get('lines', [])
        target_media_plan_id = body.get('targetMediaPlanId')
        lines_df = pd.DataFrame(lines)
        lines_df["_original_Id"] = lines_df["Id"]
        lines_target_df = TEMP_DATA["lines_target_temp"]
        if lines_target_df is None:
            return {"error": "No lines_target_temp data in memory"}
        # 匹配LineTarget
        line_ids = set(int(float(i)) for i in lines_df['_original_Id'] if pd.notnull(i))
        lines_target_temp_select = lines_target_df[
            lines_target_df['LineId'].apply(lambda x: int(float(x)) if pd.notnull(x) else None).isin(line_ids)
        ].copy()
        # 合并
        lines_merged_select = pd.concat([lines_df, lines_target_temp_select], ignore_index=True)
        # 负数Id分配
        max_negative_value = -1
        line_id_map = {}
        for idx, row in lines_merged_select[lines_merged_select['entitytype'] == 'Line'].iterrows():
            old_id = row['_original_Id'] if '_original_Id' in row else row['Id']
            new_id = max_negative_value
            line_id_map[old_id] = new_id
            lines_merged_select.at[idx, 'Id'] = new_id
            lines_merged_select.at[idx, 'MediaPlanId'] = target_media_plan_id
            max_negative_value -= 1
        max_negative_value_2 = -1
        for idx, row in lines_merged_select[lines_merged_select['entitytype'] == 'LineTarget'].iterrows():
            new_id = max_negative_value_2
            lines_merged_select.at[idx, 'Id'] = new_id
            lines_merged_select.at[idx, 'MediaPlanId'] = target_media_plan_id
            max_negative_value_2 -= 1
            old_lineid = row['LineId']
            if old_lineid in line_id_map:
                lines_merged_select.at[idx, 'LineId'] = line_id_map[old_lineid]
        if '_original_Id' in lines_merged_select.columns:
            lines_merged_select = lines_merged_select.drop(columns=['_original_Id'])
        TEMP_DATA["lines_merged_select_update_complete"] = lines_merged_select.replace({np.nan: None})
        review_data = TEMP_DATA["lines_merged_select_update_complete"].to_dict(orient='records')
        session_id = get_session_id(request)
        redis_client.set(f"review_data:{session_id}", json.dumps(review_data), ex=3600)
        return {"success": True, "review_data": review_data, "download_url": "/download_ready_csv"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/process_edit")
async def process_edit(request: Request):
    try:
        post_selection_complete_edit = await request.json()
        lines_df = pd.DataFrame(post_selection_complete_edit)
        lines_df["_original_Id"] = lines_df["Id"]
        lines_target_df = TEMP_DATA["lines_target_temp"]
        if lines_target_df is None:
            return {"error": "No lines_target_temp data in memory"}
        # 匹配LineTarget
        line_ids = set(int(float(i)) for i in lines_df['_original_Id'] if pd.notnull(i))
        lines_target_temp_select = lines_target_df[
            lines_target_df['LineId'].apply(lambda x: int(float(x)) if pd.notnull(x) else None).isin(line_ids)
        ].copy()
        # 合并
        lines_merged_select = pd.concat([lines_df, lines_target_temp_select], ignore_index=True)
        if '_original_Id' in lines_merged_select.columns:
            lines_merged_select = lines_merged_select.drop(columns=['_original_Id'])
        TEMP_DATA["lines_merged_select_update_complete"] = lines_merged_select.replace({np.nan: None})
        review_data = TEMP_DATA["lines_merged_select_update_complete"].to_dict(orient='records')
        session_id = get_session_id(request)
        redis_client.set(f"review_data:{session_id}", json.dumps(review_data), ex=3600)
        return {"success": True, "review_data": review_data, "download_url": "/download_ready_csv"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/download_ready_csv")
def download_ready_csv(request: Request):
    session_id = get_session_id(request)
    data = redis_client.get(f"review_data:{session_id}")
    if not data:
        return JSONResponse({"error": "No processed data available"})
    review_data = json.loads(data)
    df_export = pd.DataFrame(review_data)
    # 导出内存中的最终数据为csv
    if 'entitytype' in df_export.columns and 'Id' in df_export.columns:
        # 1. 先为Line分配唯一负数Id
        max_negative_value = -1
        line_id_map = {}
        for idx, row in df_export[df_export['entitytype'] == 'Line'].iterrows():
            old_id = row['Id']
            new_id = max_negative_value
            line_id_map[old_id] = new_id
            df_export.at[idx, 'Id'] = new_id
            max_negative_value -= 1
        # 2. 为LineTarget分配唯一负数Id，且与Line不冲突
        max_negative_value_2 = -1
        for idx, row in df_export[df_export['entitytype'] == 'LineTarget'].iterrows():
            # 分配唯一负数Id
            new_id = max_negative_value_2
            df_export.at[idx, 'Id'] = new_id
            max_negative_value_2 -= 1
            # LineId指向其对应Line的新负数Id
            old_lineid = row['LineId']
            if old_lineid in line_id_map:
                df_export.at[idx, 'LineId'] = line_id_map[old_lineid]
    # 导出前去除originalId字段
    if 'originalId' in df_export.columns:
        df_export = df_export.drop(columns=['originalId'])
    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
        df_export.to_csv(tmp.name, index=False)
        tmp.flush()
        return FileResponse(tmp.name, filename="ready_for_import.csv")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 