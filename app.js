const SESSION_KEY = "minor-prophets-recall-session-v2";
const ACCEPTED_KEY = "minor-prophets-recall-accepted-v2";
const QUESTION_LIBRARY_KEY = "minor-prophets-recall-question-library-v1";
const QUESTION_MODE_KEY = "minor-prophets-recall-question-mode-v1";
const QUESTION_WORDING_KEY = "minor-prophets-recall-question-wording-v1";
const REFERENCE_DETAIL_KEY = "minor-prophets-recall-reference-detail-v1";
const SELECTED_BOOKS_KEY = "minor-prophets-recall-selected-books-v1";
const QUESTION_LIBRARY_ASSET = "question-library.json?v=20260812-1";
const BOOK_ORDER = ["Haggai", "Zechariah", "Malachi"];
const REFERENCE_DETAILS = ["book", "chapter", "verse"];

function emptyQuestionLibrary() {
  return {
    edits: {},
    fillEdits: {},
    removedStudy: [],
    removedFill: [],
    removedCustom: [],
    memorizationVersesByDetail: {
      book: [],
      chapter: [],
      verse: [],
    },
    custom: [],
  };
}

function normalizedQuestionLibrary(saved) {
  if (!saved || saved.version !== 1) return null;
  const legacyMemorizationVerses = Array.isArray(saved.memorizationVerses)
    ? [...new Set(saved.memorizationVerses.map(String).filter(Boolean))]
    : [];
  const savedVersesByDetail =
    saved.memorizationVersesByDetail &&
    typeof saved.memorizationVersesByDetail === "object"
      ? saved.memorizationVersesByDetail
      : {};
  return {
    edits:
      saved.edits && typeof saved.edits === "object" ? saved.edits : {},
    fillEdits:
      saved.fillEdits && typeof saved.fillEdits === "object"
        ? saved.fillEdits
        : {},
    removedStudy: Array.isArray(saved.removedStudy)
      ? saved.removedStudy.map(Number)
      : [],
    removedFill: Array.isArray(saved.removedFill)
      ? saved.removedFill.map(Number)
      : [],
    removedCustom: Array.isArray(saved.removedCustom)
      ? saved.removedCustom.map(Number)
      : [],
    memorizationVersesByDetail: Object.fromEntries(
      REFERENCE_DETAILS.map((detail) => {
        const verses = Array.isArray(savedVersesByDetail[detail])
          ? savedVersesByDetail[detail]
          : legacyMemorizationVerses;
        return [detail, [...new Set(verses.map(String).filter(Boolean))]];
      }),
    ),
    custom: Array.isArray(saved.custom) ? saved.custom : [],
  };
}

function mergeQuestionLibraries(defaults, local) {
  const customById = new Map(
    [...defaults.custom, ...local.custom]
      .filter((question) => question?.id)
      .map((question) => [Number(question.id), question]),
  );
  const removedCustom = [
    ...new Set([...defaults.removedCustom, ...local.removedCustom]),
  ];
  removedCustom.forEach((id) => customById.delete(id));

  return {
    edits: { ...defaults.edits, ...local.edits },
    fillEdits: { ...defaults.fillEdits, ...local.fillEdits },
    removedStudy: [
      ...new Set([...defaults.removedStudy, ...local.removedStudy]),
    ],
    removedFill: [
      ...new Set([...defaults.removedFill, ...local.removedFill]),
    ],
    removedCustom,
    memorizationVersesByDetail: Object.fromEntries(
      REFERENCE_DETAILS.map((detail) => [
        detail,
        local.memorizationVersesByDetail[detail].length
          ? local.memorizationVersesByDetail[detail]
          : defaults.memorizationVersesByDetail[detail],
      ]),
    ),
    custom: [...customById.values()],
  };
}

function questionSource(question) {
  if (question.scope === "book") return `${question.book} overview`;
  if (question.scope === "chapter") {
    return `${question.book} ${question.chapter} overview`;
  }
  return `${question.book} ${question.chapter}:${question.verse}${
    question.endVerse ? `-${question.endVerse}` : ""
  }`;
}

function loadQuestionLibrary(defaults) {
  try {
    const saved = normalizedQuestionLibrary(
      JSON.parse(localStorage.getItem(QUESTION_LIBRARY_KEY) || "null"),
    );
    return saved ? mergeQuestionLibraries(defaults, saved) : defaults;
  } catch {
    return defaults;
  }
}

async function loadBundledQuestions() {
  const response = await fetch(QUESTION_LIBRARY_ASSET);
  if (!response.ok) {
    throw new Error(`Question library returned ${response.status}`);
  }
  const exported = await response.json();
  if (
    exported?.format !== "golden-bell-question-export" ||
    exported.version !== 1
  ) {
    throw new Error("Unsupported bundled question library.");
  }
  const library = normalizedQuestionLibrary(exported.questionLibrary);
  if (!library) throw new Error("Invalid bundled question library.");
  return {
    library,
    acceptedAnswers: normalizedAcceptedAnswers(exported.acceptedAnswers),
  };
}

function hydrateQuestion(question, id) {
  const displayAnswer = String(question.displayAnswer || "").trim();
  const scope =
    question.scope ||
    (question.verse != null
      ? "verse"
      : question.chapter != null
        ? "chapter"
        : "book");
  const aliases = Array.isArray(question.aliases)
    ? question.aliases
    : Array.isArray(question.answers)
      ? question.answers.filter((answer) => answer !== question.displayAnswer)
      : [];
  const hydrated = {
    ...question,
    id,
    scope,
    chapter: scope === "book" ? undefined : Number(question.chapter),
    verse: scope === "verse" ? Number(question.verse) : undefined,
    endVerse:
      scope === "verse" && question.endVerse
        ? Number(question.endVerse)
        : undefined,
    question: String(question.question || "").trim(),
    alternateQuestion: String(question.alternateQuestion || "").trim(),
    displayAnswer,
    aliases: aliases.map(String).map((answer) => answer.trim()).filter(Boolean),
  };
  hydrated.answers = [hydrated.displayAnswer, ...hydrated.aliases];
  hydrated.source = questionSource(hydrated);
  return hydrated;
}

function compareQuestions(left, right) {
  const scopeOrder = { book: 0, chapter: 1, verse: 2 };
  return (
    BOOK_ORDER.indexOf(left.book) - BOOK_ORDER.indexOf(right.book) ||
    (left.chapter || 0) - (right.chapter || 0) ||
    (scopeOrder[left.scope] ?? 2) - (scopeOrder[right.scope] ?? 2) ||
    (left.verse || 0) - (right.verse || 0) ||
    (left.endVerse || left.verse || 0) -
      (right.endVerse || right.verse || 0) ||
    left.id - right.id
  );
}

