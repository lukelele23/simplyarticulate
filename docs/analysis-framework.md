# SimplyArticulate: Gemini 2.5 analysis framework

Draft for implementation in the existing SimplyArticulate application. This document specifies behavior; it is not a deployed feature or a working backend. The existing application, authentication, billing, database, and Gemini adapter were not provided.

## Product flow

1. A signed-in user selects an AssemblyAI transcript and requests analysis.
2. The server verifies identity, transcript ownership, completion status, and subscription entitlement.
3. The server reserves one daily analysis slot atomically.
4. Gemini analyzes the transcript using the accompanying system prompt. Factual claims receive a separate source-backed verification pass when needed.
5. The server validates and saves the complete result, commits the usage slot, and returns it to the user.
6. Display two analysis sections, a suggested revision, and one next step. Reopening a saved analysis does not consume another slot.

## Access and daily usage

| User | New analyses per day | User-facing behavior |
| --- | --- | --- |
| Signed out | 0 | Ask the user to sign in. |
| Signed in, free | 1 | Show availability and the next reset when exhausted. |
| Active paid subscription | 10, enforced internally | Do not display the numeric cap or a remaining-use counter. At the cap, explain that today's analysis allowance has been reached and show the reset time. |

The requested paid experience is presented as unlimited with an internal cap of 10. Proposed normal UI label: **Analyze transcript**. Do not show a false technical-error message when the cap is reached. Any published unlimited claim should describe applicable usage limits in the plan terms.

Draft reset policy: midnight UTC, shared across accounts. Return an ISO reset timestamp and display it in the user's local timezone. This is a configurable product decision, not inferred from the user's device clock.

Enforce all limits on the server using a persistent database. Never accept a user ID, paid status, daily count, or reset date supplied by the browser as authoritative. Use verified billing state; changing devices, clearing storage, and upgrading during the day must not reset completed usage. A paid user with ten completed analyses cannot get another by switching plans.

### Reservation and retry semantics

- Maintain completed usage plus active reservations per user and UTC day. Reserve only when their sum is below the current plan limit; use a transaction or atomic conditional update.
- Bind a unique idempotency key to the user and request payload. Retrying the same request returns its saved result or in-progress state, consuming no additional slot. Reject reuse with a different payload.
- One requested analysis counts once even if it requires multiple Gemini calls for extraction, fact checking, and final formatting.
- Charge only after a valid complete result is saved. Release the reservation on provider failure, timeout, blocked output, or validation failure; permit an explicit retry without charging twice.
- Use a leased reservation with a worker heartbeat and fencing token. A worker that has lost its lease cannot commit. Recover abandoned jobs without permitting overlapping live workers to exceed the limit.
- A job spanning midnight commits against its original reservation day. Save result and commit usage in the same database transaction.
- A new analysis of a changed transcript is a new request. Retrieval of an existing result is free.

## Input contract

Request: `POST /api/transcripts/{transcriptId}/analysis` with an idempotency key. The server loads the completed AssemblyAI result itself; it must not blindly trust a submitted provider transcript ID.

Internal normalized input:

```ts
type AnalysisInput = {
  transcriptId: string;
  text: string;                 // Preserve the original transcript.
  speakerId?: string;          // Analyze selected speaker when diarization exists.
  language?: string;
  speechPurpose?: string;      // Optional: debate, presentation, story, etc.
  intendedAudience?: string;
  words?: Array<{
    text: string;
    startMs?: number;
    endMs?: number;
    confidence?: number;
    speakerId?: string;
  }>;
  disfluenciesPreserved: boolean | null;
};
```

Validate nonempty text, a supported language, and a configured size limit before reserving usage. Draft maximum: 20,000 characters; reject longer inputs with a clear message instead of silently truncating. Treat low-confidence transcription as uncertain. If multiple speakers are present, require a selected speaker or return clearly separated speaker feedback; do not combine their filler counts into one person's score.

## Analysis 1: Argument and logic

Assess the thesis, reasons, evidence, assumptions, and conclusion. Identify gaps, contradictions, unsupported causal claims, generalizations, and counterarguments where the transcript supports them. Explain why an issue matters; do not merely name a fallacy.

