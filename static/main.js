(() => {
	let ctx = {tree:{}, musicDir:''};
	try { ctx = JSON.parse(document.getElementById('boot-data').textContent); } catch(e) { console.warn('Boot data parse error', e); }
	const ROOT = document.getElementById('tree');
	function el(tag, cls, text){ const e=document.createElement(tag); if(cls)e.className=cls; if(text) e.textContent=text; return e; }

	function buildNode(node){
		const li = el('li','dir');
		if(node.rel) li.dataset.rel = node.rel;
		const label = el('div','label');
		const arrow = el('span','arrow','▶');
		const nameSpan = el('span','name', node.rel? node.name : '根目录');
		label.appendChild(arrow); label.appendChild(nameSpan);
		label.onclick = () => li.classList.toggle('collapsed');
		li.appendChild(label);
		const ul = el('ul');
		(node.dirs||[]).forEach(d=>ul.appendChild(buildNode(d)));
		(node.files||[]).forEach(f=>{
			const fi = el('li','file',f.name);
			fi.dataset.rel = f.rel;
			fi.onclick = () => play(f.rel, fi);
			ul.appendChild(fi);
		});
		li.appendChild(ul);
		if(node.rel) li.classList.add('collapsed');
		return li;
	}

	function render(){
		ROOT.innerHTML='';
		const topUL = el('ul');
		let rootView = ctx.tree;
		(rootView.dirs||[]).forEach(d=>topUL.appendChild(buildNode(d)));
		(rootView.files||[]).forEach(f=>{ const fi = el('li','file',f.name); fi.dataset.rel = f.rel; fi.onclick=()=>play(f.rel,fi); topUL.appendChild(fi); });
		ROOT.appendChild(topUL);
	}

	let lastLocatedRel = null;
	function expandTo(rel){
		if(!rel) return;
		if(rel === lastLocatedRel) return; // 防止频繁跳动
		const parts = rel.split('/');
		let acc = '';
		for(let i=0;i<parts.length-1;i++){
			acc = acc ? acc + '/' + parts[i] : parts[i];
			const dir = Array.from(document.querySelectorAll('li.dir')).find(d=>d.dataset.rel===acc);
			if(dir){ dir.classList.remove('collapsed'); }
		}
		const fileEl = Array.from(document.querySelectorAll('li.file')).find(f=>f.dataset.rel===rel);
		if(fileEl){
			fileEl.scrollIntoView({block:'center'});
			lastLocatedRel = rel;
		}
	}

	function play(rel, dom){
		console.debug('[PLAY] 请求播放:', rel);
		fetch('/play', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'path='+encodeURIComponent(rel)})
			.then(r=>r.json())
			.then(j=>{
				console.debug('[PLAY] /play 响应:', j);
				if(j.status!=='OK') { console.warn('播放失败: ', j.error); alert('播放失败: '+ j.error); return; }
				document.querySelectorAll('.file.playing').forEach(e=>e.classList.remove('playing'));
				dom.classList.add('playing');
				const bar = document.getElementById('nowPlaying');
				bar.textContent = '▶ '+ rel;
			}).catch(e=>{ console.error('[PLAY] 请求错误', e); alert('请求错误: '+ e); });
	}

	function pollStatus(){
		fetch('/status').then(r=>r.json()).then(j=>{
			if(j.status!=='OK') return;
			const bar = document.getElementById('nowPlaying');
			if(!j.playing || !j.playing.rel){ bar.textContent='未播放'; return; }
			const rel = j.playing.rel;
			// 优先使用服务器提供的 media_title（mpv 的 media-title）
			// 若不存在，则使用 name（仅当 name 不是 URL 时）；若仍为 URL，则显示加载占位文本
			let displayName = (j.playing.media_title && j.playing.media_title.length) ? j.playing.media_title : null;
			if(!displayName){
				const nameField = j.playing.name || rel || '';
				if(nameField.startsWith('http')){
					// 对于网络流，在没有真实标题之前显示加载提示，避免展示原始 URL 或域名造成误导
					displayName = '加载中…';
				} else {
					displayName = nameField;
				}
			}
			let label = '▶ '+ displayName;
			if(j.mpv && j.mpv.time!=null && j.mpv.duration){
				const t = j.mpv.time||0, d = j.mpv.duration||0;
				const fmt = s=>{ if(isNaN(s)) return '--:--'; const m=Math.floor(s/60), ss=Math.floor(s%60); return m+':'+(ss<10?'0':'')+ss; };
				label += ' ['+ fmt(t) +' / '+ fmt(d) + (j.mpv.paused?' | 暂停':'') +']';
				// 进度条
				if(d>0){
					const pct = Math.min(100, Math.max(0, t/d*100));
					const fill = document.getElementById('playerProgressFill');
					if(fill) fill.style.width = pct.toFixed(2)+'%';
				}
			}
			// 同步音量显示
			if(j.mpv && j.mpv.volume!=null){
				const vs = document.getElementById('volSlider');
				if(vs && !vs._dragging){ vs.value = Math.round(j.mpv.volume); }
			}
			// 更新播放/暂停按钮显示
			if(j.mpv){
				const playPauseBtn = document.getElementById('playPauseBtn');
				if(playPauseBtn){
					playPauseBtn.textContent = j.mpv.paused ? '▶' : '⏸';
					playPauseBtn.dataset.icon = j.mpv.paused ? '▶' : '⏸';
				}
			}
			bar.textContent = label;
			document.querySelectorAll('.file.playing').forEach(e=>e.classList.remove('playing'));
			// 高亮 & 定位 (仅对本地文件)
			const target = Array.from(document.querySelectorAll('#tree .file')).find(f=>f.dataset.rel===rel);
			if(target){
				target.classList.add('playing');
				expandTo(rel);
			}
		}).catch(()=>{}).finally(()=> setTimeout(pollStatus, 2000));
	}

	setTimeout(pollStatus, 1500);

	// 播放控制按钮
	const playPauseBtn = document.getElementById('playPauseBtn');
	const prevBtn = document.getElementById('prevBtn');
	const nextBtn = document.getElementById('nextBtn');
	const shuffleBtn = document.getElementById('shuffleBtn');
	if(playPauseBtn) playPauseBtn.onclick = ()=>{
		fetch('/toggle_pause', {method:'POST'}).then(r=>r.json()).then(j=>{
			if(j.status==='OK'){
				playPauseBtn.textContent = j.paused ? '▶' : '⏸';
				playPauseBtn.dataset.icon = j.paused ? '▶' : '⏸';
			}
		});
	};
	if(prevBtn) prevBtn.onclick = ()=>{
		// 检查是否在 YouTube 页面并且有队列
		const youtubeTab = document.getElementById('youtubePlaylist');
		if(youtubeTab && youtubeTab.style.display !== 'none') {
			// 在 YouTube 页面，控制队列
			fetch('/youtube_queue')
				.then(r => r.json())
				.then(res => {
					if(res && res.status === 'OK' && res.queue && res.queue.length > 0) {
						const currentIndex = res.current_index || 0;
						const prevIndex = currentIndex - 1;
						if(prevIndex >= 0) {
							fetch('/youtube_queue_play', {
								method: 'POST',
								headers: {'Content-Type': 'application/x-www-form-urlencoded'},
								body: `index=${prevIndex}`
							})
							.then(r => r.json())
							.then(res => {
								if(res && res.status === 'OK') {
									console.debug('[UI] 播放上一首');
									// 重新加载队列显示
									if(window.loadYoutubeQueue) window.loadYoutubeQueue();
								}
							});
						} else {
							console.warn('已是第一首');
						}
					} else {
						// 没有队列，使用本地文件的上一个
						fetch('/prev', {method:'POST'}).then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn(j.error); } });
					}
				})
				.catch(e => {
					console.error('获取队列失败:', e);
					// 降级到本地文件的上一个
					fetch('/prev', {method:'POST'}).then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn(j.error); } });
				});
		} else {
			// 本地文件页面，使用原有逻辑
			fetch('/prev', {method:'POST'}).then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn(j.error); } });
		}
	};
	if(nextBtn) nextBtn.onclick = ()=>{
		// 检查是否在 YouTube 页面并且有队列
		const youtubeTab = document.getElementById('youtubePlaylist');
		if(youtubeTab && youtubeTab.style.display !== 'none') {
			// 在 YouTube 页面，控制队列
			fetch('/youtube_queue')
				.then(r => r.json())
				.then(res => {
					if(res && res.status === 'OK' && res.queue && res.queue.length > 0) {
						const currentIndex = res.current_index || 0;
						const nextIndex = currentIndex + 1;
						if(nextIndex < res.queue.length) {
							fetch('/youtube_queue_play', {
								method: 'POST',
								headers: {'Content-Type': 'application/x-www-form-urlencoded'},
								body: `index=${nextIndex}`
							})
							.then(r => r.json())
							.then(res => {
								if(res && res.status === 'OK') {
									console.debug('[UI] 播放下一首');
									// 重新加载队列显示
									if(window.loadYoutubeQueue) window.loadYoutubeQueue();
								}
							});
						} else {
							console.warn('已是最后一首');
						}
					} else {
						// 没有队列，使用本地文件的下一个
						fetch('/next', {method:'POST'}).then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn(j.error); } });
					}
				})
				.catch(e => {
					console.error('获取队列失败:', e);
					// 降级到本地文件的下一个
					fetch('/next', {method:'POST'}).then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn(j.error); } });
				});
		} else {
			// 本地文件页面，使用原有逻辑
			fetch('/next', {method:'POST'}).then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn(j.error); } });
		}
	};
	if(shuffleBtn) shuffleBtn.onclick = ()=>{
		fetch('/shuffle', {method:'POST'}).then(r=>r.json()).then(j=>{
			if(j.status==='OK'){
				shuffleBtn.dataset.on = j.shuffle ? '1':'0';
			}
		});
	};

	// 循环模式按钮 (0=不循环, 1=单曲循环, 2=全部循环)
	const loopBtn = document.getElementById('loopBtn');
	if(loopBtn) {
		loopBtn.onclick = ()=>{
			fetch('/loop', {method:'POST'}).then(r=>r.json()).then(j=>{
				if(j.status==='OK'){
					const mode = j.loop_mode;
					// 更新按钮显示和状态
					loopBtn.dataset.loop_mode = mode;
					if(mode === 0) {
						loopBtn.textContent = '↻';
						loopBtn.title = '不循环';
						loopBtn.classList.remove('loop-single', 'loop-all');
					} else if(mode === 1) {
						loopBtn.textContent = '↻¹';
						loopBtn.title = '单曲循环';
						loopBtn.classList.add('loop-single');
						loopBtn.classList.remove('loop-all');
					} else if(mode === 2) {
						loopBtn.textContent = '↻∞';
						loopBtn.title = '全部循环';
						loopBtn.classList.add('loop-all');
						loopBtn.classList.remove('loop-single');
					}
				}
			}).catch(e => console.error('循环模式请求失败:', e));
		};
	}

	// 音量滑块事件
	const vol = document.getElementById('volSlider');
	if(vol){
		const send = val => {
			fetch('/volume', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'value='+val})
				.then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn('设置音量失败', j); } })
				.catch(e=>console.warn('音量请求错误', e));
		};
		let debounceTimer;
		vol.addEventListener('input', ()=>{
			vol._dragging = true;
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(()=>{ send(vol.value); vol._dragging=false; }, 120);
		});
		// 初始化: 获取当前音量
		fetch('/volume', {method:'POST'}).then(r=>r.json()).then(j=>{
			if(j.status==='OK' && j.volume!=null){ vol.value = Math.round(j.volume); }
		}).catch(()=>{});
	}

	const toggleBtn = document.getElementById('toggleExpand');
	function updateToggleLabel(){
		if(!toggleBtn) return;
		const dirs = Array.from(document.querySelectorAll('#tree .dir'));
		const anyCollapsed = dirs.some(d=>d.classList.contains('collapsed'));
		toggleBtn.textContent = anyCollapsed ? '+' : '-';
	}
	if(toggleBtn){
		toggleBtn.onclick = ()=>{
			const dirs = document.querySelectorAll('#tree .dir');
			const anyCollapsed = Array.from(dirs).some(d=>d.classList.contains('collapsed'));
			if(anyCollapsed){
				dirs.forEach(d=>d.classList.remove('collapsed'));
			} else {
				dirs.forEach(d=>d.classList.add('collapsed'));
			}
			updateToggleLabel();
		};
	}
	render();
	// Update toggle button label after render so it reflects current tree state
	setTimeout(()=>{ try{ updateToggleLabel(); }catch(e){} }, 50);



	// ========== 标签页切换 ==========
	const tabBtns = document.querySelectorAll('.tab-btn');
	const localTab = document.querySelector('.local-tab');
	const youtubeTab = document.querySelector('.youtube-tab');
	const youtubePlaylist = document.getElementById('youtubePlaylist');
	const tabsNav = document.querySelector('.tabs-nav');

	tabBtns.forEach(btn => {
		btn.addEventListener('click', () => {
			const tab = btn.dataset.tab;
			// 更新按钮状态
			tabBtns.forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			
			// 更新标签导航的主题
			tabsNav.classList.remove('local-tab-nav', 'youtube-tab-nav');
			if(tab === 'local') {
				tabsNav.classList.add('local-tab-nav');
			} else if(tab === 'youtube') {
				tabsNav.classList.add('youtube-tab-nav');
			}
			
			// 显示/隐藏内容
			if(tab === 'local'){
				localTab.style.display = '';
				youtubeTab.style.display = 'none';
			} else if(tab === 'youtube'){
				localTab.style.display = 'none';
				youtubeTab.style.display = '';
				// 触发自定义事件，让youtube.js知道标签页已切换
				window.dispatchEvent(new CustomEvent('tabswitched', { detail: { tab: 'youtube' } }));
			}
		});
	});
	
	// 初始化标签导航主题为YouTube配色
	tabsNav.classList.add('youtube-tab-nav');

	// ========== 音量弹出控制 ==========
	const volumePopupBtn = document.getElementById('volumePopupBtn');
	const volumePopup = document.getElementById('volumePopup');
	const volumeSliderTrack = document.getElementById('volumeSliderTrack');
	const volumeSliderFill = document.getElementById('volumeSliderFill');
	const volumeSliderThumb = document.getElementById('volumeSliderThumb');
	const volSlider = document.getElementById('volSlider');
	
	let isDraggingVolume = false;
	let volumeSendTimer = null;
	let pendingVolumeValue = null;
	
	// Update visual fill and thumb position based on value
	function updateVolumeDisplay(value) {
		const percent = (value / 100) * 100;
		volumeSliderFill.style.height = percent + '%';
		const thumbPos = (percent / 100) * (volumeSliderTrack.offsetHeight - 20); // 20 is thumb size
		volumeSliderThumb.style.bottom = thumbPos + 'px';
	}
	
	// Send volume to server (debounced to every 2 seconds)
	function sendVolumeToServer(value) {
		pendingVolumeValue = value;
		
		// If already waiting to send, just update pending value and return
		if(volumeSendTimer) return;
		
		// Send immediately
		fetch('/volume', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'value='+value})
			.then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn('设置音量失败', j); } })
			.catch(e=>console.warn('音量请求错误', e));
		
		// Set timer for next send (2 seconds)
		volumeSendTimer = setTimeout(() => {
			volumeSendTimer = null;
			// If value changed during wait, send the latest value
			if(pendingVolumeValue !== value) {
				sendVolumeToServer(pendingVolumeValue);
			}
		}, 2000);
	}
	
	// Helper to set volume value
	function setVolumeValue(value) {
		value = Math.max(0, Math.min(100, value));
		if(volSlider) volSlider.value = value;
		updateVolumeDisplay(value);
		// Send to server with 2-second frequency limit
		sendVolumeToServer(value);
	}

	// Show/hide volume popup
	volumePopupBtn && volumePopupBtn.addEventListener('click', () => {
		if(volumePopup.style.display === 'none'){
			volumePopup.style.display = 'block';
			// Sync popup with main slider
			if(volSlider) {
				updateVolumeDisplay(volSlider.value);
			}
			volumePopupBtn.classList.add('active');
		} else {
			volumePopup.style.display = 'none';
			volumePopupBtn.classList.remove('active');
		}
	});
	
	// Mouse down on track - direct value setting
	volumeSliderTrack && volumeSliderTrack.addEventListener('mousedown', (e) => {
		if(e.target === volumeSliderThumb) return; // Let thumb handle its own drag
		isDraggingVolume = true;
		setVolumeFromEvent(e);
	});
	
	// Mouse down on thumb - start drag
	volumeSliderThumb && volumeSliderThumb.addEventListener('mousedown', () => {
		isDraggingVolume = true;
	});
	
	// Helper to calculate value from mouse position
	function setVolumeFromEvent(e) {
		const rect = volumeSliderTrack.getBoundingClientRect();
		const y = e.clientY - rect.top;
		// Convert y position to value (inverted: top=max, bottom=min)
		const percent = Math.max(0, Math.min(100, (1 - (y / rect.height)) * 100));
		const value = Math.round((percent / 100) * 100);
		setVolumeValue(value);
	}
	
	// Mouse move - track drag
	document.addEventListener('mousemove', (e) => {
		if(isDraggingVolume && volumePopup.style.display === 'block') {
			setVolumeFromEvent(e);
		}
	});
	
	// Mouse up - end drag
	document.addEventListener('mouseup', () => {
		isDraggingVolume = false;
	});
	
	// Touch support
	volumeSliderTrack && volumeSliderTrack.addEventListener('touchstart', (e) => {
		if(e.target === volumeSliderThumb) isDraggingVolume = true;
		else setVolumeFromTouchEvent(e);
	});
	
	document.addEventListener('touchmove', (e) => {
		if(isDraggingVolume && volumePopup.style.display === 'block') {
			setVolumeFromTouchEvent(e);
		}
	});
	
	function setVolumeFromTouchEvent(e) {
		const touch = e.touches[0];
		const rect = volumeSliderTrack.getBoundingClientRect();
		const y = touch.clientY - rect.top;
		const percent = Math.max(0, Math.min(100, (1 - (y / rect.height)) * 100));
		const value = Math.round((percent / 100) * 100);
		setVolumeValue(value);
	}
	
	document.addEventListener('touchend', () => {
		isDraggingVolume = false;
	});

	// Close popup when clicking outside
	document.addEventListener('click', (e) => {
		if(volumePopup && volumePopup.style.display === 'block' && 
		   !volumePopup.contains(e.target) && !volumePopupBtn.contains(e.target)){
			volumePopup.style.display = 'none';
			volumePopupBtn.classList.remove('active');
		}
	});

	// History modal functionality
	const historyBtn = document.getElementById('historyBtn');
	const historyModal = document.getElementById('historyModal');
	const historyList = document.getElementById('historyList');
	const historyModalClose = document.querySelector('.history-modal-close');

	if(historyBtn) {
		historyBtn.addEventListener('click', () => {
			loadHistoryModal();
			historyModal.classList.add('show');
		});
	}

	if(historyModalClose) {
		historyModalClose.addEventListener('click', () => {
			historyModal.classList.remove('show');
		});
	}

	// Close history modal when clicking outside
	if(historyModal) {
		historyModal.addEventListener('click', (e) => {
			if(e.target === historyModal) {
				historyModal.classList.remove('show');
			}
		});
	}

	function loadHistoryModal() {
		fetch('/youtube_history?limit=50')
			.then(r => r.json())
			.then(j => {
				if(j.status !== 'OK') {
					historyList.innerHTML = '<div style="padding:16px; text-align:center; color:#888;">无法加载历史记录</div>';
					return;
				}
				const history = j.history || [];
				if(history.length === 0) {
					historyList.innerHTML = '<div style="padding:16px; text-align:center; color:#888;">暂无播放历史</div>';
					return;
				}
			historyList.innerHTML = history.map((item, idx) => {
				// 提取显示名称：优先使用 name，其次使用 title，最后从 URL 提取
				let displayName = item.name || item.title || '未知';
				if(!displayName || displayName === '加载中…') {
					// 如果是 URL，尝试提取更好的名称
					try {
						const url = item.url || '';
						if(url.includes('youtube')) {
							displayName = '播放列表或视频';
						} else {
							const urlObj = new URL(url);
							displayName = urlObj.hostname || displayName;
						}
					} catch(e) {
						displayName = '未知';
					}
				}
				const url = item.url || '';
				const itemType = item.type || 'unknown'; // 记录项目类型
				return `<div class="history-item" data-url="${url.replace(/"/g, '&quot;')}" data-type="${itemType}">
					<div class="history-item-info">
						<div class="history-item-name">${displayName}</div>
						<div class="history-item-url">${url.substring(0, 100)}${url.length > 100 ? '...' : ''}</div>
					</div>
					<button class="history-item-delete" data-index="${idx}" title="删除">✕</button>
				</div>`;
			}).join('');

			// Add click handlers for playback
			historyList.querySelectorAll('.history-item').forEach(item => {
				item.addEventListener('click', (e) => {
					if(!e.target.classList.contains('history-item-delete')) {
						const url = item.dataset.url;
						const itemType = item.dataset.type;
						if(url) {
							playHistoryItem(url, itemType);
							historyModal.classList.remove('show');
						}
					}
				});
			});				// Add delete handlers
				historyList.querySelectorAll('.history-item-delete').forEach(btn => {
					btn.addEventListener('click', (e) => {
						e.stopPropagation();
						const item = e.target.closest('.history-item');
						item.remove();
						// Could add backend support for deletion later
					});
				});
			})
			.catch(e => {
				console.error('Failed to load history:', e);
				historyList.innerHTML = '<div style="padding:16px; text-align:center; color:#888;">加载失败</div>';
			});
	}

	function playHistoryItem(url, itemType) {
		console.debug('[HISTORY] 播放历史项目:', url, '类型:', itemType);
		
		if(itemType === 'local') {
			// 本地文件，使用 /play API
			fetch('/play', {
				method: 'POST',
				headers: {'Content-Type': 'application/x-www-form-urlencoded'},
				body: 'path=' + encodeURIComponent(url)
			})
			.then(r => r.json())
			.then(j => {
				if(j.status !== 'OK') {
					console.warn('播放失败:', j.error);
					alert('播放失败: ' + j.error);
				}
			})
			.catch(e => console.error('播放请求错误:', e));
		} else {
			// YouTube URL，使用 /play_youtube API
			fetch('/play_youtube', {
				method: 'POST',
				headers: {'Content-Type': 'application/x-www-form-urlencoded'},
				body: 'url=' + encodeURIComponent(url)
			})
			.then(r => r.json())
			.then(j => {
				if(j.status !== 'OK') {
					console.warn('播放失败:', j.error);
					alert('播放失败: ' + j.error);
				}
			})
			.catch(e => console.error('播放请求错误:', e));
		}
	}
})();