let questionLibrary = emptyQuestionLibrary();
let bundledAcceptedAnswers = {};
const BASE_QUESTION_COUNT = expandedQuestionBank.length;
const STUDY_QUESTIONS = [];

let QUESTIONS = STUDY_QUESTIONS;
const QUESTION_BANKS = {
  study: STUDY_QUESTIONS,
  fill: [],
};
const READER_BOOKS = BOOK_ORDER;

function buildStudyQuestionBank() {
  STUDY_QUESTIONS.splice(
    0,
    STUDY_QUESTIONS.length,
    ...expandedQuestionBank
      .map((question, index) => {
        const id = index + 1;
        return hydrateQuestion(
          { ...question, ...(questionLibrary.edits[id] || {}) },
          id,
        );
      })
      .filter(
        (question) => !questionLibrary.removedStudy.includes(question.id),
      ),
  );

  questionLibrary.custom.forEach((question) => {
    if (
      !question?.id ||
      questionLibrary.removedCustom.includes(Number(question.id)) ||
      STUDY_QUESTIONS.some((item) => item.id === Number(question.id))
    ) {
      return;
    }
    STUDY_QUESTIONS.push(hydrateQuestion(question, Number(question.id)));
  });
  STUDY_QUESTIONS.sort(compareQuestions);
}

const state = {
  bible: null,
  questionMode: "study",
  questionWording: "preferred",
  referenceDetail: "verse",
  selectedBooks: new Set(BOOK_ORDER),
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
  readerOpen: false,
  readerBook: READER_BOOKS[0],
  readerChapter: 1,
  readerVerse: 1,
  editingQuestionId: null,
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
  questionModeSelect: document.querySelector("#question-mode-select"),
  bookFilter: document.querySelector("#book-filter"),
  bookFilterSummary: document.querySelector("#book-filter-summary"),
  selectAllBooks: document.querySelector("#select-all-books"),
  bookCheckboxes: document.querySelectorAll('input[name="study-book"]'),
  referenceDetailControl: document.querySelector(
    "#reference-detail-control",
  ),
  referenceDetailSelect: document.querySelector("#reference-detail-select"),
  questionWordingControl: document.querySelector("#question-wording-control"),
  questionWordingButtons: document.querySelectorAll(
    "[data-question-wording]",
  ),
  questionSelect: document.querySelector("#question-select"),
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
  previousQuestionButton: document.querySelector("#previous-question-button"),
  nextQuestionButton: document.querySelector("#next-question-button"),
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
  addQuestionButton: document.querySelector("#add-question-button"),
  exportQuestionsButton: document.querySelector("#export-questions-button"),
  importQuestionsButton: document.querySelector("#import-questions-button"),
  importQuestionsInput: document.querySelector("#import-questions-input"),
  editQuestionButton: document.querySelector("#edit-question-button"),
  deleteQuestionButton: document.querySelector("#delete-question-button"),
  openReaderButton: document.querySelector("#open-reader-button"),
  readerBackdrop: document.querySelector("#reader-backdrop"),
  readerPanel: document.querySelector("#reader-panel"),
  closeReaderButton: document.querySelector("#close-reader-button"),
  readerTitle: document.querySelector("#reader-title"),
  readerSelectionCount: document.querySelector("#reader-selection-count"),
  readerBookSelect: document.querySelector("#reader-book-select"),
  readerChapterSelect: document.querySelector("#reader-chapter-select"),
  previousChapterButton: document.querySelector("#previous-chapter-button"),
  nextChapterButton: document.querySelector("#next-chapter-button"),
  readerVerses: document.querySelector("#reader-verses"),
  questionDialog: document.querySelector("#question-dialog"),
  questionForm: document.querySelector("#question-form"),
  questionDialogTitle: document.querySelector("#question-dialog-title"),
  questionPromptLabel: document.querySelector("#question-prompt-label"),
  alternateQuestionField: document.querySelector(
    "#alternate-question-field",
  ),
  questionAnswerLabel: document.querySelector("#question-answer-label"),
  closeQuestionDialogButton: document.querySelector(
    "#close-question-dialog-button",
  ),
  saveQuestionButton: document.querySelector("#save-question-button"),
  questionScope: document.querySelector("#question-scope"),
  questionBook: document.querySelector("#question-book"),
  questionChapter: document.querySelector("#question-chapter"),
  questionVerse: document.querySelector("#question-verse"),
  questionEndVerse: document.querySelector("#question-end-verse"),
  questionPrompt: document.querySelector("#question-prompt"),
  alternateQuestionPrompt: document.querySelector(
    "#alternate-question-prompt",
  ),
  questionAnswer: document.querySelector("#question-answer"),
  questionAliases: document.querySelector("#question-aliases"),
  toast: document.querySelector("#toast"),
};

let toastTimer;

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

const BOOK_ABBREVIATIONS = {
  Haggai: "Hag",
  Zechariah: "Zech",
  Malachi: "Mal",
};

function makeReferenceQuestion(book, chapter, verse, id) {
  const displayAnswer = `${book} ${chapter}:${verse.num}`;
  return hydrateQuestion(
    {
      book,
      chapter,
      verse: verse.num,
      question: `“${verse.text}”`,
      displayAnswer,
      aliases: [`${BOOK_ABBREVIATIONS[book]} ${chapter}:${verse.num}`],
      generated: true,
    },
    id,
  );
}

function memorizationVerseKey(book, chapter, verse) {
  return `${book} ${chapter}:${verse}`;
}

function memorizationVersesForDetail(detail = state.referenceDetail) {
  return questionLibrary.memorizationVersesByDetail[detail];
}

function buildReferenceQuestionBank() {
  let id = 3_000_000;
  const selectedVerses = new Set(memorizationVersesForDetail());
  QUESTION_BANKS.fill = READER_BOOKS.flatMap((bookName) => {
    const book = bibleBook(bookName);
    return book.chapters.flatMap((chapter, chapterIndex) =>
      chapter.verses.map((verse) => {
        id += 1;
        const generated = makeReferenceQuestion(
          bookName,
          chapterIndex + 1,
          verse,
          id,
        );
        const edit = questionLibrary.fillEdits[id];
        return edit
          ? hydrateQuestion(
              {
                ...generated,
                ...edit,
                question: edit.question || generated.question,
                generated: true,
              },
              id,
            )
          : generated;
      }),
    );
  }).filter(
    (question) =>
      !questionLibrary.removedFill.includes(question.id) &&
      (!selectedVerses.size ||
        selectedVerses.has(
          memorizationVerseKey(
            question.book,
            question.chapter,
            question.verse,
          ),
        )),
  );
}

function questionById(id) {
  return QUESTIONS.find((question) => question.id === id);
}

function currentQuestion() {
  return questionById(state.deckIds[state.index]);
}

