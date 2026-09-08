"use client";

import { useEffect, useRef, useState } from "react";
import { getLevelPracticeWords, type SessionWord } from "@/lib/practice/actions";
import { chunkWords } from "@/lib/practice/chunk";
import {
  generateReadingPassage,
  logReadingResult,
  type ReadingContent,
  type ReadingMode,
  type GlossaryEntry,
} from "@/lib/practice/reading";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { AnswerOption, type AnswerState } from "@/components/ui/answer-option";
import { ExerciseTopBar } from "@/components/ui/exercise-top-bar";
import { MascotPlaceholder } from "@/components/ui/mascot-placeholder";

type Phase = "loading" | "generating" | "answer" | "result" | "complete" | "error";

// Splits a passage into tokens and wraps any word matching a glossary entry
// so hovering (desktop) or tapping (touch) reveals its meaning -- an
// unfamiliar word never fully blocks reading. Tapping/clicking also pins
// the tooltip open, since a bare CSS :hover tooltip doesn't work on touch.
function GlossedPassage({
  text,
  glossary,
  pinned,
  onTogglePin,
  keyPrefix = "",
}: {
  text: string;
  glossary: GlossaryEntry[];
  pinned: string | null;
  onTogglePin: (key: string | null) => void;
  keyPrefix?: string;
}) {
  const glossMap = new Map(
    (glossary ?? []).map((g) => [g.word.toLowerCase(), g.gloss]),
  );
  const tokens = text.split(/(\s+)/);
  return (
    <>
      {tokens.map((token, i) => {
        if (/^\s+$/.test(token) || token === "") return token;
        const match = token.match(/^(\P{L}*)(\p{L}+)(\P{L}*)$/u);
        if (!match) return token;
        const [, lead, word, trail] = match;
        const gloss = glossMap.get(word.toLowerCase());
        if (!gloss) return token;
        const key = `${keyPrefix}${i}`;
        const isPinned = pinned === key;
        return (
          <span key={i} className="group relative inline-block">
            {lead}
            <span
              onClick={() => onTogglePin(isPinned ? null : key)}
              className="cursor-pointer underline decoration-dotted decoration-accent underline-offset-4 hover:bg-accent/15"
            >
              {word}
            </span>
            <span
              className={`pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-btn border-2 border-text bg-surface px-2 py-1 text-xs font-bold shadow-hard-sm ${
                isPinned ? "block" : "hidden group-hover:block"
              }`}
            >
              {gloss}
            </span>
            {trail}
          </span>
        );
      })}
    </>
  );
}

