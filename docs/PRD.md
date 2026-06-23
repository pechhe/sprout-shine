# Sprout Shine PRD

## Summary

Sprout Shine is a voice-first adaptive maths tutor for 7-10-year-olds. It gives children short personalised lessons and gives parents a weekly learning insight into how their child learns, where they get stuck, and where they may be showing unusual strengths.

The product should not be positioned as another AI homework chatbot. The wedge is a trusted learner model plus parent insight layer:

> Not just what your child got wrong. Why they got stuck, what helped, and where they might shine.

## Product position

**The AI tutor that learns how your child learns.**

The first product is a tutor because tutoring is the easiest way to collect useful learning signals. The long-term product is a persistent learning profile that improves every lesson, subject, and parent interaction over time.

## First customer

Start with parents of 7-10-year-olds who are bright but uneven: capable in some areas, resistant in others, hard for parents to help, and not well served by generic tutoring apps.

Avoid starting with schools, VR, exam prep, SEN diagnosis, teenagers, or broad homework help.

## First subject

Start with maths reasoning.

Maths gives the cleanest learning loop: objective, attempt, mistake pattern, hint, retry, mastery check, parent insight. It also works well with a visual canvas: number lines, fraction bars, blocks, arrays, counters, word problems, scratchpad, and explanation prompts.

Coding may be a strong later expansion because it reveals planning, debugging, persistence, decomposition, and creativity. It should not be the first wedge.

## MVP promise

A child does short voice-led maths sessions. The tutor adapts in real time. Each week, the parent receives a short learning fingerprint showing what improved, what was hard, what motivates the child, and one strength worth encouraging.

## Core loop

1. Parent interview
2. Child onboarding
3. Short diagnostic
4. Adaptive maths lesson
5. Structured session events
6. Learner model update
7. Weekly parent insight
8. Parent feedback
9. Better next lesson

## Product principles

### 1. The tutor teaches; it does not just give answers

The tutor should guide the child through thinking using hints, worked examples, questions, retries, and reflection.

### 2. Lessons are structured

The LLM should not invent the whole lesson live. Each lesson has an objective, prerequisites, concept intro, worked example, practice tasks, hint ladder, misconception checks, mastery check, and reflection.

### 3. The learner model is evidence-based and humble

Use cautious language. Say, "She responded well to visual explanations this week," not "She is a visual learner." Say, "He showed strong spatial reasoning in this task," not "He is gifted."

### 4. Privacy is a product feature

Parents and children should understand what is stored, what is deleted, what parents see, what the AI uses, and how to opt out.

### 5. Avatars are bounded mentors, not friends

The avatar can be warm and memorable, but it should not become a companion, pretend to need the child, keep secrets, or simulate dependency.

## MVP scope

### In scope

- Parent signup and child profile
- Guardian consent and privacy controls
- Parent interview form
- Child onboarding and fictional tutor style selection
- Voice-first maths lessons
- Visual maths workspace
- Structured lesson engine
- Initial diagnostic session
- Learner model with skill and pattern tags
- Weekly parent digest
- Parent feedback on insights
- Admin review console for early pilot
- Founder pilot landing page
- Pilot metrics dashboard

### Out of scope for MVP

- VR
- School dashboards
- Teacher accounts
- Full curriculum coverage
- Coding
- Science simulations
- Exam prep
- Diagnosis or SEN labelling
- Behaviour scoring
- Parent access to full transcripts by default
- Existing cartoon or celebrity avatars
- Social features between children
- Open-ended AI companion mode

## User journeys

### Parent onboarding

1. Parent lands from QR code, referral, or direct link.
2. Parent creates an account.
3. Parent confirms they are the guardian.
4. Parent creates a child profile using nickname, age, school year if known, and maths confidence.
5. Parent answers a short interview about what the child finds easy, what they avoid, what happens when they get stuck, what has already been tried, and what the parent wants to understand.
6. Parent selects privacy settings.
7. Parent starts or schedules the child onboarding.

### Child onboarding

1. Tutor introduces itself as an AI learning helper.
2. Child chooses a fictional tutor style.
3. Tutor asks simple preference questions about hint size, pace, tone, and whether the child likes puzzles, stories, or straight questions.
4. Child completes short diagnostic tasks.
5. Tutor ends with positive, specific feedback.

### Daily lesson