function eligibleQuestions() {
  return QUESTIONS.filter((question) => state.selectedBooks.has(question.book));
}

function answerIsCorrect(value, question) {
  const normalized = normalizeAnswer(value);
  const expectedAnswers =
    state.questionMode === "fill" &&
    question.generated &&
    state.referenceDetail !== "verse"
      ? [referenceAnswer(question), referenceAnswer(question, true)]
      : question.answers;
  const customAnswers =
    state.questionMode !== "fill" || state.referenceDetail === "verse"
      ? state.acceptedAnswers.get(question.id) || []
      : [];
  const accepted = [...expectedAnswers, ...customAnswers];
  return accepted.some((answer) => normalizeAnswer(answer) === normalized);
}

function referenceAnswer(question, abbreviated = false) {
  const book = abbreviated
    ? BOOK_ABBREVIATIONS[question.book] || question.book
    : question.book;
  if (state.referenceDetail === "book") return book;
  if (state.referenceDetail === "chapter") {
    return `${book} ${question.chapter}`;
  }
  return `${book} ${question.chapter}:${question.verse}`;
}

function officialAnswer(question) {
  return state.questionMode === "fill" &&
    question.generated &&
    state.referenceDetail !== "verse"
    ? referenceAnswer(question)
    : question.displayAnswer;
}

function referenceDetailLabel() {
  if (state.referenceDetail === "book") return "Book";
  if (state.referenceDetail === "chapter") return "Book and chapter";
  return "Book, chapter, and verse";
}

function displayedQuestion(question) {
  return state.questionWording === "alternate" && question.alternateQuestion
    ? question.alternateQuestion
    : question.question;
}

