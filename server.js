// server.js - Финальная версия с исправленной логикой паузы/возобновления, процентов и Player-Specific сообщений
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;
const QUIZZES_FILE = path.join(__dirname, 'quizzes.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    }
});
const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let quizzes = [];
let gameState;
let hostWs = null;

function generateQuizCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function loadQuizzes() {
    try {
        const data = fs.readFileSync(QUIZZES_FILE, 'utf8');
        quizzes = JSON.parse(data);
        console.log('[Server] Quizzes loaded:', quizzes.length);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('[Server] quizzes.json not found, starting with empty quiz list.');
            quizzes = [];
        } else {
            console.error('[Server] Failed to load quizzes:', error);
            quizzes = [];
        }
    }
}

function saveQuizzes() {
    try {
        fs.writeFileSync(QUIZZES_FILE, JSON.stringify(quizzes, null, 2), 'utf8');
        console.log('[Server] Quizzes saved.');
    } catch (error) {
        console.error('[Server] Failed to save quizzes:', error);
    }
}

function initializeGameState(quizId = null) {
    if (gameState && gameState.questionTimer) {
        clearTimeout(gameState.questionTimer);
    }

    return {
        players: {}, // Используем объект для игроков: { wsId: { name, score, answers, persistentId, ws } }
        currentQuizId: quizId,
        currentQuiz: null,
        currentQuizTitle: 'waitingForQuizSelection',
        currentQuestionIndex: -1,
        isGameStarted: false,
        quizCode: generateQuizCode(),
        questionTimer: null, // Серверный таймер для длительности вопроса
        currentQuestionEndTime: null,  // Время завершения текущего вопроса
        questionDuration: 0,           // Исходная длительность текущего вопроса
        answersReceived: 0,
        answeredPlayers: new Set(),    // Количество уникальных игроков, ответивших на текущий вопрос
        leaderboard: [],
        questionActive: false, // Активен ли текущий вопрос?
        currentQuestionAnswerStats: null,
        currentQuestionTextAnswers: null,
        gamePaused: false       // Игра на паузе (из-за отключения ведущего)?
    };
}

gameState = initializeGameState(); // Инициализация состояния при запуске сервера

// Централизованная функция завершения вопроса
function endQuestion() {
    if (gameState.questionTimer) {
        clearTimeout(gameState.questionTimer);
        gameState.questionTimer = null;
    }

    if (!gameState.questionActive) return;

    console.log(`[Server] Ending question ${gameState.currentQuestionIndex + 1}.`);
    gameState.questionActive = false;

    const currentQuestion = gameState.currentQuiz.questions[gameState.currentQuestionIndex];
    if (!currentQuestion) return;

    const correctAns = currentQuestion.correctAnswer;

    sendToHost({
        type: 'questionEnded',
        questionIndex: gameState.currentQuestionIndex,
        correctAnswer: correctAns,
        answerStats: gameState.currentQuestionAnswerStats,
        textAnswers: gameState.currentQuestionTextAnswers,
        totalAnswers: gameState.answeredPlayers.size
    });

    Object.values(gameState.players).forEach(playerObj => {
        if (playerObj.ws && playerObj.ws.readyState === WebSocket.OPEN) {
            const playerAnswer = playerObj.answers[currentQuestion.name];
            playerObj.ws.send(JSON.stringify({
                type: 'questionEnded',
                questionIndex: gameState.currentQuestionIndex,
                correctAnswer: correctAns,
                yourAnswer: playerAnswer ? playerAnswer.answer : null,
                isCorrect: playerAnswer ? playerAnswer.correct : false,
                gainedScore: playerAnswer ? playerAnswer.score : 0,
                totalScore: playerObj.score
            }));
        }
    });

    updateLeaderboard();
}

// Утилитарная функция для получения списка имен игроков (только активных)
function getPlayerNames() {
    return Object.values(gameState.players)
                 .filter(p => p.ws && p.ws.readyState === WebSocket.OPEN)
                 .map(p => p.name);
}

function broadcastToPlayers(message) {
    Object.values(gameState.players).forEach(player => {
        if (player.ws && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify(message));
        }
    });
}