1. Tutor introduces the lesson objective.
2. Child completes a warm-up.
3. Tutor introduces the concept using visual tools.
4. Child attempts tasks using voice and workspace interactions.
5. System records structured events: answer, workspace state, hint usage, misconception tags, time to attempt, and explanation quality.
6. Tutor uses hint ladder and nudges.
7. Child completes a mastery check.
8. Child reflects on what helped.
9. Learner model updates.

### Parent weekly digest

Parent receives a short weekly summary with:

- What improved
- What was tricky
- How the child seems to learn best
- One shine moment
- One thing to try at home

The digest should be based on structured evidence, not a raw transcript dump.

## Functional requirements

### Parent account and child profile

- Parent can sign up.
- Parent can create one child profile.
- Parent can edit the child profile.
- Parent can answer and update the parent interview.
- Profile does not require full child name, precise location, school, address, or unnecessary sensitive data.

### Consent and privacy controls

- Parent must give guardian consent before child use.
- Consent version and timestamp are stored.
- Learning-pattern insights can be enabled or disabled.
- Raw audio retention is off by default.
- Full transcript sharing is off by default.
- Product improvement use is opt-in.
- Parent can delete child data.
- Child can ask what the tutor tells the parent.

### Child transparency

Suggested message:

> I am an AI learning helper. I help you practise maths. I remember things like what topics you are practising and what kinds of hints help you. I tell your parent a short summary about your learning, but I do not tell them every word you say.

### Voice tutor

- Speech-to-text
- Text-to-speech
- Push-to-talk or clear turn-taking
- Repeat button
- Mute option
- Fallback text input
- Tutor stays inside the learning context
- Unsafe or inappropriate responses are blocked or rewritten

### Tutor behaviour guardrails

The tutor must not:

- Diagnose the child
- Ask for secrets
- Become an emotional companion
- Shame the child
- Talk about sensitive topics unnecessarily
- Tell the child to hide things from parents
- Overpraise intelligence
- Use labels such as lazy, gifted, ADHD, dyslexic, bad focus, or behaviour problem

### Visual maths workspace

Initial tools:

- Counters
- Grid
- Number line
- Fraction bars
- Scratchpad
- Answer input

The system should inspect workspace state and log structured events rather than relying only on transcript text.

### Structured lesson schema

Each lesson should include:

- Objective
- Prerequisites
- Warm-up
- Concept explanation
- Worked example
- Practice tasks
- Hint ladder
- Misconception tags
- Mastery check
- Reflection
- Parent insight templates

Example lesson object shape:

```json
{
  "lesson_id": "arrays_intro_01",
  "title": "Multiplication as arrays",
  "age_band": "7-10",
  "estimated_duration_minutes": 12,
  "objective": "Understand multiplication as rows and columns of equal groups",
  "prerequisites": ["counting", "equal_groups"],
  "materials": ["grid", "counters"],
  "tasks": [
    {
      "task_id": "array_3x4_build",
      "prompt": "Build an array with 3 rows and 4 counters in each row.",
      "answer_type": "manipulative",
      "correct_state": { "rows": 3, "columns": 4 },
      "misconceptions": ["rows_columns_confused", "unequal_groups"],
      "hints": [
        "Start with one row of 4.",
        "Now make two more rows that look the same.",
        "Check: does every row have 4 counters?"
      ]
    }
  ],
  "mastery_check": {
    "prompt": "Draw or build 4 x 5 in a way that proves the answer.",
    "success_criteria": [
      "uses_equal_rows_or_columns",
      "gives_correct_total",
      "can_explain_structure"
    ]
  }
}
```

## Learner model

The learner model should maintain working hypotheses, not fixed labels.

### Skill tags

Examples:

- number_sense_basic
- multiplication_as_groups
- division_sharing
- fractions_equal_parts
- fractions_number_line
- word_problem_translation
- explanation_quality
- checking_work

Each tag should track estimated level, confidence, last seen, evidence count, and misconception tags.

### Pattern tags

Examples:

- benefits_from_visuals
- rushes_when_confident
- persists_after_hint
- avoids_explaining
- strong_spatial_reasoning
- responds_to_story_context
- loses_focus_on_long_explanation

These are learning signals, not personality labels.

## Parent digest spec

Digest format:

### What improved

A short description of the child’s progress this week.

### What was tricky

A specific sticking point, framed neutrally.

### How they seem to learn best

A cautious pattern from evidence.

### Shine moment

A concrete moment where the child showed unusual strategy, persistence, creativity, explanation, or transfer.

### One thing to try at home

One practical parent action.

Footer:

> These are learning signals from this week’s sessions, not fixed labels. You can correct anything that does not sound right.