function getVerse(question) {
  if (question.scope !== "verse") return "";
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

function bibleBook(bookName) {
  return state.bible?.books.find((book) => book.name === bookName);
}

function setSelectOptions(select, values, selectedValue, label = String) {
  select.replaceChildren(
    ...values.map((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = label(value);
      return option;
    }),
  );
  select.value = String(selectedValue);
}

function populateEditorBooks(selectedBook = READER_BOOKS[0]) {
  setSelectOptions(
    elements.questionBook,
    READER_BOOKS,
    selectedBook,
    (book) => book,
  );
}

function populateEditorChapters(selectedChapter = 1) {
  const count = bibleBook(elements.questionBook.value)?.chapters.length || 1;
  const chapters = Array.from({ length: count }, (_, index) => index + 1);
  setSelectOptions(
    elements.questionChapter,
    chapters,
    Math.min(Number(selectedChapter) || 1, count),
  );
}

function populateEditorVerses(selectedVerse = 1, selectedEndVerse = "") {
  const chapter =
    bibleBook(elements.questionBook.value)?.chapters[
      Number(elements.questionChapter.value) - 1
    ];
  const verses = chapter?.verses.map((verse) => verse.num) || [1];
  const verse = verses.includes(Number(selectedVerse))
    ? Number(selectedVerse)
    : verses[0];
  setSelectOptions(elements.questionVerse, verses, verse);

  const validEndVerses = verses.filter((number) => number >= verse);
  elements.questionEndVerse.replaceChildren(
    Object.assign(document.createElement("option"), {
      value: "",
      textContent: "Same verse",
    }),
    ...validEndVerses
      .filter((number) => number > verse)
      .map((number) =>
        Object.assign(document.createElement("option"), {
          value: String(number),
          textContent: String(number),
        }),
      ),
  );
  elements.questionEndVerse.value = validEndVerses.includes(
    Number(selectedEndVerse),
  )
    ? String(selectedEndVerse)
    : "";
}

function updateEditorReferenceFields(lockReference = false) {
  const scope = elements.questionScope.value;
  elements.questionScope.disabled = lockReference;
  elements.questionBook.disabled = lockReference;
  elements.questionChapter.disabled = lockReference || scope === "book";
  elements.questionVerse.disabled = lockReference || scope !== "verse";
  elements.questionEndVerse.disabled = lockReference || scope !== "verse";
}

function openQuestionEditor(question = null) {
  if (!state.bible) return;
  const isReferenceQuestion = Boolean(question?.generated);
  state.editingQuestionId = question?.id || null;
  elements.questionDialogTitle.textContent = isReferenceQuestion
    ? "Edit verse question"
    : question
      ? "Edit question"
      : "Add question";
  elements.questionPromptLabel.textContent = isReferenceQuestion
    ? "Verse text"
    : "Preferred question";
  elements.alternateQuestionField.hidden = isReferenceQuestion;
  elements.questionAnswerLabel.textContent = isReferenceQuestion
    ? "Verse reference"
    : "Official answer";
  elements.saveQuestionButton.textContent = question
    ? "Save changes"
    : "Add question";

  const reference =
    question || currentQuestion() || eligibleQuestions()[0] || QUESTIONS[0];
  elements.questionScope.value = reference.scope || "verse";
  populateEditorBooks(reference.book);
  populateEditorChapters(reference.chapter || 1);
  populateEditorVerses(reference.verse || 1, reference.endVerse);
  updateEditorReferenceFields(isReferenceQuestion);
  elements.questionPrompt.value = question?.question || "";
  elements.alternateQuestionPrompt.value = question?.alternateQuestion || "";
  elements.questionAnswer.value = question?.displayAnswer || "";
  elements.questionAliases.value = question?.aliases?.join("\n") || "";
  elements.questionDialog.showModal();
  requestAnimationFrame(() => elements.questionPrompt.focus());
}

function closeQuestionEditor() {
  elements.questionDialog.close();
  state.editingQuestionId = null;
}

function questionFieldsFromEditor() {
  const scope = elements.questionScope.value;
  const endVerse = Number(elements.questionEndVerse.value);
  return {
    scope,
    book: elements.questionBook.value,
    chapter:
      scope === "book" ? undefined : Number(elements.questionChapter.value),
    verse:
      scope === "verse" ? Number(elements.questionVerse.value) : undefined,
    endVerse: scope === "verse" && endVerse ? endVerse : undefined,
    question: elements.questionPrompt.value.trim(),
    alternateQuestion: elements.alternateQuestionPrompt.value.trim(),
    displayAnswer: elements.questionAnswer.value.trim(),
    aliases: elements.questionAliases.value
      .split(/\r?\n/)
      .map((answer) => answer.trim())
      .filter(Boolean),
  };
}

function storedQuestion(question) {
  return {
    id: question.id,
    scope: question.scope,
    book: question.book,
    chapter: question.chapter,
    verse: question.verse,
    endVerse: question.endVerse,
    question: question.question,
    alternateQuestion: question.alternateQuestion,
    displayAnswer: question.displayAnswer,
    aliases: question.aliases,
  };
}

function saveQuestionLibrary() {
  try {
    localStorage.setItem(
      QUESTION_LIBRARY_KEY,
      JSON.stringify({ version: 1, ...questionLibrary }),
    );
    return true;
  } catch {
    showToast("Question changes could not be saved.");
    return false;
  }
}

function normalizedAcceptedAnswers(saved) {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  return Object.fromEntries(
    Object.entries(saved)
      .filter(([, answers]) => Array.isArray(answers))
      .map(([id, answers]) => [
        String(Number(id)),
        answers.map(String).map((answer) => answer.trim()).filter(Boolean),
      ])
      .filter(([id, answers]) => id !== "NaN" && answers.length),
  );
}

function exportQuestions() {
  const acceptedAnswers = normalizedAcceptedAnswers(
    Object.fromEntries(state.acceptedAnswers),
  );
  const exported = {
    format: "golden-bell-question-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    questionLibrary: { version: 1, ...questionLibrary },
    acceptedAnswers,
  };
  const date = exported.exportedAt.slice(0, 10);
  const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `golden-bell-questions-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Question export downloaded.");
}

async function importQuestions(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;

  try {
    const exported = JSON.parse(await file.text());
    if (
      exported?.format !== "golden-bell-question-export" ||
      exported.version !== 1
    ) {
      throw new Error("Unsupported question export.");
    }
    const importedLibrary = normalizedQuestionLibrary(
      exported.questionLibrary,
    );
    if (!importedLibrary) throw new Error("Invalid question library.");
    const acceptedAnswers = normalizedAcceptedAnswers(
      exported.acceptedAnswers,
    );
    const confirmed = window.confirm(
      "Replace the question changes saved in this browser with this export?",
    );
    if (!confirmed) return;

    localStorage.setItem(
      QUESTION_LIBRARY_KEY,
      JSON.stringify({ version: 1, ...importedLibrary }),
    );
    localStorage.setItem(ACCEPTED_KEY, JSON.stringify(acceptedAnswers));
    window.location.reload();
  } catch {
    showToast("That question export could not be imported.");
  }
}

function createQuestionId() {
  let id = Date.now();
  while (QUESTIONS.some((question) => question.id === id)) id += 1;
  return id;
}

function sortQuestionBankAndDecks() {
  const currentId = state.deckIds[state.index];
  QUESTIONS.sort(compareQuestions);
  const order = new Map(
    QUESTIONS.map((question, index) => [question.id, index]),
  );
  const sortIds = (ids) =>
    ids?.sort(
      (left, right) =>
        (order.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right) ?? Number.MAX_SAFE_INTEGER),
    );

  sortIds(state.deckIds);
  sortIds(state.mainDeckIds);
  if (currentId !== undefined) {
    state.index = Math.max(state.deckIds.indexOf(currentId), 0);
  }
}

function handleQuestionSave(event) {
  event.preventDefault();
  if (!elements.questionForm.reportValidity()) return;

  const fields = questionFieldsFromEditor();
  let question;
  let message;
  let removedFromSelection = false;

  if (state.editingQuestionId) {
    question = questionById(state.editingQuestionId);
    Object.assign(question, hydrateQuestion(fields, question.id));
    if (question.generated) {
      questionLibrary.fillEdits[question.id] = storedQuestion(question);
    } else if (question.id <= BASE_QUESTION_COUNT) {
      questionLibrary.edits[question.id] = storedQuestion(question);
    } else {
      const index = questionLibrary.custom.findIndex(
        (item) => Number(item.id) === question.id,
      );
      if (index >= 0) questionLibrary.custom[index] = storedQuestion(question);
    }
    message = "Question updated.";
    if (!state.selectedBooks.has(question.book)) {
      state.deckIds = state.deckIds.filter((id) => id !== question.id);
      state.mainDeckIds =
        state.mainDeckIds?.filter((id) => id !== question.id) || null;
      state.index = Math.min(
        state.index,
        Math.max(state.deckIds.length - 1, 0),
      );
      removedFromSelection = true;
    }
  } else {
    question = hydrateQuestion(fields, createQuestionId());
    QUESTIONS.push(question);
    questionLibrary.custom.push(storedQuestion(question));
    if (state.practiceMode && state.selectedBooks.has(question.book)) {
      state.mainDeckIds ||= expandedQuestionBank.map((_, index) => index + 1);
      state.mainDeckIds.push(question.id);
    } else if (state.selectedBooks.has(question.book)) {
      state.deckIds.push(question.id);
    }
    message = "Question added.";
  }

  sortQuestionBankAndDecks();
  if (!saveQuestionLibrary()) return;
  populateQuestionSelect();
  closeQuestionEditor();
  saveSession();
  if (state.selectedBooks.has(question.book)) goToQuestion(question.id);
  else renderQuestion();
  if (state.readerOpen) renderReader();
  showToast(
    removedFromSelection
      ? "Question updated and hidden by the current book filter."
      : message,
  );
}

function deleteCurrentQuestion() {
  const question = currentQuestion();
  if (!question) return;
  if (!window.confirm(`Delete the question for ${question.source}?`)) return;

  if (question.generated) {
    if (!questionLibrary.removedFill.includes(question.id)) {
      questionLibrary.removedFill.push(question.id);
    }
    delete questionLibrary.fillEdits[question.id];
  } else if (question.id <= BASE_QUESTION_COUNT) {
    if (!questionLibrary.removedStudy.includes(question.id)) {
      questionLibrary.removedStudy.push(question.id);
    }
    delete questionLibrary.edits[question.id];
  } else {
    questionLibrary.custom = questionLibrary.custom.filter(
      (item) => Number(item.id) !== question.id,
    );
    if (!questionLibrary.removedCustom.includes(question.id)) {
      questionLibrary.removedCustom.push(question.id);
    }
  }

  const questionIndex = QUESTIONS.indexOf(question);
  if (questionIndex >= 0) QUESTIONS.splice(questionIndex, 1);
  state.deckIds = state.deckIds.filter((id) => id !== question.id);
  state.mainDeckIds =
    state.mainDeckIds?.filter((id) => id !== question.id) || null;
  state.correctIds.delete(question.id);
  state.missed.delete(question.id);
  state.skippedIds.delete(question.id);
  state.practiceCorrectIds.delete(question.id);
  state.acceptedAnswers.delete(question.id);
  state.index = Math.min(state.index, Math.max(state.deckIds.length - 1, 0));

  if (!saveQuestionLibrary()) return;
  saveAcceptedAnswers();
  populateQuestionSelect();
  saveSession();
  if (state.readerOpen) renderReader();
  renderQuestion();
  showToast("Question deleted.");
}

function populateReaderBooks() {
  elements.readerBookSelect.replaceChildren(
    ...READER_BOOKS.map((bookName) => {
      const option = document.createElement("option");
      option.value = bookName;
      option.textContent = bookName;
      return option;
    }),
  );
}

function populateReaderChapters() {
  const book = bibleBook(state.readerBook);
  const chapterCount = book?.chapters.length || 0;
  elements.readerChapterSelect.replaceChildren(
    ...Array.from({ length: chapterCount }, (_, index) => {
      const option = document.createElement("option");
      option.value = String(index + 1);
      option.textContent = String(index + 1);
      return option;
    }),
  );
}

function updateReaderNavigation() {
  const bookIndex = READER_BOOKS.indexOf(state.readerBook);
  const book = bibleBook(state.readerBook);
  const chapter = book?.chapters[state.readerChapter - 1];
  const firstVerse = chapter?.verses[0]?.num || 1;
  const lastVerse = chapter?.verses.at(-1)?.num || 1;
  elements.previousChapterButton.disabled =
    bookIndex === 0 &&
    state.readerChapter === 1 &&
    state.readerVerse === firstVerse;
  elements.nextChapterButton.disabled =
    bookIndex === READER_BOOKS.length - 1 &&
    state.readerChapter === book.chapters.length &&
    state.readerVerse === lastVerse;
}

function questionsForReaderVerse(verseNumber) {
  return eligibleQuestions().filter(
    (question) =>
      question.scope === "verse" &&
      question.book === state.readerBook &&
      question.chapter === state.readerChapter &&
      verseNumber >= question.verse &&
      verseNumber <= (question.endVerse || question.verse),
  );
}

function goToQuestionFromReader(questions, verseNumber) {
  const target =
    questions.find((question) => !state.correctIds.has(question.id)) ||
    questions[0];
  state.readerVerse = verseNumber;
  goToQuestion(target.id);
  renderReader();
}

function toggleMemorizationVerse(book, chapter, verse) {
  const key = memorizationVerseKey(book, chapter, verse);
  const selected = new Set(memorizationVersesForDetail());
  if (selected.has(key)) selected.delete(key);
  else selected.add(key);
  questionLibrary.memorizationVersesByDetail[state.referenceDetail] = [
    ...selected,
  ];
  if (!saveQuestionLibrary()) return;

  if (state.questionMode === "fill") saveSession();
  buildReferenceQuestionBank();

  if (state.questionMode === "fill") {
    QUESTIONS = QUESTION_BANKS.fill;
    resetModeProgress();
    restoreSession();
    populateQuestionSelect();
    elements.finishView.hidden = true;
    elements.quizView.hidden = false;
    if (state.index >= state.deckIds.length) showFinish();
    else renderQuestion();
  }

  renderReader();
  showToast(
    selected.has(key)
      ? `${key} added to the memorization set.`
      : `${key} removed from the memorization set.`,
  );
}

function renderReader() {
  const book = bibleBook(state.readerBook);
  const chapter = book?.chapters[state.readerChapter - 1];
  if (!chapter) return;

  if (!chapter.verses.some((verse) => verse.num === state.readerVerse)) {
    state.readerVerse = chapter.verses[0].num;
  }

  elements.readerTitle.textContent =
    `${state.readerBook} ${state.readerChapter}:${state.readerVerse}`;
  const memorizationVerses = memorizationVersesForDetail();
  elements.readerSelectionCount.textContent = memorizationVerses.length
    ? `${pluralize(
        memorizationVerses.length,
        "verse",
      )} selected for ${referenceDetailLabel().toLowerCase()}`
    : "All verses included";
  elements.readerBookSelect.value = state.readerBook;
  populateReaderChapters();
  elements.readerChapterSelect.value = String(state.readerChapter);

  let highlightedRow = null;
  elements.readerVerses.replaceChildren(
    ...chapter.verses.map((verse) => {
      const questions = questionsForReaderVerse(verse.num);
      const row = document.createElement("div");
      let openVerseQuestion = null;
      row.className = "verse-row";
      if (questions.length) {
        row.classList.add("has-question");
        openVerseQuestion = () =>
          goToQuestionFromReader(questions, verse.num);
        row.addEventListener("click", () => {
          const selection = window.getSelection?.()?.toString().trim();
          if (!selection) openVerseQuestion();
        });
      }

      const isCurrent = verse.num === state.readerVerse;
      if (isCurrent) {
        row.classList.add("is-current");
        highlightedRow = row;
      }

      const number = document.createElement("span");
      number.className = "verse-number";
      number.textContent = verse.num;
      const text = document.createElement("span");
      text.textContent = verse.text;
      row.append(number, text);
      if (questions.length) {
        const badge = document.createElement("button");
        badge.className = "verse-question-badge";
        badge.type = "button";
        badge.textContent = pluralize(questions.length, "question");
        badge.setAttribute(
          "aria-label",
          `Go to ${questions.length === 1 ? "question" : "questions"} for ${
            state.readerBook
          } ${state.readerChapter}:${verse.num}`,
        );
        badge.addEventListener("click", (event) => {
          event.stopPropagation();
          openVerseQuestion();
        });
        row.append(badge);
      }
      const key = memorizationVerseKey(
        state.readerBook,
        state.readerChapter,
        verse.num,
      );
      const isSelected = memorizationVerses.includes(key);
      const memoryButton = document.createElement("button");
      memoryButton.className = "verse-memory-button";
      if (isSelected) memoryButton.classList.add("is-selected");
      memoryButton.type = "button";
      memoryButton.title = isSelected
        ? "Remove from memorization set"
        : "Add to memorization set";
      memoryButton.setAttribute("aria-label", `${memoryButton.title}: ${key}`);
      memoryButton.setAttribute("aria-pressed", String(isSelected));
      memoryButton.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 3h12v18l-6-4-6 4Z"></path>
        </svg>
      `;
      memoryButton.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleMemorizationVerse(
          state.readerBook,
          state.readerChapter,
          verse.num,
        );
      });
      row.append(memoryButton);
      return row;
    }),
  );

  updateReaderNavigation();
  requestAnimationFrame(() => {
    if (highlightedRow) {
      highlightedRow.scrollIntoView({ block: "center" });
    } else {
      elements.readerVerses.scrollTop = 0;
    }
  });
}

