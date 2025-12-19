#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
播放历史迁移脚本
将现有的playback_history.json转换为新的数据格式
为每条记录添加play_count和timestamps字段
"""

import json
import os
from collections import defaultdict

def migrate_playback_history(file_path: str):
    """迁移播放历史数据
    
    参数:
      file_path: playback_history.json文件路径
    """
    
    if not os.path.exists(file_path):
        print(f"[ERROR] 文件不存在: {file_path}")
        return False
    
    try:
        # 读取现有数据
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        if not isinstance(data, list):
            print("[ERROR] 数据格式不正确")
            return False
        
        print(f"[INFO] 读取了 {len(data)} 条记录")
        
        # 按URL聚合，保留最新记录的其他信息
        aggregated = {}
        url_timestamps = defaultdict(list)
        
        for item in data:
            url = item.get('url', '')
            ts = item.get('ts') or item.get('timestamp', 0)
            
            if not url:
                continue
            
            # 记录每个URL的所有时间戳
            if ts > 0:
                url_timestamps[url].append(ts)
            
            # 保存最新的记录信息（最后一个记录具有最新的时间戳）
            if url not in aggregated or ts > aggregated[url].get('ts', 0):
                aggregated[url] = item.copy()
        
        # 构建新数据格式
        migrated_data = []
        for url, item in aggregated.items():
            # 排序时间戳
            timestamps = sorted(set(url_timestamps.get(url, [])))
            
            # 更新item数据
            item['ts'] = timestamps[-1] if timestamps else 0  # 最后一次播放时间
            item['timestamp'] = item['ts']  # 保持兼容性
            item['play_count'] = len(timestamps)  # 播放次数
            item['timestamps'] = ','.join(str(ts) for ts in timestamps)  # 逗号分割的时间戳列表
            
            migrated_data.append(item)
        
        # 按最后播放时间排序
        migrated_data.sort(key=lambda x: x.get('ts', 0), reverse=True)
        
        # 备份原文件
        backup_path = file_path + '.backup'
        if not os.path.exists(backup_path):
            with open(backup_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"[INFO] 已备份原文件到: {backup_path}")
        
        # 写入新数据
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(migrated_data, f, ensure_ascii=False, indent=2)
        
        print(f"[SUCCESS] 迁移完成！")
        print(f"  - 聚合为 {len(migrated_data)} 条唯一记录")
        print(f"  - 总播放次数: {sum(item.get('play_count', 0) for item in migrated_data)}")
        
        return True
        
    except Exception as e:
        print(f"[ERROR] 迁移失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    file_path = os.path.join(os.path.dirname(__file__), 'playback_history.json')
    migrate_playback_history(file_path)
