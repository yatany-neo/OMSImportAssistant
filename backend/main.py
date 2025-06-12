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
        "https://zealous-water-097e55b1e.6.azurestaticapps.net",
        "https://yellow-ground-0657c970f.6.azurestaticapps.net"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 用于存储内存中的临时数据
TEMP_DATA = {
    "lines_temp": None,  # entitytype=Line 的所有行
}

REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD", None)

print("=== OMS Import Assistant FastAPI backend starting ===")
print(f"Redis config: host={REDIS_HOST}, port={REDIS_PORT}, ssl=True")
try:
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        decode_responses=True,
        ssl=True
    )
    # 尝试连接
    redis_client.ping()
    print("=== Redis client initialized and connected successfully ===")
except Exception as e:
    print(f"!!! Redis client initialization or connection failed: {e}")

def get_session_id(request: Request):
    return request.cookies.get("session_id") or "default"

def clear_session_data(session_id: str):
    """清除会话相关的所有Redis数据"""
    keys = redis_client.keys(f"*:{session_id}")
    if keys:
        redis_client.delete(*keys)

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), request: Request = None):
    try:
        session_id = get_session_id(request)
        # 清除旧的会话数据
        clear_session_data(session_id)
        
        # 新标准字段
        standard_columns = [
            "EntityType", "Id", "Name", "Description", "StartDate", "EndDate", "TargetSpend", 
            "CustomerId", "CustomerName", "MediaPlanId", "MediaPlanName", "CurrencyCode", 
            "Contact", "OpportunityId", "MediaPlanStatus", "LineId", "LineName", "LineType", 
            "LineStatus", "Cpm", "Cpd", "TargetImpressions", "IsReserved", "BudgetScheduleType", 
            "Targets", "PublisherId", "PublisherName", "ProductId", "ProductName", "ProductType"
        ]
        
        # 读取CSV文件
        df = pd.read_csv(file.file, dtype=str, keep_default_na=False)
        print("[DEBUG] 上传CSV shape:", df.shape)
        print("[DEBUG] 上传CSV columns:", df.columns.tolist())
        
        # 校验字段名和顺序
        if list(df.columns) != standard_columns:
            return {"error": f"CSV columns do not match required format.\nExpected: {standard_columns}\nGot: {df.columns.tolist()}"}
        
        # 字段格式处理
        df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)  # 去除字符串字段的空白
        
        # 处理数字字段
        numeric_fields = ['Id', 'CustomerId', 'MediaPlanId', 'Cpm', 'Cpd', 'TargetImpressions', 'TargetSpend']
        for field in numeric_fields:
            df[field] = pd.to_numeric(df[field], errors='coerce').fillna('')
        
        # 处理布尔字段
        boolean_fields = ['IsReserved']
        for field in boolean_fields:
            df[field] = df[field].str.upper().map({'TRUE': 'TRUE', 'FALSE': 'FALSE'}).fillna('FALSE')
        
        # 处理日期字段
        date_fields = ['StartDate', 'EndDate']
        for field in date_fields:
            df[field] = pd.to_datetime(df[field], errors='coerce').dt.strftime('%Y-%m-%d %H:%M:%S').fillna('')
        
        # 只保留 EntityType=Line 的行
        lines_df = df[df['EntityType'].str.strip().str.upper() == 'LINE'].copy()
        print("[DEBUG] Line行数:", lines_df.shape[0])
        print("[DEBUG] Line部分预览:", lines_df.head(2).to_dict(orient='records'))
        
        # 存储到Redis
        redis_client.set(f"lines_temp:{session_id}", lines_df.to_json(orient='records'), ex=3600)
        
        return {"message": "File processed successfully"}
    except Exception as e:
        print(f"[DEBUG] 上传处理异常: {e}")
        return {"error": str(e)}

@app.get("/lines")
async def get_lines(request: Request):
    try:
        session_id = get_session_id(request)
        lines_temp_json = redis_client.get(f"lines_temp:{session_id}")
        if not lines_temp_json:
            return {"data": []}
        df = pd.read_json(lines_temp_json)
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
        
        # 确保只处理EntityType=Line的数据
        lines_df = lines_df[lines_df['EntityType'].str.strip().str.upper() == 'LINE'].copy()
        
        # 负数Id分配
        max_negative_value = -1
        for idx, row in lines_df.iterrows():
            new_id = max_negative_value
            lines_df.at[idx, 'Id'] = new_id
            max_negative_value -= 1
        
        lines_df = lines_df.replace({np.nan: None})
        review_data = lines_df.to_dict(orient='records')
        
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
        target_opportunity_id = body.get('targetOpportunityId')
        
        lines_df = pd.DataFrame(lines)
        
        # 确保只处理EntityType=Line的数据
        lines_df = lines_df[lines_df['EntityType'].str.strip().str.upper() == 'LINE'].copy()
        
        # 负数Id分配
        max_negative_value = -1
        for idx, row in lines_df.iterrows():
            new_id = max_negative_value
            lines_df.at[idx, 'Id'] = new_id
            lines_df.at[idx, 'MediaPlanId'] = target_media_plan_id
            lines_df.at[idx, 'OpportunityId'] = target_opportunity_id
            max_negative_value -= 1
        
        lines_df = lines_df.replace({np.nan: None})
        review_data = lines_df.to_dict(orient='records')
        
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
        
        # 确保只处理EntityType=Line的数据
        lines_df = lines_df[lines_df['EntityType'].str.strip().str.upper() == 'LINE'].copy()
        
        lines_df = lines_df.replace({np.nan: None})
        review_data = lines_df.to_dict(orient='records')
        
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

@app.get("/download_template")
def download_template():
    # 获取项目根目录
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    template_path = os.path.join(base_dir, 'File template.csv')
    return FileResponse(template_path, filename="OMS_Import_Template.csv", media_type='text/csv')

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 