function sendToHost(message) {
    if (hostWs && hostWs.readyState === WebSocket.OPEN) {
        hostWs.send(JSON.stringify(message));
    } else {
        console.warn('[Server] Attempted to send message to host, but hostWs is not available or not open:', message.type);
    }
}

function calculateScore(questionDuration, timeTaken) {
    const maxScore = 1000;
    if (timeTaken >= questionDuration) {
        return 0;
    }
    return Math.round(maxScore * (1 - (timeTaken / questionDuration)));
}

function updateLeaderboard() {
    gameState.leaderboard = Object.values(gameState.players)
        .sort((a, b) => b.score - a.score)
        .map(p => ({ id: p.persistentId, name: p.name, score: p.score }));
    sendToHost({ type: 'leaderboardUpdate', leaderboard: gameState.leaderboard });
}

loadQuizzes();

// --- Admin API Endpoints ---
app.get('/api/quizzes', (req, res) => {
    res.json(quizzes.map(q => ({
        id: q.id,
        title: q.title,
        questionsCount: q.questions ? q.questions.length : 0
    })));
});

app.get('/api/quiz/:id', (req, res) => {
    const quiz = quizzes.find(q => q.id === req.params.id);
    if (quiz) {
        res.json(quiz);
    } else {
        res.status(404).json({ message: 'Quiz not found' });
    }
});

app.post('/api/quiz', (req, res) => {
    const newQuiz = {
        id: uuidv4(),
        title: req.body.title || 'New Quiz',
        questions: []
    };
    quizzes.push(newQuiz);
    saveQuizzes();
    res.status(201).json(newQuiz);
});

app.put('/api/quiz/:id', (req, res) => {
    const quizIndex = quizzes.findIndex(q => q.id === req.params.id);
    if (quizIndex !== -1) {
        quizzes[quizIndex].title = req.body.title || quizzes[quizIndex].title;
        saveQuizzes();
        res.json(quizzes[quizIndex]);
    } else {
        res.status(404).json({ message: 'Quiz not found' });
    }
});

app.delete('/api/quiz/:id', (req, res) => {
    const initialLength = quizzes.length;
    quizzes = quizzes.filter(q => q.id !== req.params.id);
    if (quizzes.length < initialLength) {
        saveQuizzes();
        res.status(204).send();
    } else {
        res.status(404).json({ message: 'Quiz not found' });
    }
});

app.post('/api/quiz/:quizId/question', upload.single('image'), (req, res) => {
    const quiz = quizzes.find(q => q.id === req.params.quizId);
    if (!quiz) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: 'Quiz not found' });
    }
    const newQuestion = {
        id: uuidv4(),
        name: `q_${uuidv4().substring(0, 5)}`,
        title: req.body.title,
        type: req.body.type,
        choices: req.body.choices ? JSON.parse(req.body.choices) : undefined,
        correctAnswer: req.body.correctAnswer ? JSON.parse(req.body.correctAnswer) : undefined,
        timer: parseInt(req.body.timer) || 15,
        imageUrl: req.file ? `/uploads/${req.file.filename}` : undefined
    };
    if (!quiz.questions) quiz.questions = [];
    quiz.questions.push(newQuestion);
    saveQuizzes();
    res.status(201).json(newQuestion);
});

app.put('/api/quiz/:quizId/question/:questionId', upload.single('image'), (req, res) => {
    const quiz = quizzes.find(q => q.id === req.params.quizId);
    if (!quiz || !quiz.questions) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: 'Quiz or questions not found' });
    }
    const questionIndex = quiz.questions.findIndex(q => q.id === req.params.questionId);
    if (questionIndex === -1) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: 'Question not found' });
    }
    const oldQuestion = quiz.questions[questionIndex];
    const updatedQuestion = {
        ...oldQuestion,
        title: req.body.title || oldQuestion.title,
        type: req.body.type || oldQuestion.type,
        choices: req.body.choices ? JSON.parse(req.body.choices) : oldQuestion.choices,
        correctAnswer: req.body.correctAnswer ? JSON.parse(req.body.correctAnswer) : oldQuestion.correctAnswer,
        timer: req.body.timer ? parseInt(req.body.timer) : oldQuestion.timer,
    };
    if (req.file) {
        if (oldQuestion.imageUrl && fs.existsSync(path.join(__dirname, 'public', oldQuestion.imageUrl))) {
            fs.unlinkSync(path.join(__dirname, 'public', oldQuestion.imageUrl));
        }
        updatedQuestion.imageUrl = `/uploads/${req.file.filename}`;
    } else if (req.body.clearImage === 'true') {
        if (oldQuestion.imageUrl && fs.existsSync(path.join(__dirname, 'public', oldQuestion.imageUrl))) {
            fs.unlinkSync(path.join(__dirname, 'public', oldQuestion.imageUrl));
        }
        updatedQuestion.imageUrl = undefined;
    }
    quiz.questions[questionIndex] = updatedQuestion;
    saveQuizzes();
    res.json(updatedQuestion);
});