function openReader() {
  if (!state.bible) return;
  const question = currentQuestion() || eligibleQuestions()[0] || QUESTIONS[0];
  state.readerBook = question.book;
  state.readerChapter = question.chapter || 1;
  const chapter = bibleBook(state.readerBook).chapters[state.readerChapter - 1];
  state.readerVerse = question.verse || chapter.verses[0].num;
  state.readerOpen = true;
  const isOverlay =
    !window.matchMedia || window.matchMedia("(max-width: 899px)").matches;
  renderReader();
  elements.readerBackdrop.hidden = !isOverlay;
  elements.readerPanel.classList.add("is-open");
  elements.readerPanel.setAttribute("aria-modal", String(isOverlay));
  elements.readerPanel.setAttribute("aria-hidden", "false");
  document.body.classList.add("reader-open");
  elements.closeReaderButton.focus();
}

function closeReader() {
  state.readerOpen = false;
  elements.readerPanel.classList.remove("is-open");
  elements.readerPanel.setAttribute("aria-hidden", "true");
  elements.readerBackdrop.hidden = true;
  document.body.classList.remove("reader-open");
  elements.openReaderButton.focus();
}

function changeReaderVerse(direction) {
  let bookIndex = READER_BOOKS.indexOf(state.readerBook);
  let book = bibleBook(state.readerBook);
  let chapter = book.chapters[state.readerChapter - 1];
  const verseIndex = chapter.verses.findIndex(
    (verse) => verse.num === state.readerVerse,
  );
  const nextVerseIndex = verseIndex + direction;

  if (nextVerseIndex >= 0 && nextVerseIndex < chapter.verses.length) {
    state.readerVerse = chapter.verses[nextVerseIndex].num;
    renderReader();
    return;
  }

  if (direction < 0) {
    if (state.readerChapter > 1) {
      state.readerChapter -= 1;
    } else if (bookIndex > 0) {
      bookIndex -= 1;
      state.readerBook = READER_BOOKS[bookIndex];
      book = bibleBook(state.readerBook);
      state.readerChapter = book.chapters.length;
    } else {
      return;
    }
    chapter = bibleBook(state.readerBook).chapters[state.readerChapter - 1];
    state.readerVerse = chapter.verses.at(-1).num;
  } else {
    if (state.readerChapter < book.chapters.length) {
      state.readerChapter += 1;
    } else if (bookIndex < READER_BOOKS.length - 1) {
      bookIndex += 1;
      state.readerBook = READER_BOOKS[bookIndex];
      state.readerChapter = 1;
    } else {
      return;
    }
    chapter = bibleBook(state.readerBook).chapters[state.readerChapter - 1];
    state.readerVerse = chapter.verses[0].num;
  }

  renderReader();
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
  if (state.questionMode === "fill" && state.referenceDetail !== "verse") {
    return "";
  }
  const answers = state.acceptedAnswers.get(question.id) || [];
  if (!answers.length) return "";

  const items = answers
    .map(
      (answer, index) => `
        <li>
          <span>${escapeHtml(answer)}</span>
          <button
            class="accepted-answer-remove"
            type="button"
            data-accepted-answer-index="${index}"
            aria-label="Remove accepted answer"
            title="Remove accepted answer"
          >&times;</button>
        </li>
      `,
    )
    .join("");
  return `
    <div class="accepted-answers">
      <strong>Your accepted answers</strong>
      <ul>${items}</ul>
    </div>
  `;
}

