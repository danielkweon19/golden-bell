const SESSION_KEY = "minor-prophets-recall-session-v2";
const ACCEPTED_KEY = "minor-prophets-recall-accepted-v2";
const QUESTION_LIBRARY_KEY = "minor-prophets-recall-question-library-v1";
const QUESTION_MODE_KEY = "minor-prophets-recall-question-mode-v1";
const QUESTION_WORDING_KEY = "minor-prophets-recall-question-wording-v1";
const REFERENCE_DETAIL_KEY = "minor-prophets-recall-reference-detail-v1";
const SELECTED_BOOKS_KEY = "minor-prophets-recall-selected-books-v1";
const QUESTION_LIBRARY_ASSET = "question-library.json?v=20260831-1";
const QUESTION_LIBRARY_VERSION = 2;
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

function blankCount(value) {
  return (String(value || "").match(/_{3,}/g) || []).length;
}

function questionBlankCount(question) {
  return Math.max(
    blankCount(question?.question),
    blankCount(question?.alternateQuestion),
  );
}

function normalizedBlankAnswers(answers) {
  if (!Array.isArray(answers)) return [];
  return answers.map(String).map((answer) => answer.trim()).filter(Boolean);
}

function deriveLegacyBlankAnswers(question, count) {
  if (!count) return [];
  const explicit = normalizedBlankAnswers(question?.blankAnswers);
  if (explicit.length === count) return explicit;

  const displayAnswer = String(question?.displayAnswer || "").trim();
  const commaSeparated = displayAnswer
    .split(/\s*,\s*/)
    .map((answer) => answer.trim())
    .filter(Boolean);
  if (commaSeparated.length === count) return commaSeparated;

  if (count === 2 && commaSeparated.length === 1) {
    const joinedPair = displayAnswer
      .split(/\s+and\s+/i)
      .map((answer) => answer.trim())
      .filter(Boolean);
    if (joinedPair.length === count) return joinedPair;
  }
  return [];
}

function migrateStoredQuestion(question, libraryVersion) {
  if (!question || typeof question !== "object" || libraryVersion !== 1) {
    return question;
  }
  if (["matching", "reference", "fill-blank"].includes(question.type)) {
    return question;
  }

  const count = questionBlankCount(question);
  const blankAnswers = deriveLegacyBlankAnswers(question, count);
  return count && blankAnswers.length === count
    ? {
        ...question,
        type: "fill-blank",
        blankAnswers,
        displayAnswer: blankAnswers.join(", "),
      }
    : question;
}