Assess rhetorical structure appropriate to the purpose: introduction, claim, support, transitions, response to objections, and conclusion or call to action. Consider credibility, reasoning, and emotional appeals without requiring every speech to use all three.

Assess persuasiveness for the stated audience. A persuasive presentation is not proof that its factual claims are true. Opinions and values should not be labeled factual errors. If there is no argument, mark argument evaluation as not applicable and give limited purpose-appropriate structural feedback.

### Fact verification

Extract externally checkable claims and real-world examples. Prioritize central or consequential claims, up to five per request in this draft. Mark additional claims as not checked; never imply comprehensive verification when only some were researched.

Use a separate Gemini 2.5 Google Search grounding pass for claim verification. Keep grounded evidence and provider citation metadata on the server, then provide that evidence to the final structured analysis pass. This separates search output from the final JSON response configuration.

Use these statuses:

- `supported`: Retrieved sources substantiate the claim as stated.
- `contradicted`: Retrieved sources contradict it; give a supported correction.
- `partially_supported`: Sources support a narrower version; explain the qualification.
- `unverified`: Search failed, evidence was insufficient, or the claim is personal and not independently checkable.
- `not_checked`: Externally checkable, but outside this request's verification coverage.

Every supported factual correction must include relevant source IDs. The server creates the source registry from actual grounding metadata; the model may reference IDs but cannot invent URLs. Validate that every ID exists. Link the sources next to the claim and preserve any required Google Search attribution/suggestions according to Google's current display requirements.

If verification is unavailable, continue with a clearly marked unverified assessment. Do not call model memory a fact check, and do not replace an uncertain claim with another unsupported fact. Do not send a full private transcript to search when an isolated claim suffices.

## Analysis 2: Structure, word choice, and filler words

Assess sentence construction, clarity, concision, transitions, word precision, vocabulary variety, and audience suitability. Separate sentence-level structure here from argument-level organization in section 1. Prefer specific, plain wording over automatically suggesting larger words. Respect dialect and the speaker's voice.

Identify likely filler occurrences contextually. Examples include "um", "uh", "like", "you know", and "I mean"; meaningful uses such as "I like science" are not fillers. Distinguish deliberate emphasis from unnecessary repetition or false starts.

Return exact transcript excerpts and occurrence ranges. The server checks that the text matches those ranges and derives counts from validated occurrences, rather than trusting a model's arithmetic. Use zero-based, end-exclusive JavaScript string offsets against the exact original transcript; matching text without an unambiguous offset should be reported as qualitative feedback, not added to a precise count.

Report counts only for the selected speaker's available transcript. If word data exists, define word count as the number of selected-speaker word entries. Otherwise use a documented language-appropriate tokenizer and label the count approximate. Compute filler occurrences per 100 words as `100 * fillerOccurrenceCount / wordCount`; return null for an empty denominator. Count a multiword filler phrase as one occurrence and use non-overlapping ranges.

Describe repetitions and false starts as **visible disfluencies**, not a medical diagnosis of stuttering. Transcription may omit fillers, partial words, and repetitions. If preservation is unknown or disabled, explicitly say counts reflect only what survived transcription. No visible occurrences means zero observed occurrences, not proof of fluent audio.

Do not assess pace, pitch, volume, pauses, pronunciation, or vocal confidence from transcript text alone.

## Response contract

Use a Gemini structured output schema with these fields, then validate it on the server. The accompanying prompt describes the content rules; it does not replace runtime schema validation.