function verseCitationMarkup(question) {
  const verse = getVerse(question);
  if (!verse) return "";
  return `<p class="verse">“${escapeHtml(verse)}” — ${escapeHtml(
    question.source,
  )} NKJV</p>`;
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
    const local = localStorage.getItem(ACCEPTED_KEY);
    const saved =
      local === null
        ? bundledAcceptedAnswers
        : normalizedAcceptedAnswers(JSON.parse(local));
    state.acceptedAnswers = new Map(
      Object.entries(saved).map(([id, answers]) => [Number(id), answers]),
    );
  } catch {
    state.acceptedAnswers = new Map();
  }
}

function removeAcceptedAnswer(question, index) {
  const answers = [...(state.acceptedAnswers.get(question.id) || [])];
  if (!Number.isInteger(index) || index < 0 || index >= answers.length) {
    return false;
  }
  answers.splice(index, 1);
  if (answers.length) state.acceptedAnswers.set(question.id, answers);
  else state.acceptedAnswers.delete(question.id);
  saveAcceptedAnswers();
  return true;
}

function handleAcceptedAnswerRemoval(event) {
  const button = event.target.closest("[data-accepted-answer-index]");
  const question = currentQuestion();
  if (!button || !question) return;
  const index = Number(button.dataset.acceptedAnswerIndex);
  if (!removeAcceptedAnswer(question, index)) return;

  const currentList = elements.feedback.querySelector(".accepted-answers");
  const replacement = acceptedAnswersMarkup(question);
  if (!replacement) currentList?.remove();
  else if (currentList) currentList.outerHTML = replacement;
  showToast("Accepted answer removed.");
}

function saveSession() {
  try {
    localStorage.setItem(
      sessionKey(),
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
  } catch {
    showToast("Progress could not be saved.");
  }
}

function sessionKey() {
  const selectedBookSuffix =
    state.selectedBooks.size === BOOK_ORDER.length
      ? ""
      : `-books-${BOOK_ORDER.filter((book) => state.selectedBooks.has(book))
          .map((book) => book.toLowerCase())
          .join("-")}`;
  if (state.questionMode === "study") return `${SESSION_KEY}${selectedBookSuffix}`;
  if (state.referenceDetail === "verse") {
    return `${SESSION_KEY}-${state.questionMode}${selectedBookSuffix}`;
  }
  return `${SESSION_KEY}-${state.questionMode}-${state.referenceDetail}${selectedBookSuffix}`;
}

function restoreSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(sessionKey()) || "null");
    if (!saved || saved.version !== 2) return;

    const availableQuestions = eligibleQuestions();
    const validIds = new Set(
      availableQuestions.map((question) => question.id),
    );
    const restoredDeck = (saved.deckIds || []).filter((id) => validIds.has(id));
    const missingIds = availableQuestions.map((question) => question.id).filter(
      (id) => !restoredDeck.includes(id),
    );

    state.deckIds = saved.practiceMode
      ? restoredDeck
      : restoredDeck.length
        ? [...restoredDeck, ...missingIds]
      : availableQuestions.map((question) => question.id);
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
      ? [
          ...saved.mainDeckIds.filter((id) => validIds.has(id)),
          ...missingIds.filter((id) => !saved.mainDeckIds.includes(id)),
        ]
      : null;
    state.mainIndex = Number(saved.mainIndex) || 0;
  } catch {
    localStorage.removeItem(sessionKey());
  }
}

function resetModeProgress() {
  state.deckIds = eligibleQuestions().map((question) => question.id);
  state.index = 0;
  state.correctIds = new Set();
  state.missed = new Map();
  state.skippedIds = new Set();
  state.practiceMode = false;
  state.practiceCorrectIds = new Set();
  state.mainDeckIds = null;
  state.mainIndex = 0;
  state.pendingRejectedAnswer = "";
  state.advancing = false;
}

