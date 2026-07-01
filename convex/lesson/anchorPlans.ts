// #14 — Strand Anchors: one hand-authored, always-validated gold Lesson Plan
// per maths strand. Permanent infrastructure, NOT sample content and NOT retired
// when on-the-fly generation matures. They are the fail-safe floor the lesson
// engine falls back to when a generated plan fails validatePlan, and the
// known-good first lesson a child gets in a new strand. Anchors are validated at
// deploy time (seedAnchors) and never at fallback time, so the fail-safe is
// guaranteed valid. See the Strand Anchor glossary term in CONTEXT.md.

import type { LessonPlan } from './plan';
import type { Strand } from './vocab';
import { arraysIntroPlan } from './seedPlans';

// --- Number sense -----------------------------------------------------------
export const numberSenseAnchor: LessonPlan = {
  lessonId: 'anchor_number_sense_01',
  title: 'Making ten to add',
  ageBand: '7-10',
  skillTag: 'number_sense_basic',
  objective: 'Combine numbers by making ten, building flexible number sense.',
  prerequisites: [],
  estimatedMinutes: 12,
  warmUp: {
    id: 'ns_warmup',
    prompt: 'What is 8 add 5?',
    answerType: 'numeric',
    numericAnswer: 13,
    hints: [
      'Start at 8 and count on 5 more.',
      '8 and 2 makes 10 — how many more to add?'
    ],
    misconceptions: ['counting_slip', 'off_by_one']
  },
  concept:
    'Number sense is about how numbers fit together. A handy trick is "making ten": if you are adding 8 and 5, move 2 from the 5 to turn the 8 into 10, then add what is left.',
  workedExample: {
    narration:
      'For 8 add 5, I take 2 from the 5 to turn the 8 into 10. That leaves 3 more. So 8 add 5 is 13.'
  },
  practice: [
    {
      id: 'ns_p1',
      prompt: 'What is 7 add 6?',
      answerType: 'numeric',
      numericAnswer: 13,
      hints: ['Make ten: how many do you need to reach 10 from 7?', '7 and 3 makes 10, then add 3 more.'],
      misconceptions: ['counting_slip', 'off_by_one']
    },
    {
      id: 'ns_p2',
      prompt: 'What is 9 add 4?',
      answerType: 'numeric',
      numericAnswer: 13,
      hints: ['How many to make 10 from 9?', '9 and 1 makes 10, then add 3 more.'],
      misconceptions: ['counting_slip', 'off_by_one']
    }
  ],
  masteryCheck: {
    id: 'ns_mastery',
    prompt: 'Explain how making ten helps you add 8 and 5.',
    answerType: 'explanation',
    hints: ['How many do you move to make ten?', 'After making ten, what is left to add?'],
    misconceptions: []
  },
  reflection: {
    prompt: 'What helped you most today?',
    choices: ['Making ten', 'Counting on', 'The hints', 'Saying it out loud']
  },
  parentInsight: {
    skillTags: ['number_sense_basic'],
    improvedTemplate: '{child} is growing confident combining numbers by making ten.',
    trickyTemplate: '{child} sometimes counts on one too many or one too few.'
  }
};

// --- Fractions --------------------------------------------------------------
export const fractionsAnchor: LessonPlan = {
  lessonId: 'anchor_fractions_01',
  title: 'Fractions as equal parts',
  ageBand: '7-10',
  skillTag: 'fractions_equal_parts',
  objective: 'Understand a fraction as equal parts of a whole.',
  prerequisites: ['number_sense_basic', 'multiplication_as_groups'],
  estimatedMinutes: 12,
  warmUp: {
    id: 'fr_warmup',
    prompt: 'What is half of 10?',
    answerType: 'numeric',
    numericAnswer: 5,
    hints: ['Half means two equal parts.', 'Split 10 into 2 equal shares.'],
    misconceptions: ['adds_instead_of_multiplies']
  },
  concept:
    'A fraction names equal parts. Half means the whole is split into 2 equal parts. Each part gets the same amount — that is what "equal" means.',
  workedExample: {
    narration:
      'To find half of 8, I share 8 into 2 equal groups. Each group gets 4, because 4 and 4 make 8. So half of 8 is 4.'
  },
  practice: [
    {
      id: 'fr_p1',
      prompt: 'What is half of 6?',
      answerType: 'numeric',
      numericAnswer: 3,
      hints: ['Share 6 into 2 equal groups.', 'Two equal parts of 6.'],
      misconceptions: ['adds_instead_of_multiplies']
    },
    {
      id: 'fr_p2',
      prompt: 'What is half of 12?',
      answerType: 'numeric',
      numericAnswer: 6,
      hints: ['Share 12 into 2 equal groups.', 'Two equal parts of 12.'],
      misconceptions: ['adds_instead_of_multiplies']
    }
  ],
  masteryCheck: {
    id: 'fr_mastery',
    prompt: 'Share 8 counters into 2 equal groups to show half of 8.',
    answerType: 'manipulative',
    manipulative: { kind: 'equal_groups', groups: 2, perGroup: 4 },
    hints: ['Make one group first.', 'Now make a matching second group so both are equal.'],
    misconceptions: ['unequal_groups']
  },
  reflection: {
    prompt: 'What helped you most today?',
    choices: ['Sharing equally', 'Making two groups', 'The hints', 'Counting the parts']
  },
  parentInsight: {
    skillTags: ['fractions_equal_parts'],
    improvedTemplate: '{child} is starting to see a fraction as equal parts of a whole.',
    trickyTemplate: '{child} sometimes makes unequal parts instead of fair shares.'
  }
};

