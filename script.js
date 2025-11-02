// Clase para gestionar archivos locales con IndexedDB
class LocalFileManager {
    constructor() {
        this.dbName = 'YouTubePlaylistManagerFiles';
        this.dbVersion = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { keyPath: 'id' });
                }
            };
        });
    }

    async saveFile(id, file) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            const request = store.put({ id, file });
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getFile(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['files'], 'readonly');
            const store = transaction.objectStore('files');
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result ? request.result.file : null);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteFile(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

// Clase principal de la aplicación
class YouTubePlaylistManager {
    constructor() {
        console.log("Inicializando YouTube Playlist Manager...");
        
        this.playlists = this.loadPlaylistsFromStorage();
        this.currentPlaylist = null;
        this.currentTrack = null;
        this.currentTrackIndex = 0;
        this.isPlaying = false;
        this.isShuffled = false;
        this.repeatMode = 'none'; // 'none', 'all', 'one'
        this.volume = 0.7;
        this.player = null;
        this.playerReady = false;
        this.localPlayer = null;
        this.progressInterval = null;
        this.previousVolume = 0.7;
        this.fileManager = new LocalFileManager();
        this.currentLocalFileUrl = null; // NUEVO: Para manejar la URL actual del archivo local
        
        console.log("Playlists cargadas:", this.playlists.length);
        
        this.init();
    }
    
    async init() {
        try {
            await this.fileManager.init();
            this.setupEventListeners();
            this.loadPlaylists();
            this.setupYouTubeAPI();
            this.updateNavigationButtons();
            
            // Crear playlist por defecto si no existe ninguna
            if (this.playlists.length === 0) {
                this.createPlaylist('Mi Primera Playlist', 'Playlist creada automáticamente');
            }
        } catch (error) {
            console.error('Error en inicialización:', error);
        }
    }
    
    setupEventListeners() {
        // Navegación
        document.getElementById('backBtn').addEventListener('click', () => this.goBack());
        document.getElementById('forwardBtn').addEventListener('click', () => this.goForward());
        
        // Búsqueda
        document.getElementById('searchInput').addEventListener('input', (e) => this.handleSearch(e.target.value));
        
        // Controles de playlist
        document.getElementById('playAllBtn').addEventListener('click', () => {
            if (this.currentPlaylist && this.currentPlaylist.tracks.length > 0) {
                this.playTrack(this.currentPlaylist.tracks[0], 0);
            }
        });
        document.getElementById('shuffleBtn').addEventListener('click', () => this.toggleShuffle());
        document.getElementById('moreOptionsBtn').addEventListener('click', () => this.showPlaylistOptions());
        
        // Modales - Crear Playlist
        document.getElementById('createPlaylistBtn').addEventListener('click', () => this.showCreatePlaylistModal());
        document.getElementById('createPlaylistMainBtn').addEventListener('click', () => this.showCreatePlaylistModal());
        document.getElementById('closeCreatePlaylistModal').addEventListener('click', () => this.hideCreatePlaylistModal());
        document.getElementById('cancelCreatePlaylist').addEventListener('click', () => this.hideCreatePlaylistModal());
        document.getElementById('confirmCreatePlaylist').addEventListener('click', () => this.handleCreatePlaylist());
        
        // Modales - Agregar Video/Archivo
        document.getElementById('addVideoBtn').addEventListener('click', () => this.showAddVideoModal());
        document.getElementById('closeAddVideoModal').addEventListener('click', () => this.hideAddVideoModal());
        document.getElementById('cancelAddVideo').addEventListener('click', () => this.hideAddVideoModal());
        document.getElementById('confirmAddVideo').addEventListener('click', () => this.handleAddVideo());
        
        // Pestañas del modal
        document.getElementById('tabYouTube').addEventListener('click', () => this.switchTab('youtube'));
        document.getElementById('tabFile').addEventListener('click', () => this.switchTab('file'));
        
        // Cuando seleccionan un archivo
        document.getElementById('fileInputModal').addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Cambios en URL de YouTube
        document.getElementById('videoUrl').addEventListener('input', (e) => this.handleVideoUrlChange(e.target.value));
        
        // Controles del reproductor
        document.getElementById('playPauseBtn').addEventListener('click', () => this.togglePlayPause());
        document.getElementById('prevBtn').addEventListener('click', () => this.previousTrack());
        document.getElementById('nextBtn').addEventListener('click', () => this.nextTrack());
        document.getElementById('shufflePlayerBtn').addEventListener('click', () => this.toggleShuffle());
        document.getElementById('repeatBtn').addEventListener('click', () => this.toggleRepeat());
        
        // Controles de volumen
        document.getElementById('volumeBtn').addEventListener('click', () => this.toggleMute());
        this.setupVolumeSlider();
        this.setupProgressBar();
        
        // Cerrar modal al hacer clic fuera
        document.getElementById('modalOverlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('modalOverlay')) {
                this.hideAllModals();
            }
        });
        
        // Navegación del sidebar
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => this.handleNavigation(e.currentTarget));
        });
    }
    
    switchTab(tab) {
        const isYouTube = tab === 'youtube';
        
        // Cambiar estilos de pestañas
        document.getElementById('tabYouTube').style.background = isYouTube ? 'var(--bg-card)' : 'var(--bg-secondary)';
        document.getElementById('tabYouTube').style.color = isYouTube ? 'var(--text-primary)' : 'var(--text-secondary)';
        document.getElementById('tabYouTube').style.borderBottom = isYouTube ? '3px solid var(--accent-primary)' : 'none';
        
        document.getElementById('tabFile').style.background = !isYouTube ? 'var(--bg-card)' : 'var(--bg-secondary)';
        document.getElementById('tabFile').style.color = !isYouTube ? 'var(--text-primary)' : 'var(--text-secondary)';
        document.getElementById('tabFile').style.borderBottom = !isYouTube ? '3px solid var(--accent-primary)' : 'none';
        
        // Cambiar contenido
        document.getElementById('contentYouTube').style.display = isYouTube ? 'block' : 'none';
        document.getElementById('contentFile').style.display = !isYouTube ? 'block' : 'none';
        document.getElementById('videoPreview').style.display = 'none';
        
        // Limpiar
        if (!isYouTube) {
            document.getElementById('videoUrl').value = '';
        } else {
            const fileInput = document.getElementById('fileInputModal');
            fileInput.value = '';
        }
    }
    
    handleFileSelect(e) {
        const file = e.target.files[0];
        const preview = document.getElementById('videoPreview');
        
        if (!file) {
            preview.style.display = 'none';
            return;
        }

        // Validaciones básicas
        const validTypes = ['audio/', 'video/'];
        if (!validTypes.some(type => file.type.startsWith(type))) {
            alert('⚠️ Por favor selecciona un archivo de audio o video válido');
            e.target.value = '';
            preview.style.display = 'none';
            return;
        }

        // Mostrar preview
        preview.style.display = 'block';
        const isAudio = file.type.startsWith('audio/');
        const bgColor = isAudio ? '#1db954' : '#ff6b6b';
        
        preview.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: ${bgColor}; border-radius: 8px; color: white;">
                <div style="width: 60px; height: 60px; background: rgba(255,255,255,0.3); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                    <i class="fas ${isAudio ? 'fa-music' : 'fa-video'}"></i>
                </div>
                <div>
                    <div style="font-weight: 500; margin-bottom: 0.25rem;">${file.name}</div>
                    <div style="opacity: 0.9; font-size: 0.9rem;">
                        ${(file.size / (1024 * 1024)).toFixed(2)} MB • ${file.type.split('/')[1].toUpperCase()}
                    </div>
                    <div style="opacity: 0.8; font-size: 0.8rem; margin-top: 0.5rem;">
                        <i class="fas fa-check-circle"></i> Listo para agregar (se guardará permanentemente)
                    </div>
                </div>
            </div>
        `;
    }
    
    setupYouTubeAPI() {
        // Si el API ya está cargado, inicializar inmediatamente
        if (window.YT && window.YT.Player) {
            this.initializePlayer();
        }
    }
    
    initializePlayer() {
        try {
            this.player = new YT.Player('youtubePlayer', {
                height: '0',
                width: '0',
                playerVars: {
                    'playsinline': 1,
                    'controls': 0,
                    'rel': 0,
                    'showinfo': 0,
                    'modestbranding': 1
                },
                events: {
                    'onReady': (event) => this.onPlayerReady(event),
                    'onStateChange': (event) => this.onPlayerStateChange(event)
                }
            });
        } catch (error) {
            console.error('Error inicializando YouTube Player:', error);
        }
    }
    
    onPlayerReady(event) {
        this.playerReady = true;
        this.player.setVolume(this.volume * 100);
        console.log('YouTube Player listo');
        
        // Actualizar duración del track actual si es 0
        if (this.currentTrack && this.currentTrack.duration === 0 && !this.currentTrack.isLocal) {
            const duration = this.player.getDuration();
            if (duration > 0) {
                this.currentTrack.duration = Math.floor(duration);
                this.updateTrackDuration(this.currentTrack.id, duration);
            }
        }
    }
    
    onPlayerStateChange(event) {
        console.log("Estado de YouTube Player cambiado:", event.data);
        
        if (event.data === YT.PlayerState.ENDED) {
            // Manejar el final de la canción según el modo de repetición
            if (this.repeatMode === 'one') {
                this.player.playVideo();
            } else {
                this.nextTrack();
            }
        } else if (event.data === YT.PlayerState.PLAYING) {
            this.isPlaying = true;
            this.updatePlayPauseButton();
            this.startProgressUpdate();
            
            // Asegurarse de que el reproductor local esté detenido
            if (this.localPlayer) {
                this.cleanupLocalPlayer();
            }
        } else if (event.data === YT.PlayerState.PAUSED) {
            this.isPlaying = false;
            this.updatePlayPauseButton();
        } else if (event.data === YT.PlayerState.BUFFERING) {
            console.log("YouTube buffering...");
        }
    }
    
    loadPlaylistsFromStorage() {
        try {
            const stored = localStorage.getItem('youtube-playlists');
            if (stored) {
                const parsed = JSON.parse(stored);
                console.log('Playlists cargadas:', parsed.length);
                return parsed;
            }
        } catch (error) {
            console.error('Error cargando playlists:', error);
        }
        return [];
    }
    
    savePlaylists() {
        try {
            localStorage.setItem('youtube-playlists', JSON.stringify(this.playlists));
            console.log('Playlists guardadas:', this.playlists.length);
            this.loadPlaylists();
        } catch (error) {
            console.error('Error guardando playlists:', error);
            alert('No se pudieron guardar las playlists');
        }
    }
    
    // Gestión de Playlists
    createPlaylist(name, description = '') {
        const playlist = {
            id: Date.now().toString(),
            name: name,
            description: description,
            tracks: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.playlists.push(playlist);
        this.savePlaylists();
        this.loadPlaylists();
        return playlist;
    }
    
    deletePlaylist(playlistId) {
        // Eliminar archivos locales de la playlist
        const playlist = this.playlists.find(p => p.id === playlistId);
        if (playlist) {
            playlist.tracks.forEach(track => {
                if (track.isLocal) {
                    this.fileManager.deleteFile(track.id).catch(console.error);
                }
            });
        }
        
        this.playlists = this.playlists.filter(p => p.id !== playlistId);
        this.savePlaylists();
        this.loadPlaylists();
        
        if (this.currentPlaylist && this.currentPlaylist.id === playlistId) {
            this.showHomeView();
        }
    }
    
    addVideoToPlaylist(playlistId, videoData) {
        console.log("Agregando video a playlist:", playlistId, videoData);
        
        try {
            const playlist = this.playlists.find(p => p.id === playlistId);
            if (!playlist) {
                console.error("Playlist no encontrada:", playlistId);
                return false;
            }

            const track = {
                id: videoData.id || Date.now().toString(),
                videoId: videoData.videoId,
                title: videoData.title,
                channel: videoData.channel,
                duration: videoData.duration || 0,
                thumbnail: videoData.thumbnail,
                isLocal: videoData.isLocal || false,
                fileName: videoData.fileName || null,
                fileType: videoData.fileType || null,
                fileSize: videoData.fileSize || null,
                addedAt: videoData.addedAt || new Date().toISOString()
            };

            console.log("Track creado:", track);
            
            playlist.tracks.push(track);
            playlist.updatedAt = new Date().toISOString();
            
            // Guardar cambios
            this.savePlaylists();
            
            // Actualizar vista si es necesario
            if (this.currentPlaylist && this.currentPlaylist.id === playlistId) {
                this.loadPlaylistView(playlistId);
            }

            console.log("Video agregado exitosamente");
            return true;
            
        } catch (error) {
            console.error('Error en addVideoToPlaylist:', error);
            return false;
        }
    }
    
    removeVideoFromPlaylist(playlistId, trackId) {
        const playlist = this.playlists.find(p => p.id === playlistId);
        if (!playlist) return false;
        
        // Encontrar el track antes de eliminarlo
        const trackToRemove = playlist.tracks.find(t => t.id === trackId);
        
        playlist.tracks = playlist.tracks.filter(t => t.id !== trackId);
        playlist.updatedAt = new Date().toISOString();
        this.savePlaylists();
        
        // Si era un archivo local, eliminarlo de IndexedDB
        if (trackToRemove && trackToRemove.isLocal) {
            this.fileManager.deleteFile(trackId).catch(error => {
                console.error('Error eliminando archivo de IndexedDB:', error);
            });
        }
        
        // Si el track que se está eliminando es el que se está reproduciendo, detenerlo
        if (this.currentTrack && this.currentTrack.id === trackId) {
            this.stopAllPlayers();
            this.currentTrack = null;
            this.currentTrackIndex = 0;
            this.updateCurrentTrackDisplay();
        }
        
        if (this.currentPlaylist && this.currentPlaylist.id === playlistId) {
            this.loadPlaylistView(playlistId);
        }
        
        return true;
    }
    
    loadPlaylists() {
        this.renderSidebarPlaylists();
        this.renderHomeView();
    }
    
    // Interfaz de Usuario
    renderSidebarPlaylists() {
        const playlistList = document.getElementById('playlistList');
        playlistList.innerHTML = '';
        
        this.playlists.forEach(playlist => {
            const li = document.createElement('li');
            li.className = 'playlist-item';
            li.setAttribute('data-id', playlist.id);
            if (this.currentPlaylist && this.currentPlaylist.id === playlist.id) {
                li.classList.add('active');
            }
            li.innerHTML = `
                <span>${playlist.name}</span>
            `;
            li.addEventListener('click', () => this.loadPlaylistView(playlist.id));
            playlistList.appendChild(li);
        });
    }
    
    renderHomeView() {
        const playlistGrid = document.getElementById('playlistGrid');
        playlistGrid.innerHTML = '';
        
        // Mostrar las últimas 6 playlists
        const recentPlaylists = this.playlists.slice(-6).reverse();
        
        recentPlaylists.forEach(playlist => {
            const card = document.createElement('div');
            card.className = 'playlist-card';
            card.innerHTML = `
                <div class="playlist-card-cover">
                    <i class="fas fa-music"></i>
                </div>
                <div class="playlist-card-title">${playlist.name}</div>
                <div class="playlist-card-meta">${playlist.tracks.length} videos</div>
            `;
            card.addEventListener('click', () => this.loadPlaylistView(playlist.id));
            playlistGrid.appendChild(card);
        });

        // Si no hay playlists recientes, mostrar mensaje
        if (recentPlaylists.length === 0) {
            playlistGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <i class="fas fa-music" style="font-size: 4rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <p>No hay playlists aún</p>
                    <button class="action-btn primary" onclick="app.showCreatePlaylistModal()" style="margin-top: 1rem;">
                        <i class="fas fa-plus"></i>
                        Crear tu primera playlist
                    </button>
                </div>
            `;
        }
    }
    
    loadPlaylistView(playlistId) {
        const playlist = this.playlists.find(p => p.id === playlistId);
        if (!playlist) return;
        
        this.currentPlaylist = playlist;
        
        // Actualizar información de la playlist
        document.getElementById('currentPlaylistTitle').textContent = playlist.name;
        document.getElementById('currentPlaylistMeta').textContent = `${playlist.tracks.length} videos`;
        
        // Renderizar lista de tracks
        this.renderTrackList(playlist.tracks);
        
        // Mostrar vista de playlist
        this.showView('playlistView');
        
        // Actualizar navegación del sidebar
        document.querySelectorAll('.playlist-item').forEach(item => item.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        
        // Activar la playlist actual en el sidebar
        const currentPlaylistItem = document.querySelector(`.playlist-item[data-id="${playlistId}"]`);
        if (currentPlaylistItem) {
            currentPlaylistItem.classList.add('active');
        }
    }
    
    renderTrackList(tracks) {
        const trackListBody = document.getElementById('trackListBody');
        trackListBody.innerHTML = '';
        
        if (tracks.length === 0) {
            trackListBody.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    <i class="fas fa-music" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <p>No hay videos en esta playlist</p>
                    <button class="action-btn primary" onclick="app.showAddVideoModal()" style="margin-top: 1rem;">
                        <i class="fas fa-plus"></i>
                        Agregar primer video
                    </button>
                </div>
            `;
            return;
        }
        
        tracks.forEach((track, index) => {
            const trackItem = document.createElement('div');
            trackItem.className = 'track-item';
            if (this.currentTrack && this.currentTrack.id === track.id) {
                trackItem.classList.add('playing');
            }
            
            trackItem.innerHTML = `
                <div class="track-number">${index + 1}</div>
                <div class="play-icon" style="display: none;">
                    <i class="fas fa-play"></i>
                </div>
                <div class="track-info">
                    <div class="track-thumbnail">
                        ${track.isLocal ? 
                            `<div class="local-file-thumbnail ${track.fileType.startsWith('audio/') ? 'audio-thumb' : 'video-thumb'}">
                                <i class="fas ${track.fileType.startsWith('audio/') ? 'fa-music' : 'fa-video'}"></i>
                            </div>` :
                            `<img src="${track.thumbnail}" alt="${track.title}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-music\\'></i>'">`
                        }
                    </div>
                    <div class="track-details">
                        <div class="track-name">${track.title}</div>
                        <div class="track-artist">${track.channel}</div>
                    </div>
                </div>
                <div class="track-duration">${track.duration > 0 ? this.formatDuration(track.duration) : '--:--'}</div>
                <div class="track-actions">
                    ${!track.isLocal ? `
                        <button class="track-menu-btn" onclick="event.stopPropagation(); window.open('https://www.youtube.com/watch?v=${track.videoId}', '_blank')" title="Ver en YouTube">
                            <i class="fab fa-youtube"></i>
                        </button>
                    ` : ''}
                    <button class="track-menu-btn" onclick="event.stopPropagation(); app.removeVideoFromPlaylist('${this.currentPlaylist.id}', '${track.id}')" title="Eliminar de playlist">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            trackItem.addEventListener('click', (e) => {
                if (!e.target.closest('.track-menu-btn')) {
                    this.playTrack(track, index);
                }
            });
            
            trackListBody.appendChild(trackItem);
        });
    }
    
    showView(viewId) {
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
    }
    
    showHomeView() {
        console.log("Mostrando vista de inicio");
        this.currentPlaylist = null;
        
        // Ocultar todas las vistas y mostrar home
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        document.getElementById('homeView').classList.add('active');
        
        // Actualizar navegación del sidebar
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        document.querySelectorAll('.playlist-item').forEach(item => item.classList.remove('active'));
        
        // Activar el primer ítem del sidebar (Inicio)
        const homeNavItem = document.querySelector('.sidebar-nav .nav-item');
        if (homeNavItem) {
            homeNavItem.classList.add('active');
        }
        
        // Recargar playlists recientes
        this.renderHomeView();
    }
    
    showPlaylistOptions() {
        if (!this.currentPlaylist) return;
        
        const options = confirm(`Opciones para "${this.currentPlaylist.name}"\n\n¿Deseas eliminar esta playlist?`);
        if (options) {
            this.deletePlaylist(this.currentPlaylist.id);
        }
    }
    
    // Modales
    showCreatePlaylistModal() {
        document.getElementById('modalOverlay').classList.add('active');
        document.getElementById('createPlaylistModal').style.display = 'block';
        document.getElementById('addVideoModal').style.display = 'none';
        document.getElementById('playlistName').focus();
    }
    
    hideCreatePlaylistModal() {
        document.getElementById('modalOverlay').classList.remove('active');
        document.getElementById('playlistName').value = '';
        document.getElementById('playlistDescription').value = '';
    }
    
    showAddVideoModal() {
        document.getElementById('modalOverlay').classList.add('active');
        document.getElementById('addVideoModal').style.display = 'block';
        document.getElementById('createPlaylistModal').style.display = 'none';
        
        // Llenar selector de playlists
        const selectPlaylist = document.getElementById('selectPlaylist');
        selectPlaylist.innerHTML = '<option value="">Selecciona una playlist...</option>';
        this.playlists.forEach(playlist => {
            const option = document.createElement('option');
            option.value = playlist.id;
            option.textContent = playlist.name;
            if (this.currentPlaylist && this.currentPlaylist.id === playlist.id) {
                option.selected = true;
            }
            selectPlaylist.appendChild(option);
        });
        
        // Resetear a pestaña YouTube
        this.switchTab('youtube');
    }
    
    hideAddVideoModal() {
        document.getElementById('modalOverlay').classList.remove('active');
        document.getElementById('videoUrl').value = '';
        document.getElementById('selectPlaylist').value = '';
        document.getElementById('videoPreview').style.display = 'none';
        
        const fileInput = document.getElementById('fileInputModal');
        if (fileInput) fileInput.value = '';
    }
    
    hideAllModals() {
        this.hideCreatePlaylistModal();
        this.hideAddVideoModal();
    }
    
    // Manejadores de eventos
    handleCreatePlaylist() {
        const name = document.getElementById('playlistName').value.trim();
        const description = document.getElementById('playlistDescription').value.trim();
        
        if (!name) {
            alert('Por favor ingresa un nombre para la playlist');
            return;
        }
        
        this.createPlaylist(name, description);
        this.hideCreatePlaylistModal();
    }
    
    async handleAddVideo() {
        console.log("Iniciando handleAddVideo...");
        
        const playlistId = document.getElementById('selectPlaylist').value;
        
        // Validar playlist
        if (!playlistId) {
            alert('⚠️ Por favor selecciona una playlist');
            return;
        }

        // PRIMERO verificar si hay archivo local seleccionado
        const fileInput = document.getElementById('fileInputModal');
        const file = fileInput.files[0];
        
        if (file) {
            console.log("Archivo detectado:", file.name);
            await this.processLocalFile(file, playlistId);
            return;
        }

        // SI NO hay archivo, entonces procesar URL de YouTube
        const url = document.getElementById('videoUrl').value.trim();
        if (!url) {
            alert('⚠️ Por favor ingresa una URL de YouTube o selecciona un archivo');
            return;
        }

        const videoId = this.extractVideoId(url);
        if (!videoId) {
            alert('❌ URL de YouTube no válida');
            return;
        }

        this.processYouTubeVideo(videoId, playlistId);
    }
    
    async processLocalFile(file, playlistId) {
        console.log("Procesando archivo local...");
        
        // Validaciones del archivo
        const validAudioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/x-m4a', 'audio/aac'];
        const validVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
        
        if (!validAudioTypes.includes(file.type) && !validVideoTypes.includes(file.type)) {
            alert('⚠️ Tipo de archivo no soportado. Formatos soportados: MP3, WAV, OGG, WEBM, M4A, AAC, MP4, etc.');
            return;
        }

        // Validar tamaño (máximo 50MB)
        if (file.size > 50 * 1024 * 1024) {
            alert('⚠️ El archivo es demasiado grande. Máximo 50MB.');
            return;
        }

        try {
            // Crear ID único para el archivo
            const fileId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Guardar archivo en IndexedDB
            await this.fileManager.saveFile(fileId, file);
            console.log("Archivo guardado en IndexedDB:", fileId);

            // Crear thumbnail
            const isAudio = file.type.startsWith('audio/');
            const backgroundColor = isAudio ? '#1db954' : '#ff6b6b';
            const typeText = isAudio ? 'AUDIO' : 'VIDEO';
            
            const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90">
                <rect width="120" height="90" fill="${backgroundColor}"/>
                <circle cx="60" cy="35" r="15" fill="#ffffff" opacity="0.9"/>
                <rect x="52" y="25" width="16" height="20" fill="${backgroundColor}"/>
                <text x="60" y="70" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="12" font-weight="bold">
                    ${typeText}
                </text>
            </svg>`;
            
            const thumbnail = 'data:image/svg+xml;base64,' + btoa(svgContent);

            // Crear objeto de track local
            const trackData = {
                id: fileId,
                videoId: fileId,
                title: file.name.replace(/\.[^/.]+$/, ''),
                channel: 'Archivo Local',
                duration: 0,
                thumbnail: thumbnail,
                isLocal: true,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                addedAt: new Date().toISOString()
            };

            console.log("Datos del track creados:", trackData);

            // Agregar a la playlist
            const success = this.addVideoToPlaylist(playlistId, trackData);
            
            if (success) {
                const playlist = this.playlists.find(p => p.id === playlistId);
                alert(`✅ ¡Archivo "${trackData.title}" agregado a "${playlist.name}"!`);
                this.hideAddVideoModal();
            } else {
                // Si falla, eliminar el archivo de IndexedDB
                await this.fileManager.deleteFile(fileId);
                alert('❌ Error al agregar el archivo a la playlist');
            }
        } catch (error) {
            console.error('Error procesando archivo:', error);
            alert('❌ Error al procesar el archivo: ' + error.message);
        }
    }
    
    processYouTubeVideo(videoId, playlistId) {
        console.log("Procesando video de YouTube...");
        
        // Mostrar loading
        const preview = document.getElementById('videoPreview');
        preview.style.display = 'block';
        preview.innerHTML = '<div style="padding: 1rem; text-align: center;">Cargando información del video...</div>';

        this.fetchVideoData(videoId).then(videoData => {
            if (videoData) {
                const success = this.addVideoToPlaylist(playlistId, videoData);
                if (success) {
                    const playlist = this.playlists.find(p => p.id === playlistId);
                    alert(`✅ ¡Video agregado a "${playlist.name}"!`);
                    this.hideAddVideoModal();
                } else {
                    alert('❌ Error al agregar el video a la playlist');
                }
            } else {
                alert('❌ No se pudo obtener información del video');
            }
        }).catch(error => {
            console.error('Error:', error);
            alert('❌ Error al procesar el video de YouTube');
        });
    }
    
    handleVideoUrlChange(url) {
        const videoId = this.extractVideoId(url);
        const preview = document.getElementById('videoPreview');
        
        if (videoId) {
            preview.style.display = 'block';
            preview.innerHTML = `
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <img src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" 
                         style="width: 120px; height: 90px; border-radius: 4px; object-fit: cover;">
                    <div>
                        <div style="font-weight: 500; margin-bottom: 0.5rem;">Cargando información del video...</div>
                        <div style="color: var(--text-secondary); font-size: 0.9rem;">YouTube</div>
                    </div>
                </div>
            `;
            
            this.fetchVideoData(videoId).then(videoData => {
                if (videoData) {
                    preview.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <img src="${videoData.thumbnail}" 
                                 style="width: 120px; height: 90px; border-radius: 4px; object-fit: cover;">
                            <div>
                                <div style="font-weight: 500; margin-bottom: 0.5rem;">${videoData.title}</div>
                                <div style="color: var(--text-secondary); font-size: 0.9rem;">${videoData.channel}</div>
                                <div style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 0.25rem;">
                                    Duración: ${this.formatDuration(videoData.duration)}
                                </div>
                            </div>
                        </div>
                    `;
                }
            });
        } else {
            preview.style.display = 'none';
        }
    }
    
    handleNavigation(navItem) {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        navItem.classList.add('active');
        
        const text = navItem.querySelector('span').textContent.trim();
        if (text === 'Inicio') {
            this.showHomeView();
        } else if (text === 'Buscar') {
            this.showView('searchView');
        } else if (text === 'Tu Biblioteca') {
            this.showHomeView();
        }
    }
    
    handleSearch(query) {
        if (query.length < 3) {
            document.getElementById('searchResults').innerHTML = '';
            return;
        }
        
        const searchResults = document.getElementById('searchResults');
        
        // Verificar si es un enlace de YouTube
        const videoId = this.extractVideoId(query);
        if (videoId) {
            searchResults.innerHTML = `
                <div class="loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    Cargando video...
                </div>
            `;
            
            this.fetchVideoData(videoId).then(videoData => {
                if (videoData) {
                    searchResults.innerHTML = `
                        <div class="search-result-item">
                            <div class="video-thumbnail">
                                <img src="${videoData.thumbnail}" alt="${videoData.title}">
                                <button class="play-overlay-btn" onclick="app.playVideoFromSearch('${videoId}', ${JSON.stringify(videoData).replace(/"/g, '&quot;')})">
                                    <i class="fas fa-play"></i>
                                </button>
                            </div>
                            <div class="video-info">
                                <h3>${videoData.title}</h3>
                                <p>${videoData.channel}</p>
                                <p>Duración: ${this.formatDuration(videoData.duration)}</p>
                                <div class="video-actions">
                                    <button class="btn primary" onclick="app.playVideoFromSearch('${videoId}', ${JSON.stringify(videoData).replace(/"/g, '&quot;')})">
                                        <i class="fas fa-play"></i> Reproducir
                                    </button>
                                    <button class="btn secondary" onclick="app.showAddVideoModalWithData('${videoId}', ${JSON.stringify(videoData).replace(/"/g, '&quot;')})">
                                        <i class="fas fa-plus"></i> Agregar a playlist
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    searchResults.innerHTML = `
                        <div class="error-message">
                            <i class="fas fa-exclamation-triangle"></i>
                            No se pudo cargar el video
                        </div>
                    `;
                }
            });
        } else {
            // Búsqueda de texto normal (simulada)
            searchResults.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    <i class="fas fa-search" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <p>Búsqueda de texto en desarrollo</p>
                    <p style="font-size: 0.9rem; margin-top: 0.5rem;">
                        Prueba pegando un enlace directo de YouTube para reproducir
                    </p>
                </div>
            `;
        }
    }
    
    playVideoFromSearch(videoId, videoData) {
        // Crear un track temporal para reproducir
        const tempTrack = {
            id: 'temp_' + Date.now(),
            videoId: videoId,
            title: videoData.title,
            channel: videoData.channel,
            duration: videoData.duration,
            thumbnail: videoData.thumbnail
        };
        
        // Crear playlist temporal si no hay una activa
        if (!this.currentPlaylist) {
            this.currentPlaylist = {
                id: 'temp_playlist',
                name: 'Reproducción desde búsqueda',
                tracks: [tempTrack]
            };
            this.currentTrackIndex = 0;
        } else {
            // O agregar a la playlist actual temporalmente
            this.currentPlaylist.tracks.push(tempTrack);
            this.currentTrackIndex = this.currentPlaylist.tracks.length - 1;
        }
        
        this.playTrack(tempTrack, this.currentTrackIndex);
    }
    
    showAddVideoModalWithData(videoId, videoData) {
        this.showAddVideoModal();
        
        // Pre-llenar el modal con los datos del video
        document.getElementById('videoUrl').value = `https://www.youtube.com/watch?v=${videoId}`;
        
        const preview = document.getElementById('videoPreview');
        preview.style.display = 'block';
        preview.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1rem;">
                <img src="${videoData.thumbnail}" 
                     style="width: 120px; height: 90px; border-radius: 4px; object-fit: cover;">
                <div>
                    <div style="font-weight: 500; margin-bottom: 0.5rem;">${videoData.title}</div>
                    <div style="color: var(--text-secondary); font-size: 0.9rem;">${videoData.channel}</div>
                    <div style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 0.25rem;">
                        Duración: ${this.formatDuration(videoData.duration)}
                    </div>
                </div>
            </div>
        `;
    }
    
    // CORRECCIÓN PRINCIPAL: Limpiar correctamente el reproductor local
    cleanupLocalPlayer() {
        if (this.localPlayer) {
            console.log("Limpiando reproductor local...");
            this.localPlayer.pause();
            this.localPlayer.currentTime = 0;
            
            // Liberar URL de objeto si existe
            if (this.currentLocalFileUrl) {
                URL.revokeObjectURL(this.currentLocalFileUrl);
                this.currentLocalFileUrl = null;
            }
            
            // Remover del DOM
            if (this.localPlayer.parentNode) {
                this.localPlayer.parentNode.removeChild(this.localPlayer);
            }
            
            this.localPlayer = null;
        }
    }
    
    // Reproducción
    playTrack(track, index) {
        console.log("Reproduciendo track:", track);
        
        if (!this.playerReady && !track.isLocal) {
            console.log('Player de YouTube no está listo');
            return;
        }
        
        this.currentTrack = track;
        this.currentTrackIndex = index;
        
        // Detener todos los reproductores antes de iniciar uno nuevo
        this.stopAllPlayers();
        
        if (track.isLocal) {
            // Reproducir archivo local
            this.playLocalFile(track);
        } else {
            // Reproducir video de YouTube
            if (this.playerReady) {
                this.player.loadVideoById(track.videoId);
            } else {
                console.log('YouTube Player no está listo todavía');
                // Intentar inicializar si no está listo
                if (window.YT && window.YT.Player && !this.player) {
                    this.initializePlayer();
                    // Esperar un momento y reintentar
                    setTimeout(() => {
                        if (this.playerReady) {
                            this.player.loadVideoById(track.videoId);
                        }
                    }, 1000);
                }
            }
        }
        
        this.updateCurrentTrackDisplay();
        this.updateTrackListDisplay();
    }
    
    async playLocalFile(track) {
        console.log("Reproduciendo archivo local:", track.id);
        
        try {
            // Cargar archivo desde IndexedDB
            const file = await this.fileManager.getFile(track.id);
            if (!file) {
                throw new Error('Archivo no encontrado en el almacenamiento');
            }
            
            // Crear URL temporal para reproducir
            this.currentLocalFileUrl = URL.createObjectURL(file);
            
            const isAudio = track.fileType.startsWith('audio/');
            this.localPlayer = document.createElement(isAudio ? 'audio' : 'video');
            this.localPlayer.src = this.currentLocalFileUrl;
            this.localPlayer.style.display = 'none';
            this.localPlayer.volume = this.volume;
            
            // Event listeners
            this.localPlayer.addEventListener('canplay', () => {
                console.log('Archivo local listo para reproducir');
                this.localPlayer.play().catch(err => {
                    console.error('Error al reproducir:', err);
                    alert('No se pudo reproducir el archivo. Intenta de nuevo.');
                    this.isPlaying = false;
                    this.updatePlayPauseButton();
                });
            });
            
            this.localPlayer.addEventListener('ended', () => {
                console.log('Archivo local terminado');
                
                // Liberar URL
                if (this.currentLocalFileUrl) {
                    URL.revokeObjectURL(this.currentLocalFileUrl);
                    this.currentLocalFileUrl = null;
                }
                
                if (this.repeatMode === 'one') {
                    this.localPlayer.currentTime = 0;
                    this.localPlayer.play();
                } else {
                    this.nextTrack();
                }
            });
            
            this.localPlayer.addEventListener('loadedmetadata', () => {
                // Actualizar duración
                if (track.duration === 0 || isNaN(track.duration)) {
                    const duration = Math.floor(this.localPlayer.duration);
                    this.updateTrackDuration(track.id, duration);
                }
            });
            
            this.localPlayer.addEventListener('timeupdate', () => {
                this.updateLocalProgress();
            });
            
            this.localPlayer.addEventListener('play', () => {
                this.isPlaying = true;
                this.updatePlayPauseButton();
                this.startProgressUpdate();
            });
            
            this.localPlayer.addEventListener('pause', () => {
                this.isPlaying = false;
                this.updatePlayPauseButton();
            });
            
            this.localPlayer.addEventListener('error', (e) => {
                console.error('Error en reproductor local:', e);
                if (this.currentLocalFileUrl) {
                    URL.revokeObjectURL(this.currentLocalFileUrl);
                    this.currentLocalFileUrl = null;
                }
                alert('Error al cargar el archivo. Puede que esté corrupto o no sea compatible.');
                this.isPlaying = false;
                this.updatePlayPauseButton();
            });
            
            document.body.appendChild(this.localPlayer);
            
            // Iniciar carga del archivo
            this.localPlayer.load();
            
        } catch (error) {
            console.error('Error cargando archivo local:', error);
            alert('Error al cargar el archivo: ' + error.message);
        }
    }
    
    stopAllPlayers() {
        console.log("Deteniendo todos los reproductores...");
        
        // Detener reproductor local
        this.cleanupLocalPlayer();
        
        // Detener reproductor de YouTube
        if (this.player && this.playerReady) {
            this.player.pauseVideo();
        }
        
        this.isPlaying = false;
        this.updatePlayPauseButton();
    }
    
    togglePlayPause() {
        if (!this.currentTrack) return;
        
        console.log("Toggle play/pause. Track actual:", this.currentTrack);
        
        if (this.currentTrack.isLocal) {
            // Controlar reproductor local
            if (this.localPlayer) {
                if (this.isPlaying) {
                    this.localPlayer.pause();
                } else {
                    this.localPlayer.play();
                }
            }
        } else {
            // Controlar reproductor de YouTube
            if (this.player && this.playerReady) {
                if (this.isPlaying) {
                    this.player.pauseVideo();
                } else {
                    this.player.playVideo();
                }
            } else {
                console.log("YouTube Player no disponible");
            }
        }
    }
    
    previousTrack() {
        if (!this.currentPlaylist || this.currentPlaylist.tracks.length === 0) return;
        
        let newIndex = this.currentTrackIndex - 1;
        if (newIndex < 0) {
            newIndex = this.currentPlaylist.tracks.length - 1;
        }
        
        this.playTrack(this.currentPlaylist.tracks[newIndex], newIndex);
    }
    
    nextTrack() {
        if (!this.currentPlaylist || this.currentPlaylist.tracks.length === 0) return;
        
        let newIndex;
        
        if (this.isShuffled) {
            // Modo aleatorio
            do {
                newIndex = Math.floor(Math.random() * this.currentPlaylist.tracks.length);
            } while (newIndex === this.currentTrackIndex && this.currentPlaylist.tracks.length > 1);
        } else {
            // Modo secuencial
            newIndex = this.currentTrackIndex + 1;
            if (newIndex >= this.currentPlaylist.tracks.length) {
                if (this.repeatMode === 'all') {
                    newIndex = 0; // Volver al inicio
                } else {
                    // Final de la playlist, detener reproducción
                    this.isPlaying = false;
                    this.updatePlayPauseButton();
                    return;
                }
            }
        }
        
        this.playTrack(this.currentPlaylist.tracks[newIndex], newIndex);
    }
    
    toggleShuffle() {
        this.isShuffled = !this.isShuffled;
        const shuffleBtn = document.getElementById('shufflePlayerBtn');
        const shuffleBtnPlaylist = document.getElementById('shuffleBtn');
        
        if (this.isShuffled) {
            shuffleBtn.style.color = 'var(--accent-primary)';
            if (shuffleBtnPlaylist) shuffleBtnPlaylist.style.color = 'var(--accent-primary)';
        } else {
            shuffleBtn.style.color = 'var(--text-secondary)';
            if (shuffleBtnPlaylist) shuffleBtnPlaylist.style.color = 'var(--text-secondary)';
        }
    }
    
    toggleRepeat() {
        const modes = ['none', 'all', 'one'];
        const currentIndex = modes.indexOf(this.repeatMode);
        this.repeatMode = modes[(currentIndex + 1) % modes.length];
        
        const repeatBtn = document.getElementById('repeatBtn');
        const icon = repeatBtn.querySelector('i');
        
        switch (this.repeatMode) {
            case 'none':
                repeatBtn.style.color = 'var(--text-secondary)';
                icon.className = 'fas fa-redo';
                break;
            case 'all':
                repeatBtn.style.color = 'var(--accent-primary)';
                icon.className = 'fas fa-redo';
                break;
            case 'one':
                repeatBtn.style.color = 'var(--accent-primary)';
                icon.className = 'fas fa-redo';
                break;
        }
    }
    
    toggleMute() {
        if (this.volume > 0) {
            this.previousVolume = this.volume;
            this.setVolume(0);
        } else {
            this.setVolume(this.previousVolume || 0.7);
        }
    }
    
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        
        // Actualizar volumen en reproductor de YouTube
        if (this.playerReady) {
            this.player.setVolume(this.volume * 100);
        }
        
        // Actualizar volumen en reproductor local
        if (this.localPlayer) {
            this.localPlayer.volume = this.volume;
        }
        
        this.updateVolumeDisplay();
    }
    
    updateCurrentTrackDisplay() {
        if (!this.currentTrack) return;
        
        const trackInfo = document.querySelector('.current-track .track-info');
        const thumbnail = document.querySelector('.current-track .track-thumbnail');
        
        trackInfo.querySelector('.track-name').textContent = this.currentTrack.title;
        trackInfo.querySelector('.track-artist').textContent = this.currentTrack.channel;
        
        if (this.currentTrack.isLocal) {
            thumbnail.innerHTML = `
                <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px;">
                    <i class="fas ${this.currentTrack.fileType.startsWith('audio/') ? 'fa-music' : 'fa-video'}"></i>
                </div>
            `;
        } else {
            thumbnail.innerHTML = `<img src="${this.currentTrack.thumbnail}" alt="${this.currentTrack.title}" 
                                        style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">`;
        }
    }
    
    updateTrackListDisplay() {
        document.querySelectorAll('.track-item').forEach((item, index) => {
            item.classList.remove('playing');
            if (index === this.currentTrackIndex) {
                item.classList.add('playing');
            }
        });
    }
    
    updatePlayPauseButton() {
        const playPauseBtn = document.getElementById('playPauseBtn');
        const icon = playPauseBtn.querySelector('i');
        icon.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
    }
    
    updateVolumeDisplay() {
        const volumeFill = document.getElementById('volumeFill');
        const volumeHandle = document.getElementById('volumeHandle');
        const volumeBtn = document.getElementById('volumeBtn');
        
        const percentage = this.volume * 100;
        volumeFill.style.width = `${percentage}%`;
        volumeHandle.style.left = `${percentage}%`;
        
        const icon = volumeBtn.querySelector('i');
        if (this.volume === 0) {
            icon.className = 'fas fa-volume-mute';
        } else if (this.volume < 0.5) {
            icon.className = 'fas fa-volume-down';
        } else {
            icon.className = 'fas fa-volume-up';
        }
    }
    
    setupVolumeSlider() {
        const volumeSlider = document.querySelector('.volume-slider');
        let isDragging = false;
        
        volumeSlider.addEventListener('mousedown', (e) => {
            isDragging = true;
            this.updateVolumeFromEvent(e);
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                this.updateVolumeFromEvent(e);
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
        
        volumeSlider.addEventListener('click', (e) => {
            this.updateVolumeFromEvent(e);
        });
    }
    
    updateVolumeFromEvent(e) {
        const volumeSlider = document.querySelector('.volume-slider');
        const rect = volumeSlider.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this.setVolume(percentage);
    }
    
    setupProgressBar() {
        const progressContainer = document.querySelector('.progress-container');
        let isDragging = false;
        
        progressContainer.addEventListener('mousedown', (e) => {
            isDragging = true;
            this.updateProgressFromEvent(e);
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                this.updateProgressFromEvent(e);
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
        
        progressContainer.addEventListener('click', (e) => {
            this.updateProgressFromEvent(e);
        });
    }
    
    updateProgressFromEvent(e) {
        if (!this.currentTrack) return;
        
        const progressContainer = document.querySelector('.progress-container');
        const rect = progressContainer.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        
        if (this.currentTrack.isLocal && this.localPlayer) {
            const duration = this.localPlayer.duration;
            const newTime = duration * percentage;
            this.localPlayer.currentTime = newTime;
        } else if (this.playerReady) {
            const duration = this.player.getDuration();
            const newTime = duration * percentage;
            this.player.seekTo(newTime);
        }
    }
    
    startProgressUpdate() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        
        this.progressInterval = setInterval(() => {
            if (this.isPlaying) {
                this.updateProgress();
            }
        }, 1000);
    }
    
    updateProgress() {
        if (!this.currentTrack) return;
        
        let currentTime = 0;
        let duration = 0;
        
        if (this.currentTrack.isLocal && this.localPlayer) {
            currentTime = this.localPlayer.currentTime;
            duration = this.localPlayer.duration;
        } else if (this.playerReady) {
            currentTime = this.player.getCurrentTime();
            duration = this.player.getDuration();
        }
        
        if (duration > 0) {
            const percentage = (currentTime / duration) * 100;
            document.getElementById('progressFill').style.width = `${percentage}%`;
            document.getElementById('progressHandle').style.left = `${percentage}%`;
            
            document.querySelector('.time-current').textContent = this.formatTime(currentTime);
            document.querySelector('.time-total').textContent = this.formatTime(duration);
        }
    }
    
    updateLocalProgress() {
        if (!this.localPlayer) return;
        
        const currentTime = this.localPlayer.currentTime;
        const duration = this.localPlayer.duration;
        
        if (duration > 0) {
            const percentage = (currentTime / duration) * 100;
            document.getElementById('progressFill').style.width = `${percentage}%`;
            document.getElementById('progressHandle').style.left = `${percentage}%`;
            
            document.querySelector('.time-current').textContent = this.formatTime(currentTime);
            document.querySelector('.time-total').textContent = this.formatTime(duration);
        }
    }
    
    updateTrackDuration(trackId, duration) {
        // Buscar y actualizar la duración en todas las playlists
        this.playlists.forEach(playlist => {
            const track = playlist.tracks.find(t => t.id === trackId);
            if (track && track.duration !== duration) {
                track.duration = duration;
                playlist.updatedAt = new Date().toISOString();
            }
        });
        
        // Guardar cambios
        this.savePlaylists();
        
        // Actualizar vista si es necesario
        if (this.currentPlaylist) {
            const currentTrack = this.currentPlaylist.tracks.find(t => t.id === trackId);
            if (currentTrack) {
                this.renderTrackList(this.currentPlaylist.tracks);
            }
        }
    }
    
    // Utilidades
    extractVideoId(url) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }
    
    async fetchVideoData(videoId) {
        try {
            // Intentar obtener datos reales del video
            const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
            
            if (response.ok) {
                const data = await response.json();
                
                return {
                    videoId: videoId,
                    title: data.title || 'Video de YouTube',
                    channel: data.author_name || 'Canal de YouTube',
                    duration: 0, // Se actualizará cuando se reproduzca
                    thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
                };
            }
        } catch (error) {
            console.error('Error al obtener datos del video:', error);
        }
        
        // Fallback con datos básicos
        return {
            videoId: videoId,
            title: 'Video de YouTube',
            channel: 'Canal de YouTube',
            duration: 0,
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
        };
    }
    
    formatDuration(seconds) {
        if (!seconds) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    goBack() {
        console.log("Botón retroceso presionado");
        
        // Si estamos en una vista específica de playlist, volver al inicio
        if (document.getElementById('playlistView').classList.contains('active')) {
            console.log("Volviendo desde vista de playlist al inicio");
            this.showHomeView();
        } 
        // Si estamos en búsqueda, volver al inicio
        else if (document.getElementById('searchView').classList.contains('active')) {
            console.log("Volviendo desde búsqueda al inicio");
            this.showHomeView();
        }
        // Si ya estamos en inicio, no hacer nada (o podrías cerrar la app)
        else {
            console.log("Ya estamos en la vista de inicio");
        }
        
        this.updateNavigationButtons();
    }
    
    goForward() {
        // Por ahora, el forward no hace nada específico
        // Podrías implementar un historial de navegación aquí
        console.log('Navegación hacia adelante');
        this.updateNavigationButtons();
    }
    
    updateNavigationButtons() {
        const backBtn = document.getElementById('backBtn');
        const forwardBtn = document.getElementById('forwardBtn');
        
        // Habilitar/deshabilitar botones según el contexto
        backBtn.disabled = false; // Siempre habilitado por ahora
        
        // El forward podría estar deshabilitado si no hay historial
        forwardBtn.disabled = true; // Deshabilitado hasta implementar historial
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.app = new YouTubePlaylistManager();
});

// Función global para manejar la API de YouTube
window.onYouTubeIframeAPIReady = function() {
    if (window.app) {
        window.app.initializePlayer();
    }
};