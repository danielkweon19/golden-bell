const QUESTIONS = expandedQuestionBank.map((question, index) => ({
  ...question,
  id: index + 1,
  source: `${question.book} ${question.chapter}:${question.verse}${
    question.endVerse ? `-${question.endVerse}` : ""
  }`,
}));

const SESSION_KEY = "minor-prophets-recall-session-v2";
const ACCEPTED_KEY = "minor-prophets-recall-accepted-v2";

const state = {
  bible: null,
  deckIds: QUESTIONS.map((question) => question.id),
  index: 0,
  correctIds: new Set(),
  missed: new Map(),
  skippedIds: new Set(),
  acceptedAnswers: new Map(),
  practiceMode: false,
  practiceCorrectIds: new Set(),
  mainDeckIds: null,
  mainIndex: 0,
  pendingRejectedAnswer: "",
  advancing: false,
};

const elements = {
  loadingView: document.querySelector("#loading-view"),
  quizView: document.querySelector("#quiz-view"),
  finishView: document.querySelector("#finish-view"),
  progressLabel: document.querySelector("#progress-label"),
  bookLabel: document.querySelector("#book-label"),
  progressTrack: document.querySelector(".progress-track"),
  progressFill: document.querySelector("#progress-fill"),
  correctCount: document.querySelector("#correct-count"),
  missedCount: document.querySelector("#missed-count"),
  skippedCount: document.querySelector("#skipped-count"),
  questionSelect: document.querySelector("#question-select"),
  saveStatus: document.querySelector("#save-status"),
  source: document.querySelector("#source"),
  questionStatus: document.querySelector("#question-status"),
  questionText: document.querySelector("#question-text"),
  answerForm: document.querySelector("#answer-form"),
  answerLabel: document.querySelector("#answer-label"),
  answerInput: document.querySelector("#answer-input"),
  feedback: document.querySelector("#feedback"),
  markCorrectButton: document.querySelector("#mark-correct-button"),
  acceptAnswerButton: document.querySelector("#accept-answer-button"),
  nextButton: document.querySelector("#next-button"),
  shuffleButton: document.querySelector("#shuffle-button"),
  skipButton: document.querySelector("#skip-button"),
  inlineSkipButton: document.querySelector("#inline-skip-button"),
  emptyMissed: document.querySelector("#empty-missed"),
  missedList: document.querySelector("#missed-list"),
  missedAsideCount: document.querySelector("#missed-aside-count"),
  practiceMissedButton: document.querySelector("#practice-missed-button"),
  resetButton: document.querySelector("#reset-button"),
  finishSummary: document.querySelector("#finish-summary"),
  finishCorrect: document.querySelector("#finish-correct"),
  finishMissed: document.querySelector("#finish-missed"),
  finishSkipped: document.querySelector("#finish-skipped"),
  reviewContent: document.querySelector("#review-content"),
  finishPracticeButton: document.querySelector("#finish-practice-button"),
  finishResetButton: document.querySelector("#finish-reset-button"),
  toast: document.querySelector("#toast"),
};

let toastTimer;
let saveStatusTimer;

function normalizeAnswer(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !["a", "an", "the"].includes(word))
    .join(" ");
}

function questionById(id) {
  return QUESTIONS.find((question) => question.id === id);
}

function currentQuestion() {
  return questionById(state.deckIds[state.index]);
}

function answerIsCorrect(value, question) {
  const normalized = normalizeAnswer(value);
  const accepted = [
    ...question.answers,
    ...(state.acceptedAnswers.get(question.id) || []),
  ];
  return accepted.some((answer) => normalizeAnswer(answer) === normalized);
}

function getVerse(question) {
  const book = state.bible.books.find((item) => item.name === question.book);
  const chapter = book?.chapters[question.chapter - 1];
  if (!chapter) return "";

  return chapter.verses
    .filter(
      (verse) =>
        verse.num >= question.verse &&
        verse.num <= (question.endVerse || question.verse),
    )
    .map((verse) => verse.text)
    .join(" ");
}

