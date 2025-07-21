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
import logging

app = FastAPI()

# 环境变量配置
IS_PRODUCTION = os.environ.get("ENVIRONMENT") == "production"

# 日志配置
logging.basicConfig(
    level=logging.INFO if IS_PRODUCTION else logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# CORS配置
CORS_ORIGINS = [
    "https://yellow-ground-0657c970f.6.azurestaticapps.net"
] if IS_PRODUCTION else ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis配置
if IS_PRODUCTION:
    REDIS_HOST = os.environ.get("REDIS_HOST", "your-redis.redis.cache.windows.net")
    REDIS_PORT = int(os.environ.get("REDIS_PORT", 6380))  # Azure Redis SSL端口
    REDIS_SSL = True
    REDIS_KEY_EXPIRE = 7200  # 生产环境缓存时间2小时
else:
    REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
    REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))  # 本地Redis默认端口
    REDIS_SSL = False
    REDIS_KEY_EXPIRE = 3600  # 开发环境缓存时间1小时

REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD", None)

# 文件路径配置
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_DIR = os.path.join(BASE_DIR, 'backend', 'temp') if not IS_PRODUCTION else '/tmp'
os.makedirs(TEMP_DIR, exist_ok=True)

# 初始化Redis客户端
try:
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        decode_responses=True,
        ssl=REDIS_SSL
    )
    redis_client.ping()
    logger.info("Redis client initialized successfully")
except Exception as e:
    logger.error(f"Redis connection failed: {e}")
    raise

def get_session_id(request: Request):
    """获取会话ID"""
    session_id = request.cookies.get("session_id") or "default"
    logger.debug(f"Session ID: {session_id}")
    return session_id

def clear_session_data(session_id: str):
    """清除会话相关的所有Redis数据"""
    try:
        keys = redis_client.keys(f"*:{session_id}")
        if keys:
            redis_client.delete(*keys)
            logger.debug(f"Cleared {len(keys)} keys for session {session_id}")
    except Exception as e:
        logger.error(f"Error clearing session data: {e}")

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), request: Request = None):
    try:
        session_id = get_session_id(request)
        clear_session_data(session_id)
        
        # 标准字段列表
        standard_columns = [
            "EntityType", "Id", "Name", "Description", "StartDate", "EndDate", "TargetSpend", 
            "CustomerId", "CustomerName", "MediaPlanId", "MediaPlanName", "CurrencyCode", 
            "Contact", "OpportunityId", "MediaPlanStatus", "LineId", "LineName", "LineType", 
            "LineStatus", "Cpm", "Cpd", "TargetImpressions", "IsReserved", "BudgetScheduleType",
            "TargetType", "Ids", "IsExcluded", "AudienceTargetingType", "DayOfWeek", 
            "StartHour", "EndHour", "DeviceTypes", "FrequencyUnit", "FrequencyNumber", 
            "MinutesPerImpression", "PublisherId", "PublisherName", "ProductId", "ProductName", 
            "ProductType"
        ]
        
        # 读取CSV文件
        df = pd.read_csv(file.file, dtype=str, keep_default_na=False)
        logger.debug(f"Uploaded CSV shape: {df.shape}")
        
        # 校验字段名和顺序
        if list(df.columns) != standard_columns:
            return {"error": f"CSV columns do not match required format"}
        
        # 数据处理和存储到Redis
        try:
            # 保存 MediaPlan 行
            media_plan_df = df[df['EntityType'].str.strip().str.upper() == 'MEDIAPLAN'].copy()
            if len(media_plan_df) > 0:
                redis_client.set(
                    f"media_plan:{session_id}", 
                    media_plan_df.iloc[0].to_json(), 
                    ex=REDIS_KEY_EXPIRE
                )
            
            # 只保留 EntityType=Line 的行
            lines_df = df[df['EntityType'].str.strip().str.upper() == 'LINE'].copy()
            redis_client.set(
                f"lines_temp:{session_id}", 
                lines_df.to_json(orient='records'), 
                ex=REDIS_KEY_EXPIRE
            )
            
            return {"message": "File processed successfully"}
        except Exception as e:
            logger.error(f"Error processing upload: {e}")
            return {"error": str(e)}
            
    except Exception as e:
        logger.error(f"Upload error: {e}")
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
        session_id = get_session_id(request)
        print(f"[DEBUG] process_clone: Processing data for session {session_id}")
        
        post_selection_complete_edit = await request.json()
        print(f"[DEBUG] process_clone received data length: {len(post_selection_complete_edit)}")
        
        lines_df = pd.DataFrame(post_selection_complete_edit)
        print(f"[DEBUG] process_clone DataFrame shape: {lines_df.shape}")
        
        # 确保只处理EntityType=Line的数据
        lines_df = lines_df[lines_df['EntityType'].str.strip().str.upper() == 'LINE'].copy()
        print(f"[DEBUG] process_clone filtered LINE rows: {len(lines_df)}")
        
        # 负数Id分配
        max_negative_value = -1
        for idx, row in lines_df.iterrows():
            new_id = max_negative_value
            lines_df.at[idx, 'Id'] = new_id
            max_negative_value -= 1
            
        lines_df = lines_df.replace({np.nan: None})
        review_data = lines_df.to_dict(orient='records')
        print(f"[DEBUG] process_clone review_data length: {len(review_data)}")
        
        # 存储到Redis
        redis_key = f"review_data:{session_id}"
        redis_client.set(redis_key, json.dumps(review_data), ex=3600)
        print(f"[DEBUG] Data stored in Redis with key: {redis_key}")
        
        # 验证数据是否成功存储
        stored_data = redis_client.get(redis_key)
        print(f"[DEBUG] Verified data in Redis exists: {bool(stored_data)}")
        if stored_data:
            print(f"[DEBUG] Verified data length: {len(json.loads(stored_data))}")
        
        return {"success": True, "review_data": review_data, "download_url": "/download_ready_csv"}
    except Exception as e:
        print(f"[DEBUG] process_clone error: {str(e)}")
        return {"error": str(e)}

