"use client";

import { useEffect, useRef, useState } from "react";
import {
  startSession,
  getLevelPracticeWords,
  generateFlashcard,
  generateFillBlank,
  logExerciseResult,
  toggleWordFlag,
  type SessionWord,
  type ExerciseType,
  type FlashcardContent,
  type FillBlankContent,
} from "@/lib/practice/actions";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button, ButtonLink } from "@/components/ui/button";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { AnswerOption, type AnswerState } from "@/components/ui/answer-option";
import { ExerciseTopBar } from "@/components/ui/exercise-top-bar";
import { MascotPlaceholder } from "@/components/ui/mascot-placeholder";

type Phase = "loading" | "front" | "result" | "complete" | "error";
type Content = FlashcardContent | FillBlankContent;
// "My words" reinforces vocabulary the learner has already seen/drilled
// (the pre-existing due+new mix). "Level practice" samples randomly across
// the whole level so recognizing a familiar word can't shortcut the task --
// only offered for fill-blank; flashcards stay word-anchored on purpose.
type VocabSource = "my_words" | "level_practice";
// Multiple-choice lets a learner eliminate options by elimination; typing
// the answer removes that shortcut entirely. Same generated content either
// way -- this only changes how the correct answer is presented and checked.
type AnswerMode = "choice" | "type";

const STAGE_LABEL: Record<string, string> = {
  new: "New",
  learning: "Learning",
  mastered: "Mastered",
};
const STAGE_TONE = {
  new: "neutral",
  learning: "accent",
  mastered: "success",
} as const;

