// Card mapping for values 1-11
const CARD_IMAGES = {
    1: 'images/card_hearts_A.png',
    2: 'images/card_diamonds_02.png',
    3: 'images/card_clubs_03.png',
    4: 'images/card_hearts_04.png',
    5: 'images/card_spades_05.png',
    6: 'images/card_diamonds_06.png',
    7: 'images/card_clubs_07.png',
    8: 'images/card_hearts_08.png',
    9: 'images/card_spades_09.png',
    10: 'images/card_diamonds_10.png',
    11: 'images/card_hearts_J.png'
};

const CARD_BACK = 'images/card_back.png';

// Preload images
const imageCache = {};
function preloadImages() {
    Object.values(CARD_IMAGES).forEach(src => {
        const img = new Image();
        img.src = src;
        imageCache[src] = img;
    });
    const backImg = new Image();
    backImg.src = CARD_BACK;
    imageCache[CARD_BACK] = backImg;
}

// Game State
let gameMode = null;
let aiDifficulty = 'medium';
let socket = null;

const AI_DIFFICULTY = {
    easy: { minDelay: 4000, maxDelay: 7000, name: 'Easy 😊' },
    medium: { minDelay: 2000, maxDelay: 5000, name: 'Medium 😐' },
    hard: { minDelay: 1000, maxDelay: 3000, name: 'Hard 😈' }
};

let gameState = {
    deck: [],
    pyramid: [],
    waste: null,
    selected: [],
    score: 0,
    cardsRemaining: 28,
    bonusCards: 0,
    combo: 0,
    timeRemaining: 180,
    gameOver: false
};

let opponentState = {
    score: 0,
    cardsRemaining: 28,
    bonusCards: 0,
    combo: 0
};

let timerInterval = null;
let aiTimeout = null;

// Initialize
preloadImages();

// Utility Functions
function createDeck() {
    const deck = [];
    for (let i = 0; i < 5; i++) {
        for (let value = 1; value <= 11; value++) {
            deck.push(value);
        }
    }
    return shuffle(deck);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function setupPyramid() {
    const pyramid = [];
    let cardIndex = 0;
    
    for (let row = 0; row < 7; row++) {
        const rowCards = [];
        for (let col = 0; col <= row; col++) {
            if (cardIndex < gameState.deck.length) {
                rowCards.push({
                    value: gameState.deck[cardIndex],
                    row: row,
                    col: col,
                    removed: false,
                    available: false
                });
                cardIndex++;
            }
        }
        pyramid.push(rowCards);
    }
    
    gameState.deck = gameState.deck.slice(cardIndex);
    return pyramid;
}

function updateAvailability() {
    gameState.pyramid.forEach((row, rowIndex) => {
        row.forEach((card, colIndex) => {
            if (!card.removed) {
                card.available = isCardAvailable(rowIndex, colIndex);
            }
        });
    });
}

function isCardAvailable(row, col) {
    const card = gameState.pyramid[row][col];
    if (card.removed) return false;
    
    if (row === gameState.pyramid.length - 1) return true;
    
    const nextRow = gameState.pyramid[row + 1];
    const leftCovered = nextRow[col] && !nextRow[col].removed;
    const rightCovered = nextRow[col + 1] && !nextRow[col + 1].removed;
    
    return !leftCovered && !rightCovered;
}

// Rendering
function renderPyramid() {
    const pyramidEl = document.getElementById('pyramid');
    pyramidEl.innerHTML = '';
    
    gameState.pyramid.forEach((row, rowIndex) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'pyramid-row';
        
        row.forEach((card, colIndex) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'card';
            cardEl.dataset.row = rowIndex;
            cardEl.dataset.col = colIndex;
            
            // Set card image
            cardEl.style.backgroundImage = `url('${CARD_IMAGES[card.value]}')`;
            
            if (card.removed) {
                cardEl.classList.add('removed');
            } else if (card.available) {
                cardEl.classList.add('available');
                cardEl.onclick = () => selectCard(rowIndex, colIndex);
            } else {
                cardEl.classList.add('unavailable');
            }
            
            if (gameState.selected.some(s => s.row === rowIndex && s.col === colIndex)) {
                cardEl.classList.add('selected');
            }
            
            rowEl.appendChild(cardEl);
        });
        
        pyramidEl.appendChild(rowEl);
    });
}

function selectCard(row, col) {
    if (gameState.gameOver) return;
    
    const card = gameState.pyramid[row][col];
    if (!card.available || card.removed) return;
    
    const selectedIndex = gameState.selected.findIndex(s => s.row === row && s.col === col);
    
    if (selectedIndex >= 0) {
        gameState.selected.splice(selectedIndex, 1);
    } else {
        gameState.selected.push({ row, col, value: card.value });
    }
    
    updateSelectionSum();
    renderPyramid();
}