function isComplete(questionId) {
  if (state.practiceMode) return state.practiceCorrectIds.has(questionId);
  return state.correctIds.has(questionId) || state.skippedIds.has(questionId);
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

function acceptedAnswersMarkup(question) {
  const answers = state.acceptedAnswers.get(question.id) || [];
  if (!answers.length) return "";

  const items = answers
    .map((answer) => `<li>${escapeHtml(answer)}</li>`)
    .join("");
  return `
    <div class="accepted-answers">
      <strong>Your accepted answers</strong>
      <ul>${items}</ul>
    </div>
  `;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2200);
}

function saveAcceptedAnswers() {
  try {
    localStorage.setItem(
      ACCEPTED_KEY,
      JSON.stringify(Object.fromEntries(state.acceptedAnswers)),
    );
  } catch {
    showToast("Accepted answers could not be saved.");
  }
}

function loadAcceptedAnswers() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCEPTED_KEY) || "{}");
    state.acceptedAnswers = new Map(
      Object.entries(saved).map(([id, answers]) => [Number(id), answers]),
    );
  } catch {
    state.acceptedAnswers = new Map();
  }
}

function saveSession() {
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        version: 2,
        deckIds: state.deckIds,
        index: state.index,
        correctIds: [...state.correctIds],
        missed: [...state.missed],
        skippedIds: [...state.skippedIds],
        practiceMode: state.practiceMode,
        practiceCorrectIds: [...state.practiceCorrectIds],
        mainDeckIds: state.mainDeckIds,
        mainIndex: state.mainIndex,
      }),
    );
    elements.saveStatus.textContent = "Progress saved";
    window.clearTimeout(saveStatusTimer);
    saveStatusTimer = window.setTimeout(() => {
      elements.saveStatus.textContent = "Progress saved in this browser";
    }, 1500);
  } catch {
    elements.saveStatus.textContent = "Progress could not be saved";
  }
}

function restoreSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!saved || saved.version !== 2) return;

    const validIds = new Set(QUESTIONS.map((question) => question.id));
    const restoredDeck = (saved.deckIds || []).filter((id) => validIds.has(id));
    if (restoredDeck.length !== QUESTIONS.length && !saved.practiceMode) return;

    state.deckIds = restoredDeck.length
      ? restoredDeck
      : QUESTIONS.map((question) => question.id);
    state.index = Math.min(
      Math.max(Number(saved.index) || 0, 0),
      state.deckIds.length,
    );
    state.correctIds = new Set(
      (saved.correctIds || []).filter((id) => validIds.has(id)),
    );
    state.missed = new Map(
      (saved.missed || []).filter(([id]) => validIds.has(Number(id))),
    );
    state.skippedIds = new Set(
      (saved.skippedIds || []).filter((id) => validIds.has(id)),
    );
    state.practiceMode = Boolean(saved.practiceMode);
    state.practiceCorrectIds = new Set(
      (saved.practiceCorrectIds || []).filter((id) => validIds.has(id)),
    );
    state.mainDeckIds = Array.isArray(saved.mainDeckIds)
      ? saved.mainDeckIds.filter((id) => validIds.has(id))
      : null;
    state.mainIndex = Number(saved.mainIndex) || 0;
  } catch {
    localStorage.removeItem(SESSION_KEY);
  }
}

function populateQuestionSelect() {
  elements.questionSelect.replaceChildren(
    ...QUESTIONS.map((question) => {
      const option = document.createElement("option");
      option.value = question.id;
      const shortQuestion =
        question.question.length > 58
          ? `${question.question.slice(0, 58)}...`
          : question.question;
      option.textContent = `${question.source} · ${shortQuestion}`;
      return option;
    }),
  );
}

