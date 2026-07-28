const questionBank = [
  {
    question: "What was the name of the woman Hosea took as his wife?",
    answers: ["Gomer", "Gomer the daughter of Diblaim"],
    displayAnswer: "Gomer",
    book: "Hosea",
    chapter: 1,
    verse: 3,
    testament: "Old Testament",
  },
  {
    question: "Hosea says God's people are destroyed for lack of what?",
    answers: ["knowledge"],
    displayAnswer: "Knowledge",
    book: "Hosea",
    chapter: 4,
    verse: 6,
    testament: "Old Testament",
  },
  {
    question: "What does the LORD desire instead of sacrifice?",
    answers: ["mercy"],
    displayAnswer: "Mercy",
    book: "Hosea",
    chapter: 6,
    verse: 6,
    testament: "Old Testament",
  },
  {
    question: "What does Hosea 10:12 tell people to sow for themselves?",
    answers: ["righteousness"],
    displayAnswer: "Righteousness",
    book: "Hosea",
    chapter: 10,
    verse: 12,
    testament: "Old Testament",
  },
  {
    question: "Out of what country did the LORD call His son?",
    answers: ["Egypt", "out of Egypt"],
    displayAnswer: "Egypt",
    book: "Hosea",
    chapter: 11,
    verse: 1,
    testament: "Old Testament",
  },
  {
    question: "Which high priest stood before the Angel of the LORD?",
    answers: ["Joshua", "Joshua the high priest"],
    displayAnswer: "Joshua",
    book: "Zechariah",
    chapter: 3,
    verse: 1,
    testament: "Old Testament",
  },
  {
    question: "The LORD's work is not by might or power, but by what?",
    answers: ["My Spirit", "the Spirit", "Spirit", "God's Spirit"],
    displayAnswer: "My Spirit",
    book: "Zechariah",
    chapter: 4,
    verse: 6,
    testament: "Old Testament",
  },
  {
    question: "What flying object did Zechariah see?",
    answers: ["a flying scroll", "flying scroll", "scroll"],
    displayAnswer: "A flying scroll",
    book: "Zechariah",
    chapter: 5,
    verse: 2,
    testament: "Old Testament",
  },
  {
    question: "What shall Jerusalem be called when the LORD returns to Zion?",
    answers: ["the City of Truth", "City of Truth"],
    displayAnswer: "The City of Truth",
    book: "Zechariah",
    chapter: 8,
    verse: 3,
    testament: "Old Testament",
  },
  {
    question: "What animal is Zion's King described as riding?",
    answers: ["a donkey", "donkey", "a colt", "colt", "the foal of a donkey"],
    displayAnswer: "A donkey",
    book: "Zechariah",
    chapter: 9,
    verse: 9,
    testament: "Old Testament",
  },
  {
    question: "Which of Esau and Jacob did the LORD say He loved?",
    answers: ["Jacob"],
    displayAnswer: "Jacob",
    book: "Malachi",
    chapter: 1,
    verse: 2,
    testament: "Old Testament",
  },
  {
    question: "What does the LORD God of Israel say that He hates?",
    answers: ["divorce"],
    displayAnswer: "Divorce",
    book: "Malachi",
    chapter: 2,
    verse: 16,
    testament: "Old Testament",
  },
  {
    question: "According to Malachi, how had the people robbed God?",
    answers: ["in tithes and offerings", "tithes and offerings"],
    displayAnswer: "In tithes and offerings",
    book: "Malachi",
    chapter: 3,
    verse: 8,
    testament: "Old Testament",
  },
  {
    question: "What was written before the LORD for those who feared Him?",
    answers: ["a book of remembrance", "book of remembrance"],
    displayAnswer: "A book of remembrance",
    book: "Malachi",
    chapter: 3,
    verse: 16,
    testament: "Old Testament",
  },
  {
    question: "Which prophet will be sent before the great and dreadful day of the LORD?",
    answers: ["Elijah", "Elijah the prophet"],
    displayAnswer: "Elijah the prophet",
    book: "Malachi",
    chapter: 4,
    verse: 5,
    testament: "Old Testament",
  },
];

const state = {
  currentIndex: 0,
  missed: [],
  bible: null,
  advancing: false,
};