@app.post("/process_copy")
async def process_copy(request: Request):
    try:
        body = await request.json()
        print("[DEBUG] process_copy收到数据:", body)
        lines = body.get('lines', [])
        target_media_plan_id = body.get('targetMediaPlanId')
        target_opportunity_id = body.get('targetOpportunityId')
        lines_df = pd.DataFrame(lines)
        print("[DEBUG] process_copy lines_df shape:", lines_df.shape)
        print("[DEBUG] process_copy lines_df columns:", lines_df.columns.tolist())
        print("[DEBUG] process_copy lines_df preview:", lines_df.head(2).to_dict(orient='records'))
        # 确保只处理EntityType=Line的数据
        lines_df = lines_df[lines_df['EntityType'].str.strip().str.upper() == 'LINE'].copy()
        print("[DEBUG] process_copy 过滤后Line shape:", lines_df.shape)
        print("[DEBUG] process_copy 过滤后Line preview:", lines_df.head(2).to_dict(orient='records'))
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
        print("[DEBUG] process_copy review_data:", review_data)
        session_id = get_session_id(request)
        redis_client.set(f"review_data:{session_id}", json.dumps(review_data), ex=3600)
        return {"success": True, "review_data": review_data, "download_url": "/download_ready_csv"}
    except Exception as e:
        print(f"[DEBUG] process_copy异常: {e}")
        return {"error": str(e)}

@app.post("/process_edit")
async def process_edit(request: Request):
    try:
        session_id = get_session_id(request)
        print(f"[DEBUG] process_edit: Processing data for session {session_id}")
        
        post_selection_complete_edit = await request.json()
        print(f"[DEBUG] process_edit received data length: {len(post_selection_complete_edit)}")
        print(f"[DEBUG] process_edit data sample: {post_selection_complete_edit[0] if post_selection_complete_edit else None}")
        
        lines_df = pd.DataFrame(post_selection_complete_edit)
        print(f"[DEBUG] process_edit DataFrame shape: {lines_df.shape}")
        print(f"[DEBUG] process_edit columns: {lines_df.columns.tolist()}")
        
        # 确保只处理EntityType=Line的数据
        lines_df = lines_df[lines_df['EntityType'].str.strip().str.upper() == 'LINE'].copy()
        print(f"[DEBUG] process_edit filtered LINE rows: {len(lines_df)}")
        
        lines_df = lines_df.replace({np.nan: None})
        review_data = lines_df.to_dict(orient='records')
        print(f"[DEBUG] process_edit review_data length: {len(review_data)}")
        
        # 存储到Redis
        redis_key = f"review_data:{session_id}"
        redis_client.set(redis_key, json.dumps(review_data), ex=3600)
        print(f"[DEBUG] Data stored in Redis with key: {redis_key}")
        
        # 验证数据是否成功存储
        stored_data = redis_client.get(redis_key)
        print(f"[DEBUG] Verified data in Redis: {bool(stored_data)}")
        
        return {"success": True, "review_data": review_data, "download_url": "/download_ready_csv"}
    except Exception as e:
        print(f"[DEBUG] process_edit error: {str(e)}")
        return {"error": str(e)}