function selectWasteCard() {
    if (gameState.gameOver || !gameState.waste) return;
    
    const wasteIndex = gameState.selected.findIndex(s => s.isWaste);
    
    if (wasteIndex >= 0) {
        gameState.selected.splice(wasteIndex, 1);
    } else {
        gameState.selected.push({ isWaste: true, value: gameState.waste });
    }
    
    updateSelectionSum();
    updateWastePile();
}

function updateSelectionSum() {
    const sum = gameState.selected.reduce((acc, card) => acc + card.value, 0);
    const sumEl = document.getElementById('selectionSum');
    
    if (gameState.selected.length === 0) {
        sumEl.classList.add('hidden');
    } else {
        sumEl.classList.remove('hidden');
        sumEl.textContent = sum;
        sumEl.className = sum === 11 ? 'selection-sum valid' : 'selection-sum invalid';
    }
}

function drawCard() {
    if (gameState.gameOver || gameState.deck.length === 0) return;
    
    gameState.waste = gameState.deck.shift();
    updateWastePile();
    updateDeckPile();
}

function updateWastePile() {
    const wastePile = document.getElementById('wastePile');
    if (gameState.waste !== null) {
        wastePile.style.backgroundImage = `url('${CARD_IMAGES[gameState.waste]}')`;
        const isSelected = gameState.selected.some(s => s.isWaste);
        wastePile.className = isSelected ? 'waste-pile selected' : 'waste-pile';
    } else {
        wastePile.style.backgroundImage = 'none';
        wastePile.style.background = '#ccc';
    }
}

function updateDeckPile() {
    const deckPile = document.getElementById('deckPile');
    const deckCount = document.getElementById('deckCount');
    
    if (gameState.deck.length > 0) {
        deckPile.style.backgroundImage = `url('${CARD_BACK}')`;
        deckCount.textContent = gameState.deck.length;
    } else {
        deckPile.style.backgroundImage = 'none';
        deckPile.style.background = '#999';
        deckCount.textContent = '0';
    }
}

function removeSelected() {
    if (gameState.gameOver || gameState.selected.length === 0) return;
    
    const sum = gameState.selected.reduce((acc, card) => acc + card.value, 0);
    
    if (sum === 11) {
        gameState.selected.forEach(card => {
            if (card.isWaste) {
                gameState.waste = null;
            } else {
                gameState.pyramid[card.row][card.col].removed = true;
                gameState.cardsRemaining--;
            }
        });
        
        const numCards = gameState.selected.length;
        const points = numCards * 10;
        gameState.score += points;
        gameState.combo++;
        
        if (gameState.combo >= 5) {
            gameState.bonusCards++;
            gameState.combo = 0;
            showNotification('⭐ BONUS CARD EARNED!', 'success');
        }
        
        gameState.selected = [];
        updateAvailability();
        renderPyramid();
        updateWastePile();
        updateStats();
        updateSelectionSum();
        
        sendMoveToOpponent();
        checkWinCondition();
    } else {
        gameState.combo = 0;
        updateStats();
        showNotification(`Sum is ${sum}, need 11!`, 'error');
    }
}

function useBonus() {
    if (gameState.gameOver || gameState.bonusCards === 0 || gameState.selected.length !== 1) {
        if (gameState.selected.length !== 1) {
            showNotification('Select exactly 1 card!', 'error');
        }
        return;
    }
    
    const card = gameState.selected[0];
    
    if (card.isWaste) {
        gameState.waste = null;
    } else {
        gameState.pyramid[card.row][card.col].removed = true;
        gameState.cardsRemaining--;
    }
    
    gameState.bonusCards--;
    gameState.selected = [];
    
    updateAvailability();
    renderPyramid();
    updateWastePile();
    updateStats();
    updateSelectionSum();
    
    sendMoveToOpponent();
    checkWinCondition();
}