const elements = {
  loadingView: document.querySelector("#loading-view"),
  quizView: document.querySelector("#quiz-view"),
  resultsView: document.querySelector("#results-view"),
  questionCount: document.querySelector("#question-count"),
  missCount: document.querySelector("#miss-count"),
  progressBar: document.querySelector("#progress-bar"),
  progressCopy: document.querySelector("#progress-copy"),
  questionLabel: document.querySelector("#question-label"),
  referenceHint: document.querySelector("#reference-hint"),
  questionText: document.querySelector("#question-text"),
  questionState: document.querySelector("#question-state"),
  answerForm: document.querySelector("#answer-form"),
  answerInput: document.querySelector("#answer-input"),
  feedback: document.querySelector("#feedback"),
  feedbackKicker: document.querySelector("#feedback-kicker"),
  feedbackTitle: document.querySelector("#feedback-title"),
  verseText: document.querySelector("#verse-text"),
  verseReference: document.querySelector("#verse-reference"),
  retryButton: document.querySelector("#retry-button"),
  resultsHeading: document.querySelector("#results-heading"),
  resultsCopy: document.querySelector("#results-copy"),
  scoreValue: document.querySelector("#score-value"),
  reviewCount: document.querySelector("#review-count"),
  reviewList: document.querySelector("#review-list"),
  restartButton: document.querySelector("#restart-button"),
};

function normalizeAnswer(value) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !["a", "an", "the"].includes(word))
    .join(" ");
}

function answerIsCorrect(value, acceptedAnswers) {
  const normalized = normalizeAnswer(value);
  return acceptedAnswers.some((answer) => normalizeAnswer(answer) === normalized);
}

function getVerse(question) {
  const book = state.bible.books.find((item) => item.name === question.book);
  const chapter = book?.chapters[question.chapter - 1];
  if (!question.endVerse) {
    return chapter?.verses.find((item) => item.num === question.verse)?.text;
  }

  return chapter?.verses
    .filter(
      (item) => item.num >= question.verse && item.num <= question.endVerse,
    )
    .map((item) => item.text)
    .join(" ");
}

function getReference(question) {
  const verseRange = question.endVerse
    ? `${question.verse}–${question.endVerse}`
    : question.verse;
  return `${question.book} ${question.chapter}:${verseRange} NKJV`;
}

function renderQuestion() {
  const question = questionBank[state.currentIndex];
  const completed = state.currentIndex;
  const percent = Math.round((completed / questionBank.length) * 100);

  state.advancing = false;
  elements.questionCount.textContent = `${state.currentIndex + 1} / ${questionBank.length}`;
  elements.missCount.textContent = state.missed.length;
  elements.progressBar.style.width = `${percent}%`;
  elements.progressCopy.textContent = `${percent}% complete`;
  elements.questionLabel.textContent = `Question ${String(state.currentIndex + 1).padStart(2, "0")}`;
  elements.referenceHint.textContent = question.testament;
  elements.questionText.textContent = question.question;
  elements.answerInput.value = "";
  elements.answerInput.removeAttribute("aria-invalid");
  elements.questionState.hidden = false;
  elements.feedback.hidden = true;
  elements.feedback.classList.remove("is-wrong");
  elements.retryButton.hidden = true;
  elements.answerInput.focus();
}

function showFeedback(question, isCorrect) {
  elements.questionState.hidden = true;
  elements.feedback.hidden = false;
  elements.feedback.classList.toggle("is-wrong", !isCorrect);
  elements.feedbackKicker.textContent = isCorrect ? "Correct" : "Review the answer";
  elements.feedbackTitle.textContent = isCorrect
    ? question.displayAnswer
    : `The answer is ${question.displayAnswer}.`;
  elements.verseText.textContent = `“${getVerse(question)}”`;
  elements.verseReference.textContent = getReference(question);
  elements.retryButton.hidden = isCorrect;
}

