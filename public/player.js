// player.js - Обновлен для поддержки постоянства состояния ведущего и паузы игры
document.addEventListener('DOMContentLoaded', () => {
    const joinScreen = document.getElementById('joinScreen');
    const playerNameInput = document.getElementById('playerName');
    const quizCodeInput = document.getElementById('quizCodeInput');
    const joinQuizBtn = document.getElementById('joinQuizBtn');
    const joinError = document.getElementById('joinError');
    const lobbyScreen = document.getElementById('lobbyScreen');
    const lobbyQuizTitle = document.getElementById('lobbyQuizTitle');
    const lobbyPlayerName = document.getElementById('lobbyPlayerName');
    const lobbyPlayerCount = document.getElementById('lobbyPlayerCount');
    const lobbyPlayerList = document.getElementById('lobbyPlayerList');
    const gameScreen = document.getElementById('gameScreen');
    const playerQuestionTitle = document.getElementById('playerQuestionTitle');
    const playerAnswerOptions = document.getElementById('playerAnswerOptions');
    const playerAnswerInput = document.getElementById('playerAnswerInput');
    const playerTextAnswer = document.getElementById('playerTextAnswer');
    const submitAnswerBtn = document.getElementById('submitAnswerBtn');
    const feedbackMessage = document.getElementById('feedbackMessage');
    const playerQuestionImage = document.getElementById('playerQuestionImage');
    const playerTimerContainer = document.getElementById('playerTimerContainer');
    const playerTimerBar = document.getElementById('playerTimerBar');
    const playerTimerText = document.getElementById('playerTimerText');
    const quizFinishedScreen = document.getElementById('quizFinishedScreen');
    const finalPlayerScore = document.getElementById('finalPlayerScore');
    const finalLeaderboardListPlayer = document.getElementById('finalLeaderboardListPlayer');
    const playAgainBtn = document.getElementById('playAgainBtn');
    const playerLeaderboard = document.getElementById('playerLeaderboard');
    const playerLeaderboardList = document.getElementById('playerLeaderboardList');
    const playerCorrectAnswerFeedback = document.getElementById('playerCorrectAnswerFeedback');

    if (!playerCorrectAnswerFeedback) {
        console.error("ОШИБКА: Элемент 'playerCorrectAnswerFeedback' не найден в DOM! Убедитесь, что он присутствует в player.html.");
    }

    let playerName = localStorage.getItem('quizPlayerName') || '';
    let quizCode = localStorage.getItem('quizCode') || '';
    let wsId = null;
    let persistentId = localStorage.getItem('quizPersistentPlayerId') || null;
    let currentQuestionType = '';
    let currentQuestionName = '';
    let playerHasAnswered = false; // Состояние игрока: ответил ли он на текущий вопрос
    let currentQuestionChoices = [];

    playerNameInput.value = playerName;
    quizCodeInput.value = quizCode;

    let ws = null;
    try {
        ws = new WebSocket(`ws://${location.hostname}:${location.port}`);
        console.log('WebSocket object created successfully:', ws);
        joinQuizBtn.disabled = true;
    } catch (e) {
        console.error('Failed to create WebSocket object:', e);
        joinQuizBtn.disabled = true;
        return;
    }

    function showPlayerSection(sectionIdToShow) {
        const sections = document.querySelectorAll('.section');
        sections.forEach(section => {
            if (section.id === sectionIdToShow) {
                section.classList.remove('hidden');
                section.style.display = 'flex';
                console.log(`[Player UI] Showing section: ${sectionIdToShow}`);
                setTimeout(() => {
                    section.classList.add('active');
                }, 10);
            } else {
                section.classList.remove('active');
                setTimeout(() => {
                    section.classList.add('hidden');
                    section.style.display = 'none';
                }, 500);
            }
        });
    }

    // Вспомогательная функция для очистки UI игрока (полностью скрывает элементы геймплея)
    function resetPlayerGameUI() {
        stopPlayerTimer();
        playerQuestionTitle.textContent = '';
        playerQuestionTitle.classList.add('hidden');
        playerQuestionTitle.style.display = 'none';
        playerAnswerOptions.innerHTML = '';
        playerAnswerOptions.classList.add('hidden');
        playerAnswerOptions.style.display = 'none';
        playerAnswerInput.classList.add('hidden');
        playerAnswerInput.style.display = 'none';
        playerTextAnswer.value = '';
        submitAnswerBtn.classList.add('hidden');
        submitAnswerBtn.style.display = 'none';
        feedbackMessage.classList.add('hidden');
        feedbackMessage.style.display = 'none';
        playerQuestionImage.classList.add('hidden');
        playerQuestionImage.style.display = 'none';
        if (playerCorrectAnswerFeedback) {
            playerCorrectAnswerFeedback.classList.add('hidden');
            playerCorrectAnswerFeedback.style.display = 'none';
            playerCorrectAnswerFeedback.innerHTML = '';
        }
        // playerLeaderboard.classList.add('hidden'); // Убрано: showPlayerSection контролирует это
        // playerLeaderboard.style.display = 'none'; // Убрано: showPlayerSection контролирует это
        // quizFinishedScreen.classList.add('hidden'); // Убрано: showPlayerSection контролирует это
        // quizFinishedScreen.style.display = 'none'; // Убрано: showPlayerSection контролирует это
    }


    function renderQuestionForPlayer(question, hasPlayerAnsweredThisQuestion = false) {
        resetPlayerGameUI(); // Сбрасываем UI перед рендерингом нового вопроса

        playerQuestionTitle.textContent = question.title;
        playerQuestionTitle.classList.remove('hidden');
        playerQuestionTitle.style.display = 'block';

        submitAnswerBtn.classList.remove('hidden');
        submitAnswerBtn.style.display = 'block';
        
        submitAnswerBtn.disabled = hasPlayerAnsweredThisQuestion;
        playerHasAnswered = hasPlayerAnsweredThisQuestion;

        if (playerHasAnswered) {
             feedbackMessage.textContent = t('player.gameScreen.alreadyAnswered');
             feedbackMessage.classList.add('success-message');
             feedbackMessage.classList.remove('hidden');
             feedbackMessage.style.display = 'block';
        } else {
             feedbackMessage.classList.add('hidden'); // Скрываем сообщение, если вопрос новый
             feedbackMessage.style.display = 'none';
        }

        playerQuestionImage.classList.add('hidden');
        playerQuestionImage.src = '';
        if (question.imageUrl) {
            playerQuestionImage.src = question.imageUrl;
            playerQuestionImage.classList.remove('hidden');
            playerQuestionImage.style.display = 'block';
        }

        currentQuestionType = question.type;
        currentQuestionName = question.name;
        currentQuestionChoices = question.choices || question.options || [];

        const isChoiceQuestion = currentQuestionType === 'radiogroup' || currentQuestionType === 'checkbox';

        if (isChoiceQuestion) {
            playerAnswerInput.classList.add('hidden');
            playerAnswerInput.style.display = 'none';
            playerAnswerOptions.classList.remove('hidden');
            playerAnswerOptions.style.display = 'grid';

            if (currentQuestionChoices && Array.isArray(currentQuestionChoices) && currentQuestionChoices.length > 0) {
                currentQuestionChoices.forEach((choice) => {
                    const label = document.createElement('label');
                    label.classList.add('option-block', 'answer-option-label');

                    const input = document.createElement('input');
                    if (currentQuestionType === 'radiogroup') {
                        input.type = 'radio';
                        input.name = 'answer';
                    } else if (currentQuestionType === 'checkbox') {
                        input.type = 'checkbox';
                        input.name = 'answer';
                    }

                    const choiceValue = typeof choice === 'object' && choice !== null && 'value' in choice ? choice.value : (typeof choice === 'object' && choice !== null && 'text' in choice ? choice.text : choice);
                    input.value = choiceValue;
                    label.dataset.value = choiceValue;

                    const spanText = document.createElement('span');
                    spanText.textContent = typeof choice === 'object' && choice !== null && 'text' in choice ? choice.text : choice;

                    label.appendChild(input);
                    label.appendChild(spanText);
                    playerAnswerOptions.appendChild(label);

                    if (playerHasAnswered) { // Отключаем варианты, если уже ответил
                        label.classList.add('answer-submitted-disabled');
                    } else {
                        input.addEventListener('change', () => {
                            if (input.type === 'radio') {
                                playerAnswerOptions.querySelectorAll('.answer-option-label').forEach(lbl => {
                                    lbl.classList.remove('player-selected-choice');
                                });
                                label.classList.add('player-selected-choice');
                            } else if (input.type === 'checkbox') {
                                label.classList.toggle('player-selected-choice', input.checked);
                            }
                        });
                    }
                });
            } else {
                console.warn('[Player UI] Player received a choice-based question but no choices/options were provided or array is empty:', question);
                playerAnswerOptions.textContent = t('player.gameScreen.noChoices');
                submitAnswerBtn.disabled = true;
            }
        } else if (currentQuestionType === 'text') {
            playerAnswerInput.classList.remove('hidden');
            playerAnswerInput.style.display = 'block';
            playerAnswerOptions.classList.add('hidden');
            playerAnswerOptions.style.display = 'none';
            playerTextAnswer.disabled = playerHasAnswered; // Отключаем поле ввода
        } else {
            console.warn('[Player UI] Player received an unknown question type:', currentQuestionType, question);
            playerAnswerOptions.textContent = t('player.gameScreen.unknownType', {type: currentQuestionType});
            playerAnswerOptions.classList.remove('hidden');
            playerAnswerOptions.style.display = 'block';
            submitAnswerBtn.disabled = true;
        }
        startPlayerTimer(question.timer, question.totalTimer || question.timer);
    }

    function attemptAutoJoin() {
        if (playerName && quizCode && persistentId && ws && ws.readyState === WebSocket.OPEN) {
            console.log('[Player UI] Attempting auto-join...');
            joinError.classList.add('hidden');
            const joinMessage = {
                type: 'playerJoin',
                name: playerName,
                quizCode: quizCode,
                rejoinPlayerId: persistentId
            };
            try {
                ws.send(JSON.stringify(joinMessage));
                joinQuizBtn.disabled = true;
            } catch (e) {
                console.error('[Player UI] Error during auto-join send:', e);
                joinQuizBtn.disabled = false;
                localStorage.removeItem('quizPersistentPlayerId');
                localStorage.removeItem('quizPlayerName');
                localStorage.removeItem('quizCode');
                showPlayerSection('joinScreen');
            }
        } else {
            console.log('[Player UI] Not all conditions met for auto-join. Waiting for manual input.');
            joinQuizBtn.disabled = false;
            showPlayerSection('joinScreen');
        }
    }

    ws.onopen = () => {
        console.log('[Player UI] WebSocket connection opened.');

        if (playerName && quizCode && persistentId) {
            attemptAutoJoin();
        } else {
            joinQuizBtn.disabled = false;
            showPlayerSection('joinScreen');
        }
    };

    ws.onmessage = event => {
        const data = JSON.parse(event.data);
        console.log('[Player UI] Player received ANY message:', data);
        switch (data.type) {
            case 'connected':
                break;
            case 'joinSuccess':
                wsId = data.wsId;
                persistentId = data.persistentId;
                localStorage.setItem('quizPersistentPlayerId', persistentId);
                localStorage.setItem('quizPlayerName', playerName);
                localStorage.setItem('quizCode', quizCode);

                showPlayerSection('lobbyScreen');
                lobbyQuizTitle.textContent = data.quizTitle;
                lobbyPlayerName.textContent = playerName;
                updateLobbyPlayers(data.players);
                joinQuizBtn.disabled = true;
                resetPlayerGameUI();
                break;
            case 'lobbyUpdate':
                if (!document.getElementById('lobbyScreen').classList.contains('hidden')) {
                    lobbyQuizTitle.textContent = data.quizTitle;
                    updateLobbyPlayers(data.players);
                }
                break;
            case 'rejoinSuccess':
                wsId = data.wsId;
                persistentId = data.persistentId;
                localStorage.setItem('quizPersistentPlayerId', persistentId);

                feedbackMessage.classList.add('hidden');
                feedbackMessage.style.display = 'none';
                if (playerCorrectAnswerFeedback) playerCorrectAnswerFeedback.classList.add('hidden');
                if (playerCorrectAnswerFeedback) playerCorrectAnswerFeedback.style.display = 'none';
                stopPlayerTimer();
                resetPlayerGameUI();

                lobbyQuizTitle.textContent = data.quizTitle;
                lobbyPlayerName.textContent = `${playerName} (${t('common.points')}: ${data.currentScore || 0})`;
                updateLobbyPlayers(data.players);

                if (data.gameStarted) {
                    showPlayerSection('gameScreen');
                    if (data.gamePaused) {
                        playerQuestionTitle.textContent = t('player.gameScreen.hostPaused');
                        playerQuestionTitle.classList.remove('hidden');
                        playerQuestionTitle.style.display = 'block';
                        submitAnswerBtn.classList.add('hidden');
                        submitAnswerBtn.style.display = 'none';
                        playerAnswerOptions.classList.add('hidden');
                        playerAnswerOptions.style.display = 'none';
                        playerAnswerInput.classList.add('hidden');
                        playerAnswerInput.style.display = 'none';
                        feedbackMessage.textContent = t('player.gameScreen.hostPaused');
                        feedbackMessage.classList.add('error-message');
                        feedbackMessage.classList.remove('hidden');
                        feedbackMessage.style.display = 'block';
                        stopPlayerTimer();
                    } else {
                        if (data.currentQuestion) {
                            renderQuestionForPlayer(data.currentQuestion, data.playerAnsweredCurrentQuestion);
                        } else {
                            playerQuestionTitle.textContent = t('player.gameScreen.rejoinWait');
                            playerQuestionTitle.classList.remove('hidden');
                            playerQuestionTitle.style.display = 'block';
                            submitAnswerBtn.disabled = true;
                            submitAnswerBtn.classList.remove('hidden');
                            submitAnswerBtn.style.display = 'block';
                        }
                    }
                } else {
                    showPlayerSection('lobbyScreen');
                }
                joinQuizBtn.disabled = true;
                break;
            case 'joinError':
                joinError.textContent = data.message;
                joinError.classList.remove('hidden');
                joinError.style.display = 'block';
                joinQuizBtn.disabled = false;
                localStorage.removeItem('quizPersistentPlayerId');
                localStorage.removeItem('quizPlayerName');
                localStorage.removeItem('quizCode');
                persistentId = null;
                playerName = '';
                quizCode = '';
                playerNameInput.value = '';
                quizCodeInput.value = '';
                showPlayerSection('joinScreen');
                console.error('[Player UI] Server error (joinError):', data.message);
                break;
            case 'playerListUpdate':
                updateLobbyPlayers(data.players);
                break;
            case 'gameStarted':
                showPlayerSection('gameScreen');
                resetPlayerGameUI(); // Очищаем UI перед стартом игры
                playerQuestionTitle.textContent = t('player.gameScreen.waitingFirst');
                playerQuestionTitle.classList.remove('hidden');
                playerQuestionTitle.style.display = 'block';
                playerLeaderboard.classList.add('hidden');
                playerLeaderboard.style.display = 'none';
                submitAnswerBtn.classList.remove('hidden');
                submitAnswerBtn.style.display = 'block';
                submitAnswerBtn.disabled = true;
                break;
            case 'startQuestion': // Теперь это сообщение содержит hasPlayerAnsweredThisQuestion
                console.log('[Player UI] Received startQuestion. Full question data:', data.question, 'Player answered this:', data.hasPlayerAnsweredThisQuestion);
                feedbackMessage.classList.add('hidden');
                feedbackMessage.style.display = 'none';
                feedbackMessage.classList.remove('success-message', 'error-message');
                if (playerCorrectAnswerFeedback) {
                    playerCorrectAnswerFeedback.classList.add('hidden');
                    playerCorrectAnswerFeedback.style.display = 'none';
                    playerCorrectAnswerFeedback.innerHTML = '';
                }
                playerLeaderboard.classList.add('hidden');
                playerLeaderboard.style.display = 'none';
                // Передаем hasPlayerAnsweredThisQuestion в renderQuestionForPlayer
                renderQuestionForPlayer({ ...data.question, totalTimer: data.question.timer }, data.hasPlayerAnsweredThisQuestion);
                break;
            case 'answerSubmitted': // Это сообщение больше не используется в текущей логике сервера, но оставлено для совместимости
                submitAnswerBtn.disabled = true;
                playerHasAnswered = true;
                feedbackMessage.textContent = t('player.gameScreen.answerAccepted');
                feedbackMessage.classList.add('success-message');
                feedbackMessage.classList.remove('hidden');
                feedbackMessage.style.display = 'block';
                 playerAnswerOptions.querySelectorAll('.answer-option-label').forEach(lbl => {
                    lbl.classList.add('answer-submitted-disabled');
                });
                break;
            case 'questionEnded':
                console.log('[Player UI] Received questionEnded. Correct Answer:', data.correctAnswer);
                submitAnswerBtn.classList.add('hidden');
                submitAnswerBtn.style.display = 'none';
                playerAnswerInput.classList.add('hidden');
                playerAnswerInput.style.display = 'none';

                stopPlayerTimer();

                const answered = playerHasAnswered || (data.yourAnswer !== null && data.yourAnswer !== undefined);
                if (!answered) {
                    feedbackMessage.textContent = t('player.gameScreen.timeUp');
                    feedbackMessage.classList.add('error-message');
                    feedbackMessage.classList.remove('hidden');
                    feedbackMessage.style.display = 'block';
                } else {
                    const statusText = data.isCorrect ? t('player.gameScreen.correct') : t('player.gameScreen.incorrect');
                    feedbackMessage.textContent = t('player.gameScreen.gainedScore', {status: statusText, gained: data.gainedScore || 0, total: data.totalScore || 0});
                    feedbackMessage.classList.add(data.isCorrect ? 'success-message' : 'error-message');
                    feedbackMessage.classList.remove('hidden');
                    feedbackMessage.style.display = 'block';
                }

                if (playerCorrectAnswerFeedback) {
                    playerCorrectAnswerFeedback.classList.remove('hidden');
                    playerCorrectAnswerFeedback.style.display = 'block';
                    let correctAnswerText;
                    if (Array.isArray(data.correctAnswer)) {
                        correctAnswerText = data.correctAnswer.map(String).join(', ');
                    } else {
                        correctAnswerText = String(data.correctAnswer);
                    }
                    playerCorrectAnswerFeedback.innerHTML = `${t('host.correctAnswerFeedback')} <span class="highlight">${correctAnswerText}</span>`;
                }

                const isChoiceQuestionEnded = currentQuestionType === 'radiogroup' || currentQuestionType === 'checkbox';
                if (isChoiceQuestionEnded) {
                    playerAnswerOptions.classList.remove('hidden');
                    playerAnswerOptions.style.display = 'grid';
                    playerAnswerOptions.querySelectorAll('.answer-option-label').forEach(label => {
                        const optionValue = label.dataset.value;
                        let isCorrectChoice = false;

                        if (Array.isArray(data.correctAnswer)) {
                            isCorrectChoice = data.correctAnswer.map(String).includes(optionValue);
                        } else {
                            isCorrectChoice = String(data.correctAnswer) === optionValue;
                        }

                        if (isCorrectChoice) {
                            label.classList.add('correct-choice');
                        } else if (label.classList.contains('player-selected-choice')) {
                            label.classList.add('incorrect-choice');
                            label.classList.remove('player-selected-choice');
                        } else {
                            label.classList.remove('player-selected-choice');
                        }
                        label.classList.add('answer-submitted-disabled');
                    });
                }

                playerLeaderboard.classList.add('hidden');
                playerLeaderboard.style.display = 'none';
                break;
            case 'leaderboardUpdate':
                playerLeaderboard.classList.add('hidden');
                playerLeaderboard.style.display = 'none';
                break;
            case 'quizFinished':
                console.log('[Player UI] Received quizFinished. Final score:', data.score, 'Leaderboard:', data.leaderboard);
                showPlayerSection('quizFinishedScreen'); // Активируем секцию завершения викторины
                resetPlayerGameUI(); // Очищаем игровой UI, но это не должно затрагивать quizFinishedScreen
                
                // Явно устанавливаем финальный счет и отображаем таблицу лидеров
                finalPlayerScore.textContent = data.score || 0; 
                document.querySelector('#quizFinishedScreen p:first-of-type').style.display = 'block'; // "Ваш финальный счет: ..."
                document.querySelector('#quizFinishedScreen h3:last-of-type').style.display = 'block'; // "Итоговая таблица лидеров"
                finalLeaderboardListPlayer.style.display = 'block';
                playAgainBtn.style.display = 'block';

                updateLeaderboardPlayer(data.leaderboard, finalLeaderboardListPlayer, 10);
                console.log('[Player UI] Quiz finished. Final score displayed:', finalPlayerScore.textContent);
                break;
            case 'gameReset':
                alert(t('player.errors.resetByHost'));
                localStorage.removeItem('quizPersistentPlayerId');
                localStorage.removeItem('quizPlayerName');
                localStorage.removeItem('quizCode');
                location.reload();
                break;
            case 'hostDisconnected':
                console.log('[Player UI] Received hostDisconnected. Game Paused:', data.gamePaused);
                stopPlayerTimer();
                playerHasAnswered = false; 
                resetPlayerGameUI();

                if (data.gamePaused) {
                    showPlayerSection('gameScreen');
                    playerQuestionTitle.textContent = t('player.gameScreen.hostPaused');
                    playerQuestionTitle.classList.remove('hidden');
                    playerQuestionTitle.style.display = 'block';
                    feedbackMessage.textContent = data.message;
                    feedbackMessage.classList.add('error-message');
                    feedbackMessage.classList.remove('hidden');
                    feedbackMessage.style.display = 'block';
                } else {
                    joinError.textContent = data.message;
                    joinError.classList.remove('hidden');
                    joinError.style.display = 'block';
                    joinQuizBtn.disabled = false;
                    localStorage.removeItem('quizPersistentPlayerId');
                    localStorage.removeItem('quizPlayerName');
                    localStorage.removeItem('quizCode');
                    persistentId = null;
                    playerName = '';
                    quizCode = '';
                    playerNameInput.value = '';
                    quizCodeInput.value = '';
                    showPlayerSection('joinScreen');
                }
                break;
            case 'gameResumed':
                console.log('[Player UI] Received gameResumed. Game resumed.');
                resetPlayerGameUI(); // Очищаем UI перед показом нового состояния
                feedbackMessage.classList.add('hidden');
                feedbackMessage.style.display = 'none';
                playerQuestionTitle.textContent = t('player.gameScreen.hostResumed');
                playerQuestionTitle.classList.remove('hidden');
                playerQuestionTitle.style.display = 'block';
                submitAnswerBtn.classList.remove('hidden');
                submitAnswerBtn.style.display = 'block';
                submitAnswerBtn.disabled = true; // Пока ожидаем первый вопрос, кнопка неактивна
                break;

            case 'error':
                joinError.textContent = data.message;
                joinError.classList.remove('hidden');
                joinError.style.display = 'block';
                joinQuizBtn.disabled = false;
                localStorage.removeItem('quizPersistentPlayerId');
                localStorage.removeItem('quizPlayerName');
                localStorage.removeItem('quizCode');
                persistentId = null;
                playerName = '';
                quizCode = '';
                playerNameInput.value = '';
                quizCodeInput.value = '';
                showPlayerSection('joinScreen');
                console.error('[Player UI] Server error (generic):', data.message);
                break;
            case 'ping':
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'pong' }));
                    console.log('[Player UI] Player sent pong in response to ping.');
                }
                break;
        }
    };

    ws.onclose = () => {
        submitAnswerBtn.disabled = true;
        console.log('[Player UI] Disconnected from WebSocket server');
        
        if (persistentId) {
             console.log('[Player UI] Persistent ID found, connection lost. Player might rejoin on refresh.');
             joinQuizBtn.disabled = false;
             joinError.textContent = t('player.errors.connectionLost');
             joinError.classList.remove('hidden');
             joinError.style.display = 'block';
             showPlayerSection('joinScreen');
        } else {
            joinQuizBtn.disabled = true;
            showPlayerSection('joinScreen');
        }
    };

    ws.onerror = error => {
        console.error('[Player UI] WebSocket error:', error);
        joinQuizBtn.disabled = true;
    };

    joinQuizBtn.addEventListener('click', () => {
        console.log('[Player UI] Join button clicked!');
        playerName = playerNameInput.value.trim();
        quizCode = quizCodeInput.value.trim().toUpperCase();
        console.log('[Player UI] Player name read:', playerName);
        console.log('[Player UI] Quiz code read:', quizCode);

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            const currentWsState = ws ? ws.readyState : 'null/undefined';
            console.error('[Player UI] WebSocket connection is not open (readyState:', currentWsState, '). Cannot send join message.');
            joinError.textContent = t('player.gameScreen.lostConnectionError');
            joinError.classList.remove('hidden');
            joinError.style.display = 'block';
            joinQuizBtn.disabled = true;
            if (ws && (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING)) {
                console.warn('[Player UI] WebSocket is closed or closing. Suggesting page reload.');
            }
            return;
        }

        if (playerName && quizCode) {
            console.log('[Player UI] Condition (playerName && quizCode) is TRUE.');
            joinError.classList.add('hidden');
            joinError.style.display = 'none';
            const joinMessage = { type: 'playerJoin', name: playerName, quizCode: quizCode };
            if (persistentId) {
                joinMessage.rejoinPlayerId = persistentId;
            }

            try {
                console.log('[Player UI] Player sending join message:', joinMessage);
                ws.send(JSON.stringify(joinMessage));
                console.log('[Player UI] ws.send() executed successfully (no immediate error).');
                joinQuizBtn.disabled = true;
            } catch (e) {
                console.error('[Player UI] Error in ws.send() or JSON.stringify():', e);
                joinError.textContent = t('player.errors.sendDataError', {message: e.message});
                joinError.classList.remove('hidden');
                joinError.style.display = 'block';
                joinQuizBtn.disabled = false;
            }
        } else {
            console.log('[Player UI] Condition (playerName && quizCode) is FALSE. Showing error message.');
            joinError.textContent = t('player.errors.needNameAndCode');
            joinError.classList.remove('hidden');
            joinError.style.display = 'block';
        }
    });

    submitAnswerBtn.addEventListener('click', () => {
        let answer = null;
        if (currentQuestionType === 'radiogroup') {
            const selected = document.querySelector('input[name="answer"]:checked');
            if (selected) {
                answer = selected.value;
            }
        } else if (currentQuestionType === 'checkbox') {
            const selected = Array.from(document.querySelectorAll('input[name="answer"]:checked')).map(input => input.value);
            if (selected.length > 0) {
                answer = selected;
            }
        } else if (currentQuestionType === 'text') {
            answer = playerTextAnswer.value.trim();
        }

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.error('[Player UI] WebSocket connection is not open. Cannot send answer.');
            feedbackMessage.textContent = t('player.gameScreen.lostConnectionError');
            feedbackMessage.classList.add('error-message');
            feedbackMessage.classList.remove('hidden');
            feedbackMessage.style.display = 'block';
            submitAnswerBtn.disabled = true;
            return;
        }

        if (answer !== null && (Array.isArray(answer) ? answer.length > 0 : answer !== '')) {
            try {
                ws.send(JSON.stringify({ type: 'playerAnswer', wsId: wsId, questionName: currentQuestionName, answer: answer }));
                submitAnswerBtn.disabled = true;
                playerHasAnswered = true; // Устанавливаем флаг, что игрок ответил
                feedbackMessage.textContent = t('player.gameScreen.answerAccepted');
                feedbackMessage.classList.add('success-message');
                feedbackMessage.classList.remove('hidden');
                feedbackMessage.style.display = 'block';
                 playerAnswerOptions.querySelectorAll('.answer-option-label').forEach(lbl => {
                    lbl.classList.add('answer-submitted-disabled');
                });
            } catch (e) {
                console.error('[Player UI] Error sending answer:', e);
                feedbackMessage.textContent = t('player.errors.sendDataError', {message: e.message});
                feedbackMessage.classList.add('error-message');
                feedbackMessage.classList.remove('hidden');
                feedbackMessage.style.display = 'block';
            }
        } else {
            feedbackMessage.textContent = t('player.gameScreen.pleaseProvide');
            feedbackMessage.classList.add('error-message');
            feedbackMessage.classList.remove('hidden');
            feedbackMessage.style.display = 'block';
        }
    });

    playAgainBtn.addEventListener('click', () => {
        localStorage.removeItem('quizPersistentPlayerId');
        localStorage.removeItem('quizPlayerName');
        localStorage.removeItem('quizCode');
        location.reload();
    });

    function updateLobbyPlayers(players) {
        lobbyPlayerList.innerHTML = '';
        players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player;
            lobbyPlayerList.appendChild(li);
        });
        lobbyPlayerCount.textContent = players.length;
    }

    function updateLeaderboardPlayer(leaderboardData, targetListElement, maxEntries = -1) {
        targetListElement.innerHTML = '';
        if (leaderboardData && leaderboardData.length > 0) {
            const displayData = maxEntries > 0 ? leaderboardData.slice(0, maxEntries) : leaderboardData;
            displayData.forEach((player, index) => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${index + 1}. ${player.name}</span> <span>${player.score} ${t('common.points')}</span>`;
                targetListElement.appendChild(li);
                setTimeout(() => {
                    li.classList.add('animated');
                }, index * 100);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = t('common.noPlayers');
            targetListElement.appendChild(li);
        }
        targetListElement.classList.add('leaderboard-list');
    }

    let playerTimerInterval = null;
    function startPlayerTimer(remainingDuration, totalDuration) {
        stopPlayerTimer();

        playerTimerContainer.classList.remove('hidden');
        playerTimerContainer.style.display = 'block';
        playerTimerContainer.classList.remove('warning', 'critical', 'expired');
        playerTimerText.textContent = Math.max(0, remainingDuration);

        const initialWidthPercentage = totalDuration > 0 ? (Math.max(0, remainingDuration) / totalDuration) * 100 : 0;

        playerTimerBar.style.width = `${initialWidthPercentage}%`;
        playerTimerBar.style.backgroundColor = '#4CAF50';
        playerTimerBar.style.transition = 'none';
        playerTimerBar.style.transformOrigin = 'right';

        void playerTimerBar.offsetWidth;

        if (remainingDuration > 0) {
            playerTimerBar.style.transition = `width ${remainingDuration}s linear, background-color 0.5s ease-in-out`;
            playerTimerBar.style.width = '0%';
        } else {
            playerTimerBar.style.width = '0%';
            playerTimerContainer.classList.add('expired');
        }

        let timeLeft = remainingDuration;
        playerTimerInterval = setInterval(() => {
            timeLeft--;
            playerTimerText.textContent = Math.max(0, timeLeft);
            playerTimerContainer.classList.toggle('warning', timeLeft <= 15 && timeLeft > 5);
            playerTimerContainer.classList.toggle('critical', timeLeft <= 5);
            if (timeLeft <= 0) {
                clearInterval(playerTimerInterval);
                playerTimerInterval = null;
                playerTimerText.textContent = '0';
                playerTimerBar.style.width = '0%';
                playerTimerContainer.classList.remove('warning', 'critical');
                playerTimerContainer.classList.add('expired');
            }
        }, 1000);
    }
    function stopPlayerTimer() {
        if (playerTimerInterval) {
            clearInterval(playerTimerInterval);
            playerTimerInterval = null;
        }
        playerTimerContainer.classList.add('hidden');
        playerTimerContainer.style.display = 'none';
        playerTimerContainer.classList.remove('warning', 'critical', 'expired');
        playerTimerBar.style.transition = 'none';
        playerTimerBar.style.width = '100%';
        playerTimerText.textContent = '';
        playerTimerBar.style.transformOrigin = 'right';
    }
});