function updateQuestionModeControls() {
  elements.questionModeSelect.value = state.questionMode;
  elements.referenceDetailSelect.value = state.referenceDetail;
  elements.quizView.dataset.mode = state.questionMode;
  elements.referenceDetailControl.hidden = state.questionMode !== "fill";
  elements.questionWordingControl.hidden = state.questionMode !== "study";
  elements.addQuestionButton.disabled = false;
  elements.editQuestionButton.hidden = false;
}

function updateBookFilterControls() {
  const selected = BOOK_ORDER.filter((book) => state.selectedBooks.has(book));
  elements.bookCheckboxes.forEach((checkbox) => {
    checkbox.checked = state.selectedBooks.has(checkbox.value);
  });
  elements.selectAllBooks.checked = selected.length === BOOK_ORDER.length;
  elements.selectAllBooks.indeterminate =
    selected.length > 0 && selected.length < BOOK_ORDER.length;
  elements.bookFilterSummary.textContent =
    selected.length === BOOK_ORDER.length
      ? "All books"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} books`;
}

function setSelectedBooks(books) {
  const nextBooks = new Set(
    BOOK_ORDER.filter((book) => books.includes(book)),
  );
  if (!nextBooks.size) {
    updateBookFilterControls();
    showToast("Select at least one book.");
    return;
  }
  if (
    nextBooks.size === state.selectedBooks.size &&
    [...nextBooks].every((book) => state.selectedBooks.has(book))
  ) {
    updateBookFilterControls();
    return;
  }

  saveSession();
  state.selectedBooks = nextBooks;
  try {
    localStorage.setItem(SELECTED_BOOKS_KEY, JSON.stringify([...nextBooks]));
  } catch {
    // The selected books still work for the current page session.
  }
  resetModeProgress();
  restoreSession();
  populateQuestionSelect();
  updateBookFilterControls();
  elements.finishView.hidden = true;
  elements.quizView.hidden = false;
  if (state.index >= state.deckIds.length) showFinish();
  else renderQuestion();
  if (state.readerOpen) renderReader();
}

function setQuestionWording(wording, save = true) {
  state.questionWording =
    wording === "alternate" ? "alternate" : "preferred";
  elements.questionWordingButtons.forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.questionWording === state.questionWording),
    );
  });

  if (save) {
    try {
      localStorage.setItem(QUESTION_WORDING_KEY, state.questionWording);
    } catch {
      // The selected wording still works for the current page session.
    }
  }

  populateQuestionSelect();
  const question = currentQuestion();
  if (question) elements.questionText.textContent = displayedQuestion(question);
  updateStats();
}

function openNewQuestionEditor() {
  if (state.questionMode !== "study") activateQuestionMode("study");
  openQuestionEditor();
}

function activateQuestionMode(mode, saveCurrent = true) {
  if (!QUESTION_BANKS[mode] || mode === state.questionMode) return;
  if (saveCurrent) saveSession();

  state.questionMode = mode;
  QUESTIONS = QUESTION_BANKS[mode];
  resetModeProgress();
  restoreSession();
  populateQuestionSelect();
  updateQuestionModeControls();
  try {
    localStorage.setItem(QUESTION_MODE_KEY, mode);
  } catch {
    // The selected mode still works for the current page session.
  }

  elements.finishView.hidden = true;
  elements.quizView.hidden = false;
  if (state.index >= state.deckIds.length) showFinish();
  else renderQuestion();
  if (state.readerOpen) renderReader();
}

function setReferenceDetail(detail) {
  const nextDetail = REFERENCE_DETAILS.includes(detail)
    ? detail
    : "verse";
  if (nextDetail === state.referenceDetail) return;

  saveSession();
  state.referenceDetail = nextDetail;
  buildReferenceQuestionBank();
  QUESTIONS = QUESTION_BANKS[state.questionMode];
  resetModeProgress();
  restoreSession();
  updateQuestionModeControls();
  try {
    localStorage.setItem(REFERENCE_DETAIL_KEY, nextDetail);
  } catch {
    // The selected detail still works for the current page session.
  }

  elements.finishView.hidden = true;
  elements.quizView.hidden = false;
  if (state.index >= state.deckIds.length) showFinish();
  else renderQuestion();
  if (state.readerOpen) renderReader();
}

function populateQuestionSelect() {
  const availableQuestions = eligibleQuestions();
  elements.questionSelect.replaceChildren(
    ...availableQuestions.map((question, index) => {
      const option = document.createElement("option");
      option.value = question.id;
      const questionText = displayedQuestion(question);
      const shortQuestion =
        questionText.length > 58
          ? `${questionText.slice(0, 58)}...`
          : questionText;
      option.textContent =
        state.questionMode === "fill"
          ? `Verse ${index + 1} · ${shortQuestion}`
          : `${question.source} · ${shortQuestion}`;
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
  elements.answerLabel.textContent =
    state.questionMode === "fill" ? referenceDetailLabel() : "Your answer";
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
  const availableQuestions = eligibleQuestions();
  const complete = state.deckIds.filter((id) => isComplete(id)).length;
  const percent = state.deckIds.length
    ? Math.round((complete / state.deckIds.length) * 100)
    : 0;

  elements.progressLabel.textContent = state.practiceMode
    ? `Missed practice · ${state.index + 1} of ${state.deckIds.length}`
    : `Question ${availableQuestions.indexOf(question) + 1} of ${
        availableQuestions.length
      }`;
  elements.bookLabel.textContent =
    state.questionMode === "fill"
      ? `Verse reference · ${referenceDetailLabel()}`
      : question.book;
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
      prompt.textContent = displayedQuestion(question);
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
    <p><b>Official answer:</b> ${escapeHtml(officialAnswer(question))}</p>
    ${acceptedAnswersMarkup(question)}
    ${verseCitationMarkup(question)}
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
  elements.source.textContent =
    state.questionMode === "fill" ? "NKJV verse" : question.source;
  elements.questionText.textContent = displayedQuestion(question);
  elements.questionSelect.value = String(question.id);
  clearFeedback();
  updateQuestionStatus(question);
  updateProgress(question);
  updateStats();
  updateQuestionNavigation();

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

function goToAdjacentQuestion(direction) {
  const nextIndex = state.index + direction;
  if (nextIndex < 0 || nextIndex >= state.deckIds.length) return;
  state.index = nextIndex;
  saveSession();
  renderQuestion();
}

function updateQuestionNavigation() {
  elements.previousQuestionButton.disabled = state.index <= 0;
  elements.nextQuestionButton.disabled =
    state.index >= state.deckIds.length - 1;
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
    <p><b>Official answer:</b> ${escapeHtml(officialAnswer(question))}</p>
    ${acceptedAnswersMarkup(question)}
    <p><b>You entered:</b> ${value ? escapeHtml(value) : "No answer"}</p>
    ${verseCitationMarkup(question)}
  `;
  elements.markCorrectButton.hidden = false;
  elements.acceptAnswerButton.hidden =
    !value ||
    (state.questionMode === "fill" && state.referenceDetail !== "verse");
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
    state.mainDeckIds || eligibleQuestions().map((question) => question.id);
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
            <p><strong>${escapeHtml(displayedQuestion(question))}</strong></p>
            ${answerLine}
            <p class="correct-answer"><strong>Answer:</strong> ${escapeHtml(
              officialAnswer(question),
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
    "Reset all progress for this question type?",
  );
  if (!confirmed) return;

  localStorage.removeItem(sessionKey());
  resetModeProgress();
  elements.finishView.hidden = true;
  elements.quizView.hidden = false;
  renderQuestion();
  showToast("Progress reset.");
}