export default function ReadingSession() {
  const [groups, setGroups] = useState<SessionWord[][]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [content, setContent] = useState<ReadingContent | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [pinnedGloss, setPinnedGloss] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [readingMode, setReadingMode] = useState<ReadingMode>("story");

  // Bumped on every begin() so a stale in-flight request from a prior
  // session (React Strict Mode's dev-mode double-invoke of the mount
  // effect, or a fast "Practice again") can't write its result over the
  // newer session's state.
  const sessionId = useRef(0);

  function begin() {
    const mySession = ++sessionId.current;
    setPhase("loading");
    getLevelPracticeWords("reading", 10)
      .then(({ words: sessionWords, level }) => {
        if (mySession !== sessionId.current) return;
        setGroups(chunkWords(sessionWords, { min: 4, max: 6 }));
        setIndex(0);
        setScore({ correct: 0, total: 0 });
        if (!level) {
          setError(
            "No words available yet -- add a word or wait for the word bank to load.",
          );
          setPhase("error");
        } else if (sessionWords.length === 0) {
          setError(
            `No ${level} words available yet. Pick a different level in Settings.`,
          );
          setPhase("error");
        } else {
          setPhase("generating");
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

  function handleReadingModeChange(mode: ReadingMode) {
    if (mode === readingMode) return;
    setReadingMode(mode);
    if (current) setPhase("generating");
  }

  const current = groups[index];

  useEffect(() => {
    if (!current || phase !== "generating") return;
    const mySession = sessionId.current;
    setContent(null);
    setAnswers({});
    setPinnedGloss(null);
    generateReadingPassage(current, readingMode)
      .then((result) => {
        if (mySession !== sessionId.current) return;
        setContent(result);
        setPhase("answer");
      })
      .catch((err) => {
        if (mySession !== sessionId.current) return;
        setError(
          err instanceof Error ? err.message : "Failed to generate passage",
        );
        setPhase("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, phase, readingMode]);

  async function handleSubmit() {
    if (!current || !content) return;

    const questionResults = content.questions.map((q, qi) => ({
      question: q.question,
      correct: answers[qi] === q.correctAnswer,
    }));
    const allCorrect = questionResults.every((r) => r.correct);

    setScore((s) => ({ correct: s.correct + (allCorrect ? 1 : 0), total: s.total + 1 }));
    setPhase("result");

    await logReadingResult({
      wordIds: current.map((w) => w.wordId),
      correct: allCorrect,
      questionResults,
    });
  }

  function advance() {
    if (index + 1 >= groups.length) {
      setPhase("complete");
    } else {
      setIndex(index + 1);
      setPhase("generating");
    }
  }

  const allQuestionsAnswered =
    content && content.questions.every((_, i) => answers[i] !== undefined);

  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto w-full max-w-md">
        <ExerciseTopBar backHref="/activities" typeLabel="Lesen" />

        <div className="mt-3">
          <SegmentedToggle
            options={
              [
                { value: "story", label: "Everyday reading" },
                { value: "article", label: "Level article" },
              ] as const
            }
            value={readingMode}
            onChange={handleReadingModeChange}
          />
        </div>

        {phase === "error" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="rounded-btn border-2 border-error bg-error/10 px-3 py-2 text-sm font-medium text-error">
              {error}
            </p>
            <div className="flex gap-2">
              {groups.length > 0 && index < groups.length && (
                <Button variant="secondary" onClick={advance}>
                  Skip
                </Button>
              )}
              <ButtonLink href="/settings" variant="secondary">
                Change level
              </ButtonLink>
            </div>
          </div>
        )}

        {(phase === "loading" || phase === "generating") && (
          <p className="mt-4 font-medium text-primary-ink/70">
            {phase === "loading" ? "Loading session..." : "Writing a passage..."}
          </p>
        )}

        {current && content && (phase === "answer" || phase === "result") && (
          <div className="mt-4 flex flex-col gap-4">
            <Card>
              {content.title && (
                <p className="mb-2 font-heading text-lg font-extrabold">
                  <GlossedPassage
                    text={content.title}
                    glossary={content.glossary}
                    pinned={pinnedGloss}
                    onTogglePin={setPinnedGloss}
                    keyPrefix="t-"
                  />
                </p>
              )}
              <p className="whitespace-pre-line leading-relaxed">
                <GlossedPassage
                  text={content.passage}
                  glossary={content.glossary}
                  pinned={pinnedGloss}
                  onTogglePin={setPinnedGloss}
                  keyPrefix="p-"
                />
              </p>
              <p className="mt-3 text-xs font-medium text-text-muted">
                Underlined words show their meaning on hover or tap.
              </p>
            </Card>

            <div className="flex flex-col gap-3">
              {content.questions.map((q, qi) => (
                <Card key={qi} padding="p-3" className="flex flex-col gap-2">
                  <p className="text-sm font-bold text-text-muted">
                    {q.question}
                  </p>
                  <div className="flex flex-col gap-2">
                    {q.options.map((option) => {
                      const isSelected = answers[qi] === option;
                      const showFeedback = phase === "result";
                      const isCorrectOption = option === q.correctAnswer;
                      let state: AnswerState = isSelected ? "selected" : "default";
                      if (showFeedback && isCorrectOption) state = "correct";
                      else if (showFeedback && isSelected && !isCorrectOption)
                        state = "incorrect";
                      return (
                        <AnswerOption
                          key={option}
                          state={state}
                          disabled={phase === "result"}
                          onClick={() =>
                            setAnswers((a) => ({ ...a, [qi]: option }))
                          }
                          className="text-left"
                        >
                          {option}
                        </AnswerOption>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>

            {phase === "answer" && (
              <Button onClick={handleSubmit} disabled={!allQuestionsAnswered}>
                Submit
              </Button>
            )}

            {phase === "result" && <Button onClick={advance}>Next</Button>}
          </div>
        )}

        {phase === "complete" && (
          <div className="mt-4 flex flex-col items-center gap-4 text-center">
            <MascotPlaceholder alt="Potato mascot celebrating" size={72} />
            <p className="font-heading text-lg font-extrabold">
              Session complete: {score.correct} / {score.total} fully correct
            </p>
            <div className="flex gap-2">
              <ButtonLink href="/home" variant="secondary" className="flex-1">
                Home
              </ButtonLink>
              <Button className="flex-1" onClick={begin}>
                Practice again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
