// host.js - Финальная версия с исправлением процентов, таймера и логики паузы/возобновления
document.addEventListener('DOMContentLoaded', () => {
    const ws = new WebSocket(`ws://${location.hostname}:${location.port}`);
    const quizCodeSpan = document.getElementById('quizCode');
    const playerLinkSpan = document.getElementById('playerLink');
    const availableQuizzesSelect = document.getElementById('availableQuizzes');
    const selectedQuizTitleSpan = document.getElementById('selectedQuizTitle');
    const startGameBtn = document.getElementById('startGameBtn');
    const resetGameBtn = document.getElementById('resetGameBtn');
    const playerList = document.getElementById('playerList');
    const playerCountSpan = document.getElementById('playerCount');
    const gamePlaySection = document.getElementById('gamePlay');
    const questionTitle = document.getElementById('questionTitle');
    const nextQuestionBtn = document.getElementById('nextQuestionBtn');
    const showLeaderboardBtn = document.getElementById('showLeaderboardBtn');
    const leaderboardSection = document.getElementById('leaderboard');
    const leaderboardList = document.getElementById('leaderboardList');
    const quizEndSection = document.getElementById('quizEnd');
    const finalLeaderboardList = document.getElementById('finalLeaderboardList');
    const startNewGameBtn = document.getElementById('startNewGameBtn');
    const answeredPlayersCount = document.getElementById('answeredPlayersCount');
    const totalPlayersCount = document.getElementById('totalPlayersCount');
    const hostQuestionDetails = document.getElementById('hostQuestionDetails');
    const hostQuestionImage = document.getElementById('hostQuestionImage');
    const hostAnswerOptionsContainer = document.getElementById('hostAnswerOptionsContainer');
    const hostTimerContainer = document.getElementById('hostTimerContainer');
    const hostTimerBar = document.getElementById('hostTimerBar');
    const hostTimerText = document.getElementById('hostTimerText');
    const hostCorrectAnswerFeedback = document.getElementById('hostCorrectAnswerFeedback');

    const place1 = document.getElementById('place1');
    const place2 = document.getElementById('place2');
    const place3 = document.getElementById('place3');

    let currentQuestionIndex = -1;
    let totalQuizQuestions = 0;
    let selectedQuizId = null;
    let hostTimerInterval = null;
    let currentQuestionData = null;

    function showHostSection(sectionIdToShow) {
        const sections = document.querySelectorAll('.section');
        sections.forEach(section => {
            if (section.id === sectionIdToShow) {
                section.classList.remove('hidden');
                section.style.display = 'flex';
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

    // Вспомогательная функция для очистки UI игры (полностью скрывает все элементы геймплея)
    function resetGameUI() {
        stopHostTimer();
        hostQuestionDetails.classList.add('hidden');
        hostQuestionDetails.style.display = 'none';
        hostCorrectAnswerFeedback.classList.add('hidden');
        hostCorrectAnswerFeedback.style.display = 'none';
        hostAnswerOptionsContainer.innerHTML = '';
        hostAnswerOptionsContainer.classList.add('hidden');
        hostAnswerOptionsContainer.style.display = 'none';
        nextQuestionBtn.classList.add('hidden');
        nextQuestionBtn.style.display = 'none';
        showLeaderboardBtn.classList.add('hidden');
        showLeaderboardBtn.style.display = 'none';
        // leaderboardSection.classList.add('hidden'); // Убрано: showHostSection контролирует это
        // leaderboardSection.style.display = 'none'; // Убрано: showHostSection контролирует это
        // quizEndSection.classList.add('hidden'); // Убрано: showHostSection контролирует это
        // quizEndSection.style.display = 'none'; // Убрано: showHostSection контролирует это
        hostQuestionImage.classList.add('hidden');
        hostQuestionImage.style.display = 'none';
        hostTimerContainer.classList.add('hidden');
        hostTimerContainer.style.display = 'none';
        questionTitle.textContent = '';
        questionTitle.classList.add('hidden');
        questionTitle.style.display = 'none';
    }

    function setupLobby(data) {
        resetGameUI(); // Очищаем игровой UI
        showHostSection('quizSetup');
        
        availableQuizzesSelect.innerHTML = `<option value="">${t('host.selectDefault')}</option>`;
        if (Object.keys(data.availableQuizzes).length === 0) {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = t('host.none');
            availableQuizzesSelect.appendChild(option);
        } else {
            data.availableQuizzes.forEach(quiz => {
                const option = document.createElement('option');
                option.value = quiz.id;
                option.textContent = quiz.title;
                availableQuizzesSelect.appendChild(option);
            });
        }
        selectedQuizId = data.currentQuizId;
        if (selectedQuizId) {
            availableQuizzesSelect.value = selectedQuizId;
            selectedQuizTitleSpan.textContent = data.currentQuizTitle;
        } else {
            selectedQuizTitleSpan.textContent = t('host.none');
        }
        
        quizCodeSpan.textContent = data.quizCode;
        playerLinkSpan.innerHTML = `${location.protocol}//${location.hostname}:${location.port}/player.html`;
        updatePlayerList(data.players);
        startGameBtn.disabled = !selectedQuizId || data.players.length === 0;
        resetGameBtn.disabled = false;
    }

    function startHostTimer(remainingDuration, totalDuration) {
        stopHostTimer();

        console.log('[Host UI] Starting timer. Remaining:', remainingDuration, 'Total:', totalDuration);

        if (typeof remainingDuration !== 'number' || typeof totalDuration !== 'number' || totalDuration <= 0) {
            console.warn('[Host UI] Invalid timer duration received:', remainingDuration, totalDuration, 'Stopping timer.');
            hostTimerText.textContent = '0';
            hostTimerContainer.classList.add('hidden');
            hostTimerContainer.style.display = 'none';
            return;
        }

        hostTimerContainer.classList.remove('hidden');
        hostTimerContainer.style.display = 'block';
        hostTimerContainer.classList.remove('warning', 'critical', 'expired');

        let timeLeft = remainingDuration;
        
        const initialWidthPercentage = (timeLeft / totalDuration) * 100;
        hostTimerBar.style.width = `${initialWidthPercentage}%`;
        hostTimerBar.style.backgroundColor = '#4CAF50';
        hostTimerBar.style.transition = 'none';
        hostTimerBar.style.transformOrigin = 'right';

        void hostTimerBar.offsetWidth; 

        hostTimerText.textContent = timeLeft;

        hostTimerBar.style.transition = `width ${timeLeft}s linear, background-color 0.5s ease-in-out`;
        hostTimerBar.style.width = '0%';

        hostTimerInterval = setInterval(() => {
            timeLeft--;
            hostTimerText.textContent = Math.max(0, timeLeft);

            hostTimerContainer.classList.toggle('warning', timeLeft <= 15 && timeLeft > 5);
            hostTimerContainer.classList.toggle('critical', timeLeft <= 5);

            if (timeLeft <= 0) {
                clearInterval(hostTimerInterval);
                hostTimerInterval = null;
                timeLeft = 0;
                hostTimerText.textContent = '0';
                hostTimerContainer.classList.remove('warning', 'critical');
                hostTimerContainer.classList.add('expired');
            }
        }, 1000);
    }

    function stopHostTimer() {
        if (hostTimerInterval) {
            clearInterval(hostTimerInterval);
            hostTimerInterval = null;
            console.log('[Host UI] Host timer stopped.');
        }
        hostTimerContainer.classList.add('hidden');
        hostTimerContainer.style.display = 'none';
        hostTimerContainer.classList.remove('warning', 'critical', 'expired');
        hostTimerBar.style.transition = 'none';
        hostTimerBar.style.width = '100%';
        hostTimerBar.style.transformOrigin = 'right';
        hostTimerText.textContent = '';
    }

    function createAndAppendHostOption(container, choiceText, count, totalAnswered, correctAnswer, questionType) {
        const optionDiv = document.createElement('div');
        optionDiv.classList.add('option-block', 'host-answer-option');
        optionDiv.dataset.value = choiceText;

        let isOptionCorrect = false;
        if (questionType === 'checkbox') {
            isOptionCorrect = Array.isArray(correctAnswer) && correctAnswer.map(String).includes(String(choiceText));
        } else if (questionType === 'radiogroup') {
            isOptionCorrect = String(correctAnswer) === String(choiceText);
        }

        if (isOptionCorrect) {
            optionDiv.classList.add('correct-choice');
        }
        
        const percentage = totalAnswered > 0 ? ((count / totalAnswered) * 100).toFixed(1) : 0;

        optionDiv.innerHTML = `
            <span class="host-choice-text">${choiceText}</span>
            <span class="answer-stats">${percentage}% (${count} ответов)</span>
        `;
        container.appendChild(optionDiv);
    }

    function updatePlayerList(players) {
        playerList.innerHTML = '';
        players.forEach(name => {
            const li = document.createElement('li');
            li.id = `player-${name.replace(/\s/g, '-')}`;
            li.textContent = name;
            li.classList.add('player-list-item');
            playerList.appendChild(li);
        });
        playerCountSpan.textContent = players.length;
        const quizSetupSection = document.getElementById('quizSetup');
        if (quizSetupSection && !quizSetupSection.classList.contains('hidden')) {
           startGameBtn.disabled = !selectedQuizId || players.length === 0;
        }
    }

    function updateLeaderboard(leaderboardData, targetListElement, maxEntries = -1) {
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

    function renderPodium(leaderboardData) {
        const places = [place1, place2, place3];
        const delays = [1500, 500, 2500];

        // Скрываем все места на подиуме перед рендерингом
        places.forEach(p => {
            p.classList.add('hidden');
            p.classList.remove('animated');
            p.querySelector('.player-name').textContent = '';
            p.querySelector('.player-score').textContent = '';
        });

        if (leaderboardData && leaderboardData.length > 0) {
            const topPlayers = [
                leaderboardData[0],
                leaderboardData[1],
                leaderboardData[2]
            ];

            topPlayers.forEach((player, index) => {
                const podiumElement = [place1, place2, place3][index];
                if (player && podiumElement) {
                    podiumElement.classList.remove('hidden'); // Делаем элемент видимым
                    podiumElement.querySelector('.player-name').textContent = player.name;
                    podiumElement.querySelector('.player-score').textContent = ` + player.score + ' ' + t('common.points') + `;

                    setTimeout(() => {
                        podiumElement.classList.add('animated');
                    }, delays[index]);
                }
            });
        }
    }

    ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'hostConnect' }));
    };

    ws.onmessage = event => {
        const data = JSON.parse(event.data);
        console.log('Host received message:', data.type, data);
        switch (data.type) {
            case 'hostReady':
                console.log('[Host UI] Received hostReady. Game state:', {gameStarted: data.gameStarted, gamePaused: data.gamePaused, questionActive: data.questionActive, currentQuestionIndex: data.currentQuestionIndex});
                
                totalQuizQuestions = data.totalQuestions;
                currentQuestionIndex = data.currentQuestionIndex;
                selectedQuizId = data.currentQuizId;

                resetGameUI(); // Сначала полностью очищаем UI игрового процесса
                
                // Затем восстанавливаем состояние
                if (data.gameStarted) {
                    showHostSection('gamePlay');
                    startGameBtn.disabled = true;
                    resetGameBtn.disabled = false;
                    
                    questionTitle.classList.remove('hidden');
                    questionTitle.style.display = 'block';

                    if (data.gamePaused) {
                        questionTitle.textContent = t('host.hostDisconnectedGame');
                        nextQuestionBtn.textContent = t('host.resumeGame');
                        nextQuestionBtn.classList.remove('hidden');
                        nextQuestionBtn.style.display = 'block';
                        nextQuestionBtn.disabled = false;
                        
                    } else if (data.questionActive && data.currentQuestion) {
                        currentQuestionData = data.currentQuestion;
                        questionTitle.textContent = t('host.question', {index: currentQuestionIndex + 1, total: totalQuizQuestions, title: data.currentQuestion.title});

                        if (currentQuestionData.imageUrl) {
                            hostQuestionImage.src = currentQuestionData.imageUrl;
                            hostQuestionImage.classList.remove('hidden');
                            hostQuestionImage.style.display = 'block';
                        }
                        
                        const isChoiceQuestion = currentQuestionData.type === 'radiogroup' || currentQuestionData.type === 'checkbox';
                        if (isChoiceQuestion) {
                            hostAnswerOptionsContainer.classList.remove('hidden');
                            hostAnswerOptionsContainer.style.display = 'grid';
                            (currentQuestionData.choices || []).forEach(choice => {
                                const optionDiv = document.createElement('div');
                                optionDiv.classList.add('option-block', 'host-answer-option');
                                optionDiv.textContent = typeof choice === 'object' && 'text' in choice ? choice.text : choice;
                                hostAnswerOptionsContainer.appendChild(optionDiv);
                            });
                        } else if (currentQuestionData.type === 'text') {
                            hostAnswerOptionsContainer.classList.remove('hidden');
                            hostAnswerOptionsContainer.style.display = 'block';
                            const textInfo = document.createElement('p');
                            textInfo.classList.add('host-text-question-info');
                            textInfo.textContent = t('host.textAnswerWait');
                            hostAnswerOptionsContainer.appendChild(textInfo);
                        }

                        startHostTimer(data.currentQuestion.timer, data.currentQuestion.totalTimer); 
                        
                        if (data.answerStats || data.textAnswers) {
                            hostQuestionDetails.classList.remove('hidden');
                            hostQuestionDetails.style.display = 'block';
                            const correctAnswerText = Array.isArray(data.correctAnswer) ? data.correctAnswer.map(String).join(', ') : String(data.correctAnswer);
                            hostCorrectAnswerFeedback.innerHTML = `${t('host.correctAnswerFeedback')} <span class="highlight">${correctAnswerText}</span>`;
                            hostCorrectAnswerFeedback.classList.remove('hidden');
                            hostCorrectAnswerFeedback.style.display = 'block';
                            hostCorrectAnswerFeedback.classList.add('success-message');

                            hostAnswerOptionsContainer.innerHTML = '';
                            hostAnswerOptionsContainer.classList.remove('hidden');
                            hostAnswerOptionsContainer.style.display = 'grid';
                            
                            const totalAnswersSubmitted = data.totalAnswers || 0; 
                            
                            if ((currentQuestionData.type === 'radiogroup' || currentQuestionData.type === 'checkbox') && data.answerStats) {
                                const processedChoices = new Set();
                                (currentQuestionData.choices || []).forEach(choice => {
                                    const choiceValue = typeof choice === 'object' && 'value' in choice ? choice.value : (typeof choice === 'object' && 'text' in choice ? choice.text : String(choice));
                                    if (!processedChoices.has(choiceValue)) {
                                        const stats = data.answerStats[choiceValue] || { count: 0, players: [] };
                                        createAndAppendHostOption(hostAnswerOptionsContainer, choiceValue, stats.count, totalAnswersSubmitted, data.correctAnswer, currentQuestionData.type);
                                        processedChoices.add(choiceValue);
                                    }
                                });
                                for (const ansValue in data.answerStats) {
                                    if (!processedChoices.has(ansValue)) {
                                        const stats = data.answerStats[ansValue];
                                        createAndAppendHostOption(hostAnswerOptionsContainer, ansValue, stats.count, totalAnswersSubmitted, data.correctAnswer, currentQuestionData.type);
                                        processedChoices.add(ansValue);
                                    }
                                }
                            } else if (currentQuestionData.type === 'text' && data.textAnswers && data.textAnswers.length > 0) {
                                hostAnswerOptionsContainer.style.display = 'block';
                                const textAnswersHeader = document.createElement('h4');
                                textAnswersHeader.textContent = t('host.textAnswersLabel');
                                hostAnswerOptionsContainer.appendChild(textAnswersHeader);
                                const ul = document.createElement('ul');
                                ul.classList.add('host-text-answers-list');
                                data.textAnswers.forEach(ans => {
                                    const li = document.createElement('li');
                                    li.textContent = `${ans.name}: "${ans.answer}"`;
                                    ul.appendChild(li);
                                });
                                hostAnswerOptionsContainer.appendChild(ul);
                            } else if (totalAnswersSubmitted === 0 && (currentQuestionData.type === 'radiogroup' || currentQuestionData.type === 'checkbox' || currentQuestionData.type === 'text')) {
                                hostAnswerOptionsContainer.style.display = 'block';
                                const noAnswersMsg = document.createElement('p');
                                noAnswersMsg.classList.add('host-text-question-info');
                                noAnswersMsg.textContent = t('host.noAnswers');
                                hostAnswerOptionsContainer.appendChild(noAnswersMsg);
                            }
                            showLeaderboardBtn.classList.remove('hidden');
                            showLeaderboardBtn.style.display = 'block';
                            nextQuestionBtn.classList.remove('hidden');
                            nextQuestionBtn.style.display = 'block';
                            nextQuestionBtn.disabled = false;
                            nextQuestionBtn.textContent = (currentQuestionIndex + 1) < totalQuizQuestions ? t('host.nextQuestion') : t('host.finishQuiz');
                        }
                    } else {
                        // Игра начата, но вопрос еще не активен (между вопросами или только что начата)
                        questionTitle.textContent = t('host.waitingForQuestion', {questionIndex: currentQuestionIndex + 2});
                        if (currentQuestionIndex >= totalQuizQuestions - 1 && totalQuizQuestions > 0) {
                             showHostSection('quizEnd');
                             renderPodium(data.leaderboard);
                             updateLeaderboard(data.leaderboard, finalLeaderboardList, 10);
                             return;
                        }
                        nextQuestionBtn.textContent = (currentQuestionIndex + 1) < totalQuizQuestions ? t('host.nextQuestion') : t('host.finishQuiz');
                        if (currentQuestionIndex === -1) {
                            nextQuestionBtn.textContent = t('host.startFirstQuestion');
                        }
                        nextQuestionBtn.classList.remove('hidden');
                        nextQuestionBtn.style.display = 'block';
                        nextQuestionBtn.disabled = false;
                    }
                    updateLeaderboard(data.leaderboard, leaderboardList);
                } else {
                    setupLobby(data);
                }
                break;

            case 'quizSelected':
                selectedQuizTitleSpan.textContent = data.quizTitle;
                quizCodeSpan.textContent = data.quizCode;
                selectedQuizId = availableQuizzesSelect.value;
                startGameBtn.disabled = !selectedQuizId || playerList.children.length === 0;
                totalQuizQuestions = data.totalQuestions;
                console.log('[Host UI] Quiz selected:', data.quizCode, 'Total Questions:', totalQuizQuestions);
                break;

            case 'playerListUpdate':
                updatePlayerList(data.players);
                break;

            case 'gameStarted':
                console.log('[Host UI] Game started. Ready for first question.');
                resetGameUI(); // Очищаем UI перед показом нового состояния геймплея
                showHostSection('gamePlay');
                questionTitle.textContent = t('host.gameStartedMsg');
                questionTitle.classList.remove('hidden');
                questionTitle.style.display = 'block';
                nextQuestionBtn.textContent = t('host.startFirstQuestion');
                nextQuestionBtn.disabled = false;
                nextQuestionBtn.classList.remove('hidden');
                nextQuestionBtn.style.display = 'block';
                break;

            case 'questionStarted':
                console.log('[Host UI] Received questionStarted. Full question data:', data.question);
                stopHostTimer();

                hostAnswerOptionsContainer.innerHTML = '';
                hostAnswerOptionsContainer.classList.add('hidden');
                hostAnswerOptionsContainer.style.display = 'none';

                hostQuestionDetails.classList.add('hidden');
                hostQuestionDetails.style.display = 'none';
                hostCorrectAnswerFeedback.classList.add('hidden');
                hostCorrectAnswerFeedback.style.display = 'none';
                hostCorrectAnswerFeedback.textContent = '';

                nextQuestionBtn.classList.add('hidden');
                nextQuestionBtn.style.display = 'none';
                showLeaderboardBtn.classList.add('hidden');
                showLeaderboardBtn.style.display = 'none';
                leaderboardSection.classList.add('hidden');
                leaderboardSection.classList.remove('active');
                leaderboardSection.style.display = 'none';

                currentQuestionIndex = data.question.index;
                questionTitle.textContent = t('host.question', {index: currentQuestionIndex + 1, total: totalQuizQuestions, title: data.question.title});
                questionTitle.classList.remove('hidden');
                questionTitle.style.display = 'block';

                answeredPlayersCount.textContent = 0;
                totalPlayersCount.textContent = playerList.children.length;

                hostQuestionImage.classList.add('hidden');
                hostQuestionImage.src = '';
                if (data.question.imageUrl) {
                    hostQuestionImage.src = data.question.imageUrl;
                    hostQuestionImage.classList.remove('hidden');
                    hostQuestionImage.style.display = 'block';
                }
                currentQuestionData = data.question;

                const isChoiceQuestion = currentQuestionData.type === 'radiogroup' || currentQuestionData.type === 'checkbox';
                if (isChoiceQuestion) {
                    hostAnswerOptionsContainer.classList.remove('hidden');
                    hostAnswerOptionsContainer.style.display = 'grid';
                    const optionsArray = currentQuestionData.choices || [];

                    if (optionsArray.length > 0) {
                        optionsArray.forEach((choice) => {
                            const optionDiv = document.createElement('div');
                            optionDiv.classList.add('option-block', 'host-answer-option');
                            optionDiv.textContent = typeof choice === 'object' && 'text' in choice ? choice.text : choice;
                            hostAnswerOptionsContainer.appendChild(optionDiv);
                        });
                    } else {
                        hostAnswerOptionsContainer.textContent = t('player.gameScreen.noChoices');
                    }
                } else if (currentQuestionData.type === 'text') {
                    hostAnswerOptionsContainer.classList.remove('hidden');
                    hostAnswerOptionsContainer.style.display = 'block';
                    const textInfo = document.createElement('p');
                    textInfo.classList.add('host-text-question-info');
                    textInfo.textContent = t('host.textAnswerWait');
                    hostAnswerOptionsContainer.appendChild(textInfo);
                } else {
                    hostAnswerOptionsContainer.classList.add('hidden');
                    hostAnswerOptionsContainer.style.display = 'none';
                }
                startHostTimer(data.question.timer, data.question.totalTimer);
                break;

            case 'playerAnswered':
                answeredPlayersCount.textContent = data.currentAnswers;
                totalPlayersCount.textContent = data.totalPlayers;
                console.log(`[Host UI] Player ${data.name} answered. Current answered: ${data.currentAnswers}/${data.totalPlayers}`);

                const playerListItem = document.getElementById(`player-${data.name.replace(/\s/g, '-')}`);
                if (playerListItem) {
                    playerListItem.classList.add('player-answered');
                    setTimeout(() => {
                        playerListItem.classList.remove('player-answered');
                    }, 1000);
                }
                break;

            case 'questionEnded':
                console.log('[Host UI] Received questionEnded. Correct Answer:', data.correctAnswer, 'Answer Stats:', data.answerStats, 'Text Answers:', data.textAnswers, 'Total Answers:', data.totalAnswers);
                stopHostTimer();

                hostQuestionDetails.classList.remove('hidden');
                hostQuestionDetails.style.display = 'block';
                if (hostCorrectAnswerFeedback) {
                    const correctAnswerText = Array.isArray(data.correctAnswer)
                        ? data.correctAnswer.map(String).join(', ')
                        : String(data.correctAnswer);
                    hostCorrectAnswerFeedback.innerHTML = `${t('host.correctAnswerFeedback')} <span class="highlight">${correctAnswerText}</span>`;
                    hostCorrectAnswerFeedback.classList.remove('hidden');
                    hostCorrectAnswerFeedback.style.display = 'block';
                    hostCorrectAnswerFeedback.classList.add('success-message');
                }
                
                hostAnswerOptionsContainer.innerHTML = '';
                hostAnswerOptionsContainer.classList.remove('hidden');
                hostAnswerOptionsContainer.style.display = 'grid';

                const totalAnswersSubmitted = data.totalAnswers || 0; 
                
                if ((currentQuestionData.type === 'radiogroup' || currentQuestionData.type === 'checkbox') && data.answerStats) {
                    const processedChoices = new Set();

                    (currentQuestionData.choices || []).forEach(choice => {
                        const choiceValue = typeof choice === 'object' && 'value' in choice ? choice.value : (typeof choice === 'object' && 'text' in choice ? choice.text : String(choice));
                        if (!processedChoices.has(choiceValue)) {
                            const stats = data.answerStats[choiceValue] || { count: 0, players: [] };
                            createAndAppendHostOption(hostAnswerOptionsContainer, choiceValue, stats.count, totalAnswersSubmitted, data.correctAnswer, currentQuestionData.type);
                            processedChoices.add(choiceValue);
                        }
                    });
                    for (const ansValue in data.answerStats) {
                        if (!processedChoices.has(ansValue)) {
                            const stats = data.answerStats[ansValue];
                            createAndAppendHostOption(hostAnswerOptionsContainer, ansValue, stats.count, totalAnswersSubmitted, data.correctAnswer, currentQuestionData.type);
                            processedChoices.add(ansValue);
                        }
                    }

                } else if (currentQuestionData.type === 'text' && data.textAnswers && data.textAnswers.length > 0) {
                    hostAnswerOptionsContainer.style.display = 'block';
                    const textAnswersHeader = document.createElement('h4');
                    textAnswersHeader.textContent = t('host.textAnswersLabel');
                    hostAnswerOptionsContainer.appendChild(textAnswersHeader);
                    const ul = document.createElement('ul');
                    ul.classList.add('host-text-answers-list');
                    data.textAnswers.forEach(ans => {
                        const li = document.createElement('li');
                        li.textContent = `${ans.name}: "${ans.answer}"`;
                        ul.appendChild(li);
                    });
                    hostAnswerOptionsContainer.appendChild(ul);
                } else if (totalAnswersSubmitted === 0 && (currentQuestionData.type === 'radiogroup' || currentQuestionData.type === 'checkbox' || currentQuestionData.type === 'text')) {
                    hostAnswerOptionsContainer.style.display = 'block';
                    const noAnswersMsg = document.createElement('p');
                    noAnswersMsg.classList.add('host-text-question-info');
                    noAnswersMsg.textContent = t('host.noAnswers');
                    hostAnswerOptionsContainer.appendChild(noAnswersMsg);
                }
                
                leaderboardSection.classList.remove('hidden');
                leaderboardSection.style.display = 'flex';
                setTimeout(() => {
                    leaderboardSection.classList.add('active');
                }, 10);
                showLeaderboardBtn.classList.remove('hidden');
                showLeaderboardBtn.style.display = 'block';

                nextQuestionBtn.classList.remove('hidden');
                nextQuestionBtn.style.display = 'block';
                nextQuestionBtn.disabled = false;
                nextQuestionBtn.textContent = (currentQuestionIndex + 1) < totalQuizQuestions ? t('host.nextQuestion') : t('host.finishQuiz');
                break;

            case 'leaderboardUpdate':
                updateLeaderboard(data.leaderboard, leaderboardList);
                break;

            case 'quizFinished':
                console.log("Entering quizFinished handler for host.");
                console.log("Leaderboard data for host:", data.leaderboard);
                showHostSection('quizEnd'); // Активируем секцию завершения викторины
                resetGameUI(); // Очищаем игровой UI, но это не должно затрагивать quizEndSection
                
                // Явно убеждаемся, что все элементы внутри quizEndSection видимы
                document.querySelector('.podium-container').style.display = 'flex'; 
                // Эти элементы могут быть hidden из-за предыдущих resetGameUI, убеждаемся, что они block
                document.querySelector('#quizEnd h3').style.display = 'block'; 
                document.querySelector('#quizEnd p').style.display = 'block'; 
                document.querySelector('#quizEnd h4').style.display = 'block'; 
                finalLeaderboardList.style.display = 'block'; 
                startNewGameBtn.style.display = 'block';

                renderPodium(data.leaderboard); // Отрисовываем подиум
                updateLeaderboard(data.leaderboard, finalLeaderboardList, 10); // Отрисовываем финальную таблицу лидеров
                
                console.log('[Host UI] Quiz finished.');
                break;
            
            case 'gameResumed':
                console.log('[Host UI] Received gameResumed. Game unpaused.');
                resetGameUI(); // Очищаем UI перед показом нового состояния
                showHostSection('gamePlay');
                questionTitle.textContent = t('player.gameScreen.hostResumed');
                questionTitle.classList.remove('hidden');
                questionTitle.style.display = 'block';
                nextQuestionBtn.textContent = (currentQuestionIndex + 1) < totalQuizQuestions ? t('host.nextQuestion') : t('host.finishQuiz');
                nextQuestionBtn.classList.remove('hidden');
                nextQuestionBtn.style.display = 'block';
                nextQuestionBtn.disabled = false;
                break;

            case 'gameResetConfirmation': // FIX: Новый обработчик для хоста
                console.log('[Host UI] Received gameResetConfirmation. Reconnecting to get fresh lobby state.');
                // После подтверждения сброса, хост должен запросить новое состояние лобби.
                // Это эффективно переводит его в начальное состояние "как будто только что подключился".
                ws.send(JSON.stringify({ type: 'hostConnect' }));
                break;

            case 'error':
                alert(t('common.errorMsg', { message: data.message }));
                console.error('[Host UI] Server error:', data.message);
                break;

            case 'ping':
                break;
        }
    };

    ws.onclose = () => {
        startGameBtn.disabled = true;
        nextQuestionBtn.disabled = true;
        resetGameBtn.disabled = true;
        stopHostTimer();
        console.log('[Host UI] Disconnected from WebSocket server');
    };

    ws.onerror = error => {
        console.error('[Host UI] WebSocket error:', error);
    };

    availableQuizzesSelect.addEventListener('change', () => {
        selectedQuizId = availableQuizzesSelect.value;
        if (selectedQuizId) {
            ws.send(JSON.stringify({ type: 'selectQuiz', quizId: selectedQuizId }));
        } else {
            selectedQuizTitleSpan.textContent = t('host.none');
            startGameBtn.disabled = true;
        }
    });

    startGameBtn.addEventListener('click', () => {
        if (!selectedQuizId) {
            alert(t('host.selectDefault'));
            return;
        }
        if (playerList.children.length === 0) {
            alert(t('common.noPlayers'));
            return;
        }
        ws.send(JSON.stringify({ type: 'startGame' }));
    });

    nextQuestionBtn.addEventListener('click', () => {
        if (nextQuestionBtn.textContent === t('host.resumeGame')) {
            ws.send(JSON.stringify({ type: 'resumeGame' }));
        } else {
            ws.send(JSON.stringify({ type: 'nextQuestion' }));
        }
        nextQuestionBtn.disabled = true;
    });

    showLeaderboardBtn.addEventListener('click', () => {
        if (leaderboardSection.classList.contains('active')) {
            leaderboardSection.classList.remove('active');
            leaderboardSection.style.display = 'none';
            setTimeout(() => {
                leaderboardSection.classList.add('hidden');
            }, 500);
        } else {
            leaderboardSection.classList.remove('hidden');
            leaderboardSection.style.display = 'flex';
            setTimeout(() => {
                leaderboardSection.classList.add('active');
            }, 10);
        }
    });

    startNewGameBtn.addEventListener('click', () => {
        ws.send(JSON.stringify({ type: 'resetGame' }));
    });

    resetGameBtn.addEventListener('click', () => {
        if (confirm(t('host.resetConfirm'))) {
            ws.send(JSON.stringify({ type: 'resetGame' }));
        }
    });

    window.addEventListener('load', () => {
    });
});