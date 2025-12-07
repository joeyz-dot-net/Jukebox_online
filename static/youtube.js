(() => {
	// YouTube tab logic - now integrated into the main tab interface
	const youtubeInputTextarea = document.getElementById('youtubeInputTextarea');
	const youtubeInputSubmit = document.getElementById('youtubeInputSubmit');
	const youtubeInputBtn = document.getElementById('youtubeInputBtn');
	const youtubeInputModal = document.getElementById('youtubeInputModal');
	const youtubeInputModalClose = document.querySelector('.youtube-input-modal-close');
	const youtubeSearchSection = document.getElementById('youtubeSearchSection');
	const youtubeQueueSection = document.getElementById('youtubeQueueSection');
	const youtubeQueueList = document.getElementById('youtubeQueueList');
	// localStorage keys and limits
	const STORAGE_KEY = 'youtube_history';
	const MAX_LOCAL_HISTORY = 100;

	// Load local history from localStorage
	function getLocalHistory(){
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			return stored ? JSON.parse(stored) : [];
		} catch (e) {
			console.warn('[Storage] Failed to parse YouTube history:', e);
			return [];
		}
	}

	// Save history to localStorage
	function saveLocalHistory(history){
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
		} catch (e) {
			console.warn('[Storage] Failed to save YouTube history:', e);
		}
	}

	// Add new history item (called after successful play)
	function addToHistory(url, title){
		try {
			let history = getLocalHistory();
			// Remove if already exists (to move to top)
			history = history.filter(item => item.url !== url);
			// Add new item to front
			history.unshift({
				url: url,
				name: title || new URL(url).hostname,
				ts: Math.floor(Date.now() / 1000)
			});
			// Keep only MAX_LOCAL_HISTORY items
			history = history.slice(0, MAX_LOCAL_HISTORY);
			saveLocalHistory(history);
		} catch (e) {
			console.error('[Storage] Error adding to history:', e);
		}
	}

	function loadYoutubeHistory(){
		// History is now displayed via modal, not in the YouTube tab
		// This function is kept for compatibility but does nothing
		return;
	}

	function renderLocalHistory(){
		// History is now displayed via modal, not in the YouTube tab
		// This function is kept for compatibility but does nothing
		return;
	}

	// Load and display current YouTube queue
	function loadYoutubeQueue(){
		if(!youtubeQueueList || !youtubeQueueSection) return;
		
		// Always show the queue section
		youtubeQueueSection.style.display = 'block';
		
		fetch('/youtube_queue')
			.then(r => r.json())
			.then(res => {
				if(res && res.status === 'OK' && res.queue && res.queue.length > 0){
					youtubeQueueList.innerHTML = '';
					const currentIndex = res.current_index || 0;
					res.queue.forEach((item, idx) => {
						const div = document.createElement('div');
						div.className = 'youtube-queue-item';
						if(idx === currentIndex) {
							div.classList.add('current');
							div.innerHTML = `<span class="queue-marker">▶</span> <span class="queue-title">${item.title}</span>`;
						} else {
							div.innerHTML = `<span class="queue-index">${idx + 1}.</span> <span class="queue-title">${item.title}</span>`;
							// 为非当前项添加点击事件
							div.style.cursor = 'pointer';
							div.addEventListener('click', () => {
								fetch('/youtube_queue_play', {
									method: 'POST',
									headers: {'Content-Type': 'application/x-www-form-urlencoded'},
									body: `index=${idx}`
								})
								.then(r => r.json())
								.then(res => {
									if(res && res.status === 'OK') {
										console.debug('[UI] 播放队列项:', idx);
										// 重新加载队列显示当前项
										setTimeout(() => loadYoutubeQueue(), 100);
									} else {
										console.error('[UI] 播放失败:', res && res.error);
									}
								})
								.catch(e => console.error('[UI] 请求失败:', e));
							});
						}
						youtubeQueueList.appendChild(div);
					});
				} else {
					youtubeQueueList.innerHTML = '<div style="padding:16px; text-align:center; color:#888;">暂无队列</div>';
				}
			})
			.catch(e => {
				console.warn('[UI] 加载YouTube队列失败:', e);
				youtubeQueueList.innerHTML = '<div style="padding:16px; text-align:center; color:#888;">加载失败</div>';
			});
	}

	// Handle Enter key in textarea (Ctrl+Enter or just Enter for submit)
	// Input modal handlers
	if(youtubeInputBtn) {
		youtubeInputBtn.addEventListener('click', () => {
			youtubeInputModal.classList.add('show');
			youtubeInputTextarea.focus();
		});
	}

	if(youtubeInputModalClose) {
		youtubeInputModalClose.addEventListener('click', () => {
			youtubeInputModal.classList.remove('show');
		});
	}

	if(youtubeInputModal) {
		youtubeInputModal.addEventListener('click', (e) => {
			if(e.target === youtubeInputModal) {
				youtubeInputModal.classList.remove('show');
			}
		});
	}

	youtubeInputTextarea && youtubeInputTextarea.addEventListener('keydown', (e) => {
		if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			youtubeInputSubmit && youtubeInputSubmit.click();
		}
	});

	youtubeInputSubmit && youtubeInputSubmit.addEventListener('click', ()=>{
		const url = (youtubeInputTextarea.value || '').trim();
		
		// Validate URL
		if(!url){
			alert('请输入YouTube地址');
			return;
		}
		
		// Check if it's a valid HTTP(S) URL and contains youtube/youtu.be domain
		let isValidYouTubeUrl = false;
		try {
			const urlObj = new URL(url);
			const host = urlObj.hostname.toLowerCase();
			isValidYouTubeUrl = host.includes('youtube.com') || host.includes('youtu.be');
		} catch (e) {
			// Not a valid URL
		}
		
		if(!isValidYouTubeUrl){
			alert('请输入有效的YouTube视频或播放列表地址');
			return;
		}

		youtubeInputSubmit.disabled = true;
		youtubeInputSubmit.textContent = '播放中...';
		
		console.debug('[UI] play_youtube 请求:', url);
		fetch('/play_youtube', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: 'url=' + encodeURIComponent(url)
		}).then(r => r.json()).then(res => {
			console.debug('[UI] /play_youtube 响应:', res);
			youtubeInputSubmit.disabled = false;
			youtubeInputSubmit.textContent = '播放';
			
			if(res && res.status === 'OK'){
				youtubeInputTextarea.value = '';
				// 立即关闭模态框，不延迟
				youtubeInputModal.classList.remove('show');
				// Add to local history immediately
				addToHistory(url, '');
				// 刷新历史记录和队列（不等待模态框关闭）
				loadYoutubeHistory();
				loadYoutubeQueue();
			}else{
				alert('播放失败：' + (res && res.error || '未知错误'));
			}
		}).catch(e=>{
			console.error('[UI] play_youtube 请求失败', e);
			youtubeInputSubmit.disabled = false;
			youtubeInputSubmit.textContent = '播放';
			alert('请求失败：' + e);
		});
	});

	// 当标签页显示时加载历史和队列
	window.addEventListener('tabswitched', (e) => {
		if(e.detail && e.detail.tab === 'youtube'){
			loadYoutubeHistory();
			loadYoutubeQueue();
			// 每2秒刷新一次队列，以显示当前播放进度
			const queueRefreshInterval = setInterval(() => {
				if(document.getElementById('youtubePlaylist').style.display === 'none') {
					clearInterval(queueRefreshInterval);
				} else {
					loadYoutubeQueue();
				}
			}, 2000);
		}
	});

	// 初始化加载历史记录和队列（当DOM就绪时）
	window.addEventListener('DOMContentLoaded', () => {
		loadYoutubeHistory();
		loadYoutubeQueue();
		initYoutubeSearch();
	});
	
	// 备用方案：如果DOM已经加载完毕，直接加载
	if(document.readyState === 'interactive' || document.readyState === 'complete'){
		loadYoutubeHistory();
		loadYoutubeQueue();
		initYoutubeSearch();
	}

	// YouTube搜索功能
	function initYoutubeSearch() {
		const youtubeSearchInput = document.getElementById('youtubeSearchInput');
		const youtubeSearchBtn = document.getElementById('youtubeSearchBtn');
		const youtubeSearchModal = document.getElementById('youtubeSearchModal');
		const youtubeSearchModalList = document.getElementById('youtubeSearchModalList');
		const youtubeSearchModalClose = document.querySelector('.youtube-search-modal-close');

		if(!youtubeSearchBtn) return;

		youtubeSearchBtn.addEventListener('click', performSearch);
		youtubeSearchInput.addEventListener('keypress', (e) => {
			if(e.key === 'Enter') performSearch();
		});

		// 搜索模态框关闭按钮
		if(youtubeSearchModalClose) {
			youtubeSearchModalClose.addEventListener('click', () => {
				youtubeSearchModal.classList.remove('show');
			});
		}

		// 点击模态框背景关闭
		if(youtubeSearchModal) {
			youtubeSearchModal.addEventListener('click', (e) => {
				if(e.target === youtubeSearchModal) {
					youtubeSearchModal.classList.remove('show');
				}
			});
		}

		function performSearch() {
			const query = youtubeSearchInput.value.trim();
			if(!query) {
				alert('请输入搜索关键字');
				return;
			}

			youtubeSearchBtn.disabled = true;
			youtubeSearchBtn.textContent = '搜索中...';

			fetch('/youtube_search', {
				method: 'POST',
				headers: {'Content-Type': 'application/x-www-form-urlencoded'},
				body: 'query=' + encodeURIComponent(query)
			})
			.then(r => r.json())
			.then(j => {
				youtubeSearchBtn.disabled = false;
				youtubeSearchBtn.textContent = '搜索';

				if(j.status !== 'OK') {
					alert('搜索失败: ' + (j.error || '未知错误'));
					return;
				}

				const results = j.results || [];
				if(results.length === 0) {
					youtubeSearchModalList.innerHTML = '<div style="padding:16px; text-align:center; color:#888;">未找到结果</div>';
					youtubeSearchModal.classList.add('show');
					return;
				}

				youtubeSearchModalList.innerHTML = results.map((item, idx) => {
					const duration = formatDuration(item.duration);
					return `<div class="youtube-search-item" data-url="${item.url.replace(/"/g, '&quot;')}" data-title="${item.title.replace(/"/g, '&quot;')}">
						<div class="youtube-search-item-title">${item.title}</div>
						<div class="youtube-search-item-meta">
							<span>${item.uploader}</span>
							<span>${duration}</span>
						</div>
					</div>`;
				}).join('');
				youtubeSearchModal.classList.add('show');

				// Add click handlers - add to queue instead of playing directly
				youtubeSearchModalList.querySelectorAll('.youtube-search-item').forEach(item => {
					item.addEventListener('click', (e) => {
						const url = item.dataset.url;
						const title = item.dataset.title;
						if(url) {
							// 添加到队列而不是直接播放
							fetch('/youtube_queue_add', {
								method: 'POST',
								headers: {'Content-Type': 'application/x-www-form-urlencoded'},
								body: `url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`
							})
							.then(r => r.json())
							.then(res => {
								if(res && res.status === 'OK') {
									console.debug('[UI] 已添加到队列:', title);
									// 改变背景色表示已添加
									item.classList.add('added-to-queue');
									// 重新加载队列显示
									loadYoutubeQueue();
								} else {
									console.error('[UI] 添加失败:', res && res.error);
									alert('添加到队列失败: ' + (res && res.error || '未知错误'));
								}
							})
							.catch(e => {
								console.error('[UI] 请求失败:', e);
								alert('添加到队列失败: ' + e.message);
							});
						}
					});
				});
			})
			.catch(e => {
				youtubeSearchBtn.disabled = false;
				youtubeSearchBtn.textContent = '搜索';
				console.error('搜索失败:', e);
				alert('搜索失败: ' + e.message);
			});
		}
	}

	function formatDuration(seconds) {
		if(!seconds) return '未知';
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;
		if(hours > 0) {
			return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
		}
		return `${minutes}:${String(secs).padStart(2, '0')}`;
	}

	// 暴露 loadYoutubeQueue 到全局作用域，供其他脚本使用
	window.loadYoutubeQueue = loadYoutubeQueue;

})();