Feedback buttons:

- This sounds right
- This does not sound right
- Useful
- Not useful
- Tell me less about this
- I want more detail

## Initial 20 maths lessons

1. Making 10 and 20
2. Comparing numbers
3. Place value with blocks
4. Estimating before calculating
5. Number line jumps
6. Multiplication as equal groups
7. Arrays
8. Repeated addition
9. Sharing equally
10. Remainders as left over
11. Equal and unequal parts
12. Halves, thirds, quarters
13. Fractions as part of a set
14. Fractions on a number line
15. Equivalent fractions visually
16. Finding the question in a word problem
17. Choosing the operation
18. Drawing the problem
19. Multi-step problems
20. Explaining why the answer makes sense

## Admin review console

During the early pilot, parent insights should be human-reviewed before being sent.

Admin should be able to:

- View session event timeline
- View generated insight
- Edit insight
- Approve insight
- Reject insight
- View safety flags
- View parent feedback

## Founder pilot

Launch as a founder pilot, not a finished app.

Target:

- 20-30 families
- Children aged 7-10
- 3 sessions per week
- 10-15 minutes per session
- Weekly parent digest
- End-of-pilot parent interview

Suggested pricing test:

- £29/month founding family price
- £49 for a 4-week pilot
- £99 for 8 weeks with founder support

## Street marketing

Business card front:

> Not just what they got wrong. Why they got stuck.

Business card back:

> Adaptive voice tutor for children’s maths. Built for parents who want to understand how their child learns. Founder pilot open now. Scan to apply.

Do not hand cards to children. Speak to parents. Do not imply school endorsement.

## Success metrics

### Child engagement

- Sessions per week
- Lesson completion rate
- Child asks to continue
- Child returns without heavy parent pressure
- Number of voluntary explanations given

### Learning

- Improvement on mastery checks
- Reduced repeated misconceptions
- Better transfer to new problem formats
- Better explanation quality
- Fewer hints needed over time

### Parent value

- Digest open rate
- Parent says insight was accurate
- Parent says they learned something new
- Parent follows suggested action
- Parent willingness to pay

### Safety and trust

- Opt-out rate from insights
- Parent concern reports
- Inappropriate tutor response rate
- Safety false positives and false negatives
- Deletion/export requests handled

### Commercial

- Business card scan rate
- Landing page conversion
- Parent interview booking rate
- Pilot activation
- Paid conversion
- Month-one retention
- Referral rate

## Build gates

### Gate 1: Problem validation

Proceed if parents strongly resonate with understanding how their child learns, not just improving marks.

### Gate 2: Lesson loop validation

Proceed if children complete sessions and want another one.

### Gate 3: Parent insight validation

Proceed if parents find the digest accurate and useful.

### Gate 4: Productisation

Only then build more automation, content, payment flows, and broader subject coverage.

## Roadmap

### V0: Concierge prototype

- Parent interview
- Child diagnostic
- 5-10 maths lessons
- Voice tutor using constrained scripts
- Manual review of weekly parent insight
- Simple dashboard

### V1: Real MVP

- Account system
- Consent and privacy controls
- Voice tutor
- Maths canvas
- Structured lesson engine
- Learner model
- Parent weekly digest
- Admin review tool
- Payments

### V2: Broader learning fingerprint

- Writing mini-lessons
- Reading comprehension
- Richer strength detection
- Parent goal tracking
- Improved avatar selection
- Lesson pre-generation

### V3: Coding and projects

- Simple block coding
- Debugging puzzles
- Logic games
- Explain-your-code voice prompts
- Project-based challenges

### V4: School-safe version

- Teacher-controlled
- Classroom-only
- No behavioural profiling by default
- No parent coaching
- Explainable skill progress
- Safeguarding workflows
- DPA and DPIA ready

## Key risks

### It feels creepy

Mitigate with no hidden monitoring, no transcript dump, child-visible sharing rules, parent opt-outs, and humble language.

### It becomes generic homework help

Mitigate with structured lessons, maths canvas, learner model, and parent insights.

### Children get attached to the avatar

Mitigate with bounded mentor persona, no companion mode, session limits, transparency, and parent co-use moments.

### The AI gives bad pedagogy

Mitigate with structured lessons, deterministic validators, constrained prompts, human-authored content, and human review.

### Parents like it but do not pay

Mitigate by charging in the founder pilot or testing willingness to pay early.

### Schools distract the product

Mitigate by ignoring schools until DTC retention and evidence exist.