function handleSubmit(event) {
  event.preventDefault();
  if (state.advancing) return;

  const question = questionBank[state.currentIndex];
  const submittedAnswer = elements.answerInput.value.trim();

  if (!submittedAnswer) {
    elements.answerInput.setAttribute("aria-invalid", "true");
    elements.answerInput.focus();
    return;
  }

  const isCorrect = answerIsCorrect(submittedAnswer, question.answers);
  showFeedback(question, isCorrect);

  if (!isCorrect) {
    const alreadyMissed = state.missed.some(
      (missed) => missed.index === state.currentIndex,
    );
    if (!alreadyMissed) {
      state.missed.push({
        index: state.currentIndex,
        submittedAnswer,
        question: question.question,
        correctAnswer: question.displayAnswer,
        reference: getReference(question),
      });
      elements.missCount.textContent = state.missed.length;
    }
    return;
  }

  state.advancing = true;
  window.setTimeout(() => {
    state.currentIndex += 1;
    if (state.currentIndex === questionBank.length) {
      showResults();
    } else {
      renderQuestion();
    }
  }, 1100);
}

function retryQuestion() {
  elements.feedback.hidden = true;
  elements.questionState.hidden = false;
  elements.answerInput.value = "";
  elements.answerInput.removeAttribute("aria-invalid");
  elements.answerInput.focus();
}

function showResults() {
  const correctOnFirstTry = questionBank.length - state.missed.length;
  const missedLabel = `${state.missed.length} ${state.missed.length === 1 ? "miss" : "misses"}`;

  elements.quizView.hidden = true;
  elements.resultsView.hidden = false;
  elements.scoreValue.textContent = correctOnFirstTry;
  elements.reviewCount.textContent = missedLabel;

  if (state.missed.length === 0) {
    elements.resultsHeading.textContent = "Every answer, first try.";
    elements.resultsCopy.textContent =
      "You completed the session without missing a question.";
    elements.reviewList.innerHTML = `
      <div class="empty-review">
        <strong>No missed questions</strong>
        <span>Your review list is clear.</span>
      </div>
    `;
  } else {
    elements.resultsHeading.textContent = "Session complete.";
    elements.resultsCopy.textContent =
      `You corrected every answer. Review these ${missedLabel} before your next session.`;
    elements.reviewList.replaceChildren(
      ...state.missed.map((missed, position) => {
        const item = document.createElement("article");
        item.className = "review-item";

        const title = document.createElement("h3");
        title.textContent = `${position + 1}. ${missed.question}`;

        const yourAnswer = document.createElement("p");
        yourAnswer.className = "review-answer";
        yourAnswer.innerHTML = "<span>Your answer</span>";
        const yourValue = document.createElement("span");
        yourValue.textContent = missed.submittedAnswer;
        yourAnswer.append(yourValue);

        const correctAnswer = document.createElement("p");
        correctAnswer.className = "review-answer correct";
        correctAnswer.innerHTML = "<span>NKJV answer</span>";
        const correctValue = document.createElement("span");
        correctValue.textContent = `${missed.correctAnswer} · ${missed.reference}`;
        correctAnswer.append(correctValue);

        item.append(title, yourAnswer, correctAnswer);
        return item;
      }),
    );
  }

  elements.resultsView.scrollIntoView({ behavior: "smooth", block: "center" });
}

function restartQuiz() {
  state.currentIndex = 0;
  state.missed = [];
  state.advancing = false;
  elements.resultsView.hidden = true;
  elements.quizView.hidden = false;
  renderQuestion();
}

async function initialize() {
  try {
    const response = await fetch("nkjv.json");
    if (!response.ok) throw new Error(`Bible data returned ${response.status}`);
    state.bible = await response.json();

    const missingVerse = questionBank.find((question) => !getVerse(question));
    if (missingVerse) {
      throw new Error(`Missing verse: ${getReference(missingVerse)}`);
    }

    elements.loadingView.hidden = true;
    elements.quizView.hidden = false;
    renderQuestion();
  } catch (error) {
    elements.loadingView.innerHTML = `
      <p><strong>The NKJV study data could not be loaded.</strong></p>
      <p>Run this site through a local web server and refresh the page.</p>
    `;
    console.error(error);
  }
}

elements.answerForm.addEventListener("submit", handleSubmit);
elements.answerInput.addEventListener("input", () => {
  elements.answerInput.removeAttribute("aria-invalid");
});
elements.retryButton.addEventListener("click", retryQuestion);
elements.restartButton.addEventListener("click", restartQuiz);

initialize();