function updateStats() {
    document.getElementById('playerScore').textContent = gameState.score;
    document.getElementById('cardsLeft').textContent = gameState.cardsRemaining;
    document.getElementById('bonusCount').textContent = gameState.bonusCards;
    document.getElementById('bonusBtn').textContent = `BONUS (${gameState.bonusCards})`;
    
    document.getElementById('p1Score').textContent = gameState.score;
    document.getElementById('p1Cards').textContent = gameState.cardsRemaining;
    document.getElementById('p1Combo').textContent = gameState.combo;
    
    const progress = ((28 - gameState.cardsRemaining) / 28 * 100).toFixed(0);
    const progressEl = document.getElementById('p1Progress');
    progressEl.style.width = progress + '%';
    progressEl.textContent = progress + '%';
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        gameState.timeRemaining--;
        
        const minutes = Math.floor(gameState.timeRemaining / 60);
        const seconds = gameState.timeRemaining % 60;
        const timerEl = document.getElementById('timer');
        timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (gameState.timeRemaining <= 30) {
            timerEl.classList.add('warning');
        }
        
        if (gameState.timeRemaining <= 0) {
            clearInterval(timerInterval);
            endGame(false);
        }
    }, 1000);
}

function checkWinCondition() {
    if (gameState.cardsRemaining === 0) {
        endGame(true);
    }
}

function endGame(won, customMessage = null) {
    gameState.gameOver = true;
    clearInterval(timerInterval);
    if (aiTimeout) clearTimeout(aiTimeout);
    
    const modal = document.getElementById('modal');
    const titleEl = document.getElementById('modalTitle');
    const textEl = document.getElementById('modalText');
    const overlayEl = document.getElementById('modalOverlay');
    
    if (won) {
        titleEl.textContent = '🎉 YOU WIN!';
        textEl.textContent = `Final Score: ${gameState.score}`;
        modal.className = 'modal win';
    } else {
        if (customMessage) {
            titleEl.textContent = '😔 GAME OVER';
            textEl.textContent = customMessage;
        } else if (gameMode === 'vsai' && opponentState.cardsRemaining === 0) {
            titleEl.textContent = '🤖 AI WINS!';
            textEl.textContent = `AI Score: ${opponentState.score}`;
        } else {
            titleEl.textContent = '⏰ TIME\'S UP!';
            textEl.textContent = `Final Score: ${gameState.score}`;
        }
        modal.className = 'modal lose';
    }
    
    overlayEl.classList.add('show');
}