@app.get("/download_ready_csv")
def download_ready_csv(request: Request):
    try:
        session_id = get_session_id(request)
        print(f"[DEBUG] download_ready_csv: Getting data for session {session_id}")
        
        # 检查 Redis 连接
        try:
            redis_client.ping()
            print("[DEBUG] Redis connection is alive")
        except Exception as e:
            print(f"[DEBUG] Redis connection error: {str(e)}")
            return JSONResponse({"error": "Redis connection error"})
        
        # 检查所有相关的 Redis 键
        all_keys = redis_client.keys(f"*:{session_id}")
        print(f"[DEBUG] All Redis keys for session: {all_keys}")
        
        # 获取数据
        data = redis_client.get(f"review_data:{session_id}")
        print(f"[DEBUG] Redis get result: {bool(data)}")
        
        if not data:
            print("[DEBUG] No data found in Redis")
            return JSONResponse({"error": "No processed data available"})
        
        # 解析数据
        try:
            review_data = json.loads(data)
            print(f"[DEBUG] Parsed JSON data length: {len(review_data)}")
            print(f"[DEBUG] First record sample: {review_data[0] if review_data else None}")
        except json.JSONDecodeError as e:
            print(f"[DEBUG] JSON decode error: {str(e)}")
            return JSONResponse({"error": "Invalid data format in storage"})
        
        # 创建 DataFrame
        df_export = pd.DataFrame(review_data)
        print(f"[DEBUG] DataFrame shape: {df_export.shape}")
        print(f"[DEBUG] DataFrame columns: {df_export.columns.tolist()}")
        
        # 检查必需的列
        if 'EntityType' not in df_export.columns or 'Id' not in df_export.columns:
            print(f"[DEBUG] Missing required columns. Available columns: {df_export.columns.tolist()}")
            return JSONResponse({"error": "Invalid data structure"})
        
        # 处理 Line 类型数据
        line_rows = df_export[df_export['EntityType'].str.strip().str.upper() == 'LINE']
        print(f"[DEBUG] Found {len(line_rows)} LINE rows")
        
        # 负数 Id 分配
        max_negative_value = -1
        line_id_map = {}
        
        for idx, row in line_rows.iterrows():
            old_id = row['Id']
            new_id = max_negative_value
            line_id_map[old_id] = new_id
            df_export.at[idx, 'Id'] = new_id
            max_negative_value -= 1
        
        # 如果是 clone 操作，添加原始的 MediaPlan 行
        media_plan_data = redis_client.get(f"media_plan:{session_id}")
        if media_plan_data:
            try:
                media_plan_row = pd.Series(json.loads(media_plan_data))
                print("[DEBUG] Adding MediaPlan row")
                df_export = pd.concat([df_export, pd.DataFrame([media_plan_row])], ignore_index=True)
            except Exception as e:
                print(f"[DEBUG] Error adding MediaPlan row: {str(e)}")
        
        # 导出前去除 originalId 字段
        if 'originalId' in df_export.columns:
            print("[DEBUG] Removing originalId column")
            df_export = df_export.drop(columns=['originalId'])
        
        print(f"[DEBUG] Final DataFrame shape: {df_export.shape}")
        
        # 创建临时文件并导出
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
            df_export.to_csv(tmp.name, index=False)
            tmp.flush()
            print(f"[DEBUG] CSV file created: {tmp.name}")
            return FileResponse(tmp.name, filename="ready_for_import.csv")
            
    except Exception as e:
        print(f"[DEBUG] Error in download_ready_csv: {str(e)}")
        return JSONResponse({"error": f"Error processing data: {str(e)}"})

@app.get("/download_template")
def download_template():
    # 获取项目根目录
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    template_path = os.path.join(base_dir, 'File template new.csv')
    return FileResponse(template_path, filename="OMS_Import_Template.csv", media_type='text/csv')

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 