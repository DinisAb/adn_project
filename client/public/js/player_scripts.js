let player = null;
let currentHls = null;
let currentStreamUrl = null;
let ambilightEnabled = true;
let ambilightInterval = null;

function initializePlayer() {
    if (player) return;

    console.log('Инициализация плеера...');
    const videoElement = document.getElementById('myPlayer');
    if (!videoElement) {
        console.error('Элемент #myPlayer не найден!');
        return;
    }

    player = videojs(videoElement, {
        controls: true,
        fluid: true,
        aspectRatio: '16:9',
        preload: 'auto',
        muted: true,
        controlBar: {
            volumePanel: { inline: false },
            children: [
                'playToggle',
                'currentTimeDisplay',
                'timeDivider',
                'durationDisplay',
                'progressControl',
                'liveDisplay',
                'fullscreenToggle'
            ]
        },
        bigPlayButton: true
    });

    player.on('ready', () => {
        console.log('Плеер готов!');
        const bigPlayButton = player.el().querySelector('.vjs-big-play-button');
        if (bigPlayButton) {
            bigPlayButton.style.display = 'block';
        }
    });

    player.on('play', () => {
        console.log('Воспроизведение началось!');
        const bigPlayButton = player.el()?.querySelector('.vjs-big-play-button');
        if (bigPlayButton) bigPlayButton.style.display = 'none';
        if (ambilightEnabled) startAmbilight();
    });

    player.on('pause', () => {
        console.log('Плеер на паузе');
        const bigPlayButton = player.el()?.querySelector('.vjs-big-play-button');
        if (bigPlayButton) bigPlayButton.style.display = 'block';
        stopAmbilight();
    });

    player.on('ended', () => {
        console.log('Воспроизведение завершено');
        const bigPlayButton = player.el()?.querySelector('.vjs-big-play-button');
        if (bigPlayButton) bigPlayButton.style.display = 'block';
        resetActiveStream();
        stopAmbilight();
    });

    player.on('error', (e) => {
        console.error('Ошибка плеера:', e);
        showError('Ошибка воспроизведения: ' + (player.error()?.message || 'Неизвестная ошибка'));
        resetActiveStream();
        stopAmbilight();
    });
}