export default function ExerciseSession({
  type,
  title,
  // This component backs both a Vocab space (flashcards) and an Activities
  // one (fill-blank), so where "back" goes depends on the caller.
  backHref = "/activities",
  // Difficult Words reuses this component with its own word pool instead of
  // the default due+new mix from startSession. Its words are all
  // already-seen, so "new" there means "keeps resetting," not "unseen" --
  // relabeled accordingly.
  loadWords,
  emptyMessage,
  showFlagButton = false,
  relabelNewAsStruggling = false,
}: {
  type: ExerciseType;
  title: string;
  backHref?: string;
  loadWords?: () => Promise<SessionWord[]>;
  emptyMessage?: string;
  showFlagButton?: boolean;
  relabelNewAsStruggling?: boolean;
}) {
  const [queue, setQueue] = useState<SessionWord[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [flagging, setFlagging] = useState(false);
  const showVocabToggle = type === "fill_blank";
  const [vocabSource, setVocabSource] = useState<VocabSource>("level_practice");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("choice");
  const [typedAnswer, setTypedAnswer] = useState("");

  // Content is cached by queue index in a ref (not state) so a background
  // prefetch of the *next* card doesn't need to trigger a re-render -- only
  // fetches for the currently-displayed index drive a phase change. This is
  // what lets the "Generating exercise..." screen disappear between cards:
  // by the time the user clicks Next, the next card's content is usually
  // already sitting in this cache.
  const contentCache = useRef<Record<number, Content>>({});
  const fetching = useRef<Set<number>>(new Set());
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Bumped on every begin() so in-flight fetches from a session that has
  // since been restarted (Practice again, or React Strict Mode's dev-mode
  // double-invoke of the mount effect) know to discard their result instead
  // of writing a stale word's content into the new queue's cache slot.
  const sessionId = useRef(0);

  function fetchContent(word: SessionWord): Promise<Content> {
    return type === "flashcard" ? generateFlashcard(word) : generateFillBlank(word);
  }

  function ensureFetched(i: number, words: SessionWord[]) {
    if (i < 0 || i >= words.length) return;
    if (contentCache.current[i] || fetching.current.has(i)) return;
    const mySession = sessionId.current;
    fetching.current.add(i);
    fetchContent(words[i])
      .then((content) => {
        fetching.current.delete(i);
        if (mySession !== sessionId.current) return;
        contentCache.current[i] = content;
        if (i === indexRef.current) {
          setPhase("front");
        }
      })
      .catch((err) => {
        fetching.current.delete(i);
        if (mySession !== sessionId.current) return;
        if (i === indexRef.current) {
          setError(
            err instanceof Error ? err.message : "Failed to generate exercise",
          );
          setPhase("error");
        }
      });
  }

  function begin(source: VocabSource = vocabSource) {
    const mySession = ++sessionId.current;
    setPhase("loading");
    contentCache.current = {};
    fetching.current.clear();

    const load = loadWords
      ? loadWords().then((sessionWords) => ({
          words: sessionWords,
          level: sessionWords[0]?.level ?? null,
        }))
      : showVocabToggle && source === "level_practice"
        ? getLevelPracticeWords(type)
        : startSession(type);

    load
      .then(({ words: sessionWords, level }) => {
        if (mySession !== sessionId.current) return;
        setQueue(sessionWords);
        setIndex(0);
        setScore({ correct: 0, total: 0 });
        if (sessionWords.length === 0) {
          setError(
            emptyMessage ??
              (!level
                ? "No words available yet -- add a word or wait for the word bank to load."
                : `No ${level} words available yet. Pick a different level in Settings.`),
          );
          setPhase("error");
        }
      })
      .catch((err) => {
        if (mySession !== sessionId.current) return;
        setError(err instanceof Error ? err.message : "Failed to start session");
        setPhase("error");
      });
  }

  useEffect(() => {
    begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (queue.length === 0 || index >= queue.length) return;

    setSelected(null);
    setTypedAnswer("");
    setError(null);

    if (contentCache.current[index]) {
      setPhase("front");
    } else {
      setPhase("loading");
      ensureFetched(index, queue);
    }
    // Prefetch two cards ahead, not just one -- a single card of lead time
    // wasn't enough buffer against generation latency for anyone answering
    // quickly (multiple choice especially), which showed up as "Generating
    // exercise..." reappearing partway through a session.
    ensureFetched(index + 1, queue);
    ensureFetched(index + 2, queue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, index]);

  const current = queue[index];
  const content = contentCache.current[index];

  function advance() {
    if (index + 1 >= queue.length) {
      setPhase("complete");
    } else {
      setIndex(index + 1);
    }
  }

  async function handleToggleFlag() {
    if (!current || flagging) return;
    setFlagging(true);
    try {
      const nextFlagged = await toggleWordFlag(current.wordId);
      setQueue((q) =>
        q.map((w, i) => (i === index ? { ...w, isFlagged: nextFlagged } : w)),
      );
    } finally {
      setFlagging(false);
    }
  }

  async function handleFlashcardGrade(knewIt: boolean) {
    if (!current) return;
    setScore((s) => ({ correct: s.correct + (knewIt ? 1 : 0), total: s.total + 1 }));
    setPhase("result");
    await logExerciseResult({
      wordId: current.wordId,
      type: "flashcard",
      correct: knewIt,
      userResponse: knewIt ? "knew_it" : "didnt_know",
    });
  }

  async function handleFillBlankSelect(option: string) {
    if (!current || !content) return;
    const fillBlank = content as FillBlankContent;
    const correct = option === fillBlank.correctAnswer;
    setSelected(option);
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    setPhase("result");
    await logExerciseResult({
      wordId: current.wordId,
      type: "fill_blank",
      correct,
      userResponse: option,
      // Level practice draws a random word regardless of whether the
      // learner chose to drill it -- a hit or miss there shouldn't move
      // its mastery stage or scheduling the way "My words" does.
      updateMastery: vocabSource !== "level_practice",
    });
  }

  async function handleFillBlankTypeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !content || !typedAnswer.trim()) return;
    const fillBlank = content as FillBlankContent;
    const correct =
      typedAnswer.trim().toLowerCase() === fillBlank.correctAnswer.toLowerCase();
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    setPhase("result");
    await logExerciseResult({
      wordId: current.wordId,
      type: "fill_blank",
      correct,
      userResponse: typedAnswer.trim(),
      updateMastery: vocabSource !== "level_practice",
    });
  }

  function handleVocabSourceChange(source: VocabSource) {
    if (source === vocabSource) return;
    setVocabSource(source);
    begin(source);
  }

  // Difficult Words only ever shows already-seen words, but a word that
  // keeps getting missed also keeps getting reset to the "new" stage (see
  // applyProgressUpdate) -- "Struggling" is the accurate read there.
  function stageLabel(stage: string): string {
    return relabelNewAsStruggling && stage === "new"
      ? "Struggling"
      : STAGE_LABEL[stage];
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto w-full max-w-md">
        <ExerciseTopBar
          backHref={backHref}
          typeLabel={title}
          level={current?.level}
          status={
            queue.length > 0 ? `${Math.min(index + 1, queue.length)} / ${queue.length}` : undefined
          }
        />
        {showVocabToggle && (
          <div className="mt-3">
            <SegmentedToggle
              options={
                [
                  { value: "level_practice", label: "Level practice" },
                  { value: "my_words", label: "My words" },
                ] as const
              }
              value={vocabSource}
              onChange={handleVocabSourceChange}
            />
          </div>
        )}

        {showVocabToggle && (
          <div className="mt-2">
            <SegmentedToggle
              options={
                [
                  { value: "choice", label: "Multiple choice" },
                  { value: "type", label: "Type the answer" },
                ] as const
              }
              value={answerMode}
              onChange={setAnswerMode}
            />
          </div>
        )}

        {phase === "error" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="rounded-btn border-2 border-error bg-error/10 px-3 py-2 text-sm font-medium text-error">
              {error}
            </p>
            <div className="flex gap-2">
              {queue.length > 0 && index < queue.length && (
                <Button variant="secondary" onClick={advance}>
                  Skip word
                </Button>
              )}
              <ButtonLink href="/settings" variant="secondary">
                Change level
              </ButtonLink>
            </div>
          </div>
        )}

        {phase === "loading" && (
          <p className="mt-4 font-medium text-primary-ink/70">
            {queue.length === 0 ? "Loading session..." : "Generating exercise..."}
          </p>
        )}

        {current &&
          type === "flashcard" &&
          content &&
          (phase === "front" || phase === "result") && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex items-center justify-end gap-2">
              <Pill tone={STAGE_TONE[current.masteryStage]}>
                {stageLabel(current.masteryStage)}
              </Pill>
              {showFlagButton && (
                <button
                  type="button"
                  onClick={handleToggleFlag}
                  disabled={flagging}
                  aria-label={
                    current.isFlagged
                      ? "Unmark as difficult"
                      : "Mark as difficult"
                  }
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-lg leading-none transition active:scale-95 ${
                    current.isFlagged
                      ? "border-text bg-accent text-white"
                      : "border-text/30 bg-surface text-text/50 hover:border-accent hover:text-accent"
                  }`}
                >
                  {current.isFlagged ? "★" : "☆"}
                </button>
              )}
            </div>
            <Card className="flex min-h-52 flex-col items-center justify-center text-center">
              <p className="w-full break-words font-heading text-3xl font-extrabold [overflow-wrap:anywhere]">
                {current.gender ? `${current.gender} ` : ""}
                {current.lemma}
              </p>
              {phase === "result" && (
                <div className="mt-4 flex w-full flex-col items-start gap-3 text-left">
                  <p className="text-base font-medium italic text-text">
                    {(content as FlashcardContent).exampleSentence}
                  </p>
                  <div className="w-fit max-w-full rounded-btn bg-peach/40 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-peach-ink/70">
                      Meaning
                    </p>
                    <p className="text-sm font-bold text-peach-ink">
                      {(content as FlashcardContent).gloss}
                    </p>
                  </div>
                </div>
              )}
            </Card>

            {phase === "front" && (
              <Button onClick={() => setPhase("result")}>Show answer</Button>
            )}

            {phase === "result" && score.total === index && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => handleFlashcardGrade(false)}
                >
                  Didn&apos;t know it
                </Button>
                <Button className="flex-1" onClick={() => handleFlashcardGrade(true)}>
                  Knew it
                </Button>
              </div>
            )}

            {phase === "result" && score.total > index && (
              <Button onClick={advance}>Next</Button>
            )}
          </div>
        )}

        {current &&
          type === "fill_blank" &&
          content &&
          (phase === "front" || phase === "result") && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex items-center justify-end">
              <Pill tone={STAGE_TONE[current.masteryStage]}>
                {stageLabel(current.masteryStage)}
              </Pill>
            </div>
            <Card className="flex min-h-40 flex-col justify-center gap-1 text-left">
              <p className="text-sm font-medium text-text-muted">
                Complete the sentence
              </p>
              <p className="text-lg font-bold">
                {(content as FillBlankContent).sentence}
              </p>
            </Card>

            {answerMode === "choice" ? (
              <div className="grid grid-cols-2 gap-3">
                {(content as FillBlankContent).options.map((option) => {
                  const isSelected = selected === option;
                  const isCorrectOption =
                    option === (content as FillBlankContent).correctAnswer;
                  const showFeedback = phase === "result";
                  let state: AnswerState = "default";
                  if (showFeedback && isCorrectOption) state = "correct";
                  else if (showFeedback && isSelected && !isCorrectOption)
                    state = "incorrect";
                  return (
                    <AnswerOption
                      key={option}
                      state={state}
                      disabled={phase === "result"}
                      onClick={() => handleFillBlankSelect(option)}
                    >
                      {option}
                    </AnswerOption>
                  );
                })}
              </div>
            ) : phase === "front" ? (
              <form
                onSubmit={handleFillBlankTypeSubmit}
                className="flex flex-col gap-3"
              >
                <input
                  type="text"
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  placeholder="Fehlendes Wort..."
                  className="rounded-btn border-[2.5px] border-text px-4 py-3 font-medium shadow-hard-sm focus:outline-none"
                  autoFocus
                />
                <Button type="submit" disabled={!typedAnswer.trim()}>
                  Submit
                </Button>
              </form>
            ) : (
              <Card
                shadow="shadow-hard-sm"
                className={
                  typedAnswer.trim().toLowerCase() ===
                  (content as FillBlankContent).correctAnswer.toLowerCase()
                    ? "border-success bg-success/10"
                    : "border-error bg-error/10"
                }
              >
                <p>Your answer: {typedAnswer}</p>
                <p className="mt-1 font-bold">
                  Correct answer: {(content as FillBlankContent).correctAnswer}
                </p>
              </Card>
            )}

            {phase === "result" && <Button onClick={advance}>Next</Button>}
          </div>
        )}

        {phase === "complete" && (
          <div className="mt-4 flex flex-col items-center gap-4 text-center">
            <MascotPlaceholder alt="Potato mascot celebrating" size={72} />
            <p className="font-heading text-lg font-extrabold">
              Session complete: {score.correct} / {score.total} correct
            </p>
            <div className="flex gap-2">
              <ButtonLink href="/home" variant="secondary" className="flex-1">
                Home
              </ButtonLink>
              <Button className="flex-1" onClick={() => begin()}>
                Practice again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
