document.addEventListener('DOMContentLoaded', () => {
    const messageContainer = document.getElementById('messageContainer');
    const textInput = document.getElementById('textInput');
    const imageInput = document.getElementById('imageInput');
    const sendButton = document.getElementById('sendButton');
    const voiceButton = document.getElementById('voiceButton');
    const fileInfo = document.getElementById('fileInfo'); // 新增：获取文件信息元素
    
    // 语音识别功能
    let recognition = null;
    let isRecording = false;
    
    // 检查浏览器是否支持语音识别
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'zh-CN';
        recognition.interimResults = true;
        
        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            
            textInput.value = transcript;
        };
        
        recognition.onend = () => {
            isRecording = false;
            voiceButton.classList.remove('recording');
        };
        
        recognition.onerror = (event) => {
            console.error('语音识别错误:', event.error);
            isRecording = false;
            voiceButton.classList.remove('recording');
            alert('语音识别失败，请重试');
        };
    } else {
        voiceButton.style.display = 'none';
        console.warn('当前浏览器不支持语音识别');
    }
    
    // 语音按钮点击事件
    voiceButton.addEventListener('click', () => {
        if (!recognition) return;
        
        if (isRecording) {
            recognition.stop();
        } else {
            try {
                recognition.start();
                isRecording = true;
                voiceButton.classList.add('recording');
                textInput.value = '正在聆听...';
            } catch (error) {
                console.error('无法启动语音识别:', error);
            }
        }
    });
    
    // 添加图片按钮事件监听
    const imageButton = document.getElementById('imageButton');
    imageButton.addEventListener('click', () => {
        imageInput.click();
    });
    
    // 新增：监听文件选择变化
    imageInput.addEventListener('change', () => {
        if (imageInput.files.length > 0) {
            const fileName = imageInput.files[0].name;
            fileInfo.textContent = `已选择: ${fileName}`;
            fileInfo.style.display = 'block';
        } else {
            fileInfo.style.display = 'none';
        }
    });
    
    // 添加提示容器
    const placeholder = document.createElement('div');
    placeholder.id = 'placeholder';
    placeholder.textContent = '输入文字，图片或语音，开始对话';
    placeholder.style.textAlign = 'center';
    placeholder.style.padding = '20px';
    placeholder.style.color = '#999';
    placeholder.style.fontSize = '1rem';
    messageContainer.appendChild(placeholder);
    
    // 会话ID和人设管理
    let sessionId = localStorage.getItem('chat_session_id');
    let currentPersona = localStorage.getItem('current_persona') || 'normal';
    
    if (!sessionId) {
        sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
        localStorage.setItem('chat_session_id', sessionId);
    }
    
    // 人设选择变化时清空对话历史
    const personaSelect = document.getElementById('personaSelect');
    personaSelect.value = currentPersona;
    
    personaSelect.addEventListener('change', () => {
        currentPersona = personaSelect.value;
        localStorage.setItem('current_persona', currentPersona);
        
        // 清空对话历史
        messageContainer.innerHTML = '';
        const placeholder = document.createElement('div');
        placeholder.id = 'placeholder';
        placeholder.textContent = '输入文字，图片或语音，开始对话';
        placeholder.style.textAlign = 'center';
        placeholder.style.padding = '20px';
        placeholder.style.color = '#999';
        placeholder.style.fontSize = '1rem';
        messageContainer.appendChild(placeholder);
        
        // 重置会话ID
        sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
        localStorage.setItem('chat_session_id', sessionId);
    });
    
    // 发送消息函数
    async function sendMessage() {
        const text = textInput.value.trim();
        const file = imageInput.files[0];
        const persona = document.getElementById('personaSelect').value;
        
        if (!text && !file) return;
        
        // 创建用户消息元素
        addMessage(text, file, 'user');
        
        // 新增：清除文件选择信息
        fileInfo.style.display = 'none';
        
        try {
            // 准备发送数据（新增session_id）
            const formData = new FormData();
            if (text) formData.append('text', text);
            if (file) {
                const reader = new FileReader();
                reader.onload = async () => {
                    const response = await fetch('/send_message', {
                        method: 'POST',
                        body: JSON.stringify({
                            text: text,
                            image: reader.result,
                            session_id: sessionId,
                            persona: persona  // 添加人设参数
                        }),
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    const data = await response.json();
                    addMessage(data.response, null, 'ai');
                };
                reader.readAsDataURL(file);
            } else {
            const response = await fetch('/send_message', {
                method: 'POST',
                body: JSON.stringify({ 
                    text: text,
                    session_id: sessionId,
                    persona: persona  // 新增人设选择
                }),
                headers: {
                    'Content-Type': 'application/json'
                }
            });
                
                const data = await response.json();
                addMessage(data.response, null, 'ai');
            }
            
            // 清空输入
            textInput.value = '';
            imageInput.value = '';
        } catch (error) {
            console.error('发送消息失败:', error);
            addMessage('发送消息失败，请重试', null, 'ai');
        }
    }
    
    // 添加消息到聊天界面 - 微信风格
    function addMessage(content, file, sender) {
        // 移除提示
        if (placeholder.parentNode === messageContainer) {
            placeholder.remove();
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'bubble';
        
        if (file) {
            const imgContainer = document.createElement('div');
            imgContainer.style.maxWidth = '300px';
            imgContainer.style.margin = '0 auto';
            
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.style.maxWidth = '100%';
            img.style.borderRadius = '8px';
            img.style.display = 'block';
            
            imgContainer.appendChild(img);
            bubbleDiv.appendChild(imgContainer);
        }
        
        if (content) {
            const text = document.createElement('p');
            text.textContent = content;
            text.style.margin = '0';
            text.style.padding = '0';
            bubbleDiv.appendChild(text);
        }
        
        messageDiv.appendChild(bubbleDiv);
        messageContainer.appendChild(messageDiv);
        
        // 平滑滚动到底部
        messageContainer.scrollTo({
            top: messageContainer.scrollHeight,
            behavior: 'smooth'
        });
    }
    
    // 自动调整输入框高度
    textInput.addEventListener('input', () => {
        textInput.style.height = 'auto';
        textInput.style.height = (textInput.scrollHeight) + 'px';
    });

    // 事件监听
    sendButton.addEventListener('click', sendMessage);
    textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 初始化输入框高度
    textInput.style.height = 'auto';
    textInput.style.height = (textInput.scrollHeight) + 'px';
});