function clearFeedback() {
  state.pendingRejectedAnswer = "";
  state.advancing = false;
  elements.feedback.hidden = true;
  elements.feedback.className = "feedback";
  elements.feedback.replaceChildren();
  elements.markCorrectButton.hidden = true;
  elements.acceptAnswerButton.hidden = true;
  elements.nextButton.hidden = true;
  elements.answerInput.disabled = false;
  elements.answerInput.value = "";
  elements.answerInput.removeAttribute("aria-invalid");
  elements.answerLabel.textContent = "Your answer";
}

function updateQuestionStatus(question) {
  elements.questionStatus.className = "question-status";
  if (state.practiceMode) {
    elements.questionStatus.textContent = "Review";
    return;
  }
  if (state.missed.has(question.id)) {
    elements.questionStatus.textContent = "Needs review";
    elements.questionStatus.classList.add("is-missed");
  } else if (state.correctIds.has(question.id)) {
    elements.questionStatus.textContent = "Completed";
    elements.questionStatus.classList.add("is-correct");
  } else if (state.skippedIds.has(question.id)) {
    elements.questionStatus.textContent = "Skipped";
  } else {
    elements.questionStatus.textContent = "Unanswered";
  }
}

function updateProgress(question) {
  const complete = state.deckIds.filter((id) => isComplete(id)).length;
  const percent = state.deckIds.length
    ? Math.round((complete / state.deckIds.length) * 100)
    : 0;

  elements.progressLabel.textContent = state.practiceMode
    ? `Missed practice · ${state.index + 1} of ${state.deckIds.length}`
    : `Question ${question.id} of ${QUESTIONS.length}`;
  elements.bookLabel.textContent = question.book;
  elements.progressFill.style.width = `${percent}%`;
  elements.progressTrack.setAttribute("aria-valuenow", String(percent));
}

function updateStats() {
  elements.correctCount.textContent = state.correctIds.size;
  elements.missedCount.textContent = state.missed.size;
  elements.skippedCount.textContent = state.skippedIds.size;
  elements.missedAsideCount.textContent = pluralize(
    state.missed.size,
    "question",
  );
  elements.emptyMissed.hidden = state.missed.size > 0;
  elements.practiceMissedButton.disabled = state.missed.size === 0;
  elements.practiceMissedButton.textContent = state.practiceMode
    ? "Return to main progress"
    : "Practice missed";
  elements.finishPracticeButton.disabled = state.missed.size === 0;
  elements.skipButton.disabled = state.practiceMode;
  elements.inlineSkipButton.disabled = state.practiceMode;

  elements.missedList.replaceChildren(
    ...[...state.missed.entries()].map(([id, entry]) => {
      const question = questionById(Number(id));
      const item = document.createElement("div");
      item.className = "missed-item";

      const openButton = document.createElement("button");
      openButton.className = "missed-question";
      openButton.type = "button";
      openButton.dataset.questionId = question.id;
      const source = document.createElement("strong");
      source.textContent = question.source;
      const prompt = document.createElement("span");
      prompt.textContent = question.question;
      openButton.append(source, prompt);

      const removeButton = document.createElement("button");
      removeButton.className = "missed-remove";
      removeButton.type = "button";
      removeButton.dataset.removeMissedId = question.id;
      removeButton.setAttribute(
        "aria-label",
        `Remove ${question.source} from review`,
      );
      removeButton.title = "Remove from review";
      removeButton.textContent = "×";

      item.append(openButton, removeButton);
      return item;
    }),
  );
}