async function loadStreams() {
    try {
        console.log('Загрузка потоков...');
        const response = await fetch('/api/streams', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            credentials: 'include' // Используем куки
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка ${response.status}: ${errorText}`);
        }

        const streams = await response.json();
        if (!Array.isArray(streams)) {
            throw new Error('Сервер вернул некорректные данные: ожидался массив потоков');
        }

        console.log('Потоки загружены:', streams);
        const list = document.getElementById('streamList');
        if (!list) {
            throw new Error('Элемент #streamList не найден в DOM');
        }

        list.innerHTML = streams.map(stream => `
            <li class="stream-item" 
                data-url="${stream.url}" 
                onclick="playStream('${stream.url}', '${stream.type}')" 
                style="cursor: pointer"
            >
                <span class="status-indicator" id="status-${stream.id}"></span>
                ${stream.name}
            </li>
        `).join('');

        streams.forEach(async (stream) => {
            try {
                const res = await fetch(stream.url, { method: 'HEAD' });
                const statusIndicator = document.getElementById(`status-${stream.id}`);
                if (statusIndicator) {
                    statusIndicator.className = res.ok 
                        ? 'status-indicator status-online' 
                        : 'status-indicator status-offline';
                }
            } catch (err) {
                console.error(`Ошибка проверки статуса потока ${stream.url}:`, err);
                const statusIndicator = document.getElementById(`status-${stream.id}`);
                if (statusIndicator) {
                    statusIndicator.className = 'status-indicator status-offline';
                }
            }
        });
    } catch (error) {
        console.error('Ошибка загрузки потоков:', error.message);
        showError(`Не удалось загрузить потоки: ${error.message}`);
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => errorDiv.style.display = 'none', 5000);
    }
}

function resetActiveStream() {
    console.log('Сброс активного потока');
    const activeItem = document.querySelector('.stream-item.active');
    if (activeItem) {
        activeItem.classList.remove('active');
    }
    currentStreamUrl = null;
    const streamUrlDiv = document.getElementById('streamUrl');
    if (streamUrlDiv) {
        streamUrlDiv.style.display = 'none';
    }
}

function startAmbilight() {
    const video = player.el().querySelector('video');
    const canvas = document.getElementById('videoCanvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const container = document.querySelector('.player-container');

    function onLoadedMetadata() {
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            console.error('Размеры видео недоступны:', video.videoWidth, video.videoHeight);
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        function updateAmbilight() {
            console.log('Обновление Ambilight: canvas.width =', canvas.width, ', canvas.height =', canvas.height);
            if (canvas.width === 0 || canvas.height === 0) {
                console.warn('Пропуск обновления Ambilight: нулевые размеры канваса');
                return;
            }

            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            const edgeSize = 10;
            const topData = context.getImageData(0, 0, canvas.width, edgeSize).data;
            const bottomData = context.getImageData(0, canvas.height - edgeSize, canvas.width, edgeSize).data;
            const leftData = context.getImageData(0, 0, edgeSize, canvas.height).data;
            const rightData = context.getImageData(canvas.width - edgeSize, 0, edgeSize, canvas.height).data;

            const getAverageColor = (data) => {
                let r = 0, g = 0, b = 0;
                for (let i = 0; i < data.length; i += 4) {
                    r += data[i];
                    g += data[i + 1];
                    b += data[i + 2];
                }
                const count = data.length / 4;
                return `rgb(${Math.floor(r / count)}, ${Math.floor(g / count)}, ${Math.floor(b / count)})`;
            };

            const topColor = getAverageColor(topData);
            const bottomColor = getAverageColor(bottomData); // Ошибка: customData → bottomData
            const leftColor = getAverageColor(leftData);
            const rightColor = getAverageColor(rightData);

            container.style.boxShadow = `
                0 -20px 30px ${topColor},
                0 20px 30px ${bottomColor},
                -20px 0 30px ${leftColor},
                20px 0 30px ${rightColor}
            `;
        }

        if (ambilightInterval) {
            clearInterval(ambilightInterval);
        }
        ambilightInterval = window.setInterval(updateAmbilight, 100);
    }

    if (video.readyState >= 1) {
        onLoadedMetadata();
    } else {
        video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    }
}

function stopAmbilight() {
    if (ambilightInterval) {
        clearInterval(ambilightInterval);
        ambilightInterval = null;
    }
    const container = document.querySelector('.player-container');
    if (container) {
        container.style.boxShadow = 'none';
    }
}

function playStream(url, type) {
    console.log('Запуск потока:', url, type);
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.style.display = 'none';

    if (currentStreamUrl === url && player && !player.paused()) {
        console.log('Этот поток уже воспроизводится, игнорируем');
        return;
    }

    stopAmbilight();

    if (!player) {
        initializePlayer();
    }

    if (currentHls) {
        currentHls.destroy();
        currentHls = null;
    }

    resetActiveStream();

    const streamItems = document.querySelectorAll('.stream-item');
    streamItems.forEach(item => {
        if (item.getAttribute('data-url') === url) {
            item.classList.add('active');
        }
    });

    currentStreamUrl = url;

    const streamUrlDiv = document.getElementById('streamUrl');
    streamUrlDiv.textContent = url;
    streamUrlDiv.style.display = 'block';
    streamUrlDiv.onclick = () => {
        navigator.clipboard.writeText(url).then(() => {
            console.log('URL скопирован в буфер:', url);
            showError('URL скопирован в буфер обмена');
        }).catch(err => {
            console.error('Ошибка копирования:', err);
            showError('Не удалось скопировать URL');
        });
    };

    if (type === 'hls') {
        if (Hls.isSupported() && !player.canPlayType('application/x-mpegURL')) {
            currentHls = new Hls({
                autoStartLoad: true,
                capLevelToPlayerSize: true,
                maxBufferLength: 30
            });
            currentHls.loadSource(url);
            currentHls.attachMedia(player.el().querySelector('video'));
            currentHls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('Манифест HLS загружен (HLS.js)');
                player.muted(true);
                player.play().catch(error => {
                    console.error('Ошибка авто-плей:', error);
                    showError('Нажмите воспроизведение вручную');
                });
                startAmbilight();
            });
            currentHls.on(Hls.Events.ERROR, (event, data) => {
                console.error('Ошибка HLS:', data);
                showError('Ошибка потока: ' + data.details);
            });
        } else {
            player.src({
                src: url,
                type: 'application/x-mpegURL'
            });
            console.log('Установлен источник для нативного HLS');
            player.muted(true);
            player.play().catch(error => {
                console.error('Ошибка авто-плей:', error);
                showError('Нажмите воспроизведение вручную');
            });
            player.one('loadedmetadata', startAmbilight);
        }
    } else {
        showError('Тип потока не поддерживается');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadStreams();
});