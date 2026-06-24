// #9 — the canonical diagnostic task set. One light task per skill area, covering
// number sense, equal groups, simple multiplication, basic fractions, word
// problems, and explaining reasoning. Reuses the same Task shape + graders as
// lessons, so the diagnostic shares the voice + workspace interaction patterns.

import type { Task } from './plan';

export type DiagnosticItem = {
  skillTag: string;
  /** plain-language label used in the positive closing feedback */
  label: string;
  task: Task;
};

export const DIAGNOSTIC_ITEMS: DiagnosticItem[] = [
  {
    skillTag: 'number_sense_basic',
    label: 'number sense',
    task: {
      id: 'dx_number_sense',
      prompt: 'What is 7 add 5?',
      answerType: 'numeric',
      numericAnswer: 12,
      hints: [
        'Start from 7 and count on 5 more.',
        '7 and 3 makes 10 — how many more to add?'
      ],
      misconceptions: ['counting_slip', 'off_by_one']
    }
  },
  {
    skillTag: 'multiplication_as_groups',
    label: 'making equal groups',
    task: {
      id: 'dx_equal_groups',
      prompt: 'Make 3 groups, with 4 counters in each group.',
      answerType: 'manipulative',
      manipulative: { kind: 'equal_groups', groups: 3, perGroup: 4 },
      hints: [
        'Put out one group of 4 first.',
        'Now make two more groups that look the same.'
      ],
      misconceptions: ['unequal_groups', 'counting_slip']
    }
  },
  {
    skillTag: 'multiplication_as_arrays',
    label: 'using arrays',
    task: {
      id: 'dx_array',
      prompt: 'Build an array with 2 rows and 3 counters in each row.',
      answerType: 'manipulative',
      manipulative: { kind: 'array', rows: 2, columns: 3 },
      hints: ['Make one row of 3 first.', 'Add a matching row underneath.'],
      misconceptions: ['rows_columns_confused', 'unequal_groups']
    }
  },
  {
    skillTag: 'fractions_equal_parts',
    label: 'basic fractions',
    task: {
      id: 'dx_fractions',
      prompt: 'What is half of 8?',
      answerType: 'numeric',
      numericAnswer: 4,
      hints: ['Half means sharing into 2 equal parts.', 'Two equal parts of 8 each get the same.'],
      misconceptions: ['adds_instead_of_multiplies']
    }
  },
  {
    skillTag: 'word_problem_translation',
    label: 'word problems',
    task: {
      id: 'dx_word_problem',
      prompt: 'Sara has 4 bags. Each bag holds 2 apples. How many apples altogether?',
      answerType: 'numeric',
      numericAnswer: 8,
      hints: [
        'How many apples is that saying per bag?',
        'You have 4 bags of 2 — what does that make?'
      ],
      misconceptions: ['adds_instead_of_multiplies', 'off_by_one']
    }
  },
  {
    skillTag: 'explanation_quality',
    label: 'explaining your thinking',
    task: {
      id: 'dx_explanation',
      prompt: 'In your own words: why do 3 times 4 and 4 times 3 give the same answer?',
      answerType: 'explanation',
      hints: [
        'Think about rows and columns — could you turn one into the other?',
        'Picture 3 rows of 4, then turn it on its side.'
      ],
      misconceptions: []
    }
  }
];