function showCorrectFeedback(question, heading = "Correct.") {
  state.advancing = true;
  elements.answerInput.disabled = true;
  elements.answerInput.removeAttribute("aria-invalid");
  elements.feedback.className = "feedback correct";
  elements.feedback.hidden = false;
  elements.feedback.innerHTML = `
    <strong>${escapeHtml(heading)}</strong>
    <p><b>Official answer:</b> ${escapeHtml(question.displayAnswer)}</p>
    ${acceptedAnswersMarkup(question)}
    <p class="verse">“${escapeHtml(getVerse(question))}” — ${escapeHtml(
      question.source,
    )} NKJV</p>
  `;
  elements.markCorrectButton.hidden = true;
  elements.acceptAnswerButton.hidden = true;
  elements.nextButton.hidden = false;
  elements.nextButton.focus();
}

function renderQuestion() {
  const question = currentQuestion();
  if (!question) {
    if (state.practiceMode) {
      returnFromPractice();
    } else {
      showFinish();
    }
    return;
  }

  elements.finishView.hidden = true;
  elements.quizView.hidden = false;
  elements.source.textContent = question.source;
  elements.questionText.textContent = question.question;
  elements.questionSelect.value = String(question.id);
  clearFeedback();
  updateQuestionStatus(question);
  updateProgress(question);
  updateStats();

  if (!state.practiceMode && state.correctIds.has(question.id)) {
    showCorrectFeedback(question, "Completed question.");
  } else if (state.practiceMode && state.practiceCorrectIds.has(question.id)) {
    showCorrectFeedback(question, "Reviewed correctly.");
  } else {
    requestAnimationFrame(() => elements.answerInput.focus());
  }
}

function findNextUnanswered(startIndex) {
  if (!state.deckIds.length) return -1;
  for (let offset = 0; offset < state.deckIds.length; offset += 1) {
    const candidateIndex = (startIndex + offset) % state.deckIds.length;
    if (!isComplete(state.deckIds[candidateIndex])) return candidateIndex;
  }
  return -1;
}

function goToNextQuestion() {
  const nextIndex = findNextUnanswered(state.index + 1);
  if (nextIndex < 0) {
    state.index = state.deckIds.length;
  } else {
    state.index = nextIndex;
  }
  saveSession();
  renderQuestion();
}

function handleSubmit(event) {
  event.preventDefault();
  if (state.advancing) return;

  const question = currentQuestion();
  const value = elements.answerInput.value.trim();

  if (answerIsCorrect(value, question)) {
    if (state.practiceMode) {
      state.practiceCorrectIds.add(question.id);
    } else {
      state.correctIds.add(question.id);
      state.skippedIds.delete(question.id);
    }
    showCorrectFeedback(question);
    updateQuestionStatus(question);
    updateStats();
    saveSession();
    return;
  }

  const existing = state.missed.get(question.id);
  if (existing) {
    existing.attempts += 1;
    existing.answers.push(value);
  } else {
    state.missed.set(question.id, {
      attempts: 1,
      answers: [value],
    });
  }

  state.pendingRejectedAnswer = value;
  elements.answerInput.value = "";
  elements.answerInput.setAttribute("aria-invalid", "true");
  elements.answerLabel.textContent = "Try the same question again";
  elements.feedback.className = "feedback wrong";
  elements.feedback.hidden = false;
  elements.feedback.innerHTML = `
    <strong>Not quite.</strong>
    <p><b>Official answer:</b> ${escapeHtml(question.displayAnswer)}</p>
    ${acceptedAnswersMarkup(question)}
    <p><b>You entered:</b> ${value ? escapeHtml(value) : "No answer"}</p>
    <p class="verse">“${escapeHtml(getVerse(question))}” — ${escapeHtml(
      question.source,
    )} NKJV</p>
  `;
  elements.markCorrectButton.hidden = false;
  elements.acceptAnswerButton.hidden = !value;
  updateQuestionStatus(question);
  updateStats();
  saveSession();
  elements.answerInput.focus();
}

