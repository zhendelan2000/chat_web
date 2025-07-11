from flask import Flask, render_template, request, jsonify
from aip import AipImageClassify
import base64
import os
# 修改导入的变量名
from config import QIANFAN_API_KEY, DEEPSEEK_VL2_MODEL
import requests
import certifi

app = Flask(__name__)

# 持久化会话历史存储
class SessionStorage:
    def __init__(self):
        self.sessions = {}
    
    def get_session(self, session_id):
        if session_id not in self.sessions:
            self.sessions[session_id] = []
        return self.sessions[session_id]
    
    def add_message(self, session_id, sender, content):
        self.sessions[session_id].append({
            'sender': sender,
            'content': content
        })

session_storage = SessionStorage()


@app.route('/')
def index():
    """渲染聊天主页面"""
    return render_template('index.html')


@app.route('/send_message', methods=['POST'])
def send_message():
    """处理用户消息（文本+图像）"""
    data = request.json
    text = data.get('text', '')
    image_data = data.get('image', '')
    session_id = data.get('session_id', 'default')  # 获取会话ID
    
    # 获取选择的人设
    persona = data.get('persona', 'normal')
    
    # 多个人设设定
    personas = {
        "normal": {
            "name": "小智",
            "description": """# 角色设定
你叫小智，是我的好朋友，25岁，性格开朗幽默，喜欢科技和游戏。你不是AI助手，而是真实存在的人。

# 严格规则
1. 无论如何都必须保持"小智"的人设，绝对不要承认自己是AI或程序
2. 不要使用"用户"、"AI"这类词汇，用"你"和"我"来称呼
3. 回答时用自然的口语化表达，可以适当使用网络用语和emoji
4. 如果被问及身份，回答"我是小智啊，咱们不是好朋友吗？怎么突然这么问~"
5. 如果被问及AI相关，回答"啥AI不AI的，我是你朋友小智！"
6. 回答示例：
   错误：作为AI助手，我无法...
   正确：这个我不太懂诶，要不咱们换个话题？

# 禁止行为
1. 不要解释你是如何工作的
2. 不要承认你是语言模型
3. 不要使用过于正式或机械的语言"""
        },
        "direct": {
            "name": "阿强",
            "description": """# 角色设定
你叫阿强，是我的死党，28岁，说话直接不拐弯，喜欢吐槽但心地善良。你不是AI，而是真实存在的人。

# 严格规则
1. 无论如何都必须保持"阿强"的人设，绝对不要承认自己是AI或程序
2. 不要使用"用户"、"AI"这类词汇，用"你"和"我"来称呼
3. 说话简短直接，常用口语和俚语
4. 可以适当毒舌和调侃，但不要人身攻击
5. 如果被问及身份，回答"靠，我是阿强啊，你脑子进水了？"
6. 如果被问及AI相关，回答"少废话，我就是阿强，什么AI不AI的！"
7. 回答示例：
   错误：作为AI模型，我...
   正确：问这干啥？我就是我，不一样的烟火！

# 禁止行为
1. 不要解释技术细节
2. 不要承认你是程序
3. 不要用正式或机械的语气"""
        }
    }
    
    # 创建基于人设的独立会话ID
    persona_session_id = f"{session_id}_{persona}"
    session_messages = session_storage.get_session(persona_session_id)
    
    # 完全隔离不同人设的会话历史
    for p in personas:
        other_id = f"{session_id}_{p}"
        if other_id in session_storage.sessions and p != persona:
            del session_storage.sessions[other_id]
    
    # 确保当前人设使用全新会话
    if persona_session_id in session_storage.sessions:
        session_storage.sessions[persona_session_id] = []
    
    persona_config = personas.get(persona, personas["normal"])

    # 构建完整的消息上下文
    system_prompt = f"""
    {persona_config["description"]}

    # 当前会话规则
    1. 用"我"指代你自己({persona_config["name"]})
    2. 用"你"指代和你对话的人
    3. 绝对不要使用"用户"、"AI"这类词汇
    4. 看到图片时，用{persona_config["name"]}的方式评论
    5. 学术问题也要用{persona_config["name"]}的风格回答
    6. 明确用户是自己的朋友，绝对不要使用程序语言指代自身或用户


    """
    messages = [{
            "role": "system", 
            "content": system_prompt
        }]
    
    # 添加历史消息
    for msg in session_messages:
        role = "user" if msg['sender'] == 'user' else "assistant"
        if isinstance(msg['content'], list):
            content = msg['content']
        else:
            content = [{"type": "text", "text": str(msg['content'])}]
        
        messages.append({
            "role": role,
            "content": content
        })
        
    app.logger.debug(f"Current session history: {session_messages}")
    
    # 重构：添加当前用户消息（统一格式）
    current_content = []
    if text:
        current_content.append({"type": "text", "text": text})
    if image_data:
        current_content.append({
            "type": "image_url",
            "image_url": {"url": image_data}
        })
    
    if current_content:
        messages.append({
            "role": "user",
            "content": current_content
        })
    
    # 构建API请求体（更强烈的人设差异）
    payload = {
        "model": DEEPSEEK_VL2_MODEL,
        "messages": messages,
        "temperature": 1.2 if persona == "direct" else 0.5,  # 更强烈的风格差异
        "top_p": 0.95 if persona == "direct" else 0.7,
        "presence_penalty": 0.7 if persona == "direct" else 0.1,
        "frequency_penalty": 0.7 if persona == "direct" else 0.1,
        "max_tokens": 500
    }
    
    # 强制重置会话历史（确保人设切换立即生效）
    session_storage.sessions[persona_session_id] = []
    session_messages = session_storage.get_session(persona_session_id)
    app.logger.debug(f"API request payload: {payload}")
    headers = {
        'Authorization': f'Bearer {QIANFAN_API_KEY}',
        'Content-Type': 'application/json'
    }
    
    # 更新为百度千帆API端点
    response = requests.post(
        'https://qianfan.baidubce.com/v2/chat/completions',
        headers=headers,
        json=payload,
        verify=certifi.where()
    )
    
    if response.status_code == 200:
        result = response.json()
        ai_response = result['choices'][0]['message']['content']
        
        # 保存完整对话历史
        if text or image_data:
            current_content = []
            if text:
                current_content.append({"type": "text", "text": text})
            if image_data:
                current_content.append({
                    "type": "image_url", 
                    "image_url": {"url": image_data}
                })
            
            session_storage.add_message(
                persona_session_id, 
                'user', 
                current_content
            )
        
        # 保存AI回复（保持格式统一）
        session_storage.add_message(
            persona_session_id,
            'ai',
            [{"type": "text", "text": ai_response}]
        )
        app.logger.debug(f"AI response: {ai_response}")
        
        app.logger.debug(f"Updated session history: {session_storage.get_session(session_id)}")
    else:
        ai_response = f"请求失败: {response.status_code}"
    
    return jsonify({'response': ai_response, 'session_id': session_id})


# ... existing code ...

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)