function showNotification(text, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = text;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s reverse';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

// Menu Functions
function showMenu() {
    document.getElementById('menuScreen').classList.remove('hidden');
    document.getElementById('aiDifficultyScreen').classList.add('hidden');
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('gameScreen').style.display = 'none';
    document.getElementById('modalOverlay').classList.remove('show');
    
    if (timerInterval) clearInterval(timerInterval);
    if (aiTimeout) clearTimeout(aiTimeout);
}

function showAIDifficulty() {
    document.getElementById('menuScreen').classList.add('hidden');
    document.getElementById('aiDifficultyScreen').classList.remove('hidden');
}

function showLobby() {
    document.getElementById('menuScreen').classList.add('hidden');
    document.getElementById('lobbyScreen').classList.remove('hidden');
}

function startSinglePlayer() {
    gameMode = 'single';
    initGame();
    document.getElementById('opponentPanel').style.display = 'none';
}

function startVsAI(difficulty = 'medium') {
    gameMode = 'vsai';
    aiDifficulty = difficulty;
    initGame();
    
    const difficultyInfo = AI_DIFFICULTY[difficulty];
    document.getElementById('player2Name').textContent = `AI 🤖 (${difficultyInfo.name})`;
    document.getElementById('opponentPanel').style.display = 'block';
    
    initAI();
}

function joinRoom() {
    const playerName = document.getElementById('playerName').value || 'Player';
    const roomCode = document.getElementById('roomCode').value || generateRoomCode();
    
    gameMode = 'multiplayer';
    
    if (!socket) {
        socket = io('YOUR_RENDER_URL_HERE');
        
        socket.on('playerJoined', (data) => {
            updatePlayerList(data.players);
        });
        
        socket.on('gameStart', (data) => {
            initGame();
            document.getElementById('player2Name').textContent = getOpponentName(data.players);
            document.getElementById('opponentPanel').style.display = 'block';
        });
        
        socket.on('opponentUpdate', (data) => {
            if (data.playerId !== socket.id) {
                opponentState = data.stats;
                updateOpponentStats();
                
                if (opponentState.cardsRemaining === 0) {
                    endGame(false, 'Opponent won!');
                }
            }
        });
        
        socket.on('gameOver', (data) => {
            if (data.winnerId === socket.id) {
                endGame(true);
            } else {
                endGame(false, `${data.winner} won!`);
            }
        });
    }
    
    socket.emit('joinRoom', { playerName, roomCode });
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getOpponentName(players) {
    const opponent = players.find(p => p.id !== socket.id);
    return opponent ? opponent.name : 'Opponent';
}

function updatePlayerList(players) {
    const listEl = document.getElementById('playerList');
    if (players.length === 0) {
        listEl.innerHTML = 'Waiting for players...';
    } else {
        listEl.innerHTML = players.map(p => 
            `<div style="padding: 10px; background: white; margin: 5px 0; border-radius: 5px;">
                ${p.name}${p.id === socket.id ? ' (You)' : ''}
            </div>`
        ).join('');
    }
}

function sendMoveToOpponent() {
    if (gameMode === 'multiplayer' && socket) {
        socket.emit('playerMove', {
            score: gameState.score,
            cardsRemaining: gameState.cardsRemaining,
            bonusCards: gameState.bonusCards,
            combo: gameState.combo
        });
    }
}

function initGame() {
    gameState = {
        deck: createDeck(),
        pyramid: [],
        waste: null,
        selected: [],
        score: 0,
        cardsRemaining: 28,
        bonusCards: 0,
        combo: 0,
        timeRemaining: 180,
        gameOver: false
    };
    
    opponentState = {
        score: 0,
        cardsRemaining: 28,
        bonusCards: 0,
        combo: 0
    };
    
    gameState.pyramid = setupPyramid();
    updateAvailability();
    
    document.getElementById('menuScreen').classList.add('hidden');
    document.getElementById('aiDifficultyScreen').classList.add('hidden');
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('gameScreen').style.display = 'block';
    
    document.getElementById('timer').classList.remove('warning');
    renderPyramid();
    updateWastePile();
    updateDeckPile();
    updateStats();
    updateOpponentStats();
    updateSelectionSum();
    
    startTimer();
}

function playAgain() {
    document.getElementById('modalOverlay').classList.remove('show');
    
    if (gameMode) {
        if (gameMode === 'vsai') {
            startVsAI(aiDifficulty);
        } else {
            initGame();
        }
    }
}

// AI Opponent
function initAI() {
    if (aiTimeout) clearTimeout(aiTimeout);
    
    const difficulty = AI_DIFFICULTY[aiDifficulty];
    
    const makeAIMove_withDelay = () => {
        if (gameState.gameOver) return;
        
        makeAIMove();
        
        const delay = difficulty.minDelay + Math.random() * (difficulty.maxDelay - difficulty.minDelay);
        aiTimeout = setTimeout(makeAIMove_withDelay, delay);
    };
    
    const initialDelay = difficulty.minDelay + Math.random() * (difficulty.maxDelay - difficulty.minDelay);
    aiTimeout = setTimeout(makeAIMove_withDelay, initialDelay);
}

function makeAIMove() {
    const availableMoves = findAvailableMoves();
    
    if (availableMoves.length > 0) {
        availableMoves.sort((a, b) => b.length - a.length);
        
        const move = availableMoves[0];
        const numCards = move.length;
        const points = numCards * 10;
        
        opponentState.score += points;
        opponentState.cardsRemaining -= numCards;
        opponentState.combo++;
        
        if (opponentState.combo >= 5) {
            opponentState.bonusCards++;
            opponentState.combo = 0;
        }
        
        updateOpponentStats();
        
        if (opponentState.cardsRemaining === 0) {
            endGame(false);
        }
    } else if (opponentState.bonusCards > 0) {
        opponentState.bonusCards--;
        opponentState.cardsRemaining--;
        updateOpponentStats();
        
        if (opponentState.cardsRemaining === 0) {
            endGame(false);
        }
    }
}

function findAvailableMoves() {
    const moves = [];
    const cardValues = Array(11).fill(0).map((_, i) => i + 1);
    
    if (cardValues.includes(11)) {
        moves.push([11]);
    }
    
    for (let i = 1; i <= 10; i++) {
        if (cardValues.includes(i) && cardValues.includes(11 - i)) {
            moves.push([i, 11 - i]);
        }
    }
    
    for (let i = 1; i <= 9; i++) {
        for (let j = i; j <= 10; j++) {
            const k = 11 - i - j;
            if (k >= j && k <= 11) {
                moves.push([i, j, k]);
            }
        }
    }
    
    return moves;
}

function updateOpponentStats() {
    document.getElementById('p2Score').textContent = opponentState.score;
    document.getElementById('p2Cards').textContent = opponentState.cardsRemaining;
    document.getElementById('p2Combo').textContent = opponentState.combo;
    
    const progress = ((28 - opponentState.cardsRemaining) / 28 * 100).toFixed(0);
    const progressEl = document.getElementById('p2Progress');
    progressEl.style.width = progress + '%';
    progressEl.textContent = progress + '%';
}