function markCurrentCorrect(acceptPermanently) {
  const question = currentQuestion();
  if (!question || (acceptPermanently && !state.pendingRejectedAnswer)) return;

  if (acceptPermanently) {
    const alternatives = state.acceptedAnswers.get(question.id) || [];
    const normalized = normalizeAnswer(state.pendingRejectedAnswer);
    const exists = alternatives.some(
      (answer) => normalizeAnswer(answer) === normalized,
    );
    if (!exists) {
      state.acceptedAnswers.set(question.id, [
        ...alternatives,
        state.pendingRejectedAnswer,
      ]);
      saveAcceptedAnswers();
    }
  }

  state.missed.delete(question.id);
  if (state.practiceMode) {
    state.practiceCorrectIds.add(question.id);
  } else {
    state.correctIds.add(question.id);
    state.skippedIds.delete(question.id);
  }

  showCorrectFeedback(
    question,
    acceptPermanently ? "Answer saved as valid." : "Marked correct.",
  );
  updateQuestionStatus(question);
  updateStats();
  saveSession();
}

function skipCurrentQuestion() {
  const question = currentQuestion();
  if (!question || state.advancing || state.practiceMode) return;
  state.skippedIds.add(question.id);
  saveSession();
  goToNextQuestion();
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function shuffleRemaining() {
  if (state.advancing) return;
  const complete = state.deckIds.filter((id) => isComplete(id));
  const remaining = state.deckIds.filter((id) => !isComplete(id));
  if (remaining.length < 2) {
    showToast("There are not enough remaining questions to shuffle.");
    return;
  }
  state.deckIds = [...complete, ...shuffle(remaining)];
  state.index = complete.length;
  saveSession();
  renderQuestion();
  showToast("Remaining questions shuffled.");
}

function goToQuestion(questionId) {
  if (state.practiceMode) returnFromPractice(false);
  const index = state.deckIds.indexOf(questionId);
  if (index < 0) return;
  state.index = index;
  saveSession();
  renderQuestion();
}

function startMissedPractice() {
  const missedIds = [...state.missed.keys()].map(Number);
  if (!missedIds.length) return;

  if (!state.practiceMode) {
    state.mainDeckIds = [...state.deckIds];
    state.mainIndex = state.index;
  }
  state.practiceMode = true;
  state.practiceCorrectIds = new Set();
  state.deckIds = missedIds;
  state.index = 0;
  saveSession();
  elements.finishView.hidden = true;
  elements.quizView.hidden = false;
  renderQuestion();
}

function toggleMissedPractice() {
  if (state.practiceMode) {
    returnFromPractice(false);
  } else {
    startMissedPractice();
  }
}

function returnFromPractice(showMessage = true) {
  state.practiceMode = false;
  state.practiceCorrectIds = new Set();
  state.deckIds =
    state.mainDeckIds || QUESTIONS.map((question) => question.id);
  state.index = state.mainIndex;
  state.mainDeckIds = null;
  saveSession();

  const nextIndex = findNextUnanswered(state.index);
  if (nextIndex < 0) {
    showFinish();
  } else {
    state.index = nextIndex;
    renderQuestion();
  }
  if (showMessage) showToast("Missed-question practice complete.");
}

function buildReviewSection(title, entries, type) {
  if (!entries.length) return "";
  const rows = entries
    .map(([id, entry]) => {
      const question = questionById(Number(id));
      const answerLine =
        type === "missed"
          ? `<p class="your-answer"><strong>Your first answer:</strong> ${escapeHtml(
              entry.answers[0] || "No answer",
            )}</p>`
          : "";
      return `
        <article class="review-row">
          <div class="review-source">${escapeHtml(question.source)}</div>
          <div>
            <p><strong>${escapeHtml(question.question)}</strong></p>
            ${answerLine}
            <p class="correct-answer"><strong>Answer:</strong> ${escapeHtml(
              question.displayAnswer,
            )}</p>
          </div>
        </article>
      `;
    })
    .join("");
  return `<section class="review-section"><h2>${title}</h2>${rows}</section>`;
}

function showFinish() {
  elements.quizView.hidden = true;
  elements.finishView.hidden = false;
  elements.finishCorrect.textContent = state.correctIds.size;
  elements.finishMissed.textContent = state.missed.size;
  elements.finishSkipped.textContent = state.skippedIds.size;
  elements.finishSummary.textContent =
    state.missed.size === 0
      ? "You completed the set without a recorded miss."
      : `You completed the set with ${pluralize(
          state.missed.size,
          "question",
        )} to review.`;

  const missedEntries = [...state.missed.entries()];
  const skippedEntries = [...state.skippedIds].map((id) => [id, {}]);
  elements.reviewContent.innerHTML =
    buildReviewSection("Missed questions", missedEntries, "missed") +
      buildReviewSection("Skipped questions", skippedEntries, "skipped") ||
    '<section class="review-section"><h2>No review needed</h2><p>Every question was answered correctly.</p></section>';
  updateStats();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetProgress() {
  const confirmed = window.confirm(
    "Reset all correct, missed, skipped, and saved session progress?",
  );
  if (!confirmed) return;

  localStorage.removeItem(SESSION_KEY);
  state.deckIds = QUESTIONS.map((question) => question.id);
  state.index = 0;
  state.correctIds = new Set();
  state.missed = new Map();
  state.skippedIds = new Set();
  state.practiceMode = false;
  state.practiceCorrectIds = new Set();
  state.mainDeckIds = null;
  state.mainIndex = 0;
  elements.finishView.hidden = true;
  elements.quizView.hidden = false;
  renderQuestion();
  showToast("Progress reset.");
}

async function initialize() {
  try {
    const response = await fetch("nkjv.json");
    if (!response.ok) throw new Error(`Bible data returned ${response.status}`);
    state.bible = await response.json();

    const missingReference = QUESTIONS.find((question) => !getVerse(question));
    if (missingReference) {
      throw new Error(`Missing reference: ${missingReference.source}`);
    }

    loadAcceptedAnswers();
    restoreSession();
    populateQuestionSelect();
    elements.loadingView.hidden = true;
    elements.quizView.hidden = false;

    if (state.index >= state.deckIds.length) {
      if (state.practiceMode) returnFromPractice();
      else showFinish();
    } else {
      renderQuestion();
    }
  } catch (error) {
    elements.loadingView.innerHTML = `
      <p><strong>The NKJV study data could not be loaded.</strong></p>
      <p>Refresh the page or run the site through a local web server.</p>
    `;
    console.error(error);
  }
}

elements.answerForm.addEventListener("submit", handleSubmit);
elements.answerInput.addEventListener("input", () => {
  elements.answerInput.removeAttribute("aria-invalid");
});
elements.nextButton.addEventListener("click", goToNextQuestion);
elements.markCorrectButton.addEventListener("click", () =>
  markCurrentCorrect(false),
);
elements.acceptAnswerButton.addEventListener("click", () =>
  markCurrentCorrect(true),
);
elements.skipButton.addEventListener("click", skipCurrentQuestion);
elements.inlineSkipButton.addEventListener("click", skipCurrentQuestion);
elements.shuffleButton.addEventListener("click", shuffleRemaining);
elements.questionSelect.addEventListener("change", (event) =>
  goToQuestion(Number(event.target.value)),
);
elements.practiceMissedButton.addEventListener("click", toggleMissedPractice);
elements.finishPracticeButton.addEventListener("click", startMissedPractice);
elements.resetButton.addEventListener("click", resetProgress);
elements.finishResetButton.addEventListener("click", resetProgress);
elements.missedList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-missed-id]");
  if (removeButton) {
    state.missed.delete(Number(removeButton.dataset.removeMissedId));
    updateStats();
    saveSession();
    return;
  }

  const questionButton = event.target.closest("[data-question-id]");
  if (questionButton) {
    goToQuestion(Number(questionButton.dataset.questionId));
  }
});

initialize();
