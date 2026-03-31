document.addEventListener('DOMContentLoaded', () => {
    const adminStatus = document.getElementById('adminStatus');
    // Quiz List Elements
    const quizListSection = document.getElementById('quizListSection');
    const quizzesList = document.getElementById('quizzesList');
    const addNewQuizBtn = document.getElementById('addNewQuizBtn');
    // Quiz Editor Elements
    const quizEditorSection = document.getElementById('quizEditorSection');
    const editorTitle = document.getElementById('editorTitle');
    const currentQuizIdInput = document.getElementById('currentQuizId');
    const quizTitleInput = document.getElementById('quizTitle');
    const saveQuizBtn = document.getElementById('saveQuizBtn');
    const cancelEditQuizBtn = document.getElementById('cancelEditQuizBtn');
    // Question List Elements (within Quiz Editor)
    const questionsListContainer = document.getElementById('questionsListContainer');
    const questionsCountSpan = document.getElementById('questionsCount');
    const questionsList = document.getElementById('questionsList');
    const addNewQuestionBtn = document.getElementById('addNewQuestionBtn');
    // Question Editor Elements
    const questionEditorSection = document.getElementById('questionEditorSection');
    const questionEditorTitle = document.getElementById('questionEditorTitle');
    const currentQuestionIdInput = document.getElementById('currentQuestionId');
    const questionTextInput = document.getElementById('questionText');
    const questionTypeSelect = document.getElementById('questionType');
    const choicesContainer = document.getElementById('choicesContainer');
    const choicesInputList = document.getElementById('choicesInputList');
    const addChoiceBtn = document.getElementById('addChoiceBtn'); // Убедился, что это getElementById
    const correctAnswerTextInput = document.getElementById('correctAnswerText');
    const questionTimerInput = document.getElementById('questionTimer');
    const questionImageInput = document.getElementById('questionImage');
    const currentImagePreview = document.getElementById('currentImagePreview');
    const currentImagePreviewImg = currentImagePreview.querySelector('img');
    const clearImageBtn = document.getElementById('clearImageBtn');
    const saveQuestionBtn = document.getElementById('saveQuestionBtn');
    const cancelEditQuestionBtn = document.getElementById('cancelEditQuestionBtn');
    
    let currentQuiz = null; // The quiz being edited
    let editingQuestion = null; // The question being edited
    let originalImageUrlForEditing = null;

    // --- Utility Functions ---
    async function fetchData(url, options = {}) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            if (options.method === 'DELETE' || response.status === 204) return null; // No content for delete
            return await response.json();
        } catch (error) {
            console.error('Fetch error:', error);
            adminStatus.textContent = t('common.errorMsg', {message: error.message});
            adminStatus.style.backgroundColor = '#ffebee';
            adminStatus.style.color = '#d32f2f';
            throw error;
        }
    }

    function showStatus(message, isError = false) {
        adminStatus.textContent = message;
        adminStatus.style.backgroundColor = isError ? '#ffebee' : '#e0f7fa';
        adminStatus.style.color = isError ? '#d32f2f' : '#00796b';
        adminStatus.classList.remove('hidden');
        setTimeout(() => {
            adminStatus.classList.add('active');
        }, 10);
    }

    // --- Quiz List Management ---
    async function loadQuizzes() {
        showStatus(t('admin.messages.loadingQuizzes'));
        try {
            const quizzesData = await fetchData('/api/quizzes');
            quizzesList.innerHTML = '';
            if (quizzesData.length === 0) {
                quizzesList.innerHTML = `<li>${t('admin.quizList.noQuizzes')}</li>`;
            } else {
                quizzesData.forEach(quiz => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <span>${quiz.title} (${t('admin.quizList.questionsCount', {count: quiz.questionsCount})})</span>
                        <div>
                            <button data-id="${quiz.id}" class="edit-quiz-btn">${t('admin.quizList.editBtn')}</button>
                            <button data-id="${quiz.id}" class="delete-quiz-btn reset-button">${t('admin.quizList.deleteBtn')}</button>
                        </div>
                    `;
                    quizzesList.appendChild(li);
                });
            }
            showStatus(t('admin.messages.quizzesLoaded'));
        } catch (error) {
            showStatus(t('admin.messages.loadingQuizError', {message: error.message}), true);
        }
    }

    quizzesList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('edit-quiz-btn')) {
            const quizId = e.target.dataset.id;
            await editQuiz(quizId);
        } else if (e.target.classList.contains('delete-quiz-btn')) {
            const quizId = e.target.dataset.id;
            if (confirm(t('admin.messages.deleteQuizConfirm'))) {
                showStatus(t('admin.messages.deletingQuiz'));
                try {
                    await fetchData(`/api/quiz/${quizId}`, { method: 'DELETE' });
                    showStatus(t('admin.messages.quizDeleted'));
                    loadQuizzes();
                } catch (error) {
                    showStatus(t('common.errorMsg', {message: error.message}), true);
                }
            }
        }
    });

    addNewQuizBtn.addEventListener('click', () => {
        currentQuiz = null;
        editorTitle.textContent = t('admin.quizEditor.createNewTitle');
        currentQuizIdInput.value = '';
        quizTitleInput.value = '';
        questionsListContainer.classList.add('hidden'); // Hide questions list for new quiz
        showSection(quizEditorSection);
    });

    // --- Quiz Editor Management ---
    async function editQuiz(quizId) {
        showStatus(t('admin.messages.loadingQuiz'));
        try {
            currentQuiz = await fetchData(`/api/quiz/${quizId}`);
            editorTitle.textContent = t('admin.quizEditor.editTitle', {title: currentQuiz.title});
            currentQuizIdInput.value = currentQuiz.id;
            quizTitleInput.value = currentQuiz.title;
            questionsListContainer.classList.remove('hidden'); // Make questions list visible
            loadQuestions(currentQuiz.questions);
            showSection(quizEditorSection);
            showStatus(t('admin.messages.quizLoaded', {title: currentQuiz.title}));
        } catch (error) {
            showStatus(t('common.errorMsg', {message: error.message}), true);
        }
    }

    saveQuizBtn.addEventListener('click', async () => {
        const title = quizTitleInput.value.trim();
        if (!title) {
            showStatus(t('admin.messages.titleEmpty'), true);
            return;
        }
        showStatus(t('admin.messages.savingQuiz'));
        try {
            if (currentQuiz) { // Update existing quiz
                await fetchData(`/api/quiz/${currentQuiz.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title })
                });
                showStatus(t('admin.messages.quizUpdated'));
            } else { // Create new quiz
                const newQuiz = await fetchData('/api/quiz', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title })
                });
                currentQuiz = newQuiz;
                currentQuizIdInput.value = newQuiz.id;
                questionsListContainer.classList.remove('hidden'); // Show questions list after creating a new quiz
                questionsCountSpan.textContent = '0';
                questionsList.innerHTML = `<li>${t('admin.quizEditor.noQuestions')}</li>`;
                showStatus(t('admin.messages.quizCreated'));
            }
            loadQuizzes(); // Refresh quiz list
            editorTitle.textContent = t('admin.quizEditor.editTitle', {title: currentQuiz.title}); // Update title
        } catch (error) {
            showStatus(t('common.errorMsg', {message: error.message}), true);
        }
    });

    cancelEditQuizBtn.addEventListener('click', () => {
        currentQuiz = null;
        showSection(quizListSection);
    });

    // --- Question List Management ---
    function loadQuestions(questions) {
        questionsList.innerHTML = '';
        questionsCountSpan.textContent = questions ? questions.length : 0;
        if (!questions || questions.length === 0) {
            questionsList.innerHTML = `<li>${t('admin.quizEditor.noQuestions')}</li>`;
        } else {
            questions.forEach(question => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${t('admin.quizEditor.questionInfo', {title: question.title, type: question.type, timer: question.timer})}</span>
                    <div>
                        <button data-id="${question.id}" class="edit-question-btn">${t('admin.quizList.editBtn')}</button>
                        <button data-id="${question.id}" class="delete-question-btn reset-button">${t('admin.quizList.deleteBtn')}</button>
                    </div>
                `;
                questionsList.appendChild(li);
            });
        }
    }

    questionsList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('edit-question-btn')) {
            const questionId = e.target.dataset.id;
            editingQuestion = currentQuiz.questions.find(q => q.id === questionId);
            if (editingQuestion) {
                fillQuestionForm(editingQuestion);
                showSection(questionEditorSection);
            }
        } else if (e.target.classList.contains('delete-question-btn')) {
            const questionId = e.target.dataset.id;
            if (confirm(t('admin.messages.deleteQuestionConfirm'))) {
                showStatus(t('admin.messages.deletingQuestion'));
                try {
                    await fetchData(`/api/quiz/${currentQuiz.id}/question/${questionId}`, { method: 'DELETE' });
                    showStatus(t('admin.messages.questionDeleted'));
                    currentQuiz.questions = currentQuiz.questions.filter(q => q.id !== questionId); // Update in-memory
                    loadQuestions(currentQuiz.questions);
                } catch (error) {
                    showStatus(t('common.errorMsg', {message: error.message}), true);
                }
            }
        }
    });

    addNewQuestionBtn.addEventListener('click', () => {
        if (!currentQuiz) {
            showStatus(t('admin.messages.selectQuizFirst'), true);
            return;
        }
        editingQuestion = null;
        fillQuestionForm(null); // Clear form for new question
        showSection(questionEditorSection);
    });

    // --- Question Editor Management ---
    questionTypeSelect.addEventListener('change', () => {
        if (questionTypeSelect.value === 'radiogroup' || questionTypeSelect.value === 'checkbox') {
            choicesContainer.classList.remove('hidden');
        } else {
            choicesContainer.classList.add('hidden');
        }
    });

    addChoiceBtn.addEventListener('click', () => {
        addChoiceInput();
    });

    choicesInputList.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-choice-btn')) {
            e.target.closest('.choice-input-item').remove();
        }
    });

    function addChoiceInput(value = '') {
        const div = document.createElement('div');
        div.classList.add('choice-input-item');
        div.innerHTML = `
            <input type="text" value="${value}" placeholder="${t('admin.questionEditor.choicePlaceholder')}">
            <button type="button" class="remove-choice-btn reset-button">${t('admin.questionEditor.removeChoiceBtn')}</button>
        `;
        choicesInputList.appendChild(div);
    }

    function fillQuestionForm(question) {
        questionEditorTitle.textContent = question ? t('admin.questionEditor.editTitle') : t('admin.questionEditor.createNewTitle');
        currentQuestionIdInput.value = question ? question.id : '';
        questionTextInput.value = question ? question.title : '';
        questionTypeSelect.value = question ? question.type : 'radiogroup';
        questionTimerInput.value = question ? question.timer : 15;
        questionImageInput.value = ''; // Clear file input

        // Handle choices
        choicesInputList.innerHTML = '';
        if (question && (question.type === 'radiogroup' || question.type === 'checkbox') && question.choices) {
            question.choices.forEach(choice => addChoiceInput(choice));
            choicesContainer.classList.remove('hidden');
        } else {
            choicesContainer.classList.add('hidden');
        }

        // Handle correct answer
        if (question && question.correctAnswer) {
            // ИСПРАВЛЕНО: УДАЛЕН ЛИШНИЙ ТЕРНАРНЫЙ ОПЕРАТОР
            correctAnswerTextInput.value = Array.isArray(question.correctAnswer) ? question.correctAnswer.join(', ') : question.correctAnswer;
        } else {
            correctAnswerTextInput.value = '';
        }

        // Handle image preview and NEW: store original image URL
        if (question && question.imageUrl) {
            currentImagePreviewImg.src = question.imageUrl;
            currentImagePreview.classList.remove('hidden');
            originalImageUrlForEditing = question.imageUrl;
        } else {
            currentImagePreviewImg.src = '';
            currentImagePreview.classList.add('hidden');
            originalImageUrlForEditing = null;
        }
        questionTypeSelect.dispatchEvent(new Event('change')); // Trigger change to show/hide choices
    }

    saveQuestionBtn.addEventListener('click', async () => {
        const title = questionTextInput.value.trim();
        const type = questionTypeSelect.value;
        const timer = parseInt(questionTimerInput.value);
        const imageFile = questionImageInput.files[0];
        
        const shouldClearImageOnServer = currentImagePreview.classList.contains('hidden') && !imageFile && originalImageUrlForEditing;

        if (!title) {
            showStatus(t('admin.messages.questionTextEmpty'), true);
            return;
        }
        if (isNaN(timer) || timer < 5) {
            showStatus(t('admin.messages.timerInvalid'), true);
            return;
        }

        let choices = [];
        if (type === 'radiogroup' || type === 'checkbox') {
            const choiceInputs = choicesInputList.querySelectorAll('.choice-input-item input[type="text"]');
            choices = Array.from(choiceInputs).map(input => input.value.trim()).filter(Boolean);
            if (choices.length < 2) {
                showStatus(t('admin.messages.choicesNeedTwo'), true);
                return;
            }
        }

        let correctAnswer;
        const rawCorrectAnswer = correctAnswerTextInput.value.trim();
        if (type === 'checkbox') {
            correctAnswer = rawCorrectAnswer.split(',').map(s => s.trim()).filter(Boolean);
            if (correctAnswer.length === 0) {
                showStatus('Для вопросов с множественным выбором укажите хотя бы один правильный ответ!', true);
                return;
            }
        } else { // radiogroup or text
            correctAnswer = rawCorrectAnswer;
            if (!correctAnswer) {
                showStatus('Укажите правильный ответ!', true);
                return;
            }
        }

        const formData = new FormData();
        formData.append('title', title);
        formData.append('type', type);
        formData.append('timer', timer);
        formData.append('choices', JSON.stringify(choices));
        formData.append('correctAnswer', JSON.stringify(correctAnswer));

        if (imageFile) {
            formData.append('image', imageFile);
        } else if (shouldClearImageOnServer) {
            formData.append('clearImage', 'true');
        }

        showStatus(t('admin.messages.savingQuestion'));
        try {
            if (editingQuestion) { // Update existing question
                await fetchData(`/api/quiz/${currentQuiz.id}/question/${editingQuestion.id}`, {
                    method: 'PUT',
                    body: formData
                });
                showStatus(t('admin.messages.questionUpdated'));
            } else { // Create new question
                const newQuestion = await fetchData(`/api/quiz/${currentQuiz.id}/question`, {
                    method: 'POST',
                    body: formData
                });
                currentQuiz.questions.push(newQuestion);
                showStatus(t('admin.messages.questionCreated'));
            }
            originalImageUrlForEditing = null; 
            loadQuestions(currentQuiz.questions);
            showSection(quizEditorSection);
        } catch (error) {
            showStatus(t('common.errorMsg', {message: error.message}), true);
        }
    });

    cancelEditQuestionBtn.addEventListener('click', () => {
        originalImageUrlForEditing = null;
        showSection(quizEditorSection);
    });

    clearImageBtn.addEventListener('click', () => {
        questionImageInput.value = '';
        currentImagePreview.classList.add('hidden');
        currentImagePreviewImg.src = '';
    });

    // --- Section Visibility Management ---
    function showSection(sectionToShow) {
        const sections = [quizListSection, quizEditorSection, questionEditorSection];
        sections.forEach(section => {
            section.classList.remove('active');
            section.classList.add('hidden');
        });
        sectionToShow.classList.remove('hidden');
        setTimeout(() => {
            sectionToShow.classList.add('active');
        }, 10);
    }

    // Initial load
    loadQuizzes();
    showSection(quizListSection);
});