// --- Word problems ----------------------------------------------------------
export const wordProblemsAnchor: LessonPlan = {
  lessonId: 'anchor_word_problems_01',
  title: 'Turning a story into a maths sentence',
  ageBand: '7-10',
  skillTag: 'word_problem_translation',
  objective: 'Translate a word problem into groups and amounts, then solve.',
  prerequisites: ['number_sense_basic', 'multiplication_as_groups'],
  estimatedMinutes: 12,
  warmUp: {
    id: 'wp_warmup',
    prompt: 'Sara has 4 bags. Each bag holds 2 apples. How many apples altogether?',
    answerType: 'numeric',
    numericAnswer: 8,
    hints: ['How many apples per bag?', 'You have 4 bags of 2.'],
    misconceptions: ['adds_instead_of_multiplies', 'off_by_one']
  },
  concept:
    'A word problem hides a maths sentence inside a story. Find the groups and the amount in each, then decide whether to add or combine them.',
  workedExample: {
    narration:
      'For 3 boxes of 5 pens: the groups are boxes (3), and each has 5. That is 3 times 5, which is 15 pens.'
  },
  practice: [
    {
      id: 'wp_p1',
      prompt: 'Tom has 3 trays. Each tray holds 4 muffins. How many muffins?',
      answerType: 'numeric',
      numericAnswer: 12,
      hints: ['How many per tray?', '3 trays of 4.'],
      misconceptions: ['adds_instead_of_multiplies', 'off_by_one']
    },
    {
      id: 'wp_p2',
      prompt: 'Mia has 5 pots. Each pot has 2 flowers. How many flowers?',
      answerType: 'numeric',
      numericAnswer: 10,
      hints: ['How many per pot?', '5 pots of 2.'],
      misconceptions: ['adds_instead_of_multiplies', 'off_by_one']
    }
  ],
  masteryCheck: {
    id: 'wp_mastery',
    prompt: 'In your own words, explain how you turn "4 bags of 2 apples" into a maths sentence.',
    answerType: 'explanation',
    hints: ['What does each bag give you?', 'How do you write "4 groups of 2" in maths?'],
    misconceptions: []
  },
  reflection: {
    prompt: 'What helped you most today?',
    choices: ['Finding the groups', 'Drawing it out', 'The hints', 'Saying it slowly']
  },
  parentInsight: {
    skillTags: ['word_problem_translation'],
    improvedTemplate: '{child} is learning to unpack word problems into groups and amounts.',
    trickyTemplate: '{child} sometimes adds when the story is really about equal groups.'
  }
};

// --- Explaining an answer ---------------------------------------------------
export const explainingAnchor: LessonPlan = {
  lessonId: 'anchor_explaining_01',
  title: 'Explaining your thinking',
  ageBand: '7-10',
  skillTag: 'explanation_quality',
  objective: 'Explain not just the answer, but the reasoning behind it.',
  prerequisites: ['multiplication_as_arrays'],
  estimatedMinutes: 12,
  warmUp: {
    id: 'ex_warmup',
    prompt: 'In your own words, what does 3 times 4 mean?',
    answerType: 'explanation',
    hints: ['Think about groups or rows.', '3 times 4 means 3 groups of 4.'],
    misconceptions: []
  },
  concept:
    'Explaining your thinking means saying not just the answer, but how you got there and why it works. Good explainers use words like "because" and "so".',
  workedExample: {
    narration:
      'To explain 3 times 4 equals 12, I would say: "3 times 4 means 3 rows of 4. I count 4, 8, 12 — so three fours make twelve."'
  },
  practice: [
    {
      id: 'ex_p1',
      prompt: 'Explain why 6 plus 2 is the same as 4 plus 4.',
      answerType: 'explanation',
      hints: ['What does each side total?', 'Both make 8 — say why.'],
      misconceptions: []
    },
    {
      id: 'ex_p2',
      prompt: 'What is 5 times 2?',
      answerType: 'numeric',
      numericAnswer: 10,
      hints: ['5 groups of 2.', 'Count 2, 4, 6, 8, 10.'],
      misconceptions: ['counting_slip']
    }
  ],
  masteryCheck: {
    id: 'ex_mastery',
    prompt: 'Explain why 6 times 2 and 2 times 6 give the same total.',
    answerType: 'explanation',
    hints: ['Picture rows and columns.', 'Turning rows into columns keeps the total the same.'],
    misconceptions: []
  },
  reflection: {
    prompt: 'What helped you most today?',
    choices: ['Saying because', 'Using rows and columns', 'The hints', 'Drawing it']
  },
  parentInsight: {
    skillTags: ['explanation_quality'],
    improvedTemplate: '{child} is growing in confidence explaining how they reached an answer.',
    trickyTemplate: '{child} sometimes gives the number without saying why.'
  }
};

// --- The strand -> anchor registry ------------------------------------------
// arraysIntroPlan (#7's seed) is recast as the multiplication & division anchor.
export const STRAND_ANCHORS: Record<Strand, LessonPlan> = {
  number_sense: numberSenseAnchor,
  multiplication_division: arraysIntroPlan,
  fractions: fractionsAnchor,
  word_problems: wordProblemsAnchor,
  explaining_an_answer: explainingAnchor
};

// Stable lesson ids for anchor lookup (seedAnchors + the fallback path key on
// these; anchors are seeded approved and fetched by lessonId, never validated
// at fallback time).
export const ANCHOR_LESSON_IDS: Record<Strand, string> = {
  number_sense: numberSenseAnchor.lessonId,
  multiplication_division: arraysIntroPlan.lessonId,
  fractions: fractionsAnchor.lessonId,
  word_problems: wordProblemsAnchor.lessonId,
  explaining_an_answer: explainingAnchor.lessonId
};
