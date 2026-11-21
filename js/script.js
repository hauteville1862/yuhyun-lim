// DOM 선택
const themeButton = document.querySelector('#dark-mode-toggle');
const menuButton = document.querySelector('#hamburger-btn');
const navMenu = document.querySelector('#nav-menu');
const header = document.querySelector('#header');
const scrollTopButton = document.querySelector('#scroll-top-btn');
const apiStatus = document.querySelector('#api-status');
const repoList = document.querySelector('#repo-list');
const retryButton = document.querySelector('#retry-repos');
const heroTitle = document.querySelector('#hero h2');
const typingText = document.querySelector('#typing-text');

const GITHUB_USERNAME = 'hauteville1862';
// 첫 화면 강조 문구. 첫 번째 문구는 HTML과 스크린 리더용 문구와 같게 둔다.
const TYPING_PHRASES = [
    'AI로 반복되는 운영을 줄이는',
    '흩어진 요청을 맞는 곳에 잇는',
    '정한 일을 끝까지 챙기는'
];
const TYPING_DELAY = { type: 90, erase: 45, hold: 2000, next: 400 };

// 이벤트가 상태를 바꾸고, render 함수가 그 상태를 화면에 반영한다.
const STATE = {
    theme: 'light',
    isMenuOpen: false,
    repos: [],
    repoStatus: 'idle',
    typing: { phraseIndex: 0, charCount: 0, isErasing: false }
};
let scrollTopFrame = null;

// 테마
function renderTheme() {
    document.documentElement.dataset.theme = STATE.theme;
    themeButton.ariaPressed = String(STATE.theme === 'dark');
}

function toggleTheme() {
    STATE.theme = STATE.theme === 'dark' ? 'light' : 'dark';
    renderTheme();
    try {
        localStorage.setItem('theme', STATE.theme);
    } catch (error) {
        console.warn('테마를 저장할 수 없습니다.', error);
    }
}

// 메뉴
function renderMenu() {
    navMenu.classList.toggle('active', STATE.isMenuOpen);
    menuButton.ariaExpanded = String(STATE.isMenuOpen);
    menuButton.ariaLabel = STATE.isMenuOpen ? '메뉴 닫기' : '메뉴 열기';
}

// 첫 화면 타이핑: 강조 문구를 한 글자씩 쓰고 지우며 번갈아 보여준다.
function renderTyping() {
    const { phraseIndex, charCount } = STATE.typing;
    const characters = Array.from(TYPING_PHRASES[phraseIndex]);
    typingText.textContent = characters.slice(0, charCount).join('');
}

// 가장 긴 문구 기준으로 제목 높이를 잡아, 글자가 바뀌어도 아래 버튼이 움직이지 않게 한다.
function reserveHeroHeight() {
    const currentText = typingText.textContent;
    heroTitle.style.minHeight = '';
    let maxHeight = 0;
    TYPING_PHRASES.forEach(phrase => {
        typingText.textContent = phrase;
        maxHeight = Math.max(maxHeight, heroTitle.offsetHeight);
    });
    typingText.textContent = currentText;
    heroTitle.style.minHeight = `${maxHeight}px`;
}

function stepTyping() {
    const typing = STATE.typing;
    const phraseLength = Array.from(TYPING_PHRASES[typing.phraseIndex]).length;
    let delay = typing.isErasing ? TYPING_DELAY.erase : TYPING_DELAY.type;

    if (!typing.isErasing) {
        typing.charCount += 1;
        if (typing.charCount === phraseLength) {
            typing.isErasing = true;
            delay = TYPING_DELAY.hold;
        }
    } else {
        typing.charCount -= 1;
        if (typing.charCount === 0) {
            typing.isErasing = false;
            typing.phraseIndex = (typing.phraseIndex + 1) % TYPING_PHRASES.length;
            delay = TYPING_DELAY.next;
        }
    }

    renderTyping();
    setTimeout(stepTyping, delay);
}

function startTyping() {
    reserveHeroHeight();
    window.addEventListener('resize', reserveHeroHeight);

    // 움직임 감소 설정이면 첫 문구를 고정해서 보여준다.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        typingText.classList.add('typing-static');
        return;
    }

    renderTyping();
    setTimeout(stepTyping, TYPING_DELAY.next);
}

// GitHub 프로젝트
// API의 글자를 HTML 태그나 속성으로 해석하지 않도록 바꾼다.
function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// 카드 한 개에 표시할 값을 준비한 뒤 HTML로 만든다.
function createProjectCard(repo) {
    const { name, html_url, description, language, stargazers_count } = repo;
    const displayDescription = description || '설명이 없습니다.';
    const displayLanguage = language || 'Other';
    let starsHtml = '';
    if (stargazers_count > 0) {
        starsHtml = `<span class="repo-stars">★ ${escapeHtml(stargazers_count)}</span>`;
    }

    return `
        <article class="card">
            <div class="card-body">
                <h3><a href="${escapeHtml(html_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a></h3>
                <p>${escapeHtml(displayDescription)}</p>
            </div>
            <div class="card-meta">
                <span class="repo-lang">${escapeHtml(displayLanguage)}</span>
                ${starsHtml}
            </div>
        </article>
    `;
}