app.delete('/api/quiz/:quizId/question/:questionId', (req, res) => {
    const quiz = quizzes.find(q => q.id === req.params.quizId);
    if (!quiz || !quiz.questions) {
        return res.status(404).json({ message: 'Quiz or questions not found' });
    }
    const initialLength = quiz.questions.length;
    const questionToDelete = quiz.questions.find(q => q.id === req.params.questionId);
    if (questionToDelete && questionToDelete.imageUrl) {
        const imagePath = path.join(__dirname, 'public', questionToDelete.imageUrl);
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }
    }
    quiz.questions = quiz.questions.filter(q => q.id !== req.params.questionId);
    if (quiz.questions.length < initialLength) {
        saveQuizzes();
        res.status(204).send();
    } else {
        res.status(404).json({ message: 'Question not found' });
    }
});

// --- WebSocket Logic ---
wss.on('connection', ws => {
    ws.isAlive = true;
    ws.id = uuidv4();
    console.log(`[Server] New client connected. WS ID: ${ws.id}`);
    
    ws.send(JSON.stringify({ type: 'connected', wsId: ws.id }));
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', message => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error(`[Server] Invalid JSON received from client WS ID: ${ws.id}:`, message.toString(), e);
            return;
        }

        console.log(`[Server] Received message from client WS ID: ${ws.id}, type: ${data.type}`);

        switch (data.type) {
            case 'hostConnect':
                if (hostWs && hostWs.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Host already connected. Only one host allowed.' }));
                    ws.close();
                    return;
                }

                hostWs = ws;
                ws.role = 'host';
                console.log('[Server] Host connected.');
                
                const hostStateToSend = {
                    type: 'hostReady',
                    quizCode: gameState.quizCode,
                    players: getPlayerNames(),
                    availableQuizzes: quizzes.map(q => ({ id: q.id, title: q.title })),
                    currentQuizId: gameState.currentQuizId,
                    currentQuizTitle: gameState.currentQuizTitle,
                    totalQuestions: gameState.currentQuiz ? gameState.currentQuiz.questions.length : 0,
                    gameStarted: gameState.isGameStarted,
                    currentQuestionIndex: gameState.currentQuestionIndex,
                    questionActive: gameState.questionActive,
                    gamePaused: gameState.gamePaused,
                    leaderboard: gameState.leaderboard,
                    currentQuestion: null
                };

                if (gameState.questionActive && gameState.currentQuiz && gameState.currentQuestionIndex !== -1) {
                    const currentQuestion = gameState.currentQuiz.questions[gameState.currentQuestionIndex];
                    const timeRemaining = Math.max(0, Math.ceil((gameState.currentQuestionEndTime - Date.now()) / 1000));
                    
                    hostStateToSend.currentQuestion = {
                        name: currentQuestion.name,
                        title: currentQuestion.title,
                        type: currentQuestion.type,
                        choices: currentQuestion.choices,
                        imageUrl: currentQuestion.imageUrl,
                        index: gameState.currentQuestionIndex,
                        timer: timeRemaining,
                        totalTimer: gameState.questionDuration
                    };
                    hostStateToSend.answerStats = gameState.currentQuestionAnswerStats;
                    hostStateToSend.textAnswers = gameState.currentQuestionTextAnswers;
                    hostStateToSend.correctAnswer = currentQuestion.correctAnswer;
                    hostStateToSend.totalAnswers = gameState.answeredPlayers.size;
                }

                sendToHost(hostStateToSend);
                console.log('[Server] Host connected/rejoined. Game state sent to host.');
                break;

            case 'selectQuiz':
                 if (ws.role === 'host' && !gameState.isGameStarted) {
                    const selectedQuiz = quizzes.find(q => q.id === data.quizId);
                    if (selectedQuiz) {
                        const newQuizCode = generateQuizCode();
                        const preservedPlayers = {};
                        for (const pWsId in gameState.players) {
                            const player = gameState.players[pWsId];
                            if (player.ws && player.ws.readyState === WebSocket.OPEN) {
                                preservedPlayers[pWsId] = {
                                    name: player.name,
                                    score: 0,
                                    answers: {},
                                    persistentId: player.persistentId,
                                    ws: player.ws
                                };
                            }
                        }

                        gameState = initializeGameState(data.quizId);
                        gameState.players = preservedPlayers;
                        gameState.quizCode = newQuizCode;
                        gameState.currentQuiz = selectedQuiz;
                        gameState.currentQuizTitle = selectedQuiz.title;

                        sendToHost({
                            type: 'quizSelected',
                            quizTitle: gameState.currentQuiz.title,
                            quizCode: gameState.quizCode,
                            totalQuestions: gameState.currentQuiz.questions.length
                        });
                        
                        // Отправляем обновленное лобби игрокам с актуальным списком игроков
                        Object.values(gameState.players).forEach(playerObj => {
                            if (playerObj.ws && playerObj.ws.readyState === WebSocket.OPEN) {
                                playerObj.ws.send(JSON.stringify({ 
                                    type: 'lobbyUpdate', 
                                    quizTitle: gameState.currentQuiz.title,
                                    players: getPlayerNames() 
                                }));
                            }
                        });
                        console.log(`[Server] Host selected quiz: ${gameState.currentQuiz.title}, new code: ${gameState.quizCode}`);
                    } else {
                        sendToHost({ type: 'error', message: 'Selected quiz not found.' });
                    }
                }
                break;

            case 'playerJoin':
                console.log(`[Server] Player join attempt from WS ID: ${ws.id}, Name: ${data.name}, Code: ${data.quizCode}, Persistent ID: ${data.rejoinPlayerId}`);
                
                let playerPersistentId = data.rejoinPlayerId || uuidv4(); 
                let playerToConnect = null;
                let oldPlayerWsId = null;

                for (const pWsId in gameState.players) {
                    const player = gameState.players[pWsId];
                    if (player.persistentId === playerPersistentId) {
                        playerToConnect = player;
                        oldPlayerWsId = pWsId;
                        break;
                    }
                }

                if (playerToConnect) {
                    console.log(`[Server] Player ${playerToConnect.name} (Persistent ID: ${playerPersistentId}) found. Attempting to re-establish connection.`);

                    if (playerToConnect.ws && playerToConnect.ws.readyState === WebSocket.OPEN && oldPlayerWsId !== ws.id) {
                        console.log(`[Server] Player ${playerToConnect.name} already connected with WS ID ${oldPlayerWsId}. Closing old connection.`);
                        playerToConnect.ws.send(JSON.stringify({ type: 'joinError', message: 'Connected from another device/tab. Old connection closed.' }));
                        playerToConnect.ws.close();
                        playerToConnect.ws = null; 
                    }
                    
                    playerToConnect.ws = ws;
                    ws.role = 'player';
                    ws.name = playerToConnect.name;
                    ws.persistentId = playerPersistentId; 
                    
                    if (oldPlayerWsId && oldPlayerWsId !== ws.id) {
                        delete gameState.players[oldPlayerWsId]; 
                        gameState.players[ws.id] = playerToConnect; 
                        console.log(`[Server] Player ${playerToConnect.name} reconnected. Old WS ID: ${oldPlayerWsId}, New WS ID: ${ws.id}.`);
                    } else {
                        gameState.players[ws.id] = playerToConnect;
                        console.log(`[Server] Player ${playerToConnect.name} (WS ID: ${ws.id}) re-registered.`);
                    }

                    let currentQuestionToSend = null;
                    let playerAnsweredCurrentQuestion = false;

                    if (gameState.isGameStarted && gameState.currentQuiz && gameState.currentQuestionIndex !== -1 && gameState.questionActive) {
                        const currentQuestion = gameState.currentQuiz.questions[gameState.currentQuestionIndex];
                        const timeRemaining = Math.max(0, Math.ceil((gameState.currentQuestionEndTime - Date.now()) / 1000));
                        
                        currentQuestionToSend = {
                            name: currentQuestion.name,
                            title: currentQuestion.title,
                            type: currentQuestion.type,
                            choices: currentQuestion.choices,
                            imageUrl: currentQuestion.imageUrl,
                            index: gameState.currentQuestionIndex,
                            timer: timeRemaining,
                            totalTimer: gameState.questionDuration
                        };
                        playerAnsweredCurrentQuestion = playerToConnect.answers[currentQuestion.name] !== undefined;
                    }

                    ws.send(JSON.stringify({
                        type: 'rejoinSuccess',
                        wsId: ws.id,
                        persistentId: ws.persistentId,
                        quizTitle: gameState.currentQuizTitle,
                        players: getPlayerNames(),
                        gameStarted: gameState.isGameStarted,
                        gamePaused: gameState.gamePaused,
                        currentQuestion: currentQuestionToSend,
                        playerAnsweredCurrentQuestion: playerAnsweredCurrentQuestion,
                        currentScore: playerToConnect.score
                    }));
                    console.log(`[Server] Player ${playerToConnect.name} rejoined game/lobby.`);

                } else {
                    if (gameState.isGameStarted && !gameState.gamePaused) {
                        ws.send(JSON.stringify({ type: 'joinError', message: 'Quiz has already started. Rejoin only by persistent ID.' }));
                        return;
                    }
                    if (!gameState.quizCode || data.quizCode !== gameState.quizCode) {
                        ws.send(JSON.stringify({ type: 'joinError', message: 'Invalid quiz code.' }));
                        return;
                    }
                    const existingPlayerNames = getPlayerNames().map(p => p.toLowerCase());
                    if (existingPlayerNames.includes(data.name.toLowerCase())) {
                         ws.send(JSON.stringify({ type: 'joinError', message: 'Name already taken. Choose another.' }));
                         return;
                    }
                    
                    ws.role = 'player';
                    ws.name = data.name;
                    ws.persistentId = playerPersistentId; 
                    
                    gameState.players[ws.id] = { 
                        name: data.name, 
                        score: 0, 
                        answers: {}, 
                        persistentId: ws.persistentId, 
                        ws: ws
                    };
                    
                    ws.send(JSON.stringify({ 
                        type: 'joinSuccess', 
                        wsId: ws.id,
                        persistentId: ws.persistentId,
                        quizTitle: gameState.currentQuizTitle,
                        players: getPlayerNames() 
                    })); 
                    console.log(`[Server] New Player ${data.name} (Persistent ID: ${ws.persistentId}) joined. WS ID: ${ws.id}.`);
                }
                sendToHost({ type: 'playerListUpdate', players: getPlayerNames() });
                broadcastToPlayers({ type: 'playerListUpdate', players: getPlayerNames() });
                break;

            case 'startGame':
                if (ws.role === 'host' && gameState.isGameStarted === false) {
                    if (!gameState.currentQuiz) {
                        sendToHost({ type: 'error', message: 'Quiz not selected!' });
                        return;
                    }
                    if (!gameState.currentQuiz.questions || gameState.currentQuiz.questions.length === 0) {
                        sendToHost({ type: 'error', message: 'No questions in selected quiz!' });
                        return;
                    }
                    if (getPlayerNames().length === 0) {
                        sendToHost({ type: 'error', message: 'No players joined yet!' });
                        return;
                    }
                    gameState.isGameStarted = true;
                    gameState.currentQuestionIndex = -1;
                    console.log(`[Server] Game "${gameState.currentQuiz.title}" started by host.`);
                    broadcastToPlayers({ type: 'gameStarted', quizTitle: gameState.currentQuiz.title, totalQuestions: gameState.currentQuiz.questions.length });
                    sendToHost({ type: 'gameStarted', quizTitle: gameState.currentQuiz.title, totalQuestions: gameState.currentQuiz.questions.length });
                }
                break;

            case 'nextQuestion':
                if (ws.role === 'host' && gameState.isGameStarted && !gameState.gamePaused) {
                    clearTimeout(gameState.questionTimer);
                    gameState.questionTimer = null;
                    gameState.currentQuestionIndex++;
                    
                    if (gameState.currentQuestionIndex < gameState.currentQuiz.questions.length) {
                        const question = gameState.currentQuiz.questions[gameState.currentQuestionIndex];
                        gameState.questionActive = true;
                        gameState.answersReceived = 0;
                        gameState.answeredPlayers.clear();
                        
                        gameState.currentQuestionAnswerStats = {};
                        if (question.type === 'radiogroup' || question.type === 'checkbox') {
                            (question.choices || []).forEach(choice => {
                                const choiceValue = typeof choice === 'object' && 'value' in choice ? choice.value : (typeof choice === 'object' && 'text' in choice ? choice.text : String(choice));
                                gameState.currentQuestionAnswerStats[choiceValue] = { count: 0, players: [] };
                            });
                        }
                        gameState.currentQuestionTextAnswers = [];

                        gameState.currentQuestionStartTime = Date.now();
                        gameState.questionDuration = question.timer || 15;
                        gameState.currentQuestionEndTime = gameState.currentQuestionStartTime + gameState.questionDuration * 1000;

                        const questionForHost = {
                            name: question.name,
                            title: question.title,
                            type: question.type,
                            choices: question.choices,
                            imageUrl: question.imageUrl,
                            index: gameState.currentQuestionIndex,
                            timer: gameState.questionDuration,
                            totalTimer: gameState.questionDuration
                        };
                        sendToHost({ type: 'questionStarted', question: questionForHost, totalQuestions: gameState.currentQuiz.questions.length });
                        
                        // Отправка player-specific сообщения каждому игроку
                        Object.values(gameState.players).forEach(playerObj => {
                            if (playerObj.ws && playerObj.ws.readyState === WebSocket.OPEN) {
                                const hasPlayerAnsweredThisQuestion = !!playerObj.answers[question.name];
                                const playerQuestionMessage = {
                                    type: 'startQuestion',
                                    question: {
                                        name: question.name,
                                        title: question.title,
                                        type: question.type,
                                        choices: question.choices,
                                        imageUrl: question.imageUrl,
                                        index: gameState.currentQuestionIndex,
                                        timer: gameState.questionDuration,
                                        totalTimer: gameState.questionDuration
                                    },
                                    hasPlayerAnsweredThisQuestion: hasPlayerAnsweredThisQuestion
                                };
                                playerObj.ws.send(JSON.stringify(playerQuestionMessage));
                            }
                        });

                        console.log(`[Server] Starting question ${gameState.currentQuestionIndex + 1}: ${question.name}`);
                        gameState.questionTimer = setTimeout(endQuestion, gameState.questionDuration * 1000);
                    } else {
                        console.log('[Server] Quiz finished!');
                        gameState.isGameStarted = false;
                        sendToHost({ type: 'quizFinished', leaderboard: gameState.leaderboard });
                        // Отправляем каждому игроку индивидуальное сообщение с его счетом и полной таблицей лидеров
                        Object.values(gameState.players).forEach(playerObj => {
                            if (playerObj.ws && playerObj.ws.readyState === WebSocket.OPEN) {
                                playerObj.ws.send(JSON.stringify({ 
                                    type: 'quizFinished', 
                                    score: playerObj.score,
                                    leaderboard: gameState.leaderboard
                                }));
                            }
                        });
                    }
                }
                break;

            case 'playerAnswer':
                if (ws.role === 'player' && gameState.isGameStarted && gameState.questionActive && !gameState.gamePaused) {
                    const player = gameState.players[ws.id]; 
                    const question = gameState.currentQuiz.questions[gameState.currentQuestionIndex];

                    if (!player || player.answers[question.name]) {
                        console.warn(`[Server] Player WS ID: ${ws.id} (Name: ${player ? player.name : 'N/A'}) tried to answer multiple times or not found.`);
                        ws.send(JSON.stringify({ type: 'error', message: 'An error occurred or you have already answered.' }));
                        return;
                    }

                    gameState.answeredPlayers.add(player.persistentId);
                    gameState.answersReceived++;
                    
                    const timeRemaining = (gameState.currentQuestionEndTime - Date.now()) / 1000;
                    const timeTaken = gameState.questionDuration - Math.max(0, timeRemaining);
                    let isCorrect = false;

                    if (question.type === 'radiogroup' || question.type === 'checkbox') {
                        const playerAnswersRaw = Array.isArray(data.answer) ? data.answer : [data.answer];
                        const playerAnswers = playerAnswersRaw.map(a => String(a).trim());

                        playerAnswers.forEach(ans => {
                            if (gameState.currentQuestionAnswerStats[ans]) {
                                gameState.currentQuestionAnswerStats[ans].count++;
                                gameState.currentQuestionAnswerStats[ans].players.push(player.name);
                            } else {
                                gameState.currentQuestionAnswerStats[ans] = { count: 1, players: [player.name] };
                            }
                        });
                    } else if (question.type === 'text') {
                        gameState.currentQuestionTextAnswers.push({ name: player.name, answer: String(data.answer).trim() });
                    }

                    if (question.type === 'radiogroup') {
                        isCorrect = String(data.answer).trim().toLowerCase() === String(question.correctAnswer).trim().toLowerCase();
                    } else if (question.type === 'checkbox') {
                        const playerAnswers = Array.isArray(data.answer) ? data.answer.sort().map(a => String(a).trim().toLowerCase()) : [];
                        const correctAnswers = Array.isArray(question.correctAnswer) ? question.correctAnswer.sort().map(a => String(a).trim().toLowerCase()) : [];
                        isCorrect = playerAnswers.length === correctAnswers.length &&
                                    playerAnswers.every((val, index) => val === correctAnswers[index]);
                    } else if (question.type === 'text') {
                        isCorrect = String(data.answer).trim().toLowerCase() === String(question.correctAnswer).trim().toLowerCase();
                    }
                    
                    const score = isCorrect ? calculateScore(gameState.questionDuration, timeTaken) : 0;
                    player.score += score;
                    player.answers[question.name] = {
                        answer: data.answer,
                        timeTaken: timeTaken,
                        correct: isCorrect,
                        score: score
                    };
                    
                    console.log(`[Server] Player ${player.name} answered: ${data.answer}, Correct: ${isCorrect}, Score: ${score}`);
                    sendToHost({ type: 'playerAnswered', name: player.name, currentAnswers: gameState.answeredPlayers.size, totalPlayers: getPlayerNames().length });
                    updateLeaderboard();
                    
                    if (gameState.answeredPlayers.size >= getPlayerNames().length) {
                        console.log('[Server] All active players answered, ending question early.');
                        endQuestion();
                    }
                } else {
                    console.warn(`[Server] Player WS ID: ${ws.id} tried to answer, but game not active, question not active, or game is paused.`);
                }
                break;
            
            case 'resumeGame':
                if (ws.role === 'host' && gameState.isGameStarted && gameState.gamePaused) {
                    console.log('[Server] Host requested to resume game.');
                    gameState.gamePaused = false;
                    
                    if (gameState.currentQuestionIndex === -1) {
                         sendToHost({ type: 'gameResumed' });
                         broadcastToPlayers({ type: 'gameResumed' });
                         return;
                    }

                    const timeRemainingMs = Math.max(0, gameState.currentQuestionEndTime - Date.now());
                    
                    if (timeRemainingMs > 0) {
                        gameState.questionActive = true;
                        gameState.currentQuestionEndTime = Date.now() + timeRemainingMs; 
                        const remainingSeconds = Math.ceil(timeRemainingMs / 1000);

                        const currentQuestion = gameState.currentQuiz.questions[gameState.currentQuestionIndex];
                        const questionForHost = {
                            name: currentQuestion.name,
                            title: currentQuestion.title,
                            type: currentQuestion.type,
                            choices: currentQuestion.choices,
                            imageUrl: currentQuestion.imageUrl,
                            index: gameState.currentQuestionIndex,
                            timer: remainingSeconds,
                            totalTimer: gameState.questionDuration
                        };
                        sendToHost({ type: 'questionStarted', question: questionForHost, totalQuestions: gameState.currentQuiz.questions.length });

                        // Отправка player-specific сообщения каждому игроку при возобновлении
                        Object.values(gameState.players).forEach(playerObj => {
                            if (playerObj.ws && playerObj.ws.readyState === WebSocket.OPEN) {
                                const hasPlayerAnsweredThisQuestion = !!playerObj.answers[currentQuestion.name];
                                const playerQuestionMessage = {
                                    type: 'startQuestion',
                                    question: {
                                        name: currentQuestion.name,
                                        title: currentQuestion.title,
                                        type: currentQuestion.type,
                                        choices: currentQuestion.choices,
                                        imageUrl: currentQuestion.imageUrl,
                                        index: gameState.currentQuestionIndex,
                                        timer: remainingSeconds,
                                        totalTimer: gameState.questionDuration
                                    },
                                    hasPlayerAnsweredThisQuestion: hasPlayerAnsweredThisQuestion
                                };
                                playerObj.ws.send(JSON.stringify(playerQuestionMessage));
                            }
                        });

                        gameState.questionTimer = setTimeout(endQuestion, timeRemainingMs);
                        console.log(`[Server] Game resumed, question ${gameState.currentQuestionIndex + 1} restarted with ${remainingSeconds} seconds.`);
                    } else {
                        console.log('[Server] Game resumed, but question time already expired during pause. Ending question.');
                        endQuestion();
                    }
                    sendToHost({ type: 'gameResumed' });
                } else {
                    console.warn('[Server] Host tried to resume game but game not started, not paused, or not host.');
                }
                break;
            
            case 'resetGame':
                if (ws.role === 'host') {
                    broadcastToPlayers({ type: 'gameReset' });
                    // Сначала отправляем подтверждение хосту, затем сбрасываем состояние на сервере
                    ws.send(JSON.stringify({ type: 'gameResetConfirmation' }));
                    gameState = initializeGameState(); // Сбрасываем глобальное состояние
                    hostWs = null; // Отключаем глобальную ссылку на хоста
                    console.log('[Server] Game reset by host. Host received confirmation, global state reset.');
                }
                break;

            default:
                console.warn(`[Server] Unhandled message type: ${data.type} from client WS ID: ${ws.id}`);
                break;
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[Server] Client disconnected. WS ID: ${ws.id}, Code: ${code}, Reason: ${reason ? reason.toString() : 'No reason'}`);
        if (ws.role === 'host') {
            console.log('[Server] Host disconnected.');
            hostWs = null;
            
            if (gameState.isGameStarted) {
                console.log('[Server] Host disconnected during game. Pausing game.');
                gameState.gamePaused = true;
                if (gameState.questionTimer) {
                    clearTimeout(gameState.questionTimer);
                    gameState.questionTimer = null;
                }
                gameState.questionActive = false;
                broadcastToPlayers({ type: 'hostDisconnected', gamePaused: true, message: 'hostDisconnectedGame' });
            } else {
                console.log('[Server] Host disconnected from lobby.');
                broadcastToPlayers({ type: 'hostDisconnected', gamePaused: false, message: 'hostDisconnected' });
            }
        } else if (ws.role === 'player') {
            const player = gameState.players[ws.id];
            if (player) {
                if (gameState.isGameStarted) {
                    player.ws = null;
                    console.log(`[Server] Player ${player.name} (Persistent ID: ${player.persistentId}) disconnected. State preserved for rejoin.`);
                } else {
                    const playerName = player.name;
                    delete gameState.players[ws.id];
                    console.log(`[Server] Player ${playerName} permanently removed from lobby.`);
                }
                sendToHost({ type: 'playerListUpdate', players: getPlayerNames() });
                broadcastToPlayers({ type: 'playerListUpdate', players: getPlayerNames() });
                updateLeaderboard();
            }
        }
    });

    ws.on('error', error => {
        console.error(`[Server] WebSocket error for client WS ID: ${ws.id}:`, error.message);
    });
});

setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            console.log(`[Server] Terminating unresponsive client. WS ID: ${ws.id || 'unknown'}`);
            ws.terminate();
            return;
        }
        ws.isAlive = false;
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    });
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on http://0.0.0.0:${PORT}`);
    console.log(`Admin interface: http://YOUR_LOCAL_IP:${PORT}/admin.html`);
    console.log(`Host interface: http://YOUR_LOCAL_IP:${PORT}/`);
    console.log(`Player interface: http://YOUR_LOCAL_IP:${PORT}/player.html`);
    console.log('Make sure to replace YOUR_LOCAL_IP with your actual local IP address.');
    console.log('You can find your local IP by running `ipconfig` (Windows) or `ifconfig` (macOS/Linux) in your terminal.');
});