async function initialize() {
  try {
    const [response, bundledQuestions] = await Promise.all([
      fetch("nkjv.json"),
      loadBundledQuestions(),
    ]);
    if (!response.ok) throw new Error(`Bible data returned ${response.status}`);
    state.bible = await response.json();
    questionLibrary = loadQuestionLibrary(bundledQuestions.library);
    bundledAcceptedAnswers = bundledQuestions.acceptedAnswers;

    buildStudyQuestionBank();
    let savedMode = "study";
    try {
      savedMode = localStorage.getItem(QUESTION_MODE_KEY) || "study";
      state.questionWording =
        localStorage.getItem(QUESTION_WORDING_KEY) === "alternate"
          ? "alternate"
          : "preferred";
      const savedReferenceDetail = localStorage.getItem(REFERENCE_DETAIL_KEY);
      state.referenceDetail = REFERENCE_DETAILS.includes(savedReferenceDetail)
        ? savedReferenceDetail
        : "verse";
      const savedBooks = JSON.parse(
        localStorage.getItem(SELECTED_BOOKS_KEY) || "null",
      );
      if (Array.isArray(savedBooks)) {
        const validBooks = BOOK_ORDER.filter((book) =>
          savedBooks.includes(book),
        );
        if (validBooks.length) state.selectedBooks = new Set(validBooks);
      }
    } catch {
      savedMode = "study";
      state.questionWording = "preferred";
      state.referenceDetail = "verse";
    }
    if (!QUESTION_BANKS[savedMode]) savedMode = "study";
    buildReferenceQuestionBank();
    state.questionMode = savedMode;
    QUESTIONS = QUESTION_BANKS[savedMode];
    resetModeProgress();

    const missingReference = Object.values(QUESTION_BANKS)
      .flat()
      .find(
        (question) => question.scope === "verse" && !getVerse(question),
      );
    if (missingReference) {
      throw new Error(`Missing reference: ${missingReference.source}`);
    }

    loadAcceptedAnswers();
    restoreSession();
    populateQuestionSelect();
    populateReaderBooks();
    updateQuestionModeControls();
    updateBookFilterControls();
    setQuestionWording(state.questionWording, false);
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
elements.feedback.addEventListener("click", handleAcceptedAnswerRemoval);
elements.nextButton.addEventListener("click", goToNextQuestion);
elements.markCorrectButton.addEventListener("click", () =>
  markCurrentCorrect(false),
);
elements.acceptAnswerButton.addEventListener("click", () =>
  markCurrentCorrect(true),
);
elements.previousQuestionButton.addEventListener("click", () =>
  goToAdjacentQuestion(-1),
);
elements.nextQuestionButton.addEventListener("click", () =>
  goToAdjacentQuestion(1),
);
elements.shuffleButton.addEventListener("click", shuffleRemaining);
elements.questionModeSelect.addEventListener("change", (event) =>
  activateQuestionMode(event.target.value),
);
elements.selectAllBooks.addEventListener("change", (event) => {
  setSelectedBooks(event.target.checked ? BOOK_ORDER : []);
});
elements.bookCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    setSelectedBooks(
      [...elements.bookCheckboxes]
        .filter((item) => item.checked)
        .map((item) => item.value),
    );
  });
});
document.addEventListener("click", (event) => {
  if (!elements.bookFilter.contains(event.target)) {
    elements.bookFilter.removeAttribute("open");
  }
});
elements.referenceDetailSelect.addEventListener("change", (event) =>
  setReferenceDetail(event.target.value),
);
elements.questionWordingButtons.forEach((button) => {
  button.addEventListener("click", () =>
    setQuestionWording(button.dataset.questionWording),
  );
});
elements.questionSelect.addEventListener("change", (event) =>
  goToQuestion(Number(event.target.value)),
);
elements.practiceMissedButton.addEventListener("click", toggleMissedPractice);
elements.finishPracticeButton.addEventListener("click", startMissedPractice);
elements.resetButton.addEventListener("click", resetProgress);
elements.finishResetButton.addEventListener("click", resetProgress);
elements.addQuestionButton.addEventListener("click", openNewQuestionEditor);
elements.exportQuestionsButton.addEventListener("click", exportQuestions);
elements.importQuestionsButton.addEventListener("click", () =>
  elements.importQuestionsInput.click(),
);
elements.importQuestionsInput.addEventListener("change", importQuestions);
elements.editQuestionButton.addEventListener("click", () =>
  openQuestionEditor(currentQuestion()),
);
elements.deleteQuestionButton.addEventListener("click", deleteCurrentQuestion);
elements.questionForm.addEventListener("submit", handleQuestionSave);
elements.closeQuestionDialogButton.addEventListener(
  "click",
  closeQuestionEditor,
);
elements.questionDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
});
elements.questionScope.addEventListener("change", () =>
  updateEditorReferenceFields(false),
);
elements.questionBook.addEventListener("change", () => {
  populateEditorChapters();
  populateEditorVerses();
});
elements.questionChapter.addEventListener("change", () =>
  populateEditorVerses(),
);
elements.questionVerse.addEventListener("change", () =>
  populateEditorVerses(elements.questionVerse.value),
);
elements.openReaderButton.addEventListener("click", openReader);
elements.closeReaderButton.addEventListener("click", closeReader);
elements.readerBackdrop.addEventListener("click", closeReader);
elements.previousChapterButton.addEventListener("click", () =>
  changeReaderVerse(-1),
);
elements.nextChapterButton.addEventListener("click", () =>
  changeReaderVerse(1),
);
elements.readerBookSelect.addEventListener("change", (event) => {
  state.readerBook = event.target.value;
  state.readerChapter = 1;
  state.readerVerse = bibleBook(state.readerBook).chapters[0].verses[0].num;
  renderReader();
});
elements.readerChapterSelect.addEventListener("change", (event) => {
  state.readerChapter = Number(event.target.value);
  state.readerVerse =
    bibleBook(state.readerBook).chapters[state.readerChapter - 1].verses[0].num;
  renderReader();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.readerOpen) closeReader();
});
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