function renderProjects() {
    const cards = STATE.repos.map(createProjectCard);
    repoList.innerHTML = cards.join('');
}

function renderRepoState() {
    const status = STATE.repoStatus;
    apiStatus.hidden = status === 'idle' || status === 'success';
    apiStatus.classList.toggle('api-error', status === 'error');
    retryButton.hidden = status !== 'error';

    if (status === 'loading') {
        apiStatus.textContent = '데이터를 불러오는 중입니다...';
    } else if (status === 'empty') {
        apiStatus.textContent = '표시할 프로젝트가 없습니다.';
    } else if (status === 'error') {
        apiStatus.textContent = '프로젝트를 불러올 수 없습니다. 다시 시도해주세요.';
    } else {
        apiStatus.textContent = '';
    }

    if (status === 'success') {
        renderProjects();
    } else {
        repoList.innerHTML = '';
    }
}

async function fetchGitHubRepos() {
    if (STATE.repoStatus === 'loading') return;
    STATE.repoStatus = 'loading';
    STATE.repos = [];
    renderRepoState();

    try {
        const response = await fetch(`https://api.github.com/users/${GITHUB_USERNAME}/repos`);
        if (!response.ok) {
            throw new Error('GitHub API 요청 실패: ' + response.status);
        }

        const repos = await response.json();
        if (!Array.isArray(repos)) {
            throw new Error('저장소 목록 형식이 올바르지 않습니다.');
        }
        // 저장소 설명 칸을 채운 저장소만 보여준다.
        const describedRepos = repos.filter(repo => typeof repo.description === 'string' && repo.description.trim() !== '');
        STATE.repos = describedRepos;
        STATE.repoStatus = describedRepos.length === 0 ? 'empty' : 'success';
    } catch (error) {
        STATE.repoStatus = 'error';
    }
    renderRepoState();
}

// 스크롤과 섹션 등장
function showSection(section) {
    section.classList.remove('reveal-pending');
    section.classList.add('visible');
}

// README에 명시된 스크롤 기준값을 유지한다.
function updateScrollState() {
    scrollTopButton.hidden = window.scrollY < 300;
    header.classList.toggle('scrolled', window.scrollY >= 60);

    // 제목을 지나친 위치로 이동하거나 복원되면 해당 섹션을 표시한다.
    document.querySelectorAll('.fade-section.reveal-pending').forEach(section => {
        if (section.querySelector('h2').getBoundingClientRect().bottom < 0) {
            showSection(section);
        }
    });
}

function scrollToTop() {
    if (scrollTopFrame !== null) {
        cancelAnimationFrame(scrollTopFrame);
    }
    const startY = window.scrollY;
    const startTime = performance.now();
    const duration = 700;

    function animateScroll(currentTime) {
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(1, Math.max(0, elapsedTime / duration));
        // 남은 비율을 세제곱하면 도착할수록 이동 속도가 줄어든다.
        const remainingProgress = 1 - progress;
        const nextY = startY * remainingProgress ** 3;
        // 브라우저의 추가 보간 없이 각 프레임에서 계산한 위치로 이동한다.
        window.scrollTo({ top: nextY, behavior: 'instant' });

        if (progress < 1) {
            scrollTopFrame = requestAnimationFrame(animateScroll);
        } else {
            scrollTopFrame = null;
        }
    }

    scrollTopFrame = requestAnimationFrame(animateScroll);
}

function observeSections() {
    // 섹션 전체 대신 제목을 관찰하면 긴 프로젝트 목록도 등장할 수 있다.
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.2) {
                const section = entry.target.closest('.fade-section');
                showSection(section);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });

    document.querySelectorAll('.fade-section').forEach(section => {
        section.classList.add('reveal-pending');
        observer.observe(section.querySelector('h2'));
    });
}

// 이벤트 연결
themeButton.addEventListener('click', toggleTheme);

menuButton.addEventListener('click', () => {
    STATE.isMenuOpen = !STATE.isMenuOpen;
    renderMenu();
});

navMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        STATE.isMenuOpen = false;
        renderMenu();
    });
});

retryButton.addEventListener('click', fetchGitHubRepos);
window.addEventListener('scroll', updateScrollState);
window.addEventListener('pageshow', updateScrollState);
scrollTopButton.addEventListener('click', scrollToTop);

// 초기화
function initializePage() {
    try {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' || savedTheme === 'light') {
            STATE.theme = savedTheme;
        }
    } catch (error) {
        // 저장소 접근이 차단되어도 다른 기능은 동작한다.
        console.warn('저장된 테마를 읽을 수 없습니다.', error);
    }

    renderTheme();
    renderMenu();
    startTyping();
    updateScrollState();
    observeSections();
    fetchGitHubRepos();
}

initializePage();