```ts
type EvidenceIssue = {
  quote: string;
  explanation: string;
  suggestion: string;
};
type AnalysisResult = {
  summary: string;
  argumentLogic: {
    applicability: 'applicable' | 'limited' | 'not_applicable';
    assessment: string;
    strengths: string[];           // Up to 3, only if evidenced.
    issues: EvidenceIssue[];        // Up to 3 priorities.
    rhetoricalStructure: string;
    persuasiveness: string;
    factChecks: Array<{
      claimQuote: string;
      status: 'supported' | 'contradicted' | 'partially_supported'
        | 'unverified' | 'not_checked';
      explanation: string;
      correction: string | null;
      sourceIds: string[];
    }>;
  };
  structureLanguage: {
    assessment: string;
    strengths: string[];
    sentenceStructure: EvidenceIssue[];
    wordChoice: EvidenceIssue[];
    fillerOccurrences: Array<{
      quote: string; startChar: number; endChar: number;
    }>;
    visibleDisfluencies: Array<{
      quote: string; startChar: number; endChar: number;
      kind: 'repetition' | 'false_start' | 'partial_word';
      explanation: string;
    }>;
    transcriptLimitations: string[];
  };
  suggestedRevision: string;
  nextStep: string;
};
```

The server adds `analysisId`, `createdAt`, source registry, verification coverage, validated metrics, and transcription-quality notices. None of these authoritative fields comes from the model. No numeric overall score is included in this draft; feedback should be concrete and explainable.

## Gemini integration

Reuse the existing server-side Gemini analysis adapter. Model default for this draft: `gemini-2.5-flash`; allow `gemini-2.5-pro` through server configuration if desired. Confirm the configured model is available in the application's Gemini account before rollout. Keep API credentials on the server.

Pipeline outline (pseudocode, not executable):

```text
verify session and subscription
load owned, completed transcript and validate input
return existing request result if idempotency key already completed
atomically reserve daily slot or return daily-limit response
try:
  extract relevant claims from transcript as untrusted content
  verify prioritized claims with separate grounded Gemini call
  build source registry from provider metadata
  call Gemini with system prompt, original transcript, evidence, output schema
  validate JSON, excerpts, source IDs, statuses, and occurrence ranges
  calculate metrics from validated data
  atomically save result and commit reservation
  return saved analysis
catch:
  release reservation if still owned; save retryable failure state
  return clear error with no charge
```

Treat transcript text and search content as untrusted data, including instructions embedded within either. Render returned text safely; do not insert model output as executable HTML. Store results under the owning user and avoid raw transcript logging by default. Provider/schema failures should never expose secrets or raw internal errors.

## User interface

Show a brief summary followed by:

1. **Argument and logic:** strengths, up to three improvements, rhetorical organization, and factual claims with verification labels and source links.
2. **Structure and language:** sentence construction, vocabulary suggestions, observed filler count, visible repetitions, and transcription limitations.
3. **Suggested revision:** preserve the speaker's position and voice; revise concisely without adding unsupported evidence.
4. **Your next step:** one practical exercise or edit.

Show a loading state and prevent accidental double submission. Authentication failures use a sign-in action. Free-limit messages explain one analysis per day. Paid-limit messages say "You've reached today's analysis allowance. You can analyze another transcript after [local reset time]." Do not expose the internal ten-use count. Provider failures offer retry without charging another analysis.

## Acceptance checks before implementation is released

- Signed-out access and access to another user's transcript are rejected.
- First free analysis succeeds; a second new request is denied until reset.
- Ten paid analyses succeed; the eleventh is denied, including concurrent requests.
- Refreshes, repeated idempotency keys, and multiple Gemini passes do not double charge.
- Failed jobs release usage; stale workers cannot commit after lease recovery.
- Boundary tests cover midnight UTC, plan changes, and saved-result retrieval.
- Nonargumentative speech receives no fabricated logic critique.
- Personal anecdotes remain unverified; corrections require real relevant sources.
- "I like science" is not counted as a filler; quoted occurrence ranges match.
- Transcript-only feedback does not diagnose stuttering or invent audio observations.
- Embedded transcript instructions cannot change the analysis policy or reveal secrets.

## Reference documentation

- Google Search grounding: https://ai.google.dev/gemini-api/docs/google-search
- Structured outputs and schema validation: https://ai.google.dev/gemini-api/docs/structured-output

Before wiring this draft into the app, identify its existing Gemini adapter, authentication/session API, subscription source, database transaction mechanism, and AssemblyAI transcript storage. No live calls or integration tests have been run for this specification.