function normalizedQuestionLibrary(saved) {
  if (!saved || ![1, QUESTION_LIBRARY_VERSION].includes(saved.version)) {
    return null;
  }
  const migrateQuestion = (question) =>
    migrateStoredQuestion(question, saved.version);
  const migrateEdits = (edits) =>
    Object.fromEntries(
      Object.entries(edits && typeof edits === "object" ? edits : {}).map(
        ([id, question]) => [id, migrateQuestion(question)],
      ),
    );
  const legacyMemorizationVerses = Array.isArray(saved.memorizationVerses)
    ? [...new Set(saved.memorizationVerses.map(String).filter(Boolean))]
    : [];
  const savedVersesByDetail =
    saved.memorizationVersesByDetail &&
    typeof saved.memorizationVersesByDetail === "object"
      ? saved.memorizationVersesByDetail
      : {};
  return {
    edits: migrateEdits(saved.edits),
    fillEdits: migrateEdits(saved.fillEdits),
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
    custom: Array.isArray(saved.custom)
      ? saved.custom.map(migrateQuestion)
      : [],
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
  if (question.scope === "all-books") return "All three books overview";
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

function normalizedMatchingPairs(pairs) {
  if (!Array.isArray(pairs)) return [];
  return pairs
    .map((pair) => {
      const answers = [
        ...new Set(
          (Array.isArray(pair?.answers) ? pair.answers : [pair?.answer])
            .map((answer) => String(answer || "").trim())
            .filter(Boolean),
        ),
      ];
      return {
        prompt: String(pair?.prompt || "").trim(),
        answer: answers[0] || "",
        answers,
      };
    })
    .filter((pair) => pair.prompt && pair.answers.length);
}

function matchingAnswerSummary(pairs) {
  return pairs
    .map((pair) => `${pair.prompt}: ${pair.answers.join(", ")}`)
    .join("; ");
}

function isMatchingQuestion(question) {
  return question?.type === "matching" && question.pairs?.length >= 2;
}

function isReferenceQuestion(question) {
  return question?.type === "reference";
}

function isFillBlankQuestion(question) {
  return (
    question?.type === "fill-blank" &&
    question.blankAnswers?.length === questionBlankCount(question)
  );
}

function hydrateQuestion(question, id) {
  const matchingPairs = normalizedMatchingPairs(question.pairs);
  const blankAnswers = deriveLegacyBlankAnswers(
    question,
    questionBlankCount(question),
  );
  const type =
    question.type === "matching" && matchingPairs.length >= 2
      ? "matching"
      : question.type === "reference"
        ? "reference"
        : question.type === "fill-blank" &&
            blankAnswers.length === questionBlankCount(question)
          ? "fill-blank"
        : "text";
  const displayAnswer =
    type === "matching"
      ? matchingAnswerSummary(matchingPairs)
      : type === "fill-blank"
        ? blankAnswers.join(", ")
      : String(question.displayAnswer || "").trim();
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
    books: scope === "all-books" ? [...BOOK_ORDER] : undefined,
    chapter:
      scope === "book" || scope === "all-books"
        ? undefined
        : Number(question.chapter),
    verse: scope === "verse" ? Number(question.verse) : undefined,
    endVerse:
      scope === "verse" && question.endVerse
        ? Number(question.endVerse)
        : undefined,
    question: String(question.question || "").trim(),
    alternateQuestion: String(question.alternateQuestion || "").trim(),
    type,
    pairs: type === "matching" ? matchingPairs : [],
    blankAnswers: type === "fill-blank" ? blankAnswers : [],
    displayAnswer,
    aliases: aliases.map(String).map((answer) => answer.trim()).filter(Boolean),
  };
  hydrated.answers = [hydrated.displayAnswer, ...hydrated.aliases];
  hydrated.source = questionSource(hydrated);
  return hydrated;
}

function compareQuestions(left, right) {
  const scopeOrder = { "all-books": -1, book: 0, chapter: 1, verse: 2 };
  const leftBookIndex =
    left.scope === "all-books" ? -1 : BOOK_ORDER.indexOf(left.book);
  const rightBookIndex =
    right.scope === "all-books" ? -1 : BOOK_ORDER.indexOf(right.book);
  return (
    leftBookIndex - rightBookIndex ||
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
        const stored = {
          ...question,
          ...(questionLibrary.edits[id] || {}),
        };
        return hydrateQuestion(
          migrateStoredQuestion(stored, 1),
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
  shuffleEnabled: false,
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
  textAnswerArea: document.querySelector("#text-answer-area"),
  answerLabel: document.querySelector("#answer-label"),
  answerInput: document.querySelector("#answer-input"),
  answerNote: document.querySelector("#answer-note"),
  bookAnswerChoices: document.querySelector("#book-answer-choices"),
  bookAnswerInputs: document.querySelectorAll('input[name="book-answer"]'),
  matchingArea: document.querySelector("#matching-area"),
  matchingBoard: document.querySelector("#matching-board"),
  fillBlankAnswerArea: document.querySelector("#fill-blank-answer-area"),
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
  openEditorReaderButton: document.querySelector(
    "#open-editor-reader-button",
  ),
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
  questionDialogBackdrop: document.querySelector(
    "#question-dialog-backdrop",
  ),
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
  referenceFields: document.querySelector("#reference-fields"),
  questionBookField: document.querySelector("#question-book-field"),
  questionChapterField: document.querySelector("#question-chapter-field"),
  questionVerseField: document.querySelector("#question-verse-field"),
  questionEndVerseField: document.querySelector("#question-end-verse-field"),
  questionBook: document.querySelector("#question-book"),
  questionChapter: document.querySelector("#question-chapter"),
  questionVerse: document.querySelector("#question-verse"),
  questionEndVerse: document.querySelector("#question-end-verse"),
  questionPrompt: document.querySelector("#question-prompt"),
  alternateQuestionPrompt: document.querySelector(
    "#alternate-question-prompt",
  ),
  questionTypeField: document.querySelector("#question-type-field"),
  questionType: document.querySelector("#question-type"),
  questionTextAnswerFields: document.querySelector(
    "#question-text-answer-fields",
  ),
  questionAnswer: document.querySelector("#question-answer"),
  questionAliases: document.querySelector("#question-aliases"),
  matchingPairField: document.querySelector("#matching-pair-field"),
  matchingPairEditor: document.querySelector("#matching-pair-editor"),
  addPairButton: document.querySelector("#add-pair-button"),
  fillBlankAnswerField: document.querySelector(
    "#fill-blank-answer-field",
  ),
  fillBlankAnswerEditor: document.querySelector(
    "#fill-blank-answer-editor",
  ),
  toast: document.querySelector("#toast"),
};

let toastTimer;
let matchingState = null;

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
  return QUESTIONS.filter(questionMatchesBookFilter);
}

function questionMatchesBookFilter(question) {
  if (question.scope === "all-books") {
    return BOOK_ORDER.every((book) => state.selectedBooks.has(book));
  }
  return state.selectedBooks.has(question.book);
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

function usesBookAnswerChoices() {
  return state.questionMode === "fill" && state.referenceDetail === "book";
}

function selectedAnswerValue() {
  if (usesInlineBlankInputs()) {
    return inlineBlankInputs()
      .map((input) => input.value.trim())
      .join(", ");
  }
  if (!usesBookAnswerChoices()) return elements.answerInput.value.trim();
  return (
    [...elements.bookAnswerInputs].find((input) => input.checked)?.value || ""
  );
}

function displayedQuestion(question) {
  return state.questionWording === "alternate" && question.alternateQuestion
    ? question.alternateQuestion
    : question.question;
}

function usesInlineBlankInputs(question = currentQuestion()) {
  return (
    isFillBlankQuestion(question) &&
    blankCount(displayedQuestion(question)) === question.blankAnswers.length
  );
}

function inlineBlankInputs() {
  return [...elements.questionText.querySelectorAll(".inline-blank-input")];
}

function concealsQuestionReference(question = currentQuestion()) {
  return state.questionMode === "study" && isReferenceQuestion(question);
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
  const allBooks = scope === "all-books";
  elements.referenceFields.classList.toggle("is-all-books", allBooks);
  elements.questionBookField.hidden = allBooks;
  elements.questionChapterField.hidden = allBooks;
  elements.questionVerseField.hidden = allBooks;
  elements.questionEndVerseField.hidden = allBooks;
  elements.questionScope.disabled = lockReference;
  elements.questionBook.disabled = lockReference || allBooks;
  elements.questionChapter.disabled =
    lockReference || scope === "book" || allBooks;
  elements.questionVerse.disabled = lockReference || scope !== "verse";
  elements.questionEndVerse.disabled = lockReference || scope !== "verse";
}

function updateMatchingPairRemoveButtons() {
  const buttons = elements.matchingPairEditor.querySelectorAll(
    ".matching-pair-remove",
  );
  buttons.forEach((button) => {
    button.disabled = buttons.length <= 2;
  });
}

function updateMatchingAnswerRemoveButtons(answerEditor) {
  const buttons = answerEditor.querySelectorAll(".matching-answer-remove");
  buttons.forEach((button) => {
    button.disabled = buttons.length <= 1;
  });
}

function addMatchingAnswerEditorRow(answerEditor, value = "") {
  const row = document.createElement("div");
  row.className = "matching-answer-row";

  const answer = document.createElement("input");
  answer.className = "matching-pair-answer";
  answer.type = "text";
  answer.placeholder = "Match";
  answer.setAttribute("aria-label", "Matching answer");
  answer.value = value;
  answer.required = elements.questionType.value === "matching";

  const remove = document.createElement("button");
  remove.className = "matching-answer-remove";
  remove.type = "button";
  remove.setAttribute("aria-label", "Remove this match");
  remove.title = "Remove match";
  remove.textContent = "×";

  row.append(answer, remove);
  answerEditor.insertBefore(
    row,
    answerEditor.querySelector(".matching-answer-add"),
  );
  updateMatchingAnswerRemoveButtons(answerEditor);
}

function addMatchingPairEditorRow(pair = { prompt: "", answers: [""] }) {
  const row = document.createElement("div");
  row.className = "matching-pair-row";

  const prompt = document.createElement("input");
  prompt.className = "matching-pair-prompt";
  prompt.type = "text";
  prompt.placeholder = "Prompt";
  prompt.setAttribute("aria-label", "Matching prompt");
  prompt.value = pair.prompt;

  const answerEditor = document.createElement("div");
  answerEditor.className = "matching-answer-editor";

  const addAnswer = document.createElement("button");
  addAnswer.className = "button matching-answer-add";
  addAnswer.type = "button";
  addAnswer.textContent = "Add match";
  answerEditor.append(addAnswer);
  const answers =
    pair.answers?.length
      ? pair.answers
      : [pair.answer || ""];
  answers.forEach((answer) =>
    addMatchingAnswerEditorRow(answerEditor, answer),
  );

  const remove = document.createElement("button");
  remove.className = "matching-pair-remove";
  remove.type = "button";
  remove.setAttribute("aria-label", "Remove matching pair");
  remove.title = "Remove pair";
  remove.textContent = "×";

  const matching = elements.questionType.value === "matching";
  prompt.required = matching;
  row.append(prompt, answerEditor, remove);
  elements.matchingPairEditor.append(row);
  updateMatchingPairRemoveButtons();
}

function populateMatchingPairEditor(pairs = []) {
  elements.matchingPairEditor.replaceChildren();
  const initialPairs = pairs.length
    ? pairs
    : [
        { prompt: "", answers: [""] },
        { prompt: "", answers: [""] },
      ];
  initialPairs.forEach(addMatchingPairEditorRow);
}

function readFillBlankAnswerEditor() {
  return [
    ...elements.fillBlankAnswerEditor.querySelectorAll(
      ".fill-blank-editor-answer",
    ),
  ].map((input) => input.value.trim());
}

function syncFillBlankAnswerEditor(initialAnswers = null) {
  const previousAnswers =
    initialAnswers || readFillBlankAnswerEditor();
  const count = Math.max(
    blankCount(elements.questionPrompt.value),
    blankCount(elements.alternateQuestionPrompt.value),
  );
  elements.fillBlankAnswerEditor.replaceChildren(
    ...Array.from({ length: count }, (_, index) => {
      const label = document.createElement("label");
      const caption = document.createElement("span");
      const input = document.createElement("input");
      caption.textContent = `Blank ${index + 1}`;
      input.className = "fill-blank-editor-answer";
      input.type = "text";
      input.value = previousAnswers[index] || "";
      input.required = elements.questionType.value === "fill-blank";
      input.setAttribute("aria-label", `Official answer for blank ${index + 1}`);
      label.append(caption, input);
      return label;
    }),
  );
}

function setEditorQuestionType(type, lockType = false) {
  const questionType =
    !lockType &&
    ["fill-blank", "matching", "reference"].includes(type)
      ? type
      : "text";
  const matching = questionType === "matching";
  const fillBlank = questionType === "fill-blank";
  elements.questionType.value = questionType;
  elements.questionType.disabled = lockType;
  elements.questionTypeField.hidden = lockType;
  elements.questionTextAnswerFields.hidden = matching || fillBlank;
  elements.matchingPairField.hidden = !matching;
  elements.fillBlankAnswerField.hidden = !fillBlank;
  elements.questionAnswer.required = !matching && !fillBlank;
  elements.matchingPairEditor.querySelectorAll("input").forEach((input) => {
    input.required = matching;
  });
  if (!lockType) {
    elements.questionPromptLabel.textContent = fillBlank
      ? "Question with blanks"
      : "Preferred question";
    elements.questionPrompt.placeholder = fillBlank
      ? "The Lord is my ________."
      : "";
  }
  if (fillBlank) syncFillBlankAnswerEditor();
  elements.fillBlankAnswerEditor.querySelectorAll("input").forEach((input) => {
    input.required = fillBlank;
  });
}

function readMatchingPairEditor() {
  return [
    ...elements.matchingPairEditor.querySelectorAll(".matching-pair-row"),
  ].map((row) => ({
    prompt: row.querySelector(".matching-pair-prompt").value.trim(),
    answers: [...row.querySelectorAll(".matching-pair-answer")]
      .map((input) => input.value.trim())
      .filter(Boolean),
  }));
}

function openQuestionEditor(question = null) {
  if (!state.bible) return;
  const isGeneratedVerseQuestion = Boolean(question?.generated);
  state.editingQuestionId = question?.id || null;
  elements.questionDialogTitle.textContent = isGeneratedVerseQuestion
    ? "Edit verse question"
    : question
      ? "Edit question"
      : "Add question";
  elements.questionPromptLabel.textContent = isGeneratedVerseQuestion
    ? "Verse text"
    : "Preferred question";
  elements.alternateQuestionField.hidden = isGeneratedVerseQuestion;
  elements.questionAnswerLabel.textContent = isGeneratedVerseQuestion
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
  updateEditorReferenceFields(isGeneratedVerseQuestion);
  elements.questionPrompt.value = question?.question || "";
  elements.alternateQuestionPrompt.value = question?.alternateQuestion || "";
  elements.questionType.value = isMatchingQuestion(question)
    ? "matching"
    : isReferenceQuestion(question)
      ? "reference"
      : isFillBlankQuestion(question)
        ? "fill-blank"
      : "text";
  populateMatchingPairEditor(isMatchingQuestion(question) ? question.pairs : []);
  syncFillBlankAnswerEditor(
    isFillBlankQuestion(question) ? question.blankAnswers : [],
  );
  setEditorQuestionType(
    elements.questionType.value,
    isGeneratedVerseQuestion,
  );
  elements.questionAnswer.value = isMatchingQuestion(question)
    ? ""
    : question?.displayAnswer || "";
  elements.questionAliases.value = question?.aliases?.join("\n") || "";
  elements.questionDialogBackdrop.hidden = false;
  elements.questionDialog.show();
  document.body.classList.add("editor-open");
  requestAnimationFrame(() => elements.questionPrompt.focus());
}

function closeQuestionEditor() {
  elements.questionDialog.close();
  elements.questionDialogBackdrop.hidden = true;
  document.body.classList.remove("editor-open");
  elements.matchingPairEditor.replaceChildren();
  elements.fillBlankAnswerEditor.replaceChildren();
  state.editingQuestionId = null;
}

function questionFieldsFromEditor() {
  const scope = elements.questionScope.value;
  const endVerse = Number(elements.questionEndVerse.value);
  const type = elements.questionType.value;
  const pairs = type === "matching" ? readMatchingPairEditor() : [];
  const blankAnswers =
    type === "fill-blank" ? readFillBlankAnswerEditor() : [];
  return {
    scope,
    book: scope === "all-books" ? BOOK_ORDER[0] : elements.questionBook.value,
    books: scope === "all-books" ? [...BOOK_ORDER] : undefined,
    chapter:
      scope === "book" || scope === "all-books"
        ? undefined
        : Number(elements.questionChapter.value),
    verse:
      scope === "verse" ? Number(elements.questionVerse.value) : undefined,
    endVerse: scope === "verse" && endVerse ? endVerse : undefined,
    question: elements.questionPrompt.value.trim(),
    alternateQuestion: elements.alternateQuestionPrompt.value.trim(),
    type,
    pairs,
    blankAnswers,
    displayAnswer:
      type === "matching"
        ? matchingAnswerSummary(pairs)
        : type === "fill-blank"
          ? blankAnswers.join(", ")
        : elements.questionAnswer.value.trim(),
    aliases:
      type === "matching"
        ? []
        : elements.questionAliases.value
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
    books: question.books,
    chapter: question.chapter,
    verse: question.verse,
    endVerse: question.endVerse,
    question: question.question,
    alternateQuestion: question.alternateQuestion,
    type: question.type,
    pairs: question.pairs,
    blankAnswers: question.blankAnswers,
    displayAnswer: question.displayAnswer,
    aliases: question.aliases,
  };
}

function saveQuestionLibrary() {
  try {
    localStorage.setItem(
      QUESTION_LIBRARY_KEY,
      JSON.stringify({ version: QUESTION_LIBRARY_VERSION, ...questionLibrary }),
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
    questionLibrary: {
      version: QUESTION_LIBRARY_VERSION,
      ...questionLibrary,
    },
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
  if (state.shuffleEnabled) return;

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
  if (fields.type === "matching") {
    if (
      fields.pairs.length < 2 ||
      fields.pairs.some((pair) => !pair.prompt || !pair.answers.length)
    ) {
      showToast("Add at least two complete matching pairs.");
      return;
    }
    const normalizedAnswers = fields.pairs.flatMap((pair) =>
      pair.answers.map(normalizeAnswer),
    );
    if (new Set(normalizedAnswers).size !== normalizedAnswers.length) {
      showToast("Each match must have a distinct answer.");
      return;
    }
  }
  if (fields.type === "fill-blank") {
    const counts = [
      blankCount(fields.question),
      blankCount(fields.alternateQuestion),
    ].filter(Boolean);
    if (!counts.length) {
      showToast("Add at least one underscore blank to the question.");
      elements.questionPrompt.focus();
      return;
    }
    if (
      counts.some((count) => count !== fields.blankAnswers.length) ||
      fields.blankAnswers.some((answer) => !answer)
    ) {
      showToast("Add one official answer for every blank.");
      elements.fillBlankAnswerEditor
        .querySelector("input:invalid")
        ?.focus();
      return;
    }
  }
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
    if (!questionMatchesBookFilter(question)) {
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
    if (state.practiceMode && questionMatchesBookFilter(question)) {
      state.mainDeckIds ||= expandedQuestionBank.map((_, index) => index + 1);
      state.mainDeckIds.push(question.id);
    } else if (questionMatchesBookFilter(question)) {
      state.deckIds.push(question.id);
    }
    message = "Question added.";
  }

  sortQuestionBankAndDecks();
  if (!saveQuestionLibrary()) return;
  populateQuestionSelect();
  closeQuestionEditor();
  saveSession();
  if (questionMatchesBookFilter(question)) goToQuestion(question.id);
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
  const description = concealsQuestionReference()
    ? "this question"
    : `the question for ${question.source}`;
  if (!window.confirm(`Delete ${description}?`)) return;

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

let readerReturnFocus = elements.openReaderButton;

function updateReaderLayout() {
  const isOverlay =
    !window.matchMedia || window.matchMedia("(max-width: 899px)").matches;
  elements.readerPanel.style.width = isOverlay
    ? `${document.documentElement.clientWidth}px`
    : "";
  elements.readerPanel.style.maxWidth = isOverlay ? "none" : "";
  elements.readerBackdrop.hidden = !state.readerOpen || !isOverlay;
  elements.readerPanel.setAttribute("aria-modal", String(isOverlay));
}

function openReader(reference = null, returnFocus = elements.openReaderButton) {
  if (!state.bible) return;
  const question =
    reference || currentQuestion() || eligibleQuestions()[0] || QUESTIONS[0];
  state.readerBook = question.book;
  state.readerChapter = question.chapter || 1;
  const chapter = bibleBook(state.readerBook).chapters[state.readerChapter - 1];
  state.readerVerse = question.verse || chapter.verses[0].num;
  readerReturnFocus = returnFocus;
  state.readerOpen = true;
  renderReader();
  updateReaderLayout();
  elements.readerPanel.classList.add("is-open");
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
  const returnDialog = readerReturnFocus?.closest("dialog");
  const returnTargetIsVisible = !returnDialog || returnDialog.open;
  (returnTargetIsVisible ? readerReturnFocus : elements.openReaderButton).focus();
  readerReturnFocus = elements.openReaderButton;
}

function openReaderFromQuestionEditor() {
  const book = elements.questionBook.value;
  const chapter = Number(elements.questionChapter.value) || 1;
  const selectedChapter = bibleBook(book)?.chapters[chapter - 1];
  if (!selectedChapter) return;
  const selectedVerse = Number(elements.questionVerse.value);
  const verse = selectedChapter.verses.some(
    (item) => item.num === selectedVerse,
  )
    ? selectedVerse
    : selectedChapter.verses[0].num;
  openReader({ book, chapter, verse }, elements.openEditorReaderButton);
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

function renderQuestionPrompt(question) {
  const prompt = displayedQuestion(question);
  if (!usesInlineBlankInputs(question)) {
    elements.questionText.textContent = prompt;
    return;
  }

  const parts = prompt.split(/(_{3,})/g);
  let blankIndex = 0;
  elements.questionText.replaceChildren(
    ...parts.map((part) => {
      if (!/^_{3,}$/.test(part)) return document.createTextNode(part);

      const input = document.createElement("input");
      const inputNumber = blankIndex + 1;
      input.className = "inline-blank-input";
      input.type = "text";
      input.name = `blank-${inputNumber}`;
      input.dataset.blankIndex = String(blankIndex);
      input.setAttribute("form", "answer-form");
      input.setAttribute(
        "aria-label",
        `Blank ${inputNumber} of ${question.blankAnswers.length}`,
      );
      input.setAttribute("autocomplete", "off");
      input.setAttribute("autocapitalize", "sentences");
      input.setAttribute("spellcheck", "false");
      input.required = true;
      const answerLength = question.blankAnswers[blankIndex]?.length || 0;
      input.size = Math.max(
        7,
        Math.min(
          40,
          Math.max(answerLength + 1, Math.ceil(part.length / 1.5)),
        ),
      );
      if (answerLength > 24) input.classList.add("is-long");
      blankIndex += 1;
      return input;
    }),
  );
}

function createMatchingState(question) {
  const options = question.pairs.flatMap((pair, promptIndex) =>
    pair.answers.map((answer) => ({ answer, promptIndex })),
  );
  return {
    questionId: question.id,
    options,
    optionOrder: shuffle(options.map((_, index) => index)),
    assignments: question.pairs.map(() => []),
    selectedAnswerIndex: null,
    results: null,
  };
}

function renderMatchingBoard() {
  const question = currentQuestion();
  if (
    !isMatchingQuestion(question) ||
    matchingState?.questionId !== question.id
  ) {
    elements.matchingBoard.className = "matching-board";
    elements.matchingBoard.replaceChildren();
    return;
  }
  const itemCount = Math.max(
    question.pairs.length,
    matchingState.options.length,
  );
  elements.matchingBoard.className = [
    "matching-board",
    itemCount > 6 ? "is-compact" : "",
    itemCount > 12 ? "is-dense" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const assignedAnswers = new Set(matchingState.assignments.flat());
  const rows = question.pairs
    .map((pair, promptIndex) => {
      const answerIndices = matchingState.assignments[promptIndex];
      const assigned = answerIndices.length > 0;
      const result = matchingState.results?.[promptIndex];
      const resultClass =
        result === true
          ? " correct-match"
          : result === false
            ? " wrong-match"
            : "";
      return `
        <div class="match-row">
          <div class="match-prompt">${escapeHtml(pair.prompt)}</div>
          <div
            class="match-target${assigned ? " filled" : ""}${resultClass}"
            data-prompt-index="${promptIndex}"
            role="button"
            tabindex="${state.advancing ? "-1" : "0"}"
            aria-disabled="${state.advancing}"
          >${
            assigned
              ? answerIndices
                  .map(
                    (answerIndex) => `
                      <button
                        class="match-value"
                        type="button"
                        data-remove-answer-index="${answerIndex}"
                        aria-label="Remove this match"
                        ${state.advancing ? "disabled" : ""}
                      >
                        <span>${escapeHtml(matchingState.options[answerIndex].answer)}</span>
                        <b aria-hidden="true">&times;</b>
                      </button>
                    `,
                  )
                  .join("")
              : '<span class="match-placeholder">Drop match here</span>'
          }</div>
        </div>
      `;
    })
    .join("");

  const options = matchingState.optionOrder
    .filter((answerIndex) => !assignedAnswers.has(answerIndex))
    .map(
      (answerIndex) => `
        <button
          class="match-option${matchingState.selectedAnswerIndex === answerIndex ? " selected" : ""}"
          type="button"
          draggable="${state.advancing ? "false" : "true"}"
          data-answer-index="${answerIndex}"
          aria-pressed="${matchingState.selectedAnswerIndex === answerIndex}"
          ${state.advancing ? "disabled" : ""}
        >${escapeHtml(matchingState.options[answerIndex].answer)}</button>
      `,
    )
    .join("");

  elements.matchingBoard.innerHTML = `
    <div class="match-pairs">
      <p class="match-column-label">Prompts and matches</p>
      ${rows}
    </div>
    <div class="match-options">
      <p class="match-column-label">Options</p>
      ${options || '<div class="match-empty">All options placed</div>'}
    </div>
  `;
}

function assignMatchingAnswer(promptIndex, answerIndex) {
  const question = currentQuestion();
  if (
    state.advancing ||
    !isMatchingQuestion(question) ||
    !matchingState ||
    promptIndex < 0 ||
    promptIndex >= question.pairs.length ||
    answerIndex < 0 ||
    answerIndex >= matchingState.options.length
  ) {
    return;
  }

  matchingState.assignments.forEach((answers, index) => {
    matchingState.assignments[index] = answers.filter(
      (assignedIndex) => assignedIndex !== answerIndex,
    );
  });
  matchingState.assignments[promptIndex].push(answerIndex);
  matchingState.selectedAnswerIndex = null;
  matchingState.results = null;
  clearFeedback();
  renderMatchingBoard();
}

function removeMatchingAnswer(promptIndex, answerIndex) {
  if (
    state.advancing ||
    !matchingState ||
    !matchingState.assignments[promptIndex]?.includes(answerIndex)
  ) {
    return;
  }
  matchingState.assignments[promptIndex] = matchingState.assignments[
    promptIndex
  ].filter((assignedIndex) => assignedIndex !== answerIndex);
  matchingState.results = null;
  clearFeedback();
  renderMatchingBoard();
}

function matchingSubmissionSummary(question) {
  return question.pairs
    .map((pair, promptIndex) => {
      const answers = matchingState.assignments[promptIndex].map(
        (answerIndex) => matchingState.options[answerIndex].answer,
      );
      return `${pair.prompt}: ${answers.join(", ") || "No match"}`;
    })
    .join("; ");
}

function matchingAnswersMarkup(question) {
  return `
    <div class="matching-answer-list">
      ${question.pairs
        .map(
          (pair) =>
            `<div><strong>${escapeHtml(pair.prompt)}:</strong> ${escapeHtml(pair.answers.join(", "))}</div>`,
        )
        .join("")}
    </div>
  `;
}

function acceptedAnswersMarkup(question) {
  if (isMatchingQuestion(question)) return "";
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
  if (concealsQuestionReference(question)) {
    return `<p class="verse">“${escapeHtml(verse)}” NKJV</p>`;
  }
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
        shuffleEnabled: state.shuffleEnabled,
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
    state.shuffleEnabled = Boolean(saved.shuffleEnabled);
    updateShuffleControl();
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
  state.shuffleEnabled = false;
  updateShuffleControl();
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
      const questionText = displayedQuestion(question)
        .replace(/\s+/g, " ")
        .trim();
      const shortQuestion =
        questionText.length > 58
          ? `${questionText.slice(0, 58)}...`
          : questionText;
      option.textContent =
        state.questionMode === "fill"
          ? `Verse ${index + 1} · ${shortQuestion}`
          : concealsQuestionReference(question)
            ? `Question ${index + 1} · ${shortQuestion}`
            : `${question.source} · ${shortQuestion}`;
      return option;
    }),
  );
}

function clearFeedback() {
  const matching = isMatchingQuestion(currentQuestion());
  const inlineBlank = usesInlineBlankInputs();
  const showBookChoices =
    !matching && !inlineBlank && usesBookAnswerChoices();
  elements.quizView.dataset.answerType = matching
    ? "matching"
    : inlineBlank
      ? "fill-blank"
      : "text";
  state.pendingRejectedAnswer = "";
  state.advancing = false;
  elements.feedback.hidden = true;
  elements.feedback.className = "feedback";
  elements.feedback.replaceChildren();
  elements.markCorrectButton.hidden = true;
  elements.acceptAnswerButton.hidden = true;
  elements.nextButton.hidden = true;
  elements.answerInput.hidden = showBookChoices;
  elements.answerInput.disabled = showBookChoices;
  elements.answerInput.required =
    !showBookChoices && !matching && !inlineBlank;
  elements.answerInput.value = "";
  elements.answerInput.removeAttribute("aria-invalid");
  inlineBlankInputs().forEach((input) => {
    input.value = "";
    input.disabled = false;
    input.required = true;
    input.removeAttribute("aria-invalid");
  });
  elements.bookAnswerChoices.hidden = !showBookChoices;
  elements.bookAnswerChoices.removeAttribute("aria-invalid");
  elements.bookAnswerInputs.forEach((input) => {
    input.checked = false;
    input.disabled = !showBookChoices;
  });
  elements.textAnswerArea.hidden = matching || inlineBlank;
  elements.matchingArea.hidden = !matching;
  elements.fillBlankAnswerArea.hidden = !inlineBlank;
  elements.answerNote.hidden = showBookChoices;
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
      : concealsQuestionReference(question)
        ? "Reference question"
        : question.scope === "all-books"
          ? "All three books"
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
      source.textContent = concealsQuestionReference(question)
        ? "Question"
        : question.source;
      const prompt = document.createElement("span");
      prompt.textContent = displayedQuestion(question);
      openButton.append(source, prompt);

      const removeButton = document.createElement("button");
      removeButton.className = "missed-remove";
      removeButton.type = "button";
      removeButton.dataset.removeMissedId = question.id;
      removeButton.setAttribute(
        "aria-label",
        concealsQuestionReference(question)
          ? "Remove question from review"
          : `Remove ${question.source} from review`,
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
  inlineBlankInputs().forEach((input) => {
    input.disabled = true;
    input.removeAttribute("aria-invalid");
  });
  elements.bookAnswerChoices.removeAttribute("aria-invalid");
  elements.bookAnswerInputs.forEach((input) => {
    input.disabled = true;
  });
  elements.feedback.className = "feedback correct";
  elements.feedback.hidden = false;
  if (isMatchingQuestion(question)) {
    matchingState.assignments = question.pairs.map((_, promptIndex) =>
      matchingState.options
        .map((option, answerIndex) => ({ option, answerIndex }))
        .filter(({ option }) => option.promptIndex === promptIndex)
        .map(({ answerIndex }) => answerIndex),
    );
    matchingState.results = question.pairs.map(() => true);
    renderMatchingBoard();
    elements.feedback.innerHTML = `
      <strong>${escapeHtml(heading)}</strong>
      <p><b>Official matches:</b></p>
      ${matchingAnswersMarkup(question)}
      ${verseCitationMarkup(question)}
    `;
  } else {
    elements.feedback.innerHTML = `
      <strong>${escapeHtml(heading)}</strong>
      <p><b>Official answer:</b> ${escapeHtml(officialAnswer(question))}</p>
      ${acceptedAnswersMarkup(question)}
      ${verseCitationMarkup(question)}
    `;
  }
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
  const concealReference = concealsQuestionReference(question);
  elements.source.textContent =
    state.questionMode === "fill"
      ? "NKJV verse"
      : concealReference
        ? "Reference question"
        : question.source;
  elements.openReaderButton.hidden = concealReference;
  if (concealReference && state.readerOpen) closeReader();
  renderQuestionPrompt(question);
  elements.questionSelect.value = String(question.id);
  matchingState = isMatchingQuestion(question)
    ? createMatchingState(question)
    : null;
  clearFeedback();
  if (matchingState) renderMatchingBoard();
  updateQuestionStatus(question);
  updateProgress(question);
  updateStats();
  updateQuestionNavigation();

  if (!state.practiceMode && state.correctIds.has(question.id)) {
    showCorrectFeedback(question, "Completed question.");
  } else if (state.practiceMode && state.practiceCorrectIds.has(question.id)) {
    showCorrectFeedback(question, "Reviewed correctly.");
  } else {
    requestAnimationFrame(() => {
      if (matchingState) {
        elements.matchingBoard.querySelector(".match-option")?.focus();
      } else if (usesInlineBlankInputs()) {
        inlineBlankInputs()[0]?.focus();
      } else if (usesBookAnswerChoices()) {
        elements.bookAnswerInputs[0]?.focus();
      } else {
        elements.answerInput.focus();
      }
    });
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
  if (isMatchingQuestion(question)) {
    const assignedAnswers = new Set(matchingState.assignments.flat());
    const firstUnmatchedOption = matchingState.optionOrder.find(
      (answerIndex) => !assignedAnswers.has(answerIndex),
    );
    if (firstUnmatchedOption !== undefined) {
      elements.feedback.className = "feedback wrong";
      elements.feedback.hidden = false;
      elements.feedback.innerHTML =
        "<strong>Place every option before checking.</strong>";
      elements.matchingBoard
        .querySelector(`[data-answer-index="${firstUnmatchedOption}"]`)
        ?.focus();
      return;
    }

    const results = question.pairs.map((pair, promptIndex) => {
      const expected = pair.answers.map(normalizeAnswer).sort();
      const actual = matchingState.assignments[promptIndex]
        .map(
          (answerIndex) =>
            normalizeAnswer(matchingState.options[answerIndex].answer),
        )
        .sort();
      return (
        expected.length === actual.length &&
        expected.every((answer, index) => answer === actual[index])
      );
    });
    if (results.every(Boolean)) {
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

    const submittedMatches = matchingSubmissionSummary(question);
    const existing = state.missed.get(question.id);
    if (existing) {
      existing.attempts += 1;
      existing.answers.push(submittedMatches);
    } else {
      state.missed.set(question.id, {
        attempts: 1,
        answers: [submittedMatches],
      });
    }

    matchingState.results = results;
    matchingState.selectedAnswerIndex = null;
    renderMatchingBoard();
    elements.feedback.className = "feedback wrong";
    elements.feedback.hidden = false;
    elements.feedback.innerHTML =
      "<strong>Not quite. Adjust the highlighted matches and try again.</strong>";
    elements.markCorrectButton.hidden = false;
    elements.acceptAnswerButton.hidden = true;
    updateQuestionStatus(question);
    updateStats();
    saveSession();
    return;
  }

  const value = selectedAnswerValue();

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
  const inlineBlank = usesInlineBlankInputs(question);
  if (inlineBlank) {
    inlineBlankInputs().forEach((input, index) => {
      const correct =
        normalizeAnswer(input.value) ===
        normalizeAnswer(question.blankAnswers[index]);
      if (correct) {
        input.removeAttribute("aria-invalid");
      } else {
        input.setAttribute("aria-invalid", "true");
        input.value = "";
      }
    });
  } else {
    elements.answerInput.value = "";
    elements.answerInput.setAttribute("aria-invalid", "true");
    elements.bookAnswerInputs.forEach((input) => {
      input.checked = false;
    });
    elements.bookAnswerChoices.setAttribute("aria-invalid", "true");
    elements.answerLabel.textContent = "Try the same question again";
  }
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
  if (inlineBlank) {
    inlineBlankInputs().find((input) => input.hasAttribute("aria-invalid"))
      ?.focus();
  } else if (usesBookAnswerChoices()) {
    elements.bookAnswerInputs[0]?.focus();
  } else {
    elements.answerInput.focus();
  }
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

function updateShuffleControl() {
  elements.shuffleButton.setAttribute(
    "aria-pressed",
    String(state.shuffleEnabled),
  );
  elements.shuffleButton.title = state.shuffleEnabled
    ? "Turn shuffle off"
    : "Shuffle remaining questions";
}

function toggleShuffle() {
  if (state.advancing) return;
  if (state.shuffleEnabled) {
    state.shuffleEnabled = false;
    sortQuestionBankAndDecks();
    updateShuffleControl();
    saveSession();
    renderQuestion();
    showToast("Shuffle off.");
    return;
  }

  const complete = state.deckIds.filter((id) => isComplete(id));
  const remaining = state.deckIds.filter((id) => !isComplete(id));
  if (remaining.length < 2) {
    showToast("There are not enough remaining questions to shuffle.");
    return;
  }
  state.shuffleEnabled = true;
  state.deckIds = [...complete, ...shuffle(remaining)];
  state.index = complete.length;
  updateShuffleControl();
  saveSession();
  renderQuestion();
  showToast("Shuffle on.");
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
          <div class="review-source">${
            concealsQuestionReference(question)
              ? "Question"
              : escapeHtml(question.source)
          }</div>
          <div>
            <p class="review-question"><strong>${escapeHtml(
              displayedQuestion(question),
            )}</strong></p>
            ${answerLine}
            <div class="correct-answer">
              <strong>${isMatchingQuestion(question) ? "Matches:" : "Answer:"}</strong>
              ${
                isMatchingQuestion(question)
                  ? matchingAnswersMarkup(question)
                  : escapeHtml(officialAnswer(question))
              }
            </div>
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
elements.questionText.addEventListener("input", (event) => {
  event.target.closest(".inline-blank-input")?.removeAttribute("aria-invalid");
});
elements.bookAnswerInputs.forEach((input) => {
  input.addEventListener("change", () => {
    elements.bookAnswerChoices.removeAttribute("aria-invalid");
  });
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
elements.shuffleButton.addEventListener("click", toggleShuffle);
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
elements.questionType.addEventListener("change", () => {
  setEditorQuestionType(elements.questionType.value);
});
elements.questionPrompt.addEventListener("input", () => {
  if (elements.questionType.value === "fill-blank") {
    syncFillBlankAnswerEditor();
  }
});
elements.alternateQuestionPrompt.addEventListener("input", () => {
  if (elements.questionType.value === "fill-blank") {
    syncFillBlankAnswerEditor();
  }
});
elements.addPairButton.addEventListener("click", () => {
  addMatchingPairEditorRow();
  const prompts = elements.matchingPairEditor.querySelectorAll(
    ".matching-pair-prompt",
  );
  prompts[prompts.length - 1]?.focus();
});
elements.matchingPairEditor.addEventListener("click", (event) => {
  const addAnswerButton = event.target.closest(".matching-answer-add");
  if (addAnswerButton) {
    const answerEditor = addAnswerButton.closest(".matching-answer-editor");
    addMatchingAnswerEditorRow(answerEditor);
    answerEditor
      .querySelector(".matching-answer-row:last-of-type input")
      ?.focus();
    return;
  }

  const removeAnswerButton = event.target.closest(".matching-answer-remove");
  if (removeAnswerButton && !removeAnswerButton.disabled) {
    const answerEditor = removeAnswerButton.closest(".matching-answer-editor");
    removeAnswerButton.closest(".matching-answer-row")?.remove();
    updateMatchingAnswerRemoveButtons(answerEditor);
    return;
  }

  const removeButton = event.target.closest(".matching-pair-remove");
  if (!removeButton || removeButton.disabled) return;
  removeButton.closest(".matching-pair-row")?.remove();
  updateMatchingPairRemoveButtons();
});
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
elements.matchingBoard.addEventListener("click", (event) => {
  if (state.advancing || !matchingState) return;
  const removeAnswer = event.target.closest("[data-remove-answer-index]");
  if (removeAnswer) {
    const target = removeAnswer.closest("[data-prompt-index]");
    removeMatchingAnswer(
      Number(target.dataset.promptIndex),
      Number(removeAnswer.dataset.removeAnswerIndex),
    );
    return;
  }

  const option = event.target.closest("[data-answer-index]");
  if (option) {
    const answerIndex = Number(option.dataset.answerIndex);
    matchingState.selectedAnswerIndex =
      matchingState.selectedAnswerIndex === answerIndex ? null : answerIndex;
    matchingState.results = null;
    clearFeedback();
    renderMatchingBoard();
    return;
  }

  const target = event.target.closest("[data-prompt-index]");
  if (!target) return;
  const promptIndex = Number(target.dataset.promptIndex);
  if (matchingState.selectedAnswerIndex !== null) {
    assignMatchingAnswer(promptIndex, matchingState.selectedAnswerIndex);
  }
});
elements.matchingBoard.addEventListener("keydown", (event) => {
  if (
    state.advancing ||
    matchingState?.selectedAnswerIndex === null ||
    !["Enter", " "].includes(event.key)
  ) {
    return;
  }
  const target = event.target.closest("[data-prompt-index]");
  if (!target || event.target !== target) return;
  event.preventDefault();
  assignMatchingAnswer(
    Number(target.dataset.promptIndex),
    matchingState.selectedAnswerIndex,
  );
});
elements.matchingBoard.addEventListener("dragstart", (event) => {
  const option = event.target.closest("[data-answer-index]");
  if (!option || state.advancing) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(
    "text/plain",
    `match:${option.dataset.answerIndex}`,
  );
});
elements.matchingBoard.addEventListener("dragover", (event) => {
  const target = event.target.closest("[data-prompt-index]");
  if (!target || state.advancing) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  target.classList.add("drag-over");
});
elements.matchingBoard.addEventListener("dragleave", (event) => {
  event.target.closest("[data-prompt-index]")?.classList.remove("drag-over");
});
elements.matchingBoard.addEventListener("drop", (event) => {
  const target = event.target.closest("[data-prompt-index]");
  if (!target || state.advancing) return;
  event.preventDefault();
  target.classList.remove("drag-over");
  const payload = event.dataTransfer.getData("text/plain");
  const payloadMatch = payload.match(/^match:(\d+)$/);
  if (!payloadMatch) return;
  assignMatchingAnswer(
    Number(target.dataset.promptIndex),
    Number(payloadMatch[1]),
  );
});
elements.openReaderButton.addEventListener("click", () => openReader());
elements.openEditorReaderButton.addEventListener(
  "click",
  openReaderFromQuestionEditor,
);
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
window.addEventListener("resize", () => {
  if (state.readerOpen) updateReaderLayout();
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
